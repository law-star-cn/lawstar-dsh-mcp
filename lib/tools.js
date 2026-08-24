/**
 * 对话工具面：lawstar_connect / lawstar_status / lawstar_disconnect
 * 用户说"连接法律之星 MCP"等即触发 connect；模型据此完成一键接入。
 */
import { LAWSTAR_TOOLS } from './constants.js';

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    message: { type: 'string' },
    detail: { type: 'object', additionalProperties: true },
  },
  required: ['ok', 'message'],
  additionalProperties: true,
};

const resultOutput = {
  schema: RESULT_SCHEMA,
  // DSH 工具契约：render 必须返回 content 块数组（[{ type: 'text', text }]），
  // 返回字符串会让下游把 content 当数组调 .some()/.map() → "content.some is not a function"。
  render(args, value) {
    return [{ type: 'text', text: value.message }];
  },
};

/**
 * 工具清单描述（接入后可用的 mcp__lawstar__* 工具）复用，避免三处重复。
 */
function listTools() {
  return LAWSTAR_TOOLS.map((name) => `mcp__lawstar__${name}`).join('、');
}

/**
 * @param {import('cordis').Context} ctx
 * @param {{
 *   connect:(argv, signal:AbortSignal)=>Promise<object>,
 *   status:()=>Promise<object>,
 *   disconnect:(signal:AbortSignal)=>Promise<object>,
 * }} api
 */
export function registerTools(ctx, api) {
  const disposers = [];
  disposers.push(
    ctx.tools.register({
      name: 'lawstar_connect',
      description:
        `一键连接法律之星（LawStar）MCP：使用你的 API Key 配置法律之星法规数据 MCP Server。` +
        `法律之星 MCP 为 Streamable HTTP 单端点，采用静态 API Key（Bearer）鉴权。申请流程：登录法律之星开放平台控制台 → API Key 管理 → 创建 Key。` +
        `连接成功后 ${listTools()} 等工具即可使用。` +
        `已在连接状态时调用将复用已有 Key（可传入新 apiKey 覆盖），不会重复配置。`,
      parameters: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            description: '法律之星 API Key（Bearer Token）。如在插件配置/上次连接中已保存或传入，可省略。',
          },
          endpoint: {
            type: 'string',
            description: '可选覆盖 MCP 网关端点，默认 https://api.law-star.com/mcp/point。',
          },
        },
        additionalProperties: false,
      },
      output: resultOutput,
      timeoutMs: 60_000,
      async execute(args, exec) {
        return api.connect(args ?? {}, exec.signal);
      },
    }),
  );
  disposers.push(
    ctx.tools.register({
      name: 'lawstar_status',
      description:
        `查看法律之星 MCP 连接状态：是否已配置 API Key、端点、覆盖的 MCP 服务器与可用工具、是否需要重新连接等。`,
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: resultOutput,
      async execute() {
        return api.status();
      },
    }),
  );
  disposers.push(
    ctx.tools.register({
      name: 'lawstar_disconnect',
      description:
        `断开法律之星 MCP 连接：清除本地保存的 API Key（凭证）、停用 mcp-lawstar MCP 工具。` +
        `之后需要重新执行 lawstar_connect 并提供 Key 才能再次使用。`,
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: resultOutput,
      async execute(args, exec) {
        return api.disconnect(exec.signal);
      },
    }),
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}

/** 工具名序列化（供 status/日志展示） */
export { listTools };