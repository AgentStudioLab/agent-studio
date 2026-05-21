# Agent Studio 项目架构

> 基于 React 19 + Tauri v2 + Bun sidecar 的桌面 AI Agent 应用  
> 上次更新：2026-05-21

---

## 整体架构：三层独立子系统

```
┌─────────────────────────────────────────────────────────────┐
│                    React 19 前端 (Vite 8)                    │
│   src/                                                      │
│   ├── app/        App 级 chrome + 路由                       │
│   ├── features/   业务 feature（按功能垂直切分）               │
│   ├── components/ shadcn + ai-elements UI 组件库             │
│   ├── styles/     3 层设计 token 系统                        │
│   ├── lib/        运行时、数据层、mock、工具函数               │
│   └── i18n/       国际化（中/英）                             │
└───────────────────────┬─────────────────────────────────────┘
                        │ invoke('get_sidecar_info')
                        │ fetch http://127.0.0.1:<port>/
                        │ Bearer <token>
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 Tauri v2 Rust Shell                         │
│   src-tauri/                                                │
│   ├── src/lib.rs    启动 sidecar、分配端口/token              │
│   ├── src/main.rs   入口                                    │
│   ├── capabilities/ 安全策略（allow-spawn）                   │
│   └── tauri.conf.json                                       │
└───────────────────────┬─────────────────────────────────────┘
                        │ shell.sidecar(...).spawn
                        │ --port=<n> --token=<t>
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Bun + Hono HTTP/SSE 后端                       │
│   sidecar/                                                  │
│   ├── src/server.ts           Hono 服务入口                  │
│   ├── src/routes/             API 路由                      │
│   ├── src/agent/              Claude Agent SDK 运行时        │
│   ├── src/agui/core/          Agent GUI 核心引擎             │
│   ├── src/agui/provider-claude/ Claude API provider          │
│   ├── src/agui/store-sqlite/  SQLite 持久化                  │
│   └── src/services/           业务逻辑                      │
└─────────────────────────────────────────────────────────────┘
```

### 通信方式

1. **前端 -> Tauri**：`window.__TAURI__.invoke('get_sidecar_info')` — 一次性调用，获取 `{ port, token }`
2. **前端 -> Sidecar**：`fetch http://127.0.0.1:<port>/*` + `Authorization: Bearer <token>`
   - 普通请求用 `fetch`
   - SSE 流用 `fetch + ReadableStream` 手动解析（不用 EventSource，无法带 auth header）
3. **Tauri 启动 Sidecar**：分配随机端口 + 32 位 Alphanumeric token，`shell.sidecar(...).spawn`

---

## 前端目录结构 (`src/`)

Feature-folder + co-location 原则。每个 feature 自包含 View + 私有子组件。无 `views/` 文件夹，无 barrel export。

