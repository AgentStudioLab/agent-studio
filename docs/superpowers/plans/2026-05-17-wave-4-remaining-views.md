# Wave 4 · 剩余 7 个 view + Sidebar chrome 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. **Every subagent touching styling MUST invoke `design-tokens` skill first.** Steps use checkbox (`- [ ]`) syntax.

**Goal:** 完成 PRD 第 v1.0 剩余的 7 个 view + Sidebar 完整 chrome。所有 view 都通过 `AppShellContext.currentView` 切换，全部 mock 数据。完工后 9 个 view 全可走通。

**Architecture:**
- `src/features/sidebar/` — 完整 Sidebar 替换 Task 2 的占位（Sidebar / NavItem / PinnedItem / RecentItem / UserBar / UserPopover / ContextMenu）
- `src/features/project/`、`src/features/scheduled/`、`src/features/customize/`、`src/features/settings/` — 各 view 的子组件
- `src/views/{NewTask,Projects,ProjectDetail,ScheduledList,ScheduledDetail,Customize,Settings}View.tsx` — 7 个 view
- `src/views/index.tsx` — view 路由组件，按 `currentView` switch
- `src/lib/mock/projects.ts`、`scheduled.ts`、`agents.ts`、`plugins.ts`、`recents.ts`、`pinned.ts` — 扩展 mock 数据

**Tech Stack:** React 19 + Tailwind v4 + ai-elements + shadcn + Bun. Mock-only。

**预计工期：** 4 个工作日（14 个 task）

---

## 前置约束（每个 task 必守）

1. Invoke `design-tokens` skill 之前再动 styling
2. 禁硬编码 hex / 原始 HSL（每 task grep 自检）
3. 不动 `src-tauri/` `sidecar/` `scripts/` 等 Wave boundary
4. 每 task 都 `bun run build && bun run build-storybook` 双绿才 commit
5. 反 slop 4 条 PR 必查
6. 所有 view 在 light + dark 都正确渲染（stories `SideBySide` 验证）
7. View 间 navigation 用 `useAppShell().setView(...)` 不写自定义路由

---

## Task 1 · Mock 数据扩展

**Files:**
- Modify: `src/lib/mock/types.ts` — 加 6 个新类型
- Create: `src/lib/mock/projects.ts`、`scheduled.ts`、`agents.ts`、`plugins.ts`、`recents.ts`、`pinned.ts`

新类型：

```ts
// types.ts append
export interface MockProject {
  id: string;
  name: string;
  lastActivity: string; // ISO or "2 hours ago"
  instructions?: string;
  scheduledTasks?: string[]; // scheduled task IDs
  computerContext?: { path: string; folderName: string }[];
  memory?: string[];
  recentConversations?: Array<{ id: string; title: string; preview: string; time: string }>;
}

export type Frequency = "manual" | "hourly" | "daily" | "weekdays" | "weekly";

export interface MockScheduledTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  frequency: Frequency;
  timeOfDay?: string; // "09:00"
  nextRun?: string;
  active: boolean;
  alwaysAllowed?: string[]; // approvals
}

export interface MockAgent {
  id: string;
  emoji: string; // Note: anti-slop forbids emoji in DECORATIVE roles, but PRD § 4.7.3 uses emoji as semantic agent avatars (intentional categorical use). Acceptable per skill exception clause.
  name: string;
  description: string;
  systemPrompt: string;
  skills: string[]; // skill IDs
  mcpServers: string[]; // server IDs
  allowedProjects: string[] | "all";
  category: "my" | "built-in";
}

export interface MockPlugin {
  id: string;
  initials: string; // 2-letter avatar
  hue: "orange" | "blue" | "purple" | "red" | "green" | "amber" | "stone";
  name: string;
  author: string;
  description: string;
  rating: number;
  installs: number;
  installed: boolean;
  category: "productivity" | "research" | "development" | "communication" | "design" | "data";
}

export interface MockRecentItem {
  id: string;
  kind: "task" | "conversation";
  title: string;
  status?: StepStatus;
  time: string;
}

export interface MockPinnedItem {
  id: string;
  kind: "task" | "project";
  name: string;
}
```

