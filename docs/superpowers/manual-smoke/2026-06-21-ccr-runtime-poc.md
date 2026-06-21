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
- 发布态 sidecar 是 `bun build --compile` 单二进制，不能假设存在 `node_modules/.bin/ccr`；当前实现用 Bun file asset 把 CCR `cli.js` 与 `tiktoken_bg.wasm` 打进 sidecar，并在启动前复制到 `<configDir>/runtime/` 真实磁盘路径。
- 编译态 sidecar 中 `process.execPath` 指向 `agent-studio-sidecar` 自身，不能用它重新执行 CCR CLI。托管启动改为 Bun `Worker`，通过 bootstrap 脚本在加载 CCR 前修正 `process.argv`。
- CCR 内部使用 `os.homedir()` 查找配置；仅设置 Worker 的 `HOME` 不足以隔离配置。bootstrap 会在 `require(cliPath)` 前把 `os.homedir()` patch 到 `CCR_PRIVATE_HOME`。
- `CcrManager.ensure()` 必须等待 CCR ready 后再返回。run/resume 前由 `withCcrReady()` 等待 CCR；如果 CCR 不可用，直接产生 `RUN_ERROR`，避免 Claude Agent SDK 进入不可见重试。

## 本地实现验证

已通过：

```bash
cd sidecar && bun test src/ccr
```

结果：`24 pass, 0 fail`

已通过：

```bash
cd sidecar && bun test src/ccr src/agui/provider-factory.test.ts src/agui/provider-claude/provider-env.test.ts src/services/providerSettings.test.ts src/lib/providerProfiles.test.ts
```

结果：`75 pass, 0 fail`

已通过：

```bash
cd sidecar && bunx tsc --noEmit
```

结果：退出码 `0`

已通过：

```bash
cd sidecar && bun test
```

结果：`523 pass, 0 fail`

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

已通过编译态 sidecar + 私有 CCR 目录 smoke：

- CCR 监听 `127.0.0.1:<port>`。
- CCR 日志显示读取的是 Agent Studio app data 下的私有配置，而不是用户全局 `~/.claude-code-router/config.json`。
- 临时 sidecar 进程停止后无残留。

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

删除 `provider-openai` 前已确认：

- 哪个命令可以用私有 config 文件启动 CCR。
- 哪些 config 字段定义 providers、model aliases、transformers、router defaults。
- 单个 Claude SDK request 能否通过 `options.model` 指定具体 upstream model，且不需要重启 CCR。
- CCR 是否支持本地 router API key，同时 upstream API key 留在私有 config 或 env 中。

## PoC 矩阵

| 项 | 结果 | 证据 |
|---|---|---|
| Text streaming | Pass | 2026-06-21：`bun run smoke:ccr` 使用 OpenAI-compatible 上游 `https://aiproxy.cloud-ip.cc/v1`、模型 `gpt-5.5`。事件摘要：`RUN_STARTED: 1`、`TEXT_MESSAGE_START: 1`、`TEXT_MESSAGE_CONTENT: 5`、`TEXT_MESSAGE_END: 1`、`RUN_FINISHED: 1`；输出文本：`CCR text streaming smoke ok`。 |
| Read/Bash/Edit tool calls | Partial Pass | 2026-06-21：页面重启后，用户使用既有 OpenAI-compatible 配置验证已走新逻辑，工具调用不再复现卡重试问题。当前证据覆盖页面真实路径与基础工具调用；Bash/Edit/HITL 仍需后续专项矩阵补齐。 |
| HITL approve/deny | Not run |  |
| Session resume | Not run |  |
| Regenerate | Not run |  |
| File checkpoint rewind | Not run |  |
| Run-scoped model selection | Pass | `resolveCcrRuntimeRoute` 为每个 `{providerId, modelId}` 生成稳定 `agentstudio/<provider>/<model>` key；`server.ts` 把该 key 传给 Claude Agent SDK 的 model，而不是修改 CCR 全局 default 或按 run 重启 CCR。单元测试覆盖 route/model key，页面验证显示既有 OpenAI-compatible 模型走新 CCR model key。 |
| Usage | Not run | 同一次 smoke 返回 `inputTokens: 0`、`outputTokens: 0`、`totalCostUsd: 0`，只能说明回调触发，不能证明上游 usage 映射有效。 |
| Cancel | Not run |  |
| Error mapping | Not run |  |

## PoC Gate 结论

当前已经删除 `sidecar/src/agui/provider-openai`。

删除理由：

- 托管 CCR 在 `bun run smoke:ccr`、编译态 sidecar、真实页面 OpenAI-compatible 配置中均已验证可启动并进入新链路。
- `withCcrReady()` 已把 CCR ready 检查纳入 run/resume 前置条件；CCR 启动失败会产生可见 `RUN_ERROR`，不再让页面长期显示重试。
- `provider-factory` 已拒绝 `openai-compatible` runtime；OpenAI-compatible 配置只作为 CCR upstream 协议存在。
- 旧 `provider-openai` 只支持 text streaming，继续保留会制造第二条能力更弱的运行时路径。

仍需后续补齐的验证项：

- HITL approve/deny。
- session resume。
- regenerate。
- file checkpoint rewind。
- cancel。
- usage token/cost 映射。
- Bash/Edit 工具调用的完整矩阵。
