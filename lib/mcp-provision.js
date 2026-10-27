/**
 * MCP 条目动态配置：通过 ctx.loader 创建/更新/停用 @deepseek-ai/dsh-mcp-client 条目。
 * 连接时把 Bearer API Key 注入条目 config（streamable-http, 单端点 /mcp/point），
 * 断开时停用条目（disabled），保持 serverName 不变 → 工具名不变、幂等。
 */
import { DEFAULT_ENDPOINT, DEFAULT_SERVER_NAME, DEFAULT_ENTRY_PREFIX } from './constants.js';

/** 受管 mcp-client 条目 id（单服务器，固定为 mcp-lawstar） */
export function entryIdFor(config) {
  return config.mcpEntryPrefix ?? DEFAULT_ENTRY_PREFIX;
}

/**
 * 非抛错的存在性探测：部分 loader 版本的 resolve(id) 对不存在的条目会抛
 * "cannot resolve entry" 而非返回 undefined，直接用它探测会中断首次配置流程。
 */
function hasEntry(ctx, id) {
  try {
    ctx.loader.resolve(id);
    return true;
  } catch {
    return false;
  }
}

/** 构建 mcp-client 条目 config（法律之星 MCP：Streamable HTTP + Bearer 静态 Key） */
export function buildEntryConfig(config, cred) {
  const url = cred?.endpoint ?? config.endpoint ?? DEFAULT_ENDPOINT;
  const serverName = config.serverName ?? cred?.serverName ?? DEFAULT_SERVER_NAME;
  return {
    transport: 'streamable-http',
    serverName,
    url,
    headers: cred?.apiKey ? { Authorization: `Bearer ${cred.apiKey}` } : {},
  };
}

/**
 * 用给定凭证配置/停用受管 mcp-client 条目。
 * @param {import('cordis').Context} ctx
 * @param {object} config 插件配置
 * @param {object|null} cred 凭证（含 apiKey）；null 表示停用（无 Key 不建立未授权连接）
 * @returns {Promise<string>} 受管条目 id
 */
export async function provisionEntry(ctx, config, cred) {
  const id = entryIdFor(config);
  const entryConfig = buildEntryConfig(config, cred);
  const existing = hasEntry(ctx, id) ? ctx.loader.resolve(id) : null;
  if (existing) {
    // Apply the complete config rather than merging a possibly old entry
    // shape. DSH 0.2.x loader entries do not guarantee `options.config`.
    await ctx.loader.update(id, {
      config: entryConfig,
      disabled: cred ? false : true,
    });
  } else {
    await ctx.loader.create({
      id,
      name: '@deepseek-ai/dsh-mcp-client',
      config: entryConfig,
      disabled: cred ? false : true,
    });
  }
  // 注意：不能在这里 await ctx.loader.await() —— loader.await() 会等待包括
  // 插件自身在内的所有条目 fiber 完成，而当前 apply() 正运行在自身 fiber 内，
  // 会形成自死锁。新建的 mcp-client 条目会在后台加载，无需阻塞插件 apply。
  return id;
}

/** 停用全部受管条目（断开连接时调用） */
export async function disableEntry(ctx, config) {
  const id = entryIdFor(config);
  if (hasEntry(ctx, id)) {
    await ctx.loader.update(id, { disabled: true });
    return id;
  }
  return null;
}

/** 移除受管条目（卸载/彻底清理时可选） */
export async function removeEntry(ctx, config) {
  const id = entryIdFor(config);
  if (hasEntry(ctx, id)) {
    await ctx.loader.remove(id);
    return id;
  }
  return null;
}