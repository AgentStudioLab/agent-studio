# Wave 3 · TaskView 装配 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. **Every subagent that touches styling must invoke `design-tokens` skill first.** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 装配第一个完整 view —— TaskView。三栏布局 + 多轮 chat stream（组合 Wave 2 的 ai-elements message/tool/artifact）+ 右栏 tabs（Process/Files/Context）+ 滑入式 PreviewPane。所有数据来自 mock，**不连 sidecar**，但接 useState/Context 让组件可交互（切 tab、点 file 出 PreviewPane）。

**Architecture:**
- `src/lib/mock/` — task / files / skills / mcp 的 mock fixture
- `src/layouts/AppShell.tsx` — 3 栏 chrome（sidebar 260px placeholder + main flex + right aside 320px）
- `src/features/task/` — TaskHeader / TaskChatStream / TaskRightPanel / ProcessTab / FilesTab / ContextTab / PreviewPane
- `src/views/TaskView.tsx` — 装配
- `src/App.tsx` — 挂 AppShell + TaskView 替代 hello-world（保留 sidecar-client.ts 不调用）

**Tech Stack:** React 19 + Tailwind v4 + Tauri v2 + ai-elements (Wave 2) + shadcn (Wave 2) + Bun

**预计工期：** 3 个工作日（11 个 task）

---

## Wave 3 前置约束

1. 每个 task 派 subagent 时，**必须先 invoke `design-tokens` skill**
2. 禁止硬编码 hex / 原始 HSL。值通过 token 链（验收时 grep 双检）
3. **不动** `src-tauri/` `sidecar/` `scripts/` `tauri.conf.json` `Cargo.toml`
4. **不调用** sidecar-client.ts（保留文件，未来 Phase 2 接入）
5. **不接 Tauri 真实 invoke** —— `data-mode` 切换通过 `useThemeMode` 即可
6. 每 task 完成 = git commit；commit 前 `bun run build && bun run build-storybook` 双绿
7. 反 slop 4 条规则（紫色渐变 / emoji icon / 左 border 色条 / SVG 头像）每 PR 必查

---

## Task 1 · Wave 2 baseline 验证 + Mock 数据骨架

**Files (create):**
- `src/lib/mock/types.ts` — TypeScript 类型定义
- `src/lib/mock/task.ts` — 单个完整 task fixture
- `src/lib/mock/files.ts` — 工作树文件 fixture
- `src/lib/mock/skills.ts` — 已加载 skills
- `src/lib/mock/mcp-servers.ts` — MCP servers 状态

Wave 3 开局，先把所有 mock 类型 + 数据备齐，让后续 component task 直接 import。

- [ ] **Step 1: Wave 2 sanity**
   ```bash
   cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio
   git log --oneline -3
   git status --short
   bun run build 2>&1 | tail -3
   bun run build-storybook 2>&1 | tail -3
   rm -rf dist storybook-static
   ```
   HEAD 应该是 `32c1531` 或之后；树干净；双 build 绿。否则 BLOCKED。

- [ ] **Step 2: 写 `src/lib/mock/types.ts`**
   ```ts
   export type StepStatus = "done" | "active" | "pending" | "failed";

   export interface PlanStep {
     id: string;
     status: StepStatus;
     description: string;
   }

   export interface ToolCall {
     id: string;
     type: "bash" | "fs-read" | "fs-write" | "web-search" | "search";
     state: "input-streaming" | "input-available" | "output-available" | "output-error";
     input: Record<string, unknown>;
     output?: string;
     errorText?: string;
     subSteps?: { description: string }[];
   }

   export interface Artifact {
     id: string;
     name: string;
     type: "spreadsheet" | "presentation" | "document" | "markdown" | "code";
     opener?: string; // e.g., "wpsoffice"
   }

   export interface ChatMessage {
     id: string;
     from: "user" | "assistant";
     content: string;
     toolCalls?: ToolCall[];
     artifacts?: Artifact[];
   }

   export interface MockTask {
     id: string;
     title: string;
     plan: PlanStep[];
     messages: ChatMessage[];
     elapsedSeconds: number;
     status: "running" | "done" | "failed" | "paused";
   }

   export interface MockFile {
     name: string;
     path: string;
     type: "markdown" | "spreadsheet" | "presentation" | "code" | "image" | "generic";
     isNew?: boolean;
     content?: string; // populated for preview
   }

   export interface MockSkill {
     id: string;
     name: string;
     initials: string; // 字母方块 avatar
     description: string;
     hue: "orange" | "blue" | "purple" | "red" | "green" | "amber" | "stone";
   }

   export interface MockMcpServer {
     id: string;
     name: string;
     description: string;
     connected: boolean;
   }
   ```

