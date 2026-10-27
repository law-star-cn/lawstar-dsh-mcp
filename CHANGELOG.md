# Changelog

## [1.1.0] - 2026-10-27

- **适配 DSH 0.2.1-rc.2**：peer 依赖升级到 `@deepseek-ai/dsh-mcp-client@0.2.1-rc.2`、`dsh-storage-domain@0.2.1-rc.2`、`schemastery@~3.18.5`、`cordis@~4.0.5`
- **fix**: 法律之星只支持 2025 版 MCP `initialize`，DSH 0.2.x 会先发 `server/discover`；新增 fetch 层 404 兼容探测，避免服务器始终 disconnected
- **fix**: `lawstar_connect()` 无参数时复用已持久化的 Key；不再被默认空 `config.apiKey` 拦住
- **fix**: 存储域改为 `domain.table('credentials')`，兼容 0.2.x；旧 `domain.tables.get` 保留回退
- **fix**: mcp-client 条目改为完整配置覆盖，不再读取旧 `entry.options.config`
- **feat**: 工具清单补充 `law_point_balance`，当前共 7 个
- **docs**: README 改为 desktop/web 双 profile 安装说明，增加 0.2.x 兼容说明与集成验证结果

## [1.0.2] - 2026-09-20

- **chore**: peer 依赖对齐 DSH 0.1.5（`@deepseek-ai/cordis@^4.0.2` 取代 `cordis`；`@deepseek-ai/dsh-mcp-client@^0.1.5-rc.2`）。运行时代码无改动，向后兼容

## [1.0.1] - 2026-08-24

- **fix**: `lawstar_connect` 不再谎报"已连接即可用"——配置后轮询等待 mcp-client 工具就绪（默认 10s，可配 `onlineWaitMs`），超时明确提示"正在后台挂载"
- **feat**: `lawstar_connect` 连接前真实校验 API Key（向端点发 tools/list），Key 无效/网络不通直接返回失败并提示，不再因 `failOnStartupError:false` 静默成功
- **feat**: `lawstar_status` 区分"已配置 Key"与"工具在线"两种状态（`toolsOnline`）
- **docs**: README 注明工具挂载有数秒异步延迟

## [1.0.0] - 2026-08-24

- **feat**: 法律之星 MCP API Key 插件首发（单端点 Streamable HTTP + 静态 Bearer Key，npm 包 `@law-star-cn/lawstar-dsh-mcp`）
- 对话工具：`lawstar_connect` / `lawstar_status` / `lawstar_disconnect`
- 受管 MCP 服务器：`mcp-lawstar`（serverName=`lawstar`），覆盖 6 大工具：
  `law_semantic_search`、`law_semantic_clause`、`law_statute_list`、
  `law_article_recognition`、`law_hallucination_check`、`law_law_reference`
- API Key 持久化于 DSH 存储域（`~/.dsh/storages`，0700），重启自动恢复连接
- 通过 `ctx.loader` 动态配置 `@deepseek-ai/dsh-mcp-client` 条目并注入 Bearer header
- 独立存储域（`lawstar_mcp`），与其它插件可共存