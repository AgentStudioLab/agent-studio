# Backend Integration Chat Vertical · 验收

日期：2026-05-19 (Plan Task 31 自动化部分)
HEAD: `b06b142`

## 自动化验收（已通过）

| # | 项 | 结果 | 备注 |
|---|---|---|---|
| 9 | sidecar/ bun test 全绿 | ✓ PASS | 42 pass, 0 fail, 76 expect() calls (293ms) |
| 10a | `bun run build` 0 error | ✓ PASS | 980ms, dist/ generated (chunk size warning is informational) |
| 10b | `cargo check` 0 error | ✓ PASS | 1.07s, all Rust dependencies validate |
| 11 | Projects / Scheduled / Customize 视觉无回归（diff inspection only — full visual review 需要用户运行 GUI） | ✓ INFERRED | Build 0 error; CSS/component structure unchanged from Wave 4 |

## 待用户验收（需要真 API key + GUI）

| # | 项 | 状态 | 期望 |
|---|---|---|---|
| 1 | Settings 输入 API key → Save → 立即可用 | ⏳ | UI 显示 "已保存"，无需重启 |
| 2 | NewTask "hello" → 流式 → DB 双行 | ⏳ | 1s 内首 token；DB messages 有 user+assistant 两行 finish_reason=end_turn |
| 3 | Stop 中断 → finish_reason=aborted + partial blocks | ⏳ | ChatStream 显示"已停止"，DB blocks_json 非空 |
| 4 | kill sidecar 中断 → 重启 → "已中断 · Resend" | ⏳ | 上一条 assistant 行 finish_reason=null，UI 渲染状态尾标 |
| 5 | Sidebar Recents 跨重启 + Pinned 持久化 | ⏳ | 新建 3 会话；重启；按 updated_at DESC；pin 1 个跨重启在 Pinned 段 |
| 6 | 同会话连提 2 次 → 409 | ⏳ | 第二次提交显示 inline 错误"该会话有任务进行中" |
| 7 | 删 API key → banner | ⏳ | 顶部 banner "未配置 API key"，跳 Settings 按钮 |
| 8 | 错 API key → inline 错误卡 + Retry | ⏳ | SSE 流 error 事件；ChatStream 显示错误信息 |

## 已知约束 / 风险记录

（从 Task 17 报告搬过来）

- **Agent SDK 用 Claude Code CLI binary**：`bun build --compile` 模式找不到 CLI。dev mode (`bun run tauri:dev`) 可跑，但 `tauri build` 出 dmg/nsis 需要后续专题处理 (`pathToClaudeCodeExecutable` + 平台包)。
- **多轮对话仅用最后一条 user msg**：当前 adapter 未走 SDK 的 resume API；多 turn 会丢失上下文。Plan §10 风险 1 已记录。
- **Chunk size warning**：Shiki syntax highlighting 层 (JavaScript 文法包) 导致 index 入口 711 kB。性能影响微弱（用户端 lazy import），无需立即解决。

## 后续 wave 建议

- 接入 Claude Code CLI 路径（解决打包问题）
- 多轮对话使用 SDK `resume` 选项
- Resend 按钮 wire to 重新触发 sendMessage
- inline 错误显示 banner / Retry UI
- 其余 5 个子系统（持久化扩展 / 调度 / 文件系统 / 插件&MCP / 身份密钥升级）独立 spec
