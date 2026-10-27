/**
 * 法律之星（LawStar）MCP API Key 插件（DeepSeek Harness / Cordis 插件）
 *
 * 能力：
 *   - 一键接入：提供法律之星 MCP API Key，即为对话会话接入法规数据能力
 *   - 单端点 Streamable HTTP：http://<endpoint>/mcp/point，注入 `Authorization: Bearer <key>`
 *   - 安全持久化：API Key 存储于 DSH 存储域（ctx.storageDomain，~/.dsh/storages，目录 0700），
 *     重启 Host 自动恢复连接
 *   - 通过 ctx.loader 动态配置 @deepseek-ai/dsh-mcp-client 条目（注入 Bearer header）
 *   - 对话工具：lawstar_connect / lawstar_status / lawstar_disconnect
 *
 * 法律之星 MCP 采用静态 API Key + 单端点鉴权，因此本插件为「API Key 驱动 + 单 mcp-client 条目」形态。
 */
import z from '@deepseek-ai/schemastery';
import { defineCredentialDomain, CredentialStore, buildCredential } from './store.js';
import { provisionEntry, disableEntry } from './mcp-provision.js';
import { registerTools } from './tools.js';
import { DEFAULT_ENDPOINT, DEFAULT_SERVER_NAME, DEFAULT_ENTRY_PREFIX, DEFAULT_GRANT_KEY, LAWSTAR_TOOLS, REQUEST_TIMEOUT_MS } from './constants.js';

/**
 * DSH 0.2.x mcp-client negotiates the modern MCP protocol first (`server/discover`).
 * LawStar only implements the 2025-era `initialize` handshake and answers the
 * modern probe with HTTP 500. The SDK treats that as fatal instead of falling
 * back. At the fetch boundary, answer that one probe with a plain 404, which the
 * SDK classifies as "legacy" and then performs the normal handshake.
 */
const LEGACY_PROBE_PATCHED = Symbol.for('lawstar-dsh-mcp.legacy-discover');
const LEGACY_HOSTS = ['.law-star.com'];

function isLawStarHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return LEGACY_HOSTS.some((entry) => host === entry.slice(1) || host.endsWith(entry));
}

export function installLegacyProtocolCompat(logger) {
  try {
    const current = globalThis.fetch;
    if (typeof current !== 'function') return;
    if (current[LEGACY_PROBE_PATCHED] === true) return;
    // Another plugin (e.g. dsh-mcp-panel) may already own an equivalent patch.
    if (current[Symbol.for('dsh-mcp-panel.legacy-probe-fetch')] === true) return;
    const original = current;
    const patched = async (input, init) => {
      try {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
        const url = raw ? new URL(raw) : undefined;
        const body = typeof init?.body === 'string' ? init.body : undefined;
        if (
          url !== undefined
          && isLawStarHost(url.hostname)
          && init?.method?.toUpperCase() === 'POST'
          && body !== undefined
          && body.includes('server/discover')
        ) {
          return new Response(null, { status: 404, statusText: 'Not Found' });
        }
      } catch {
        // Forward anything whose shape we cannot safely inspect.
      }
      return original(input, init);
    };
    Object.defineProperty(patched, LEGACY_PROBE_PATCHED, { value: true });
    globalThis.fetch = patched;
    logger?.info?.('[lawstar-mcp] legacy MCP discover fallback enabled for api.law-star.com');
  } catch (error) {
    logger?.warn?.(`[lawstar-mcp] legacy discover fallback unavailable: ${String(error?.message ?? error)}`);
  }
}