- [ ] **Step 3: 写 `src/lib/mock/task.ts`** — 一个完整的 3 轮多轮 task fixture（参考 PRD § 4.2 示例：扫描不活跃项目 + 生成报表）。包含：plan 4 步（done/done/active/pending）+ messages 6 条（用户 3 + 助手 3）+ assistant 消息包含 toolCalls (bash + fs-read) + 第二个 assistant 消息包含 artifacts (xlsx + pptx)。

- [ ] **Step 4: 写 `src/lib/mock/files.ts`** — 5 个文件 (Q4-report.xlsx, slides.pptx, summary.md, scan.ts, plan.md), 其中两个 isNew: true。

- [ ] **Step 5: 写 `src/lib/mock/skills.ts`** — 4 个 skill (filesystem orange / disk-analyzer blue / xlsx green / cleanup-advisor purple)。

- [ ] **Step 6: 写 `src/lib/mock/mcp-servers.ts`** — 3 个 server (filesystem connected, gmail disconnected, github connected)。

- [ ] **Step 7: 双 build + commit**
   ```bash
   bun run build && bun run build-storybook
   rm -rf dist storybook-static
   git add src/lib/mock/
   git commit -m "feat(mock): add Wave 3 fixture types + data (task/files/skills/mcp)"
   ```

---

## Task 2 · AppShell 三栏骨架

**Files:**
- Create: `src/lib/AppShellContext.tsx` — Context for view + preview state
- Create: `src/layouts/AppShell.tsx` — 三栏 layout
- Create: `src/layouts/AppShell.stories.tsx`

设计：
- 左 sidebar：260px 固定宽，bg-bg-200，仅占位（顶部 logo + 4 nav items "+ New task / Projects / Scheduled / Customize"，不接交互）
- 中间 main：flex-1，bg-bg-100，承载 view content
- 右 aside：320px 固定宽，bg-bg-100，承载 TaskRightPanel（暂留空占位）
- AppShellContext 暴露：`currentView` (string), `setView`, `preview` ({ file: MockFile, open: boolean }), `openPreview`, `closePreview`

- [ ] **Step 1: 写 `src/lib/AppShellContext.tsx`**
   ```tsx
   import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
   import type { MockFile } from "@/lib/mock/types";

   type ViewKey = "new-task" | "task" | "projects" | "project-detail" | "scheduled-list" | "scheduled-detail" | "customize" | "settings";

   interface PreviewState {
     file: MockFile | null;
     open: boolean;
   }

   interface AppShellContextValue {
     currentView: ViewKey;
     setView: (v: ViewKey) => void;
     preview: PreviewState;
     openPreview: (file: MockFile) => void;
     closePreview: () => void;
   }

   const AppShellContext = createContext<AppShellContextValue | null>(null);

   export function AppShellProvider({ children, initialView = "task" as ViewKey }: { children: ReactNode; initialView?: ViewKey }) {
     const [currentView, setView] = useState<ViewKey>(initialView);
     const [preview, setPreview] = useState<PreviewState>({ file: null, open: false });
     const value = useMemo(() => ({
       currentView,
       setView,
       preview,
       openPreview: (file: MockFile) => setPreview({ file, open: true }),
       closePreview: () => setPreview((p) => ({ ...p, open: false })),
     }), [currentView, preview]);
     return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
   }

   export function useAppShell() {
     const ctx = useContext(AppShellContext);
     if (!ctx) throw new Error("useAppShell must be used inside AppShellProvider");
     return ctx;
   }
   ```

- [ ] **Step 2: 写 `src/layouts/AppShell.tsx`**
   ```tsx
   import type { ReactNode } from "react";
   import { Plus, FolderOpen, Clock, Sparkles } from "lucide-react";
   import { useAppShell } from "@/lib/AppShellContext";

   interface AppShellProps {
     main: ReactNode;
     aside?: ReactNode;
   }

   const NAV_ITEMS = [
     { icon: Plus, label: "New task" },
     { icon: FolderOpen, label: "Projects" },
     { icon: Clock, label: "Scheduled" },
     { icon: Sparkles, label: "Customize" },
   ];

   export function AppShell({ main, aside }: AppShellProps) {
     // currentView read for future view switching wire-up; unused here yet
     useAppShell();
     return (
       <div className="flex h-screen min-h-screen w-screen overflow-hidden bg-background text-foreground">
         <aside className="flex w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground" style={{ borderRight: "1px solid hsl(var(--border-300) / 0.15)" }}>
           <div className="flex items-center gap-2 px-4 py-3 text-sm font-medium">Agent Studio</div>
           <nav className="flex flex-col gap-1 px-2 py-2">
             {NAV_ITEMS.map(({ icon: Icon, label }) => (
               <button key={label} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent">
                 <Icon className="size-4" />
                 {label}
               </button>
             ))}
           </nav>
         </aside>
         <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">
           {main}
         </main>
         {aside && (
           <aside className="flex w-[320px] shrink-0 flex-col bg-background" style={{ borderLeft: "1px solid hsl(var(--border-300) / 0.12)" }}>
             {aside}
           </aside>
         )}
       </div>
     );
   }
   ```