Fixtures:
- `projects.ts` — 6 项目（含 1 个名为 "jay" 的，PRD 文档中频繁出现）
- `scheduled.ts` — 5 个定时任务（PRD § 4.5 grid 显示）
- `agents.ts` — 6 预设 agents（PRD § 4.7.3 表格）
- `plugins.ts` — 9 个 marketplace plugins（PRD § 4.7.4）
- `recents.ts` — 8-10 个 recent items
- `pinned.ts` — 3-4 个 pinned items（项目和任务混合）

Steps: write all 6 fixture files + types extension, double build, grep self-check, commit。Commit: `feat(mock): extend fixtures for Wave 4 views (projects/scheduled/agents/plugins/recents/pinned)`。

---

## Task 2 · Sidebar 完整 chrome

**Files:**
- Create: `src/features/sidebar/Sidebar.tsx`（替换 AppShell 内的占位 nav）
- Create: `src/features/sidebar/NavItem.tsx`
- Create: `src/features/sidebar/PinnedItem.tsx`
- Create: `src/features/sidebar/RecentItem.tsx`
- Create: `src/features/sidebar/UserBar.tsx`
- Create: `src/features/sidebar/UserPopover.tsx`
- Create: `src/features/sidebar/SidebarItemContextMenu.tsx`（5/7 项菜单）
- 各组件 `.stories.tsx`
- Modify: `src/layouts/AppShell.tsx` — 把 inline sidebar 拆出去，改用新的 `Sidebar` 组件

PRD § 3.2 结构：
- 顶 icon bar：收起侧栏 icon + 搜索 (⌘K)
- 主 nav 4 项：+ New task / 📁 Projects / 🕐 Scheduled / ✨ Customize
- **Pinned** section：项目 (folder icon + 粗体名) + 任务 (○ + 普通名)
- **Recents** section：滚动列表，每条 hover 显示 ⋯
- **Footer**：Update card + UserBar
- UserBar 点击弹 popover：email / Settings ⌘, / Logout
- 任意 Recents 项 hover ⋯ → 5 项菜单（Pin / Rename / Archive / Delete / Move to project）
- 任务标题 chevron → 7 项菜单（多 Schedule + Turn into skill）—— TaskHeader 已在 Wave 3 实现，不重做

Steps: 7 组件 + stories，调 AppShell 内部 sidebar 占位换成 `<Sidebar />`。Commit: `feat(sidebar): full chrome (nav/pinned/recents/userbar)`。

---

## Task 3 · View 路由组件 + 拼到 App.tsx

**Files:**
- Create: `src/views/index.tsx` — `<RouterView />` 按 `useAppShell().currentView` 选 view 组件
- Modify: `src/App.tsx` — 替换写死的 `<TaskView />` 为 `<RouterView />`
- Modify: `src/lib/AppShellContext.tsx` — 检查 setView 行为，如果切到 Settings/Customize 需要 sidebar 隐藏（PRD § 3.2 hidden views）

```tsx
// views/index.tsx
import { useAppShell } from "@/lib/AppShellContext";
import { TaskView } from "@/views/TaskView";
import { NewTaskView } from "@/views/NewTaskView"; // 后续 task 写
// ... 其它 view imports

export function RouterView() {
  const { currentView } = useAppShell();
  switch (currentView) {
    case "new-task": return <NewTaskView />;
    case "task": return <TaskView />;
    case "projects": return <ProjectsView />;
    case "project-detail": return <ProjectDetailView />;
    case "scheduled-list": return <ScheduledListView />;
    case "scheduled-detail": return <ScheduledDetailView />;
    case "customize": return <CustomizeView />;
    case "settings": return <SettingsView />;
  }
}
```

