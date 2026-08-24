# Changelog

## [1.0.0] - 2026-08-24

- **feat**: 法律之星 MCP API Key 插件首发（单端点 Streamable HTTP + 静态 Bearer Key，npm 包 `@law-star-cn/lawstar-dsh-mcp`）
- 对话工具：`lawstar_connect` / `lawstar_status` / `lawstar_disconnect`
- 受管 MCP 服务器：`mcp-lawstar`（serverName=`lawstar`），覆盖 6 大工具：
  `law_semantic_search`、`law_semantic_clause`、`law_statute_list`、
  `law_article_recognition`、`law_hallucination_check`、`law_law_reference`
- API Key 持久化于 DSH 存储域（`~/.dsh/storages`，0700），重启自动恢复连接
- 通过 `ctx.loader` 动态配置 `@deepseek-ai/dsh-mcp-client` 条目并注入 Bearer header
- 独立存储域（`lawstar_mcp`），与其它插件可共存