```
src/
├── App.tsx                              # React 入口
├── main.tsx                             # 挂载点
├── index.css                            # Tailwind v4 @theme inline
│
├── app/                                 # 应用级框架
│   ├── AppShell.tsx                     # 三栏布局（Sidebar | Main | Aside）
│   ├── AppShellContext.tsx              # 全局状态（currentView, setView, preview, hideSidebar）
│   ├── RouterView.tsx                   # currentView -> 对应 View 路由
│   └── MacTitlebar.tsx                  # macOS 覆盖式标题栏
│
├── features/                            # 业务模块（按功能垂直切分）
│   ├── sidebar/                         # 侧边栏
│   │   ├── Sidebar.tsx                  # 侧边栏容器
│   │   ├── SidebarContent.tsx           # 侧边栏内容
│   │   ├── NavItem.tsx                  # 导航项
│   │   ├── PinnedItem.tsx               # 固定项目
│   │   ├── RecentItem.tsx               # 最近项目
│   │   ├── UserBar.tsx                  # 用户栏
│   │   ├── UserPopover.tsx              # 用户弹出菜单
│   │   ├── SidebarToggle.tsx            # 侧边栏折叠
│   │   ├── UpdateCard.tsx               # 更新提示卡片
│   │   └── SidebarItemContextMenu.tsx   # 右键菜单
│   │
│   ├── new-task/                        # 新建任务
│   │   └── NewTaskView.tsx
│   │
│   ├── task/                            # 任务主界面
│   │   ├── TaskView.tsx                 # 任务页面编排
│   │   ├── TaskHeader.tsx               # 任务头部
│   │   ├── TaskChatStream.tsx           # 聊天流容器
│   │   ├── ChatStream.tsx               # 消息流
│   │   ├── TaskMessageInput.tsx         # 消息输入框
│   │   ├── TaskRightPanel.tsx           # 右侧面板容器
│   │   ├── PreviewPane.tsx              # 预览面板
│   │   ├── ContextTab.tsx               # 上下文标签页
│   │   ├── FilesTab.tsx                 # 文件标签页
│   │   ├── ProcessTab.tsx               # 进程标签页
│   │   ├── ProcessGroup.tsx             # 进程分组
│   │   ├── ToolCallTimeline.tsx         # 工具调用时间线
│   │   ├── ToolApprovalCard.tsx         # 工具审批卡片
│   │   ├── MessageActions.tsx           # 消息操作
│   │   ├── UserMessage.tsx              # 用户消息
│   │   ├── ArtifactInlineCard.tsx       # 内联产物卡片
│   │   ├── PresetQuestion.tsx           # 预设问题
│   │   └── groupBlocks.test.ts          # 块分组测试
│   │
│   ├── projects/                        # 项目列表
│   │   ├── ProjectsView.tsx
│   │   ├── ProjectCard.tsx
│   │   └── NewProjectModal.tsx
│   │
│   ├── project-detail/                  # 项目详情
│   │   ├── ProjectDetailView.tsx
│   │   ├── InstructionsCard.tsx         # 指令卡片
│   │   ├── MemoryCard.tsx               # 记忆卡片
│   │   ├── ComputerContextCard.tsx       # 电脑上下文卡片
│   │   ├── ScheduledMiniCard.tsx         # 定时任务小卡片
│   │   └── CollapsibleCard.tsx          # 可折叠卡片容器
│   │
│   ├── scheduled/                       # 定时任务
│   │   ├── ScheduledListView.tsx
│   │   ├── ScheduledDetailView.tsx
│   │   ├── ScheduledCard.tsx
│   │   ├── NewScheduledModal.tsx
│   │   ├── FrequencyChip.tsx            # 频率标签
│   │   └── KeepAwakeBanner.tsx          # 保持唤醒横幅
│   │
│   ├── customize/                       # 自定义
│   │   ├── CustomizeView.tsx            # 自定义页面编排
│   │   ├── CustomizeNav.tsx             # 自定义导航
│   │   ├── CustomizeHome.tsx            # 自定义首页
│   │   ├── AgentsBody.tsx               # Agent 管理
│   │   ├── AgentCard.tsx
│   │   ├── AgentDetail.tsx
│   │   ├── SkillsBody.tsx               # 技能管理
│   │   ├── SkillCard.tsx
│   │   ├── PluginsBody.tsx              # 插件管理
│   │   ├── PluginCard.tsx
│   │   └── PluginCategoryChips.tsx      # 插件分类筛选
│   │
│   └── settings/                        # 设置
│       ├── SettingsView.tsx
│       └── ProfileForm.tsx
│
├── shared/atoms/                        # 跨 feature 共享原子组件
│   ├── BrandStar.tsx                    # 品牌 Logo（橙色星）
│   ├── InitialsAvatar.tsx               # 字母头像方块
│   ├── StatusDot.tsx                    # 状态指示圆点
│   ├── ThemeSegment.tsx                 # 主题切换（light/dark）
│   ├── LanguageSegment.tsx              # 语言切换（中/EN）
│   └── ThinkingSpinner.tsx              # 思考加载动画
│
├── components/
│   ├── ui/                              # shadcn 基础组件（手工不改）
│   │   ├── button.tsx, card.tsx, dialog.tsx
│   │   ├── dropdown-menu.tsx, popover.tsx
│   │   ├── input.tsx, select.tsx, switch.tsx
│   │   ├── tabs.tsx, badge.tsx, avatar.tsx
│   │   ├── tooltip.tsx, command.tsx, scroll-area.tsx
│   │   ├── separator.tsx, collapsible.tsx, hover-card.tsx
│   │   ├── alert.tsx, alert-dialog.tsx
│   │   ├── textarea.tsx, spinner.tsx
│   │   ├── input-group.tsx, button-group.tsx
│   │   └── ...（约 22 个）
│   │
│   └── ai-elements/                     # vercel/ai-elements AI 组件（手工不改）
│       ├── conversation.tsx             # 对话容器
│       ├── message.tsx                  # 消息渲染
│       ├── prompt-input.tsx             # 提示输入框
│       ├── chain-of-thought.tsx         # 思考链
│       ├── reasoning.tsx                # 推理展示
│       ├── tool.tsx                     # 工具调用展示
│       ├── code-block.tsx               # 代码块
│       ├── file-tree.tsx                # 文件树
│       ├── artifact.tsx                 # 产物渲染
│       ├── canvas.tsx                   # 画布
│       ├── plan.tsx                     # 计划展示
│       ├── task.tsx                     # 任务展示
│       ├── toolbar.tsx                  # 工具栏
│       ├── confirmation.tsx             # 确认对话框
│       ├── shimmer.tsx                  # 加载闪烁
│       └── sprite-loader.tsx            # 精灵加载动画
│
├── styles/                              # 3 层设计 token 系统
│   ├── primitives/                      # 原始 token（不直接引用）
│   │   ├── colors.css
│   │   ├── radius.css
│   │   ├── spacing.css
│   │   └── typography.css
│   ├── semantic/                        # 语义 token（组件引用层）
│   │   ├── colors.css
│   │   ├── radius.css
│   │   └── spacing.css
│   ├── components/                      # 组件级 token
│   │   ├── button.css
│   │   ├── card.css
│   │   └── input.css
│   ├── shadcn-alias.css                 # shadcn/ai-elements token 桥接
│   └── globals.css                      # 全局基础样式
│
├── lib/
│   ├── agui/                            # Agent GUI 协议 + 运行时
│   │   ├── runtime/                     # SSE 协议、reducer、状态管理
│   │   │   ├── types.ts                 # 核心类型
│   │   │   ├── protocol.ts              # SSE 协议定义
│   │   │   ├── reducer.ts               # 状态 reducer
│   │   │   ├── runtime.ts               # 运行时核心
│   │   │   ├── runtime.test.ts
│   │   │   ├── sse.ts                   # SSE 连接管理
│   │   │   ├── sweep.ts                 # 状态清理
│   │   │   ├── thinking.ts              # thinking 块解析
│   │   │   └── api.ts                   # API 封装
│   │   └── react/                       # React hooks
│   │       ├── useChat.ts               # 聊天 hook
│   │       └── useThreadStatuses.ts     # 线程状态 hook
│   │
│   ├── data/                            # 数据层
│   │   ├── conversations.ts
│   │   ├── queries.ts
│   │   ├── settings.ts
│   │   └── types.ts
│   │
│   ├── mock/                            # 静态测试数据
│   │   ├── types.ts
│   │   ├── agents.ts, projects.ts, scheduled.ts
│   │   ├── skills.ts, plugins.ts
│   │   ├── pinned.ts, recents.ts
│   │   ├── files.ts, mcp-servers.ts
│   │   └── ...
│   │
│   ├── sidecar-client.ts                # Tauri invoke + fetch/SSE 封装
│   ├── useThemeMode.ts                  # 主题 hook
│   ├── useLanguage.ts                   # 国际化 hook
│   └── utils.ts                         # 工具函数
│
└── i18n/                                # 国际化
    ├── locales/en/                      # English
    └── locales/zh/                      # 中文
```

