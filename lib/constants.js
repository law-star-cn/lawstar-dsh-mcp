/**
 * 法律之星 MCP API Key 插件 - 常量定义
 *
 * 法律之星 MCP 为 Streamable HTTP 单端点（POST JSON-RPC 2.0），
 * 使用静态 API Key（Authorization: Bearer <key>）鉴权，无 OAuth。
 * 详见 MCP 控制台：https://api.law-star.com （控制台可创建 API Key / 充值积分）
 */
/** 法律之星 MCP 网关端点（与后端 API 域名独立） */
export const DEFAULT_ENDPOINT = 'https://api.law-star.com/mcp/point';
/** 受管 mcp-client 服务器的 serverName（决定 MCP 工具前缀 mcp__lawstar__*） */
export const DEFAULT_SERVER_NAME = 'lawstar';
/** 受管 mcp-client 条目 id 前缀 */
export const DEFAULT_ENTRY_PREFIX = 'mcp-lawstar';
/** 存储记录默认 account 键 */
export const DEFAULT_GRANT_KEY = 'default';
/** 法律之星 MCP 提供的 6 大工具（接入后可用 mcp__lawstar__* 调用） */
export const LAWSTAR_TOOLS = [
  'law_semantic_search',
  'law_semantic_clause',
  'law_statute_list',
  'law_article_recognition',
  'law_hallucination_check',
  'law_law_reference',
];
/** 网络请求超时（ms） */
export const REQUEST_TIMEOUT_MS = 15000;