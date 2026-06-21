# CCR Runtime PoC 记录

日期：2026-06-21

## Package

- Package: `@musistudio/claude-code-router`
- Agent Studio 固定版本：`2.0.0`
- CLI binary：`ccr`

## CLI Probe

命令：

```bash
cd sidecar && bunx ccr --help
```

退出码：`1`

输出：

```text
Usage: ccr [command] [preset-name]

Commands:
  start         Start server
  stop          Stop server
  restart       Restart server
  status        Show server status
  statusline    Integrated statusline
  code          Execute claude command
  model         Interactive model selection and configuration
  preset        Manage presets (export, install, list, delete)
  install       Install preset from GitHub marketplace
  activate      Output environment variables for shell integration
  ui            Open the web UI in browser
  -v, version   Show version information
  -h, help      Show help information

Presets:
  Any preset directory in ~/.claude-code-router/presets/

Examples:
  ccr start
  ccr code "Write a Hello World"
  ccr my-preset "Write a Hello World"    # Use preset configuration
  ccr model
  ccr preset export my-config            # Export current config as preset
  ccr preset install /path/to/preset     # Install a preset from directory
  ccr preset list                        # List all presets
  ccr install my-preset                  # Install preset from marketplace
  eval "$(ccr activate)"  # Set environment variables globally
  ccr ui
```

说明：`--help` 输出可读，但该版本 CLI 返回退出码 `1`。后续自动探测不能只用退出码判断 help 是否可用。

## 私有运行时约束

- `@musistudio/claude-code-router@2.0.0` 顶层 CLI 暴露 `ccr start`，未暴露稳定的 `--config` 参数。
- CCR 默认读取 `$HOME/.claude-code-router/config.json`。
- Agent Studio 托管 CCR 时必须设置隔离 `HOME`，把配置写到 `<configDir>/.claude-code-router/config.json`，避免污染用户真实 home。
- 配置必须包含 `PORT`、`HOST: "127.0.0.1"`、`APIKEY`、`NON_INTERACTIVE_MODE: true`、`Providers`、`Router`。
- 发布态 sidecar 是 `bun build --compile` 单二进制，不能假设存在 `node_modules/.bin/ccr`；当前实现用 Bun file asset 把 CCR `cli.js` 与 `tiktoken_bg.wasm` 打进 sidecar，并在启动前复制到 `<configDir>/runtime/` 真实磁盘路径后 spawn。

## 本地实现验证

已通过：

```bash
cd sidecar && bun test src/ccr
```

结果：`16 pass, 0 fail`

已通过：

```bash
cd sidecar && bun test src/ccr src/agui/provider-factory.test.ts src/agui/provider-claude/provider-env.test.ts src/services/providerSettings.test.ts src/lib/providerProfiles.test.ts
```

结果：`66 pass, 0 fail`

已通过：

```bash
bun run build:sidecar -- --host-only
```

结果：`[build-sidecar] done (1 target)`

已通过编译态 asset copy smoke：

```bash
bun build /tmp/agent-studio-ccr-asset-copy-smoke.ts --compile --outfile /tmp/agent-studio-ccr-asset-copy-smoke && /tmp/agent-studio-ccr-asset-copy-smoke
```

结果：

```json
{"hasShebang":true}
```

说明：`fs.copyFile` 不能从 `$bunfs` 虚拟路径复制 CCR asset；实现已改为 `Bun.file(...).arrayBuffer()` + `Bun.write(...)` 写入真实 runtime 目录。

## Smoke 入口

新增脚本：

```bash
cd sidecar
bun run smoke:ccr -- --dry-run
```

必填环境变量：

```bash
AGENT_STUDIO_CCR_POC_BASE_URL=https://api.openai.com/v1
AGENT_STUDIO_CCR_POC_API_KEY=<OpenAI-compatible API key>
AGENT_STUDIO_CCR_POC_MODEL=<model id>
```

可选环境变量：

```bash
AGENT_STUDIO_CCR_POC_PROTOCOL=openai-compatible # 或 anthropic，默认 openai-compatible
AGENT_STUDIO_CCR_POC_PROVIDER_ID=ccr_poc
AGENT_STUDIO_CCR_POC_PROVIDER_NAME="CCR PoC Provider"
AGENT_STUDIO_CCR_POC_ROUTER_API_KEY=agent-studio-ccr-poc
AGENT_STUDIO_CCR_POC_ROUTER_PORT=3456
AGENT_STUDIO_CCR_POC_CONFIG_DIR=/tmp/agent-studio-ccr-poc
AGENT_STUDIO_CCR_POC_CWD=$(pwd)
AGENT_STUDIO_CCR_POC_PROMPT="用一句中文回复：CCR text streaming smoke ok"
```