---

## Tauri Shell (`src-tauri/`)

```
src-tauri/
├── src/
│   ├── lib.rs              # 核心：setup() 分配端口/token、启动 sidecar、
│   │                       #   SidecarInfo 状态管理、退出时 kill child
│   └── main.rs             # 入口
│
├── capabilities/
│   └── default.json        # 安全策略：仅 shell:allow-spawn
│                           # （非 allow-execute，sidecar 是长进程）
│
├── tauri.conf.json         # Tauri 配置，frontendDist: "../dist"
├── Cargo.toml              # Rust 依赖（tauri-plugin-shell, tauri-plugin-store）
├── build.rs                # Tauri 构建脚本
└── binaries/               # 编译后的 sidecar 二进制（gitignored）
    └── agent-studio-sidecar-aarch64-apple-darwin
```

### Tauri 职责

| 职责 | 实现 |
|------|------|
| 启动 sidecar 进程 | `portpicker` 选空闲端口，`rand` 生成 32 位 token |
| 缓存 Sidecar 连接信息 | `app.manager(SidecarInfo { port, token })` |
| 持久化 | `tauri-plugin-store`（Rust 端 JSON KV） |
| 进程生命周期 | `Shell.sidecar(...).spawn()`，`RunEvent::Exit` 时 `child.kill()` |

