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
import { DEFAULT_ENDPOINT, DEFAULT_SERVER_NAME, DEFAULT_ENTRY_PREFIX, DEFAULT_GRANT_KEY, LAWSTAR_TOOLS } from './constants.js';

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
});

export async function apply(ctx, config) {
  const logger = ctx.logger('lawstar-mcp');
  /** 插件实例状态（内存态为权威；persistTokens=false 时仅内存） */
  const state = {
    cred: null,
  };
  // 存储域生命周期：await 打开（默认开启持久化），关闭交由 fiber 卸载时清理。
  // 注意：ctx.effect 会「立即执行」回调，回调的返回值才是卸载时的清理函数，
  // 因此必须「返回」一个 () => domain.close() 闭包，而不是直接调用它。
  let store = null;
  if (config.persistTokens) {
    const domain = await ctx.storageDomain.open(defineCredentialDomain());
    store = new CredentialStore(domain);
    ctx.effect(() => () => {
      domain.close().catch((error) => logger.warn(`domain close: ${error.message}`));
    });
  }

  /* ───────────────────────── 连接（配置 API Key） ───────────────────────── */
  async function connect(argv, _signal) {
    try {
      const endpoint = argv?.endpoint ?? config.endpoint ?? DEFAULT_ENDPOINT;
      const apiKey = argv?.apiKey ?? config.apiKey;
      if (!apiKey) {
        return {
          ok: false,
          message:
            '未提供法律之星 API Key。请登录法律之星开放平台控制台 → API Key 管理 → 创建 Key，' +
            '然后把 Key 通过 lawstar_connect 传入（例如：lawstar_connect(apiKey="sk-xxx")）。',
          detail: { configured: false },
        };
      }
      const cred = buildCredential({ endpoint, apiKey, serverName: config.serverName ?? DEFAULT_SERVER_NAME });
      state.cred = cred;
      if (config.persistTokens) await store.put(cred, config.account);
      const id = await provisionEntry(ctx, config, cred);
      logger.info(`lawstar MCP connected (endpoint=${endpoint}, entry=${id})`);
      return {
        ok: true,
        message:
          `法律之星 MCP 已连接（端点 ${endpoint}）。` +
          `可直接使用 MCP 工具：${LAWSTAR_TOOLS.map((t) => `mcp__lawstar__${t}`).join('、')}。` +
          '例如「查一下受贿罪量刑的现行有效法律」',
        detail: { connected: true, entry: id, serverName: config.serverName ?? DEFAULT_SERVER_NAME, tools: LAWSTAR_TOOLS },
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
    const tools = LAWSTAR_TOOLS.map((t) => `mcp__lawstar__${t}`).join('、');
    return {
      ok: true,
      message: [
        `法律之星 MCP 已连接（serverName: ${cred.serverName}）`,
        `端点：${cred.endpoint}`,
        `API Key：${masked}（已保存于本地存储域，不在对话中明文展示）`,
        `可用工具：${tools}`,
      ].join('；'),
      detail: {
        connected: true,
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