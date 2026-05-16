# Agent Studio · Static UI 第一阶段 Design

> 设计版本 v1 · 2026-05-16
> 状态：待评审

---

## 1. 目标

把 PRD（`原型稿/Claude Desktop/_deliverables/agent-studio-prd.md`）所描述的 Agent Studio v1 桌面 UI **静态实现**——即 9 个 view、全部交互细节、双主题——但暂不接入 Agent SDK / sidecar 业务逻辑。所有数据来自 mock。

**完成态**：
- Storybook 跑得起来，包含 PRD 提到的所有原子/复合组件，每个组件覆盖关键状态变体
- Tauri app（`bun run tauri:dev`）能打开 9 个 view 之间切换、视觉与 Showcase HTML / 截图一致
- 设计系统从 `_deliverables/anthropic-design-system/` 完整迁入项目，主题切换 (light/dark) 全局生效
- 文档化反 AI slop 规则，CI 不强校验但 code review 阶段必查

**不在范围**：
- 不调用 Agent SDK（Claude Agent SDK TS）
- 不动 `src-tauri/` Rust 代码
- 不动 `sidecar/` Bun 服务
- 不动 `scripts/build-sidecar.ts`
- 不接 Tauri ↔ React 的真实 invoke / fetchSidecar
- 不引入 React Router / Zustand / 状态持久化

---

## 2. 架构

### 2.1 三层组件架构

```
src/components/
├── ui/                    Layer 1 · shadcn primitives（已存在）
│   └── button.tsx, input.tsx, …
├── ai-elements/           Layer 2 · vercel/ai-elements（chat / agent / artifact）
│   └── message.tsx, prompt-input.tsx, tool.tsx, …
src/features/              Layer 3 · Agent Studio 业务组件
├── sidebar/   ├── task/   ├── project/
├── scheduled/ ├── customize/ └── settings/
```

- **Layer 1** 走 `bunx shadcn@latest add`，目标目录 `src/components/ui/`，由 `components.json` 配置控制
- **Layer 2** 走 `bunx --bun ai-elements@latest add`，目标目录 `src/components/ai-elements/`，**源码项目内**可改
- **Layer 3** Agent Studio 特有的、非通用 chat 范畴的组件（Sidebar、ProjectCard、ScheduledCard、SettingsForm 等），不复用 Layer 2 时自己写

### 2.2 三层 Token 架构（W3C Design Tokens / Tokens Studio 模型）

设计系统按工业级三层组织，提升维护性：

```
src/styles/
├── primitives/                # 原始值层 · 静态调色板，不依赖任何 token
│   ├── colors.css             #   --color-orange-500: 15 54.2% 51.2% （Tailwind 风格 hue + 阶梯）
│   ├── spacing.css            #   --spacing: 0.25rem  （Tailwind v4 基准单位）
│   ├── radius.css             #   --radius-sm/md/lg/xl/2xl/3xl/full
│   └── typography.css         #   --font-family-sans/serif/mono + size + weight 阶梯
├── semantic/                  # 语义层 · 引用 primitive；按 mode 切换
│   ├── colors.css             #   --bg-100, --text-100, --brand-100 → var(--color-*)
│   ├── spacing.css            #   --spacing-section-gap, --spacing-page-padding → calc(var(--spacing) * n)
│   └── radius.css             #   --radius-button, --radius-card, --radius-pill → var(--radius-*)
├── components/                # 组件层（可选骨架）· 引用 semantic
│   ├── button.css             #   --button-bg-default: var(--brand-100)（占位）
│   ├── input.css              #   占位
│   └── card.css               #   占位
├── shadcn-alias.css           # shadcn 标准命名 → 引用 semantic（让 shadcn/ai-elements 自动跟换 Anthropic 调色板）
└── globals.css                # @import 全部分层 + reset + scrollbar + focus
```

### 2.3 三层引用链 + 维护场景

```
Primitive            Semantic              Component               shadcn alias
─────────            ────────              ─────────               ────────────
--color-orange-500   --brand-100           --button-bg-default     --primary
   (raw HSL)       → var(orange-500)     → var(brand-100)        → hsl(var(brand-100))
```