- [ ] **Step 3: 写 `AppShell.stories.tsx`** — Default (empty main + aside) + WithContent stories.

- [ ] **Step 4: 双 build + commit** `feat(layout): add AppShell 3-pane chrome + AppShellContext`

---

## Task 3 · TaskHeader

**Files:**
- Create: `src/features/task/TaskHeader.tsx`
- Create: `src/features/task/TaskHeader.stories.tsx`

PRD § 4.2 头部：task title（大字 serif）+ 右侧 chevron 下拉 menu 7 项（Schedule / Turn into skill / Move to project / Pin / Rename / Archive / Delete）。

用 shadcn `dropdown-menu`（已在 Task 2 装）。

- [ ] **Step 1: 写 TaskHeader.tsx** — props: `{ title: string }`，内部用 `DropdownMenu` 触发 7 项 menu。
- [ ] **Step 2: 写 stories** — Default + LongTitle + MenuOpen variant
- [ ] **Step 3: 双 build + commit** `feat(task): add TaskHeader + 7-item menu`

---

## Task 4 · TaskChatStream（组合 message + tool + artifact）

**Files:**
- Create: `src/features/task/TaskChatStream.tsx`
- Create: `src/features/task/TaskChatStream.stories.tsx`

PRD § 4.2 多轮对话区。逻辑：iterate `task.messages`，按 message 类型渲染：
- `from: "user"` → ai-elements `<Message from="user">` + `<MessageContent>{content}</MessageContent>`
- `from: "assistant"` → ai-elements `<Message from="assistant">` + 文本内容 + 嵌套 `<Tool>` for each toolCall + 嵌套 `<Artifact>` for each artifact

artifact 点击触发 `openPreview(file)`（Wave 3 接 Context）。

- [ ] **Step 1: 写 TaskChatStream.tsx** —— props: `{ messages: ChatMessage[]; onOpenArtifact?: (a: Artifact) => void }`，组合 ai-elements。
- [ ] **Step 2: 写 stories** — 用 mock task 的 messages 渲染 SingleUser / SingleAssistant / WithToolCalls / WithArtifacts / FullConversation / SideBySide
- [ ] **Step 3: 双 build + commit** `feat(task): add TaskChatStream composing message+tool+artifact`

---

## Task 5 · ProcessTab（plan + task + elapsed timer）

**Files:**
- Create: `src/features/task/ProcessTab.tsx`
- Create: `src/features/task/ProcessTab.stories.tsx`

PRD § 4.2 Process tab：
- 顶部任务链 (plan steps)：用 ai-elements `Plan` + 自己写 StepMarker
- 中间显示当前 active step 的 sub-steps（用 ai-elements `Task`）
- 底部 `● Task running · 02:13 elapsed` 状态条（用 useEffect 接 elapsedSeconds 累加 + 转 mm:ss）

- [ ] **Step 1: 写 ProcessTab.tsx** —— props: `{ task: MockTask }`。Plan 部分 iterate `task.plan` 渲染 StepMarker；底部用 `setInterval` 累加 elapsedSeconds（仅 status === "running"）。
- [ ] **Step 2: 写 stories** — Running / Done / Failed states
- [ ] **Step 3: 双 build + commit** `feat(task): add ProcessTab w/ plan steps + elapsed timer`

---

## Task 6 · FilesTab

**Files:**
- Create: `src/features/task/FilesTab.tsx`
- Create: `src/features/task/FilesTab.stories.tsx`

PRD § 4.2 Files tab：
- 用 ai-elements `FileTree`（已在 Task 10 装）
- 文件点击触发 `openPreview(file)`
- 底部 "+ Add files to working tree" 按钮（占位）