注意：本 task 写 RouterView 时，未来 view 还没有，要么用动态 import + Suspense fallback，要么先创建空 stub 文件占位（每个 view 写一个 `export function XView() { return <div>placeholder for X</div>; }`）让 import 不报错。**推荐 stub 路线**——后续 task 直接替换 stub。

Steps: 写 RouterView + 7 个 stub view + 修改 App.tsx + commit + tauri:dev 验证默认 view 仍为 TaskView。Commit: `feat(view): router + stub views + sidebar/settings hidden gate`。

---

## Task 4 · NewTaskView（empty state）

**Files:**
- Modify (replace stub): `src/views/NewTaskView.tsx`
- Create: `src/views/NewTaskView.stories.tsx`

PRD § 4.1：
- 居中布局，无 aside
- 大衬线 H1 "Let's knock something off your list"
- BrandStar（橙色 8 角星）
- 安全链接 "Learn how to use Agent Studio safely."
- 大输入框（用 ai-elements `prompt-input`）placeholder "How can I help you today?"
- 输入框下方工具栏：`📦 Work in a project ⌄` / `🖐 Ask ⌄` / 右侧 `Legacy Model ⌄`

Steps: 装配 + stories（Default / SideBySide）+ commit。Commit: `feat(view): NewTaskView empty state`。

---

## Task 5 · ProjectsView (grid)

**Files:**
- Create: `src/features/project/ProjectCard.tsx` + stories
- Modify (replace stub): `src/views/ProjectsView.tsx` + stories

PRD § 4.3：
- Header：H1 "Projects"（衬线）+ 右上 ⇅ 排序 / 🔍 搜索 / `New project` 按钮
- 3 列 grid，ProjectCard 显示项目名（衬线大字）+ 最近活动时间（灰）
- 点击 → setView("project-detail")

Commit: `feat(view): ProjectsView grid + ProjectCard`。

---

## Task 6 · ProjectDetail view + 子卡片

**Files:**
- Create: `src/features/project/InstructionsCard.tsx`、`ScheduledMiniCard.tsx`、`ComputerContextCard.tsx`、`MemoryCard.tsx` + 各 stories
- Modify (replace stub): `src/views/ProjectDetailView.tsx` + stories

PRD § 4.4：
- 项目名大衬线 + 📌 Pin + ⋮
- 大输入框 "What would you like to work on in this project?"
- 工具栏：`📦 [项目名] +1 ⌄` / `🖐 Ask ⌄` / `Legacy Model ⌄`
- Recents 区：项目内对话卡（每条 💬 + 标题 + preview + 时间）
- 右栏 3 个 collapsible card：Instructions / Scheduled / Context (On your computer + Memory)

Commit: `feat(view): ProjectDetailView + 4 collapsible cards`。

---

## Task 7 · ScheduledList view + 卡片

**Files:**
- Create: `src/features/scheduled/ScheduledCard.tsx`、`FrequencyChip.tsx`、`KeepAwakeBanner.tsx` + stories
- Modify (replace stub): `src/views/ScheduledListView.tsx` + stories

PRD § 4.5：
- H1 "Scheduled tasks" + 副文字
- 右上 ⇅ / 🔍 / `+ New task ⌄`（白底黑字）
- Keep awake banner（ⓘ + 文字 + 右侧 ☀ Keep awake toggle）
- 3 列 task cards grid：title medium + description 2 行 灰 + frequency chip（🕐 + 绿色字）
- "More ideas" chips：☕ Daily brief / ☷ Weekly review

Commit: `feat(view): ScheduledListView + cards + KeepAwake banner`。

---

## Task 8 · NewScheduledModal

**Files:**
- Create: `src/features/scheduled/NewScheduledModal.tsx` + stories

PRD § 4.5：
- 半透明 backdrop（hsla 0 0 0 / 0.55 + blur）
- Modal max-w 640px：H2 "Create scheduled task" + ✕
- Fields: Name * / Description * / Prompt body textarea + toolbar / Frequency dropdown + 时间 input
- 副提示: "Add a randomized delay..."
- Footer: Cancel / Save（white-bg disabled until name + desc filled）
- Save → 加到 ScheduledList grid 顶部 + 关闭