**维护场景**：
- 改 brand 橙色色相 → `primitives/colors.css` 改一行 → 所有 button / chip / pill / focus ring 全部跟换
- 让 Button 用蓝色而非橙色 → `components/button.css` 一行；其他组件不动
- 改 light/dark 配色 → `semantic/colors.css` 切 `:root[data-mode="dark"]` 块
- 加新主题色（如 info 蓝）→ `primitives/colors.css` 新增 `--color-info-*` + `semantic/colors.css` 新增 `--info-100`

### 2.4 主题维度：单轴 light/dark

`data-theme="claude"` 这一层**不要**（Agent Studio 永远只有一个 brand 主题）。`<html>` 只有 `data-mode="light|dark"`：

- `theme-init.js` 防 FOUC 写 `data-mode`
- `useThemeMode` hook 运行时切换 `data-mode`
- `semantic/colors.css` 用 `:root` 给 light 默认值、`:root[data-mode="dark"]` 覆写 dark
- `index.html` 不挂 `data-theme`
- Storybook decorator 不 wrap `data-theme`

### 2.5 设计系统迁移（不再 1:1 拷贝）

Anthropic DS 的 `tokens.css` / `typography.css` / `theme.css` 是单层 semantic + 多主题包装结构，**和我们三层架构不直接匹配**，所以是**重构式迁移**：
- 提取所有 HSL 三元组 → `primitives/colors.css`（Tailwind 风格命名 stone / orange / blue / purple / red / green / amber）
- 把 `--bg-100` / `--text-100` / `--brand-100` 等 → `semantic/colors.css`，每一个 alias 到 primitive
- `theme.css` 里 spacing / radius / size 阶梯 → 拆到 primitives 对应文件
- 主题切换 selector 从 `[data-theme="claude"][data-mode="dark"]` 改成 `:root[data-mode="dark"]`
- `theme-init.js` / `useThemeMode.ts` 已经只写 `data-mode`，**1:1 拷贝**
- shadcn token 别名独立成 `shadcn-alias.css`，不混入 semantic 层

### 2.6 Token 双向别名（shadcn-alias.css）

ai-elements / shadcn UI 用 shadcn 标准 token（`--foreground`, `--background`, `--primary`, `--muted-foreground`, …）。`src/styles/shadcn-alias.css` 单独一份，把 shadcn 名称指到 semantic：

```css
:root {
  --background: hsl(var(--bg-100));
  --foreground: hsl(var(--text-100));
  --primary: hsl(var(--brand-100));
  --primary-foreground: hsl(var(--oncolor-100));
  --border: hsl(var(--border-300) / 0.15);
  /* 等等，full list 见 plan Task 2 */
}
```

`[data-mode="dark"]` 下 semantic 自身切换（在 `semantic/colors.css` 里），shadcn alias 因为 `hsl(var(--bg-100))` 是间接引用，自动跟切。

### 2.7 视觉对齐（visual reconciliation）

ai-elements 默认样式偏 Vercel/shadcn 现代风（圆角 lg、shadow-sm、字号紧凑），跟 Anthropic 原型的克制审美不完全一致。每个 ai-elements 组件装完后**强制做一轮视觉对齐**：

**对齐流程**：
1. `bunx --bun ai-elements@latest add <name>`
2. 写 default + dark mode story
3. 对照 Showcase HTML 对应片段 + 同名 PNG 截图
4. 改 `src/components/ai-elements/<name>.tsx` 直到 visual match
5. Storybook 截图保留在 `.superpowers/brainstorm/` 作为前后对照

**fallback 规则**：单个组件如改动超过 className 一半或动了 JSX 结构，放弃 ai-elements，在 `src/features/<feature>/` 重写一个轻量等价物。决策记在 commit message。

### 2.8 视图路由

- 用 `useState<ViewKey>` + Context 管理 currentView，不引入 React Router
- ViewKey 类型：`"new-task" | "task" | "projects" | "project-detail" | "scheduled-list" | "scheduled-detail" | "customize" | "settings"`（8 个，新建任务 + 任务进行中合并为 task family 由内部状态再细分）
- Settings 和 Customize 进入时 sidebar 隐藏（PRD § 3.2）
- Context 形状：

