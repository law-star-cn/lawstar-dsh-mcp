# 法律之星 MCP API Key 插件（DeepSeek Harness）

DeepSeek Harness 插件：一键把**法律之星（LawStar）法规数据 MCP**接入对话。在 DeepSeek Harness 中粘贴你的 **API Key**，即可用 `mcp__lawstar__*` 工具检索法条、调取原文、识别引用、校验幻觉。

## 功能 / Features

- 🔑 **一键接入**：提供法律之星 API Key，即为当前会话接入法规数据能力（无需 OAuth）
- ⚡ **Streamable HTTP 单端点**：`https://api.law-star.com/mcp/point`，自动注入 `Authorization: Bearer <key>`
- 🧩 **覆盖全部 6 大 MCP 工具**：
  `law_semantic_search`（语义检索法条）、`law_semantic_clause`（法条原文调取）、
  `law_statute_list`（法规列表查询）、`law_article_recognition`（法条引用识别·批量）、
  `law_hallucination_check`（AI 法条幻觉校验·批量）、`law_law_reference`（法律引用批量调取）
- 💾 **安全持久化**：API Key 存储于 DSH 存储域（`~/.dsh/storages`，目录 0700），重启 Host 自动恢复连接
- 🛠 **对话即管理**：内置 `lawstar_connect` / `lawstar_status` / `lawstar_disconnect` 三个工具
- 🚪 **一键断开**：清除本地 Key 并停用 MCP 工具
- 🧩 **独立存储域与条目 id**：与其他 DeepSeek Harness 插件可同时安装共存

## 安装 / Install

前置：DeepSeek Harness（`dsh` CLI，web profile），Node ≥ 20。

### 🤖 让 Agent 安装（最省事）

把下面的链接直接发给你的 DeepSeek Harness 对话，说「帮我安装这个插件」即可。

```
帮我安装这个插件 https://github.com/law-star-cn/lawstar-dsh-mcp
```

Agent 会按本 README 执行（你也可以自己跑）：

```
# 方式一：一键脚本（自动安装 + 注册 bundle + 提示重启）
bash <(curl -fsSL https://raw.githubusercontent.com/law-star-cn/lawstar-dsh-mcp/main/install.sh)
# 方式二：手动两步
dsh plugin --profile web add @law-star-cn/lawstar-dsh-mcp
# 重启 dsh web
```

> 安装时的 `peer dependencies` 警告可忽略——`@deepseek-ai/*` 等对等依赖由 DSH web profile 自带（host 依赖），无需另行安装；安装完成后**必须重启** dsh web 才能生效。

### 方式 A：npm 安装

```
dsh plugin --profile web add @law-star-cn/lawstar-dsh-mcp
# 重启 dsh web
```

若未自动注册，手动在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 追加 `"@law-star-cn/lawstar-dsh-mcp"`，再重启。

### 方式 B：GitHub 直装

```
dsh plugin --profile web add github:law-star-cn/lawstar-dsh-mcp
# 再重启 dsh web
```

### 方式 C：源码 / 本地调试

```
git clone https://github.com/law-star-cn/lawstar-dsh-mcp.git
cd lawstar-dsh-mcp
dsh plugin --profile web add "link:$(pwd)"      # 或 pnpm add "file:$(pwd)" # 再重启 dsh web
```

插件包内自带 `cordis.patch.yml`（bundle patch）；`dsh plugin add` 自动完成依赖安装与 bundles 注册，插件行自动合入，无需手改任何文件。

## 使用 / Usage

安装并重启后，在对话中输入：

| 你说 | 效果 |
|---|---|
| "连接法律之星 MCP"（并提供 API Key） | 触发 `lawstar_connect`：配置 Key 并挂载 mcp-lawstar 服务器 |
| "查一下法律之星 MCP 连接状态" | 触发 `lawstar_status`：显示端点、Key（脱敏）、可用工具 |
| "断开法律之星 MCP" | 触发 `lawstar_disconnect`：清除本地 Key、停用工具 |

**如何获得 API Key**：登录[法律之星开放平台](https://open.law-star.com)，进入「控制台 → API Key 管理」创建 Key。API Key 采用 Bearer 鉴权，按积分计费，单日有调用频次限制。

连接成功后，以下工具直接可用（示例）：

> 提示：MCP 工具在连接成功后会有**数秒异步挂载延迟**。`lawstar_connect` 会轮询等待工具就绪，超时（默认 10s）也会明确提示"正在后台挂载"而非谎报可用；可用 `lawstar_status` 随时确认工具是否在线。

- `mcp__lawstar__law_semantic_search` —— 语义检索相关法条，例如"受贿罪量刑"
- `mcp__lawstar__law_semantic_clause` —— 按法律名称+条号调取法条原文
- `mcp__lawstar__law_statute_list` —— 按关键词查询法规列表（可拆地域/部门）
- `mcp__lawstar__law_article_recognition` —— 批量识别文本中的法条引用
- `mcp__lawstar__law_hallucination_check` —— 校验 AI 生成的法条引用是否准确
- `mcp__lawstar__law_law_reference` —— 批量调取多部法律的指定法条原文

## 配置 / Configuration

插件行位于 `~/.dsh/profiles/web/cordis.patch.yml`（bundle 合入后可见）：

```
- id: lawstar-mcp
  name: '@law-star-cn/lawstar-dsh-mcp'
  config:
    endpoint: 'https://api.law-star.com/mcp/point'  # MCP 网关端点
    serverName: 'lawstar'                            # MCP 服务器名（工具前缀 mcp__lawstar__*）
    apiKey: ''                                       # 可预先填写；也可在对话中通过 lawstar_connect 提供
    persistTokens: true                              # 持久化 Key（false = 仅内存，重启需重连）
```

## 开发 / Development

```
npm install --legacy-peer-deps   # @deepseek-ai/* 为 harness 宿主依赖，本地不安装
npm run lint                     # 语法检查（node --check 全部 lib）
npm test                         # 纯逻辑单测（常量 + mcp-client 条目 id + 无 shell 元字符）
npm run verify-pack              # npm pack 白名单校验，防止 dev/test 侥幸进发布包
```

> `@deepseek-ai/*` 是对等依赖，仅在 DeepSeek Harness 运行环境（web profile）中提供，不在公共注册表发布；因此本地与 CI 用 `--legacy-peer-deps` 安装，仅运行不依赖宿主的纯逻辑单测。存储域 / loader / tools 的集成需在 Harness 环境验证。

## 安全说明 / Security

- API Key 只写入 `~/.dsh/storages`（0700），对话历史与日志中仅显示脱敏形式（`abcd****wxyz`）
- 不要把 `~/.dsh` 加入任何 Git 仓库
- Bearer token 仅发送给受管条目的精确端点
- 断开时立即清除本地凭证并停用工具

## License

[MIT](./LICENSE)