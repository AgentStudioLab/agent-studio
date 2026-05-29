# Agent Studio

[English](./README.md) | **简体中文**

一个用于运行、调度和管理 Claude 智能体对话的桌面应用。基于 [Claude Agent SDK](https://docs.claude.com/en/agent-sdk) 构建，为每一段对话提供真正的智能体运行时——带人工审批（human-in-the-loop）的工具调用、工作区沙箱、技能（skills）、定时（周期性）任务、用量统计和审计日志，并封装在原生 Tauri 外壳中。

> 仅支持 macOS 与 Windows（不支持 Linux——这是明确的项目决策）。

## 功能

- **任务（Tasks）** —— 聊天式的智能体运行，支持实时流式输出、工具调用与推理过程。
- **人工审批（Human-in-the-loop）** —— 修改类工具会弹出审批卡片；底层还有基于路径的工作区沙箱，以及破坏性命令护栏（`rm -rf`、`git reset --hard` 等）。
- **定时任务（Scheduled tasks）** —— 通过 `create_scheduled_task` MCP 工具定义周期性的智能体运行；基于轮询的调度器在后台经由同一条运行路径触发它们。
- **项目（Projects）** —— 对对话进行分组，并附带按项目的指令。
- **技能（Skills）** —— 个人技能（`~/.agent-studio/skills`、`~/.claude/skills`）与内置技能，可按安装实例开关。
- **设置（Settings）** —— API key / base URL、默认模型、权限模式、允许工具白名单、用户档案。
- **用量与审计** —— Token/费用聚合，以及经脱敏处理的工具审计日志。

## 架构

单仓三个相互独立的子项目（**无 workspaces**）：

```
[ React UI (src/) ]
   │  invoke('get_sidecar_info') → { port, token }   (已缓存)
   │  fetch http://127.0.0.1:<port>/* + Bearer <token>  (+ SSE)
   ▼
[ Tauri Rust 外壳 (src-tauri/) ]       [ Bun + Hono 边车 (sidecar/) ]
   以随机端口 + token 拉起边车，          HTTP/SSE 服务器；通过 Claude Agent
   并负责持久化                          SDK 运行智能体；在 SQLite 中以事件溯源
   (tauri-plugin-store)                 方式记录运行日志
```

- **`src/`** —— React 19 + TypeScript + Tailwind v4 + shadcn（Vite 8 / rolldown）。前端 AGUI 运行时（`src/lib/agui/`）是一个与框架无关的对话状态机，通过 `useSyncExternalStore` 绑定到 React。
- **`src-tauri/`** —— Tauri v2 Rust 外壳。挑选一个未占用端口 + 32 位 token，拉起边车，并负责持久化。
- **`sidecar/`** —— Bun + Hono 服务器，按平台编译为单个原生二进制。它承载 AGUI 运行引擎：每一次运行（交互式、重新生成、或定时）都汇入同一个 `runWorker`，流式发出 `RUN_STARTED → … → RUN_FINISHED/RUN_ERROR` 事件，并持久化到一份只追加、按 seq 排序的 `run_events` 日志中，前端可基于 SSE 对其回放/续连。

完整的心智模型（运行生命周期、provider 桥接、消息队列、各项约定）见 [`CLAUDE.md`](./CLAUDE.md)。

## 前置依赖

- [Bun](https://bun.sh)（用作包管理器、开发运行时、测试运行器以及边车编译器）
- [Rust](https://rustup.rs)（stable）+ 对应操作系统的 [Tauri v2 前置依赖](https://v2.tauri.app/start/prerequisites/)（macOS 上为 Xcode Command Line Tools）
- 一个 Anthropic API key（首次启动后在应用内 **Settings** 中配置）

## 快速开始

```bash
bun install                # 安装前端依赖
cd sidecar && bun install  # 安装边车依赖

# 完整桌面应用（前端 + Rust 外壳 + 边车）
bun run tauri:dev
```

首次启动后，打开 **Settings** 填入你的 Anthropic API key（以及可选的 base URL / 默认模型）。

### 其它开发入口

```bash
bun run dev                 # 仅前端 Vite → http://localhost:1420
cd sidecar && bun run dev   # 边车独立运行（dev token，端口 4123）
```

`bun run tauri:dev` 会先编译当前 host 三元组的边车（`build:sidecar --host-only`）；不要直接运行裸 `tauri dev`（它不会构建该二进制）。

## 构建

```bash
bun run build               # tsc -b && vite build → dist/
bun run build:sidecar       # 为全部 3 个目标编译边车
bun run tauri:build         # 全部边车 + Tauri release 构建
cargo check --manifest-path src-tauri/Cargo.toml   # Rust 类型检查
```

边车构建目标（由 `scripts/build-sidecar.ts` 处理）：

| Bun target | Tauri triple |
|---|---|
| `bun-darwin-arm64` | `aarch64-apple-darwin` |
| `bun-darwin-x64` | `x86_64-apple-darwin` |
| `bun-windows-x64` | `x86_64-pc-windows-msvc` |

边车二进制已被 gitignore；`tauri build` 会经由 `beforeBuildCommand` 重新生成它们。

## 测试

测试运行在 **Bun 的测试运行器**上（不是 vitest）—— 前端与边车皆然：

```bash
bun test                          # 前端（在仓库根目录运行）
cd sidecar && bun test            # 边车
bun test path/to/file.test.ts     # 单个文件
bun test -t "name substring"      # 按名称运行单个测试

# 类型检查（不产出文件）
bunx tsc --noEmit -p tsconfig.app.json   # 前端
cd sidecar && bunx tsc --noEmit          # 边车
```

每个 `*.test.ts(x)` 都从 `bun:test` 导入；本仓库中没有 vitest。

## 项目结构

```
src/          React 前端（feature-folder + 就近放置；无 index.ts barrel）
  app/        应用外壳 + 路由              lib/agui/   前端 AGUI 运行时 + React hooks
  features/   各自独立的功能模块            styles/    三层设计令牌系统
src-tauri/    Tauri v2 Rust 外壳（拉起边车、持久化）
sidecar/      Bun + Hono 服务器
  src/agui/core/             与 provider 无关的 AGUI 运行引擎
  src/agui/provider-claude/  Claude Agent SDK 桥接
  src/agui/store-sqlite/     事件溯源的 SQLite 存储
  src/routes/  HTTP/SSE 接口   src/services/  threads、messages、scheduler、usage 等
scripts/      build-sidecar.ts（bun build --compile 编排）
```

## 约定

本仓库有严格且成文的约定——贡献前请阅读 [`CLAUDE.md`](./CLAUDE.md)。要点：

- **样式**必须走三层设计令牌系统（`src/styles/`）；组件中禁止硬编码 hex/HSL。
- **每个线程同一时刻只允许一个活跃运行**是一条不变量（并发 `POST /runs` → 409，并被协作式地重新入队）。
- **`run_events` 只追加**；运行输出只能经由 `store.appendEvent` 持久化，且消息只在运行终止时落库。
- **Tauri 插件版本在 Cargo 与 npm 两侧版本锁定**。
- 项目专属技能（`design-tokens`、`claude-agent-sdk-reference`、`ai-elements` 等）位于 `.claude/skills/`。

## 许可

专有 —— 内部项目。当前未以任何开源许可证发布。