用 shadcn `dialog`（Wave 2 已装）。

Commit: `feat(scheduled): NewScheduledModal + form validation`。

---

## Task 9 · ScheduledDetail view

**Files:**
- Modify (replace stub): `src/views/ScheduledDetailView.tsx` + stories

PRD § 4.6：
- 返回链接 "← All scheduled tasks"
- 大衬线 task 名 (36px)
- 右上 ✏️ 编辑 / 🗑 删除 / `▶ Run now`（白底黑字）
- Meta row：on/off toggle + 🕐 Active chip + "Next run: tomorrow at ~9:00"
- Sections：Instructions（完整 prompt）/ Repeats（频率说明）/ Always allowed（审批历史）

Commit: `feat(view): ScheduledDetailView`。

---

## Task 10 · CustomizeView 框架 + Skills subview

**Files:**
- Create: `src/features/customize/CustomizeNav.tsx`、`SkillCard.tsx`、`CustomizeHome.tsx`（empty state） + stories
- Modify (replace stub): `src/views/CustomizeView.tsx` + stories

PRD § 4.7：
- 全屏接管（sidebar 隐藏）— 通过 `useAppShell` 内的 hidden-views set 处理
- Top header：← 返回 / "Customize" 标题
- 左侧 nav (240px)：📜 Skills / ⊞ Agents / 分隔 / Personal plugins label + `+` / 描述 / `Browse plugins` 按钮
- 右侧 body：动态根据 nav 切换（先做 Skills + empty state）

CustomizeHome (empty state)：工具箱 illustration（SVG，反 slop：不能画头像，但工具箱抽象图标允许）+ H1 "Customize Agent Studio" + 副文字 + 3 张 ActionCard（Connect apps / Create skills / Browse plugins）

Skills body：中栏 (340px) Skills 列表（Personal + Built-in 分组，active skill 显示子文件树）；右栏 skill 详情（name + toggle + Added by / Trigger / Description + SKILL.md 渲染 + 视图切换 👁/`</>`）

Commit: `feat(customize): nav + Skills subview + empty state`。

---

## Task 11 · CustomizeView Agents subview

**Files:**
- Create: `src/features/customize/AgentCard.tsx`（list item）、`AgentDetail.tsx`（右栏）+ stories

PRD § 4.7.3：6 预设 agents 列表 + 详情：
- 大 emoji 圆形头像 56px + 名字 + 描述
- on/off toggle + ⋮
- Meta: Added by / Trigger
- System prompt 衬线 italic + Edit
- Allowed skills (n)：颜色字母 chip 列表 + Add
- MCP servers (n)：绿点 chip 列表 + Add
- Allowed projects: project chip + Add（无配置时 "All projects (无限制)"）

Commit: `feat(customize): Agents subview + 6 preset agents`。

---

## Task 12 · CustomizeView Plugins marketplace

**Files:**
- Create: `src/features/customize/PluginCard.tsx`、`PluginCategoryChips.tsx` + stories

PRD § 4.7.4：
- "Browse plugins" + 副文字
- Category chips：All / Productivity / Research / Development / Communication / Design / Data
- 3 列 plugin grid，每张：彩色字母 avatar (10x10) + name + by author + 描述 (2-3 行) + 评分 ★ + installs + `Install` / `✓ Installed` 按钮

Commit: `feat(customize): Plugins marketplace + 9 plugin cards`。

---

## Task 13 · SettingsView

**Files:**
- Create: `src/features/settings/ProfileForm.tsx` + stories
- Modify (replace stub): `src/views/SettingsView.tsx` + stories

PRD § 4.8：
- 全屏接管（sidebar 隐藏）
- Top header：← 返回 / "Settings"
- 左 nav (240px)：`General`（active，唯一项）
- 右 body：
  - Profile section：JY 圆形头像（用 InitialsAvatar size 56）+ Full name input + 称呼 input + 工作描述 Select + Instructions textarea
  - Appearance section：Theme 3 段 segment（用 Wave 2 的 `ThemeSegment`）