dry-run 示例：

```bash
cd sidecar
AGENT_STUDIO_CCR_POC_BASE_URL=https://api.openai.com/v1 \
AGENT_STUDIO_CCR_POC_API_KEY=... \
AGENT_STUDIO_CCR_POC_MODEL=gpt-5.1 \
bun run smoke:ccr -- --dry-run
```

dry-run 只打印已脱敏的 CCR route/config，不启动 CCR，不调用上游模型。

真实 Text streaming smoke：

```bash
cd sidecar
AGENT_STUDIO_CCR_POC_BASE_URL=https://api.openai.com/v1 \
AGENT_STUDIO_CCR_POC_API_KEY=... \
AGENT_STUDIO_CCR_POC_MODEL=gpt-5.1 \
bun run smoke:ccr
```

预期输出包含：

- `CCR route（已脱敏）`
- `CCR config（已脱敏）`
- `CCR smoke 摘要`

如果 `CCR smoke 摘要.eventTypes` 包含 `RUN_STARTED`、`TEXT_MESSAGE_CONTENT`、`RUN_FINISHED`，且 `text` 非空，则可以把 PoC 矩阵的 `Text streaming` 更新为 Pass，并粘贴摘要作为证据。

本轮已通过 dry-run：

```bash
AGENT_STUDIO_CCR_POC_BASE_URL=https://api.openai.com/v1 \
AGENT_STUDIO_CCR_POC_API_KEY=sk-openai-secret \
AGENT_STUDIO_CCR_POC_MODEL=gpt-5.1 \
AGENT_STUDIO_CCR_POC_ROUTER_API_KEY=router-secret \
AGENT_STUDIO_CCR_POC_ROUTER_PORT=4555 \
bun run scripts/ccr-runtime-smoke.ts --dry-run
```

结果：只输出脱敏后的 route/config，并显示 `dry-run 完成：未启动 CCR，未调用上游模型。`

## 必须确认的问题

删除 `provider-openai` 前必须确认：

- 哪个命令可以用私有 config 文件启动 CCR。
- 哪些 config 字段定义 providers、model aliases、transformers、router defaults。
- 单个 Claude SDK request 能否通过 `options.model` 指定具体 upstream model，且不需要重启 CCR。
- CCR 是否支持本地 router API key，同时 upstream API key 留在私有 config 或 env 中。

## PoC 矩阵

| 项 | 结果 | 证据 |
|---|---|---|
| Text streaming | Pass | 2026-06-21：`bun run smoke:ccr` 使用 OpenAI-compatible 上游 `https://aiproxy.cloud-ip.cc/v1`、模型 `gpt-5.5`。事件摘要：`RUN_STARTED: 1`、`TEXT_MESSAGE_START: 1`、`TEXT_MESSAGE_CONTENT: 5`、`TEXT_MESSAGE_END: 1`、`RUN_FINISHED: 1`；输出文本：`CCR text streaming smoke ok`。 |
| Read/Bash/Edit tool calls | Not run |  |
| HITL approve/deny | Not run |  |
| Session resume | Not run |  |
| Regenerate | Not run |  |
| File checkpoint rewind | Not run |  |
| Run-scoped model selection | Not run |  |
| Usage | Not run | 同一次 smoke 返回 `inputTokens: 0`、`outputTokens: 0`、`totalCostUsd: 0`，只能说明回调触发，不能证明上游 usage 映射有效。 |
| Cancel | Not run |  |
| Error mapping | Not run |  |

## PoC Gate 结论

当前不能删除 `sidecar/src/agui/provider-openai`：

- 尚未验证 Read/Bash/Edit tool calls、HITL approve/deny、session resume、regenerate、file checkpoint rewind。
- 尚未验证 run-scoped model selection 经过 CCR 不需要重启服务。
- 尚未验证 cancel、usage、error mapping 在 CCR 转发路径上的实际表现。

因此本阶段只完成 Claude SDK + managed CCR runtime 的主路径接入；旧 OpenAI adapter 暂时保留为 PoC gate 未通过时的回退资产，后续拿到端到端证据后再删除。