```ts
type AppShellContext = {
  currentView: ViewKey;
  navigate: (v: ViewKey, payload?: unknown) => void;
  pinnedItems: PinnedItem[];
  recents: RecentItem[];
  // 全部 mock，来自 src/lib/mock/
};
```

### 2.9 Mock 数据

`src/lib/mock/` 下分：
- `tasks.ts` · 任务（含 plan / chain steps / artifacts 完整 fixture）
- `projects.ts` · 项目（含 instructions / scheduled / context）
- `agents.ts` · 6 预设 agents（PRD § 4.7.3）
- `skills.ts` · 内置 / 个人 skills
- `plugins.ts` · 9 个 marketplace plugins（PRD § 4.7.4）
- `scheduled.ts` · 定时任务

每个 mock 模块 export const 数组 + factory 函数（`makeMockTask(overrides?)`），stories 与 views 共用。

### 2.10 Storybook 集成

- 装 `storybook@latest`、`@storybook/addon-themes`、`@storybook/addon-essentials`、`@storybook/react-vite`
- 配置文件：`.storybook/main.ts` 和 `.storybook/preview.tsx`
- `main.ts` glob：`src/**/*.stories.@(ts|tsx)`
- `preview.tsx`：
  - import `../src/index.css`（带 Tailwind + tokens）
  - 用 `@storybook/addon-themes` 的 `withThemeByDataAttribute`，attribute `data-mode`，values `{ light: '', dark: 'dark' }`
  - 默认背景：`hsl(var(--bg-100))`
- `package.json` scripts：
  - `"storybook": "storybook dev -p 6006"`
  - `"storybook:build": "storybook build"`

---

## 3. 实施波次

### Wave 1 · DS + Storybook 基础（1 天）

- [ ] 重构式迁移 DS 到三层 token 结构：`src/styles/{primitives,semantic,components}/`、`shadcn-alias.css`、`globals.css`（详见 plan Task 1）
- [ ] 拷贝 `theme-init.js` 到 `public/`、`useThemeMode.ts` 到 `src/lib/`
- [ ] `src/index.css` import 三层 + shadcn-alias，配置 Tailwind `@theme inline` + `@custom-variant dark`
- [ ] `index.html` 加 theme-init.js + Google Fonts（**不**挂 `data-theme`，单 dimension 主题）
- [ ] 装 Storybook 8 + addon-themes + addon-essentials
- [ ] `.storybook/main.ts` / `.storybook/preview.tsx` 配好主题切换
- [ ] 写一个 sanity story（`Button` 三种 variant × dark/light）验证 token + theme 通路
- [ ] `bun run dev` / `bun run tauri:dev` / `bun run storybook` 三条命令均跑通

### Wave 2 · ai-elements + P0 atoms（5 天）

- [ ] 装 13 个 ai-elements：`message / prompt-input / tool / artifact / shimmer / plan / task / file-tree / chain-of-thought / canvas / code-block / toolbar / confirmation`
- [ ] 每个 ai-elements 走视觉对齐流程，写 default + dark story
- [ ] 装 shadcn 补全 atoms：`input / textarea / select / avatar / tooltip / dropdown-menu / dialog / popover / scroll-area / separator / badge`
- [ ] 写 Agent Studio 专属原子：`BrandStar`（橙色 8 角星 SVG）、`InitialsAvatar`（字母方块）、`ThemeSegment`（3 段 system/light/dark）、`StatusDot`（4 状态：done/active/pending/failed）
- [ ] 反 slop 规则文档化到 `.storybook/preview.tsx` 注释 + `CLAUDE.md`

### Wave 3 · TaskView 装配（2-3 天）

- [ ] `src/layouts/AppShell.tsx` 三栏布局（sidebar 260px / main flex / right aside 320px）
- [ ] `src/features/task/` 内：
  - `TaskHeader.tsx`（task title + chevron menu 7 项）
  - `TaskChatStream.tsx`（多轮对话，组合 ai-elements message + tool + artifact）
  - `TaskRightPanel.tsx`（Process / Files / Context tabs）
  - `ProcessTab.tsx`（用 ai-elements plan + task + 加 elapsed counter）
  - `FilesTab.tsx`（用 ai-elements file-tree）
  - `ContextTab.tsx`（Skills + MCP servers list）
  - `PreviewPane.tsx`（滑入动画 0.28s + resize handle + 三种内容渲染）
