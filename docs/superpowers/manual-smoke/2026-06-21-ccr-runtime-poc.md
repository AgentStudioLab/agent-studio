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
- 发布态 sidecar 是 `bun build --compile` 单二进制，不能假设存在 `node_modules/.bin/ccr`；必须验证 CCR CLI 文件可从依赖解析，或被提取/复制到真实磁盘路径后再 spawn。

## 必须确认的问题

删除 `provider-openai` 前必须确认：

- 哪个命令可以用私有 config 文件启动 CCR。
- 哪些 config 字段定义 providers、model aliases、transformers、router defaults。
- 单个 Claude SDK request 能否通过 `options.model` 指定具体 upstream model，且不需要重启 CCR。
- CCR 是否支持本地 router API key，同时 upstream API key 留在私有 config 或 env 中。

## PoC 矩阵

| 项 | 结果 | 证据 |
|---|---|---|
| Text streaming | Not run |  |
| Read/Bash/Edit tool calls | Not run |  |
| HITL approve/deny | Not run |  |
| Session resume | Not run |  |
| Regenerate | Not run |  |
| File checkpoint rewind | Not run |  |
| Run-scoped model selection | Not run |  |
| Usage | Not run |  |
| Cancel | Not run |  |
| Error mapping | Not run |  |