---

## Sidecar 后端 (`sidecar/`)

```
sidecar/
├── src/
│   ├── server.ts                  # Hono 服务入口（HTTP + SSE）
│   ├── types.ts                   # 全局类型定义
│   ├── db.ts                      # bun:sqlite 数据库初始化
│   │
│   ├── routes/                    # API 路由层
│   │   ├── health.ts              # GET /health
│   │   ├── conversations.ts       # 对话 CRUD
│   │   ├── messages.ts            # 消息 CRUD
│   │   ├── runs.ts                # Agent 运行管理
│   │   └── settings.ts            # 设置
│   │
│   ├── agent/
│   │   └── runWorker.ts           # Claude Agent SDK 执行器
│   │
│   ├── agui/                      # Agent GUI 协议引擎（服务端侧）
│   │   ├── core/                  # 核心引擎
│   │   │   ├── types.ts           # 核心类型
│   │   │   ├── store-types.ts     # 存储类型
│   │   │   ├── provider-types.ts  # Provider 类型
│   │   │   ├── runLoop.ts         # 运行循环
│   │   │   ├── streamConsumer.ts  # 流消费
│   │   │   ├── interrupts.ts      # 中断系统
│   │   │   └── encoder.ts         # 编码器
│   │   ├── provider-claude/       # Claude API Provider
│   │   │   ├── provider.ts        # Provider 实现
│   │   │   ├── bridge.ts          # Agent SDK 桥接
│   │   │   ├── interrupt-bus.ts   # 中断总线
│   │   │   ├── bridge.test.ts
│   │   │   └── interrupt-bus.test.ts
│   │   └── store-sqlite/          # SQLite 持久化 Store
│   │       └── createBunSqliteRunStore.ts
│   │
│   └── services/                  # 业务逻辑层
│       ├── apiKey.ts              # API Key 管理
│       ├── messages.ts            # 消息业务逻辑
│       ├── threads.ts             # 线程业务逻辑
│       └── ulid.ts                # ULID 生成器
│
├── dev.db*                        # 开发 SQLite 数据库文件
├── package.json                   # 依赖：hono, @anthropic-ai/sdk, bun:sqlite
└── tsconfig.json
```

---

## 构建与部署

### 关键命令

| 命令 | 用途 |
|------|------|
| `bun run dev` | Vite 开发服务器 (`:1420`) |
| `bun run build` | TypeScript 检查 + Vite 构建 -> `dist/` |
| `bun run build:sidecar -- --host-only` | 编译当前平台 sidecar |
| `bun run build:sidecar` | 编译全部 3 目标 sidecar |
| `bun run tauri:dev` | 完整应用开发（= build:sidecar + tauri dev） |
| `bun run tauri:build` | 发布构建（所有 sidecar + Tauri 打包） |
| `cd sidecar && bun run dev` | Sidecar 独立运行（固定端口 4123） |

### Sidecar 编译目标

| 目标平台 | Bun 编译目标 | Tauri triple |
|----------|-------------|-------------|
| macOS ARM64 | `bun-darwin-arm64` | `aarch64-apple-darwin` |
| macOS x64 | `bun-darwin-x64` | `x86_64-apple-darwin` |
| Windows x64 | `bun-windows-x64` | `x86_64-pc-windows-msvc` |

> 不支持 Linux — 明确的项目决策。

---

## 设计约定

### 视觉身份

- 紫色渐变、emoji 图标、圆角左边框色条、SVG 头像 -> 全部禁止
- 单一 brand-100 橙色 + `lucide-react` inline SVG + `InitialsAvatar` 字母方块
- Anthropic 视觉身份 = 克制

### 样式规则

- 所有颜色、间距、圆角必须通过 3 层 token 系统
- 组件引用 `var(--brand-100)` 等语义 token
- 禁止在 `src/components/` 或 `src/features/` 中硬编码 hex / HSL
- 单轴主题：`data-mode="light|dark"`（无 `data-theme`）

### 代码规范

- View 组件 < 80 行，逻辑抽取到 feature-local hooks/utils
- 私有组件留在 feature 内，第二个 feature 需要时才提升到 `shared/`
- 直接路径导入（`@/features/task/TaskView`），无 barrel
- 新 feature -> 新建 `features/<name>/` 目录
- 每个组件附带 `.stories.tsx` Storybook 故事文件