- [ ] `src/views/TaskView.tsx` 装配以上
- [ ] mock 一个完整的多轮 task fixture（PRD § 4.2 描述的内容）

### Wave 4 · 其它 7 view + Sidebar chrome（4 天）

- [ ] `src/features/sidebar/`：`Sidebar.tsx` / `NavItem.tsx` / `PinnedItem.tsx` / `RecentItem.tsx` / `UserBar.tsx` / `UserPopover.tsx` / `ContextMenu5.tsx`
- [ ] `src/views/NewTaskView.tsx`（empty state）
- [ ] `src/views/ProjectsView.tsx` + `src/features/project/ProjectCard.tsx`
- [ ] `src/views/ProjectDetailView.tsx` + `InstructionsCard / ScheduledMiniCard / ComputerContextCard / MemoryCard`
- [ ] `src/views/ScheduledListView.tsx` + `KeepAwakeBanner / ScheduledCard / FrequencyChip / NewScheduledModal`
- [ ] `src/views/ScheduledDetailView.tsx`
- [ ] `src/views/CustomizeView.tsx` + `CustomizeNav / SkillCard / AgentCard / PluginCard`（PRD § 4.7 三个 subview）
- [ ] `src/views/SettingsView.tsx`（Profile + Appearance with ThemeSegment）

### Wave 5 · 验证 + 反 slop 审查（1 天）

- [ ] 所有 view 在 light + dark 双主题下视觉自检
- [ ] 跑 PRD § 9 验收 checklist（每个 view 子项手动过）
- [ ] 反 slop 4 条复查（紫色渐变 / emoji icon / 色条 left border / SVG 头像）
- [ ] `bun run tauri:build` 跑通（产出 dmg / nsis）
- [ ] Storybook build 产出无 console error

**总工期**：约 13-14 个工作日。

---

## 4. 关键决策与 trade-off

| 决策 | 选项 A（采纳） | 选项 B（放弃） | 理由 |
|--|--|--|--|
| 仓库结构 | 单包 + co-located stories | Turborepo monorepo | Tauri frontendDist 约束 + Storybook 单包足够，turbo 价值在多 app/CI 缓存，单 desktop 场景过度 |
| 拆解策略 | Bottom-up（原子→组合→view） | Top-down 或 Showcase 1:1 抄 | 设计系统纪律 + 组件复用率高，视觉一致性可控 |
| ai-elements 接入 | 接入 + visual reconciliation | 不接入全自己写 | 47 个现成组件覆盖 chat / artifact / tool 等核心 AI-native 场景，对齐成本 < 自己写成本 |
| 视图路由 | useState + Context | React Router HashRouter / Zustand | 9 个 view 体量小，无 URL 需求，避免引入额外依赖 |
| Token 别名 | 双向别名（shadcn → Anthropic） | 改 ai-elements 源码 | 一次写完零维护，未来 ai-elements 升级不冲突 |
| DS 迁移方式 | 拷贝到 src/styles/ | symlink / 本地 npm 包 | 项目源码维护，可调可改 |
| Storybook theme | @storybook/addon-themes | 手写 decorator | 官方维护，0 行胶水 |

---

## 5. 文件清单（增改）

**新增**：
- `.storybook/main.ts`、`.storybook/preview.tsx`
- `src/styles/primitives/{colors,spacing,radius,typography}.css`
- `src/styles/semantic/{colors,spacing,radius}.css`
- `src/styles/components/{button,input,card}.css`（骨架占位）
- `src/styles/shadcn-alias.css`
- `src/styles/globals.css`
- `src/lib/useThemeMode.ts`
- `src/lib/AppShellContext.tsx`
- `src/lib/mock/{tasks,projects,agents,skills,plugins,scheduled}.ts`
- `src/layouts/AppShell.tsx`
- `src/views/*.tsx` × 9
- `src/features/{sidebar,task,project,scheduled,customize,settings}/*.tsx`（多个）
- `src/components/ai-elements/*.tsx`（13 个，CLI 装入）
- `src/components/ui/*.tsx`（shadcn 补全约 11 个）
- `public/theme-init.js`