export const name = 'lawstar-mcp';
/** 依赖服务：工具注册、存储域、loader（动态配置 mcp-client 条目） */
export const inject = ['tools', 'storageDomain', 'loader'];
export const Config = z.object({
  /** 法律之星 MCP 网关端点 */
  endpoint: z.string().default(DEFAULT_ENDPOINT),
  /** 受管 mcp-client 的 serverName（决定工具前缀 mcp__lawstar__*） */
  serverName: z.string().default(DEFAULT_SERVER_NAME),
  /** 受管 mcp-client 条目 id */
  mcpEntryPrefix: z.string().default(DEFAULT_ENTRY_PREFIX),
  /** API Key（Bearer）。可在配置中预先填写，也可在对话中调用 lawstar_connect 临时提供 */
  apiKey: z.string().default(''),
  /** 是否把 API Key 持久化到存储域（false 则仅内存，重启需重新连接） */
  persistTokens: z.boolean().default(true),
  /** 是否有 config.apiKey 时自动连接（无 Key 时不触发） */
  autoConnectOnActivate: z.boolean().default(false),
  /** 凭据 account 标识（预留多账号；默认 single） */
  account: z.string().default(DEFAULT_GRANT_KEY),
  /** 连接后轮询等待 mcp-client 工具就绪的超时（ms）；0 表示不等待 */
  onlineWaitMs: z.number().default(10000),
});