- [ ] **Step 1: 写 FilesTab.tsx** —— props: `{ files: MockFile[]; onOpenFile?: (f: MockFile) => void }`。Per-type icon mapping (md/xlsx/pptx/ts) + isNew badge。
- [ ] **Step 2: 写 stories** — WithFiles / Empty / WithNewFiles
- [ ] **Step 3: 双 build + commit** `feat(task): add FilesTab using ai-elements/file-tree`

---

## Task 7 · ContextTab（Skills + MCP servers）

**Files:**
- Create: `src/features/task/ContextTab.tsx`
- Create: `src/features/task/ContextTab.stories.tsx`

PRD § 4.2 Context tab：
- "Skills" section：iterate skills，每个用 InitialsAvatar + name + description
- "MCP servers" section：iterate mcp-servers，每个显示绿点/灰点 + name + description

- [ ] **Step 1: 写 ContextTab.tsx** —— props: `{ skills: MockSkill[]; mcpServers: MockMcpServer[] }`。
- [ ] **Step 2: 写 stories** — Default
- [ ] **Step 3: 双 build + commit** `feat(task): add ContextTab w/ skills+mcp lists`

---

## Task 8 · TaskRightPanel（tabs 容器）

**Files:**
- Create: `src/features/task/TaskRightPanel.tsx`
- Create: `src/features/task/TaskRightPanel.stories.tsx`

PRD § 4.2 右栏 tabs：Process / Files / Context。用 shadcn 的 `tabs` 组件（如未装则装 `bunx shadcn@latest add tabs --yes`）。

- [ ] **Step 1: 装 tabs（若没装）**
   ```bash
   ls src/components/ui/tabs.tsx 2>/dev/null || bunx shadcn@latest add tabs --yes
   # handle @/ literal gotcha if needed
   ```
- [ ] **Step 2: 写 TaskRightPanel.tsx** —— props: `{ task; files; skills; mcpServers }`。`Tabs` 包 3 个 `TabsContent`：ProcessTab / FilesTab / ContextTab。
- [ ] **Step 3: 写 stories** — Default
- [ ] **Step 4: 双 build + commit** `feat(task): add TaskRightPanel tabs container`

---

## Task 9 · PreviewPane（滑入 + resize + content）

**Files:**
- Create: `src/features/task/PreviewPane.tsx`
- Create: `src/features/task/PreviewPane.stories.tsx`

PRD § 4.2 文件预览面板：
- 滑入动画：`translateX(60px) → 0` over 0.28s `cubic-bezier(0.4, 0, 0.2, 1)`
- 左边缘 6px hot zone hover 显示 2px 白条 resize handle
- 拖拽改宽度，clamp [360, 720]
- Header：文件名 + opener selector + 刷新 + ✕ 关闭
- 内容按 type 渲染：`md` 用 markdown 简单格式化；`xlsx`/`pptx` 用 ai-elements `Canvas` 包 mock 表格 / slides；`code` 用 `CodeBlock`

- [ ] **Step 1: 写 PreviewPane.tsx** —— props: `{ file: MockFile; onClose: () => void }`。用 `useState` 管 width；mouse drag handler 实现 resize。滑入动画用 Tailwind transition 类 (`transition-transform duration-300 ease-out`)。
- [ ] **Step 2: 写 stories** — MarkdownContent / SpreadsheetContent / PresentationContent / CodeContent / Resizable interaction demo
- [ ] **Step 3: 双 build + commit** `feat(task): add PreviewPane slide-in + resize + per-type renderer`

---

## Task 10 · TaskView 装配

**Files:**
- Create: `src/views/TaskView.tsx`
- Create: `src/views/TaskView.stories.tsx`
- Modify: `src/App.tsx`

把所有 task feature 组合成 view，并替换 hello-world App：
- TaskView：拿 `useAppShell().preview`，render `<AppShell main={...} aside={preview.open ? <PreviewPane/> : <TaskRightPanel/>}>`。当 preview 开了显示 PreviewPane 替代 aside 内容；关掉恢复 TaskRightPanel。
- main 内容：TaskHeader + TaskChatStream。

- [ ] **Step 1: 写 TaskView.tsx**
- [ ] **Step 2: 写 stories** — Default (no preview) / WithPreview (markdown) / WithPreview (xlsx)
- [ ] **Step 3: 修改 src/App.tsx**：去 hello-world，挂 `<AppShellProvider><TaskView /></AppShellProvider>`，可以保留 sidecar-client.ts import 但不调用。
- [ ] **Step 4: 双 build + tauri:dev 验证 + commit** `feat(view): assemble TaskView replacing hello-world App`
   - tauri:dev 验证：bg-100 米白背景 + 三栏布局 + chat stream 出现 + 切 tab 正常 + 点 artifact 触发 preview 滑入