**修改**：
- `index.html` — 加 theme-init + Google Fonts（不加 `data-theme`）
- `src/index.css` — import 三层 token + shadcn-alias，`@theme inline` + `@custom-variant dark`
- `src/App.tsx` — 替换 hello-world，挂 AppShellContext.Provider + AppShell
- `package.json` — 加 storybook 系列 devDeps + scripts

**不动**：
- `src-tauri/**`、`sidecar/**`、`scripts/**`、`vite.config.ts`、`tauri.conf.json`、`Cargo.toml`
- `src/lib/sidecar-client.ts`（保留，Wave 5 不调用，未来 Phase 2 启用）

---

## 6. 验证标准

### 6.1 通用
- [ ] `bun run dev` 跑通，1420 端口正常
- [ ] `bun run tauri:dev` 跑通，Tauri 窗口打开能显示完整 UI
- [ ] `bun run storybook` 跑通，所有 stories 渲染无 console error
- [ ] `bun run build` 跑通（vite build），产物 < 500KB JS（不含 ai-elements skill bundle）
- [ ] `bun run tauri:build` 跑通，dmg 产出
- [ ] 主题切换无 FOUC（首屏不闪）
- [ ] 所有 view 在 light + dark 都视觉一致 Showcase HTML / 截图

### 6.2 反 AI slop（PR 必查）
- [ ] 无紫色渐变（仅允许 brand-100 橙赭单色）
- [ ] 无 emoji 装饰性 icon（语义 emoji 可用，如 avatar 占位）
- [ ] 无圆角左 border 色条
- [ ] 无 SVG 画的头像（用 initials 字母方块）
- [ ] 字体：display Source Serif 4 / body Inter / mono JetBrains Mono

### 6.3 组件覆盖
- [ ] Storybook 包含 ≥ 30 个组件 stories
- [ ] 每个状态密集组件（ToolCallTimeline、StatusDot、ArtifactInlineCard）至少 4 个 variant stories
- [ ] 每个 ai-elements 组件至少 default + dark variant

### 6.4 PRD § 9 验收 checklist
全量复用 PRD 第 9 章每个 view 的子项验收，逐条手动过。

---

## 7. 风险

1. **ai-elements visual reconciliation 工作量不可控**：13 个组件如有 ≥ 5 个改动幅度超阈值，wave 2 超 5 天。Mitigation：装一个 reconcile 一个，单个不行立即 fallback 自己写，不要把 13 个全装完再改。

2. **Token alias 漏映**：ai-elements 用到罕见 shadcn token（如 `--chart-1`、`--sidebar-foreground`）时颜色 fallback 失败。Mitigation：Storybook story 第一时间发现，逐项补 alias。

3. **`@ai-sdk/react` 拖入运行时依赖**：装 ai-elements 时拉 `useChat` 系列，构建体积增加。本阶段 stories 用 mock props 绕过运行时调用，但 dep 仍在 bundle 里。Mitigation：本阶段不严控 bundle size，Phase 2 接入真实 chat 时这些 dep 本来就要。

4. **mock 数据漂移**：mock 跟未来 Agent SDK 返回的真实数据 schema 不一致。Mitigation：mock 设计时参照 Agent SDK 的 SessionMessage / ToolCall TypeScript 类型；Phase 2 切换时只换数据源不动组件。

5. **Storybook + Tailwind v4 + Vite 8 兼容**：Storybook 8 对 Vite 8（rolldown 新底座）暂未官方明确支持，可能需要 patch。Mitigation：Wave 1 第一天就跑 sanity story，发现问题立即降到 Vite 7 或锁 Storybook 9 beta。

---

## 8. 后续衔接（Phase 2 预告）

Phase 1 完工 → 进入 Phase 2 业务接入：
- 把 `src/lib/mock/*` 的 const 数组换成 `fetchSidecar('/tasks')` 等真实请求
- sidecar 接 Claude Agent SDK (TS)（参见 memory `agent-sdk-ts-decision`）
- AppShellContext 加入 SSE 实时更新（subscribeSSE）
- `tauri-plugin-store` 接 Settings / pinned items 持久化

Phase 1 的所有组件、view、布局、主题系统**零改动**直接复用。