export async function apply(ctx, config) {
  // Cordis 4.0.x exposes a callable logger service; keep support for
  // object-style loggers used by some host/test contexts.
  const logger = typeof ctx.logger === 'function' ? ctx.logger('lawstar-mcp') : ctx.logger;
  installLegacyProtocolCompat(logger);
  /** 插件实例状态（内存态为权威；persistTokens=false 时仅内存） */
  const state = {
    cred: null,
  };
  // 存储域生命周期：await 打开（默认开启持久化），关闭交由 fiber 卸载时清理。
  // 注意：ctx.effect 会「立即执行」回调，回调的返回值才是卸载时的清理函数，
  // 因此必须「返回」一个 () => domain.close() 闭包，而不是直接调用它。
  let store = null;
  if (config.persistTokens) {
    // DSH 0.2.x exposes ctx.storageDomain. Keep the documented fallback for
    // hosts that mount the facility under ctx.storage.domain.
    const storageDomain = ctx.storageDomain ?? ctx.storage?.domain;
    if (!storageDomain) {
      throw new Error('lawstar-mcp: storageDomain service is unavailable');
    }
    const domain = await storageDomain.open(defineCredentialDomain());
    store = new CredentialStore(domain);
    ctx.effect(() => () => {
      domain.close().catch((error) => logger.warn(`domain close: ${error.message}`));
    });
  }

  /* ───────────────────────── 工具就绪探测（第 1 点） ───────────────────────── */
  /** mcp-lawstar 仓库首个工具名（作为"挂载完成"的探针） */
  const PROBE_TOOL = 'mcp__lawstar__law_semantic_search';
  /** 轮询间隔（ms） */
  const POLL_INTERVAL_MS = 500;

  /** 探针是否已上线（ctx.tools.get 存在即就绪；resolve 抛错视为未就绪） */
  async function probeOnline() {
    try {
      return Boolean(ctx.tools.get(PROBE_TOOL));
    } catch {
      return false;
    }
  }

  /** 轮询等待工具挂载完成，超时返回 false（第 1 点：避免"已连接但工具未就绪"误导） */
  async function waitForToolsOnline(timeoutMs) {
    if (!timeoutMs || timeoutMs <= 0) {
      // 未启用等待：做一次即时探测
      return probeOnline();
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await probeOnline()) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  /* ───────────────────────── Key 有效性校验（第 2 点） ───────────────────────── */
  /**
   * 连接前真实校验 Key：向 MCP 端点发 tools/list（Streamable HTTP / JSON-RPC 2.0），
   * 成功返回工具列表；失败返回 { ok:false, message }，避免 failOnStartupError:false 造成的静默失败。
   */
  async function verifyApiKey(endpoint, apiKey, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        signal: controller.signal,
      });
    } catch (e) {
      return { ok: false, code: 'network', message: e.name === 'AbortError' ? '请求超时' : (e.message || String(e)) };
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      return { ok: false, code: `http_${res.status}`, message: `HTTP ${res.status}（可能是 401 表示 Key 无效，或端点不可达）` };
    }
    const text = await res.text().catch(() => '');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Streamable HTTP may return an SSE frame even for a single response.
      const frame = text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
        .pop();
      try {
        data = frame ? JSON.parse(frame) : undefined;
      } catch {
        data = undefined;
      }
    }
    if (data?.result && Array.isArray(data.result.tools)) {
      return { ok: true, tools: data.result.tools.map((t) => t.name) };
    }
    if (data?.error) return { ok: false, code: 'mcp_error', message: data.error.message || JSON.stringify(data.error) };
    if (!data) return { ok: false, code: 'mcp_parse', message: '无法解析 MCP 响应（请确认端点为 Streamable HTTP 单端点）' };
    return { ok: false, code: 'mcp_empty', message: 'MCP 响应缺少 tools 列表' };
  }

  /** 工具名 -> 完整 MCP 前缀名（mcp__lawstar__name） */
  function toolFq(name) {
    return `mcp__${config.serverName ?? DEFAULT_SERVER_NAME}__${name}`;
  }

  /* ───────────────────────── 连接（配置 API Key） ───────────────────────── */
  async function connect(argv, _signal) {
    try {
      // Reuse the credential restored from the storage domain when the call
      // supplies no key. Older versions only looked at argv/config, so a
      // plain `lawstar_connect()` after restart incorrectly said "未提供 Key".
      const stored = state.cred ?? (config.persistTokens ? await store.get(config.account) : null);
      // Use || rather than ??: config.apiKey defaults to '' and must not mask
      // a valid credential restored from the storage domain.
      const endpoint = argv?.endpoint || stored?.endpoint || config.endpoint || DEFAULT_ENDPOINT;
      const apiKey = argv?.apiKey || config.apiKey || stored?.apiKey;
      if (!apiKey) {
        return {
          ok: false,
          message:
            '未提供法律之星 API Key。请登录法律之星开放平台控制台 → API Key 管理 → 创建 Key，' +
            '然后把 Key 通过 lawstar_connect 传入（例如：lawstar_connect(apiKey="sk-xxx")）。',
          detail: { configured: false },
        };
      }
      const cred = buildCredential({
        endpoint,
        apiKey,
        serverName: stored?.serverName ?? config.serverName ?? DEFAULT_SERVER_NAME,
      });
      // 1) 真实校验 Key + 端点可达性（第 2 点：失败不再静默成功）
      const verify = await verifyApiKey(endpoint, apiKey);
      if (!verify.ok) {
        return {
          ok: false,
          message:
            `法律之星 MCP 连接失败：API Key 校验未通过（${verify.message}）。` +
            '请检查 Key 是否正确、相应积分是否可用，以及网络是否可达后重试。',
          detail: { connected: false, verified: false, error: verify.message, code: verify.code },
        };
      }
      // 2) 写入凭证并配置 mcp-client 条目
      state.cred = cred;
      if (config.persistTokens) await store.put(cred, config.account);
      const id = await provisionEntry(ctx, config, cred);
      // 3) 轮询等待工具挂载完成，超时提示而非谎报"可直接使用"（第 1 点）
      const ready = await waitForToolsOnline(config.onlineWaitMs);
      const tools = (verify.tools && verify.tools.length
        ? verify.tools
        : LAWSTAR_TOOLS
      ).map(toolFq);
      logger.info(`lawstar MCP connected (endpoint=${endpoint}, entry=${id}, toolsReady=${ready})`);
      if (ready) {
        return {
          ok: true,
          message:
            `法律之星 MCP 已连接并就绪（端点 ${endpoint}）。` +
            `可直接使用 MCP 工具：${tools.join('、')}。` +
            '例如「查一下受贿罪量刑的现行有效法律」',
          detail: { connected: true, verified: true, toolsReady: true, entry: id, serverName: config.serverName ?? DEFAULT_SERVER_NAME, tools },
        };
      }
      return {
        ok: true,
        message:
          `法律之星 MCP 已连接，但工具仍在后台挂载，请稍等几秒后再用（端点 ${endpoint}）。` +
          `可用工具将持续出现：${tools.join('、')}。` +
          '可对我输入「查一下法律之星 MCP 连接状态」确认就绪状态。',
        detail: { connected: true, verified: true, toolsReady: false, mounting: true, entry: id, serverName: config.serverName ?? DEFAULT_SERVER_NAME, tools },
      };
    } catch (error) {
      logger.error(`lawstar connect failed: ${error.message}`);
      return { ok: false, message: `法律之星 MCP 连接失败：${error.message}`, detail: { error: error.message } };
    }
  }

  /* ───────────────────────── 状态 ───────────────────────── */
  async function status() {
    const cred = state.cred ?? (config.persistTokens ? await store.get(config.account) : null);
    if (!cred) {
      return {
        ok: true,
        message:
          '法律之星 MCP 未连接。对我说「连接法律之星 MCP」并提供 API Key（控制台 → API Key 管理 → 创建）即可一键接入。',
        detail: { connected: false },
      };
    }
    const masked = cred.apiKey ? `${cred.apiKey.slice(0, 4)}****${cred.apiKey.slice(-4)}` : '(空)';
    // 第 3 点：区分"已配置 Key"与"工具真正在线"
    const online = await probeOnline();
    const tools = LAWSTAR_TOOLS.map(toolFq).join('、');
    const message = [
      online
        ? `法律之星 MCP 已连接且工具在线（serverName: ${cred.serverName}）`
        : `法律之星 MCP 已配置 API Key，但工具尚未就绪（serverName: ${cred.serverName}）`,
      `端点：${cred.endpoint}`,
      `API Key：${masked}（已保存于本地存储域，不在对话中明文展示）`,
      online ? `可用工具：${tools}` : '提示：MCP 工具挂载有数秒异步延迟，若长时间未就绪请检查 Key 与网络',
    ];
    return {
      ok: true,
      message: message.join('；'),
      detail: {
        connected: true,
        toolsOnline: online,
        endpoint: cred.endpoint,
        serverName: cred.serverName,
        apiKeyMasked: masked,
        hasApiKey: Boolean(cred.apiKey),
        tools: LAWSTAR_TOOLS,
      },
    };
  }

  /* ───────────────────────── 断开 ───────────────────────── */
  async function disconnect(_signal) {
    state.cred = null;
    if (config.persistTokens) await store.delete(config.account);
    const id = await disableEntry(ctx, config);
    return {
      ok: true,
      message:
        `法律之星 MCP 已断开：本地 API Key 凭证已清除${id ? `，MCP 条目 ${id} 已停用` : ''}。` +
        '之后需执行 lawstar_connect 并提供 Key 才能再次使用。',
      detail: { connected: false, entry: id },
    };
  }

  /* ───────────────────────── API 门面 + 工具注册 ───────────────────────── */
  const api = { connect, status, disconnect };
  const disposerTools = registerTools(ctx, api);
  ctx.effect(() => disposerTools);

  // 启动时恢复已保存的 Key（重启 Host 自动恢复连接）；非持久化且配置了 apiKey 时直接连接。
  if (config.persistTokens) {
    const stored = await store.get(config.account);
    if (stored) {
      state.cred = stored;
      try {
        await provisionEntry(ctx, config, stored);
        logger.info(`restored lawstar MCP credential for account '${config.account}'`);
      } catch (error) {
        logger.warn(`restore failed (${error.message}); run lawstar_connect to reconnect`);
      }
    }
  } else if (config.apiKey) {
    const cred = buildCredential({ endpoint: config.endpoint, apiKey: config.apiKey, serverName: config.serverName });
    state.cred = cred;
    await provisionEntry(ctx, config, cred).catch((error) => logger.warn(`provision failed: ${error.message}`));
  }

  logger.info(`lawstar-mcp plugin active (endpoint=${config.endpoint}, serverName=${config.serverName ?? DEFAULT_SERVER_NAME})`);
  // 注意：apply 不得返回普通对象（cordis 会将其视为非法 effect），工具与状态都挂在内部分装上。
}