---

## Task 11 · Wave 3 sanity sweep + close

**Files:**
- 无新增；只验证 + commit

- [ ] **Step 1: 视觉自检**
   - `bun run dev` → 1420 端口看 TaskView 渲染
   - `bun run storybook` → 6006 端口看所有 Wave 3 stories 在 light/dark 都正常
   - `bun run tauri:dev` → Tauri 窗口跑通
- [ ] **Step 2: Token discipline grep**
   ```bash
   grep -rn "data-theme" src/ public/ index.html .storybook/ 2>/dev/null  # empty
   grep -rEn "#[0-9a-fA-F]{6}|hsl\(\s*[0-9]" src/components/ src/features/ src/views/ src/layouts/ 2>/dev/null  # empty
   ```
- [ ] **Step 3: 反 slop 4 条目检（手动）**：紫色渐变 / emoji icon / 左 border 色条 / SVG 头像 各 grep
- [ ] **Step 4: Wave 3 close commit**
   ```bash
   git commit --allow-empty -m "chore: Wave 3 complete — TaskView assembled"
   ```

---

## 验收 checklist（Wave 3 完成态）

- [ ] `src/lib/mock/` 含 5 个 fixture 文件，全部类型完整
- [ ] `src/layouts/AppShell.tsx` 三栏布局正确（260/flex/320）
- [ ] `src/lib/AppShellContext.tsx` 暴露 view + preview state
- [ ] `src/features/task/` 含 7 个组件 + 7 个 stories（TaskHeader/TaskChatStream/TaskRightPanel/ProcessTab/FilesTab/ContextTab/PreviewPane）
- [ ] `src/views/TaskView.tsx` 装配以上
- [ ] `src/App.tsx` 替换 hello-world，挂 TaskView
- [ ] `bun run dev` 1420 显示 TaskView，无 console error
- [ ] `bun run tauri:dev` Tauri 窗口显示同样内容，sidecar 仍自动 spawn（但不调用）
- [ ] `bun run build` + `bun run build-storybook` 双绿
- [ ] PreviewPane 滑入 0.28s 流畅、resize handle 工作、内容按 type 正确渲染
- [ ] ProcessTab elapsed timer 真的在动（running 状态下）
- [ ] FilesTab 点击 file → PreviewPane 滑入
- [ ] TaskHeader chevron 弹 7 项 menu
- [ ] 双主题切换无 FOUC，所有 view 在 light/dark 都视觉正确
- [ ] 反 slop 4 条全过、token 自检 0 硬编码

---

## 风险点

0. **TooltipProvider 多实例**（Wave 2 review 标注）：ai-elements 的 message 里 MessageAction、artifact 里 ArtifactAction、prompt-input 里 PromptInputButton 各自 wrap 自己的 `TooltipProvider`。装配 TaskView 时一个屏幕 10+ provider 是浪费。Mitigation: TaskView (Task 10) 顶层挂一个全局 `<TooltipProvider delayDuration={200}>`，确保 child providers 不冲突（Radix 实现下 nested provider 是 no-op）。如有干扰需删 child providers，则在对应 ai-elements 组件做单点修改并记 commit。

1. **PreviewPane resize handle 浏览器兼容性**：mouse events 在 Tauri WebView 可能行为异常。Mitigation: 先用 `pointer-events` 实现，必要时降级 fixed width。
2. **ai-elements `Tool` 组件渲染 mock toolCalls 时 prop shape**：Wave 2 装的 ai-elements Tool 期望特定 `state` 和 `input` 结构。Mitigation: Task 4 / 5 实施时 fit mock data shape 到 Tool 实际 prop。
3. **Storybook stories 渲染 React Context-dependent 组件**：TaskChatStream 调 `useAppShell()` → stories 里需要 wrap `<AppShellProvider>`。Mitigation: 在 preview.tsx 加一个 decorator 或每个 story 显式 wrap。
4. **TaskView 在 Storybook 渲染整页全屏**：min-height 100vh 在 Storybook 里看起来很挤。Mitigation: 给 TaskView.stories.tsx 单独的 `parameters: { layout: "fullscreen" }`。

---

## Wave 4 预告

Wave 3 完工后进入 Wave 4：剩 7 个 view 装配（NewTaskView / ProjectsView / ProjectDetailView / ScheduledListView / ScheduledDetailView / CustomizeView / SettingsView）+ Sidebar chrome 完善。约 4 天。
