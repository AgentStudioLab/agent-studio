# CLAUDE.md

本文件是 Claude Code 在此仓库工作的基准说明。

## 项目结构

仓库包含三个独立子项目，**不要引入 package workspace**：

- `src/`：React 19 + TypeScript + Tailwind v4 + shadcn 前端（Vite 8 / rolldown）
- `src-tauri/`：Tauri v2 Rust 外壳，负责启动 sidecar 和持久化
- `sidecar/`：Bun + Hono HTTP/SSE 服务，按平台编译为原生二进制
- `scripts/build-sidecar.ts`：编排 `bun build --compile` 的 sidecar 构建

Vite 必须保留在仓库根目录，因为 `src-tauri/tauri.conf.json` 的 `frontendDist: "../dist"` 按 `src-tauri/` 相对路径解析。

## 前端目录

采用 feature-folder + co-location：页面组合器、私有组件、hooks/utils 放在同一 feature 内；没有 `views/`；不要新增 `index.ts` barrel。

```
src/
  app/                 # AppShell / RouterView / 全局布局状态
  features/
    agent-workspaces/  # AgentsView / AgentSpaceView / agent workspace 详情
    auth/
    billing/
    composer/
    customize/
    new-task/
    scheduled/
    settings/
    sidebar/
    skills/
    task/
    tasks/
  shared/              # 第二个 feature 复用时才提升到这里
  components/ui/       # shadcn primitives，不要手动改
  components/ai-elements/ # ai-elements primitives，不要手动改
  lib/
  styles/              # 三层 design tokens
```

规则：

- View 保持薄组合器，复杂逻辑放 feature-local hooks/utils。
- 私有子组件留在所属 feature 内；跨 feature 复用才进 `shared/`。
- 使用直接路径导入，例如 `@/features/task/TaskView`，不要通过 barrel。
- 新功能优先新建 `src/features/<feature>/`，不要塞进 `app/` 或 `shared/`。

## 常用命令

```bash
bun run dev                          # Vite only，http://localhost:1420
bun run build                        # tsc -b && vite build
bun run build:sidecar -- --host-only # 仅当前 host sidecar
bun run build:sidecar                # 全部 sidecar target
bun run tauri:dev                    # 完整 Tauri dev
bun run tauri:build                  # release build

cargo check --manifest-path src-tauri/Cargo.toml

bun test                              # 前端测试，Bun runner
cd sidecar && bun test               # sidecar 测试
bunx tsc --noEmit -p tsconfig.app.json
cd sidecar && bunx tsc --noEmit
```

测试统一使用 Bun runner；所有 `*.test.ts(x)` 从 `bun:test` 导入。本仓库没有 vitest。

Sidecar target 仅支持：

- `bun-darwin-arm64` → `aarch64-apple-darwin`
- `bun-darwin-x64` → `x86_64-apple-darwin`
- `bun-windows-x64` → `x86_64-pc-windows-msvc`

无 Linux 支持。

## 架构速记

React 通过 Tauri `invoke('get_sidecar_info')` 获取 `{ port, token }`，再用 `fetch http://127.0.0.1:<port>/*` + Bearer token 调 sidecar。前端 client 在 `src/lib/sidecar-client.ts`。

Tauri 启动时选择空闲端口、生成 32 位 `rand::distr::Alphanumeric` token，并通过 `shell.sidecar(...).spawn` 启动 sidecar。退出时要 kill 子进程。

Sidecar 是 provider-agnostic 的 AGUI run engine：

- `routes/*` 接 HTTP/SSE。
- `agent/runWorker.ts` 是唯一执行入口。
- `agui/core/runLoop.ts` 消费 provider events 并 append 到 `run_events`。
- `agui/provider-claude/` 是唯一 provider 实现，修改前必须查阅 `claude-agent-sdk-reference` skill。

前端 AGUI runtime 在 `src/lib/agui/`：

- `runtime/` 管 `ChatState`、SSE replay、send/regenerate/cancel/resume/attach。
- `react/` 用 `useSyncExternalStore` 将 runtime 绑定到 React。
- `MessageQueueContext.tsx` 负责 run 期间的 per-thread 消息排队。

## 必守约定

1. Tauri Rust crate 与 npm plugin 版本必须 major+minor 对齐：`tauri-plugin-shell` ↔ `@tauri-apps/plugin-shell`，`tauri-plugin-store` ↔ `@tauri-apps/plugin-store`。
2. Capability 使用 `shell:allow-spawn`，不要换成 `shell:allow-execute`。
3. Vite `build.target` 保持 `"esnext"`。
4. `@tailwindcss/node` 依赖显式 `esbuild` devDep，不要移除。
5. shadcn 配置是 `radix-nova`；新增组件用 `bunx shadcn@latest add <component>`。
6. Sidecar binaries 已 gitignore；`tauri dev` 请用 `bun run tauri:dev`，不要裸跑。
7. 样式必须走三层 design token：`primitives → semantic → components → shadcn-alias → Tailwind @theme inline`。改样式前先查 `design-tokens` skill；禁止在 `src/components/` 或 `src/features/` 硬编码 hex/raw HSL。
8. 反 AI slop：不要紫色渐变、emoji 装饰 icon、圆角左 border 色条；优先单一 `brand-100` 橙色和 `lucide-react` inline SVG。
9. 一个 thread 同时只能有一个 live run。`POST /runs` 和 regenerate 遇到 active run 必须返回 409 `{error:"run_in_progress", activeRunId}`，前端用 `RunInProgressError` 重新入队。
10. `run_events` append-only 且 seq ordered；run output 只能通过 `store.appendEvent` 持久化；buffered messages 只在 run terminal flush。
11. Commit message 必须写英文，优先 Conventional Commit 风格。
12.  写实施计划文档输出一定要用中文。
13. 代码需要有详细的中文注解。

## Skills

项目 skills 在 `.claude/skills/`：

- `design-tokens`：任何样式改动前必须用。
- `ai-elements`：安装或调整 AI chat/agent UI primitives 前使用。
- `vercel-react-best-practices`：写 React/Next 性能相关代码时使用。
- `claude-agent-sdk-reference`：修改 `@anthropic-ai/claude-agent-sdk` 相关代码前使用，尤其是 `sidecar/src/agui/provider-claude/`。
- `theme-creator`：新增 brand theme / 主题色 / skin 时使用。
- `skill-creator`：创建或修改 skills 时使用。