Commit: `feat(view): SettingsView w/ Profile + Appearance`。

---

## Task 14 · Sidebar 接 navigation + Wave 4 close

**Files:**
- Modify: `src/features/sidebar/Sidebar.tsx` — wire nav buttons 调用 `setView()`
- Modify: `src/features/sidebar/UserPopover.tsx` — Settings 项调 `setView("settings")`
- Modify: `src/views/TaskView.tsx` — TaskHeader 的 "Move to project" 项触发 `setView("project-detail")`
- 类似把所有 view 间跳转 wire 起来

最终 Wave 4 sanity sweep：
- `bun run dev` → 1420 端口，sidebar 点 nav 切 view
- `bun run tauri:dev` → Tauri 窗口验证
- `bun run storybook` → 所有 stories 渲染
- grep token / data-theme / 反 slop 三检
- empty close commit

Commit: `chore: Wave 4 complete — all 9 views wired + sidebar navigation`。

---

## 验收 checklist（Wave 4 完成态）

- [ ] `src/features/sidebar/` 共 7 个组件 + stories
- [ ] `src/features/project/`、`scheduled/`、`customize/`、`settings/` 各 view 子组件齐全
- [ ] `src/views/` 共 8 个 view（含 Wave 3 的 TaskView）+ `index.tsx` RouterView
- [ ] `src/App.tsx` 挂 `<RouterView />`
- [ ] `bun run dev` 可点 sidebar nav 在 view 间切换
- [ ] Settings 和 Customize 进入时 sidebar 隐藏（PRD § 3.2）
- [ ] `bun run tauri:dev` 跑通完整 9 view 切换
- [ ] `bun run build` + `bun run build-storybook` 双绿
- [ ] grep `data-theme` 全空、grep 硬编码颜色全空
- [ ] 反 slop 4 条手检 + grep 验
- [ ] 所有组件 light/dark 都正确（SideBySide stories）

---

## 风险点

1. **Sidebar 隐藏机制**：Settings/Customize 进入时 sidebar 不应渲染。两种实现：(a) AppShell 接收 `hideSidebar` prop；(b) 每个 view 自己 wrap 一个不带 AppShell 的容器。**推荐 (a)**：扩展 AppShellContext 加 `hideSidebar` 计算自 `currentView`，AppShell 内 `{!hideSidebar && <Sidebar />}`。
2. **NewScheduledModal 嵌套 dialog**：shadcn `dialog` 内放 `Select` 可能 z-index 错位。Mitigation: 用 shadcn `select` 测试，必要时给 `SelectContent` 加 `position="popper"`。
3. **CustomizeView 三栏布局**：240 nav + 340 list + flex detail 与 AppShell 三栏冲突。Mitigation: Customize view 走 fullscreen 模式（hideSidebar），AppShell 不参与；CustomizeView 内部自己实现三栏。
4. **预设 agents 用 emoji 头像跟反 slop 冲突**：PRD § 4.7.3 表格里 6 个 agents 都标了 emoji（🖥️💼🔍🎨✍️📊）。反 slop 规则 #2 禁 emoji 装饰 icon —— 但这里 emoji 是 agent 的 **categorical 身份标识**（每个 agent 自带 emoji 作为 hue 一样的分类符），不是装饰。设计 design-tokens skill exception clause 解决此类（categorical primitive use）。Document the decision in Task 11 commit。
5. **9 个 plugins marketplace 数据**：fixture 需要真实感（不能全是 placeholder）。用 PRD § 4.7.4 描述的 6 个 category 各分配 1-2 个。

---

## 后续

Wave 4 完工后 v1.0 静态 UI 就齐全。下一波（Wave 5）做 final sanity + 反 slop + tauri build dmg 实测（spec § 3 Wave 5 范围）。Wave 5 plan 在 Wave 4 review 完后再写。
