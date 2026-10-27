# 法律之星 MCP API Key 插件（DeepSeek Harness）

DeepSeek Harness 插件：粘贴**法律之星（LawStar）API Key**，即可在对话里使用 `mcp__lawstar__*` 工具检索法规、调取法条原文、识别引用和做幻觉校验。

- 当前版本：**1.1.0**
- 适配：**DSH 0.2.1-rc.2 / Node ≥ 20**
- 默认 profile：`desktop`（`web` 同样可用；以你启动的 profile 为准）

## 功能

- 🔑 一键接入：`lawstar_connect` 写入 Key，自动创建受管 `mcp-lawstar` 服务器
- ⚡ Streamable HTTP 单端点：`https://api.law-star.com/mcp/point`
- 🧩 覆盖当前 7 个 MCP 工具：
  `law_semantic_search`、`law_semantic_clause`、`law_statute_list`、
  `law_article_recognition`、`law_hallucination_check`、`law_law_reference`、
  `law_point_balance`
- 💾 Key 持久化在 DSH 存储域（`~/.dsh/storages`，目录 0700），重启自动恢复
- 🛠 对话管理：`lawstar_connect` / `lawstar_status` / `lawstar_disconnect`
- 🩹 **0.2.x 协议兼容**：DSH 0.2.x 的 mcp-client 会先发 `server/discover`，法律之星
  只支持 2025 版 `initialize` 握手；本插件在 fetch 层把这一探测转为 404，让 SDK
  回退到 legacy 握手。没有这个兼容层时，服务器会显示 disconnected。

## 安装

前置：DeepSeek Harness 0.2.1-rc.2，Node ≥ 20。

### 让 Agent 安装

```
帮我安装这个插件 https://github.com/law-star-cn/lawstar-dsh-mcp
```

### 手动安装

`dsh plugin add` 会自动安装依赖并注册 bundle；安装后**必须重启 DSH**。

```bash
# 如果你使用桌面端（推荐）
dsh plugin --profile desktop add @law-star-cn/lawstar-dsh-mcp

# 如果你使用 dsh web
dsh plugin --profile web add @law-star-cn/lawstar-dsh-mcp
```

GitHub 直装或本地源码：

```bash
dsh plugin --profile desktop add github:law-star-cn/lawstar-dsh-mcp
# 或
dsh plugin --profile desktop add "link:/path/to/lawstar-dsh-mcp"
```

安装时如果出现 peer dependency 警告，确认 `@deepseek-ai/dsh-mcp-client` 为
`0.2.1-rc.2`、`@deepseek-ai/dsh-storage-domain` 为 `0.2.1-rc.2` 即可；DSH 0.2.1
会拒绝旧版 peer 范围的插件，这是有意的兼容性保护。

## 使用

安装并重启后，在对话中：

| 你说 | 效果 |
|---|---|
| “连接法律之星 MCP”（并提供 API Key） | `lawstar_connect`：校验 Key、创建 `mcp-lawstar` 条目 |
| “查一下法律之星 MCP 连接状态” | `lawstar_status`：端点、脱敏 Key、工具是否在线 |
| “断开法律之星 MCP” | `lawstar_disconnect`：清除本地 Key、停用 MCP 条目 |

API Key 获取：[法律之星开放平台](https://open.law-star.com) → 控制台 → API Key 管理。

连接成功后可直接使用：

- `mcp__lawstar__law_semantic_search` — 语义检索法条
- `mcp__lawstar__law_semantic_clause` — 按法律名 + 条号调原文
- `mcp__lawstar__law_statute_list` — 法规列表查询
- `mcp__lawstar__law_article_recognition` — 批量识别法条引用
- `mcp__lawstar__law_hallucination_check` — 法条引用幻觉校验
- `mcp__lawstar__law_law_reference` — 批量调取法律引用原文
- `mcp__lawstar__law_point_balance` — 查询账户积分余额

> 工具挂载有几秒异步延迟。`lawstar_connect` 默认最多等 10 秒；如果超时，它会明确提示“正在后台挂载”，可再用 `lawstar_status` 确认。重启后已有 Key 会自动恢复，无需重复输入。

## 配置

插件行位于当前 profile 的 `cordis.patch.yml`（bundle 合入后可修改）：

```yaml
- id: lawstar-mcp
  name: '@law-star-cn/lawstar-dsh-mcp'
  config:
    endpoint: 'https://api.law-star.com/mcp/point'
    serverName: 'lawstar'
    apiKey: ''
    persistTokens: true
    onlineWaitMs: 10000
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `endpoint` | `https://api.law-star.com/mcp/point` | 法律之星 MCP 网关 |
| `serverName` | `lawstar` | 工具前缀 `mcp__lawstar__*`，必须符合 DSH 的 `[A-Za-z0-9_-]{1,32}` |
| `apiKey` | 空 | 可预填；更推荐通过 `lawstar_connect` 提供 |
| `persistTokens` | `true` | `false` 时仅内存保存，重启需重新连接 |
| `onlineWaitMs` | `10000` | 连接后轮询工具就绪的超时，0 表示不等待 |
| `autoConnectOnActivate` | `false` | 有配置 Key 时是否在插件启动时自动连接 |

## 兼容性说明

本次适配针对 DSH **0.2.1-rc.2**：

1. `@deepseek-ai/dsh-mcp-client` 从 0.1.x 升级到 0.2.1-rc.2；
2. 存储域表句柄改用 `domain.table('credentials')`（兼容旧 `domain.tables.get`）；
3. mcp-client 条目改为完整配置覆盖，不再依赖旧 `entry.options.config`；
4. 增加法律之星 `server/discover` → 404 的 legacy 握手兼容层；
5. 工具清单补充 `law_point_balance`；
6. `lawstar_connect()` 无参数时正确复用已持久化 Key（旧版会被空 `config.apiKey` 挡住）。

## 开发

```bash
npm test
npm run lint
npm run verify-pack
```

测试覆盖常量、条目 id、工具清单和 0.2.x mcp-client 配置构造；真实 Harness 集成已用
`lawstar-test` profile 验证：`lawstar_connect` → 7 个工具上线 → 实际调用
`mcp__lawstar__law_semantic_clause` 返回《民法典》第五百八十五条。

## 安全

- API Key 只写入 `~/.dsh/storages`（0700），日志/对话只显示脱敏形式；
- Bearer Key 只发送给配置的精确端点；
- 断开时清除本地凭证并停用条目；
- 不要把 `~/.dsh` 提交到 Git。

## License

[MIT](./LICENSE)
