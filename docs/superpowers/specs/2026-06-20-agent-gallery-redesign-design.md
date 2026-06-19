# 智能体 Gallery Tabs 界面重设计

> 状态：待评审 · 2026-06-20  
> 目标：重设计真实 `/agents` 与 `/agents/:id` 智能体界面，增加分类 tab、单个智能体视觉封面与官方标识，同时保留现有智能体空间工作流。

## 1. 背景

当前真实智能体界面主要由 `src/features/agent-workspaces/AgentsView.tsx` 与 `AgentSpaceView.tsx` 组成：

- 列表页是普通三列卡片网格，所有 agent 混排，只通过小 badge 表达 `source === "builtin"`。
- 单个智能体详情页以标题 + composer + recents + 右侧 rail 为主，功能完整，但缺少能快速识别 agent 身份的视觉区域。
- 数据模型已有 `source: "user" | "builtin"` 与 `avatar` 色调，但没有更细的角色分类字段。

本次设计选择 **Gallery Tabs** 方向：用当前数据即可实现 `全部 / 我的 / 官方` 三类切换；用确定性视觉封面强化每个智能体的身份；用更明确的官方标识表达内置只读 agent。

## 2. 已确认决策

| 维度 | 决策 |
|---|---|
| 改动范围 | 只改真实 `/agents` 与 `/agents/:id`，不改 Customize mock 面板 |
| 分类 tab | 先做 `全部 / 我的 / 官方`，基于 `AgentWorkspace.source` 派生 |
| 图片/封面 | 不依赖远程图片；用 agent `avatar`、`source`、`id` 派生确定性视觉封面 |
| 官方标识 | card 与详情 masthead 都显示 `官方 / Official`，内置只读行为保持现状 |
| 后端 schema | 本期不新增 role/category 字段，避免扩大迁移与测试面 |
| 响应式 | 列表移动端单列；详情页右 rail 在窄屏下堆叠，禁止横向滚动 |

## 3. 视觉主题

遵守现有三层 design token 与反 AI slop 约束：

- 色彩继续使用 `background/card/foreground/muted/border/primary/state-hover` 等 token，不在组件里写 raw hex 或 raw HSL。
- 主强调仍走当前 brand 体系，不引入紫蓝霓虹渐变。
- 字体沿用项目现状；本次不做全局字体迁移。
- 卡片圆角使用现有 `rounded-lg/rounded-xl/rounded-2xl` 与 `rounded-card` 可表达的层级，不做过度大圆角。
- 图片化区域是结构化的视觉封面，不使用 emoji 装饰，也不使用外链 stock 图。

## 4. 列表页设计（`AgentsView`）

### 4.1 布局

`AgentsView` 保持 AppShell 内滚动布局，但主内容改成：

1. 顶部标题区：标题、副标题、搜索/排序图标按钮、新建智能体按钮。
2. 分类 tab 行：`全部`、`我的`、`官方`，每个 tab 显示数量。
3. Gallery grid：按当前 tab 过滤后的 `AgentCard` 网格。
4. 空态：当过滤结果为空时，显示与 tab 语义对应的空态文案。

桌面网格建议：

- `sm:grid-cols-2`
- 宽屏 `xl:grid-cols-3`
- 保持 `PageColumn` 约束，避免满屏卡片过散。

移动端：

- 单列卡片。
- tab 行可换行，不允许水平滚动。
- 新建按钮保持 44px 触控高度。

### 4.2 分类逻辑

新增本地 tab 状态：

```ts
type AgentFilter = "all" | "mine" | "official";
```

派生规则：

- `all`：全部非 archived agent（沿用接口返回值）。
- `mine`：`agent.source === "user"`。
- `official`：`agent.source === "builtin"`。

本期不把 tab 写入 URL，也不做持久化；这是一个轻量浏览筛选状态。

### 4.3 AgentCard

`AgentCard` 从纯文字卡片升级为带封面的 gallery card：

- 顶部：`AgentVisualCover`，由 agent 派生的视觉封面。
- 中部：头像、名称、官方 seal、更新时间。
- 底部：轻量 metadata，例如 `我的智能体 / 官方智能体` 与最近更新时间。

交互：

- 整卡仍是 button，点击进入 `/agents/:id`。
- hover 只做背景、边框、轻微 translate 或阴影变化，使用 token 和现有状态色。
- focus-visible 保持可见 ring。

官方标识：

- `source === "builtin"` 时显示小型 `官方 / Official` seal。
- seal 不能像广告标签，也不能抢主标题权重；它是来源标识，不是 CTA。

## 5. 视觉封面组件

新增 feature-local 组件，建议命名：

- `AgentVisualCover.tsx`

职责：

- 接收 `agent`、`variant?: "card" | "hero"`。
- 根据 `agent.avatar` 或 `hueForAgent(agent)` 选择已有头像 hue。
- 根据 `agent.id` 生成稳定 pattern 变体，如网格密度、局部光斑位置、线性纹理方向。
- 对 builtin 使用更规整的“official plate”构图；对 user agent 使用更个人化但克制的“workspace plate”构图。

实现限制：

- 不使用 `<img>` 外链。
- 不新增 raw color；颜色通过 Tailwind token、semantic CSS variable 或 avatar primitive exception 中已有 hue 能力表达。
- 不影响 card 尺寸；封面用固定 aspect ratio 或固定高度，避免布局跳动。
- `aria-hidden="true"`，因为它是同一 agent 身份的视觉补充，真实名称由文本呈现。

## 6. 详情页设计（`AgentSpaceView`）

### 6.1 信息架构

保留当前核心结构：

- 左侧主区域：masthead → composer → recents。
- 右侧 rail：Instructions / Scheduled / Skills / Context。
- 文件 preview 仍浮层覆盖右侧，不压缩主布局。

新增 masthead：

- 在 header 与 composer 之间或合并 header 视觉区域中展示 `AgentVisualCover variant="hero"`。
- masthead 内包含 agent 名称、头像、官方 seal、更新时间/来源 metadata。
- 现有 pin、more actions 保留在 masthead 右上区域。

### 6.2 AgentSpaceHeader

`AgentSpaceHeader` 可拆成更明确的两层：

- `AgentSpaceMasthead`：负责视觉封面、标题、来源标识、操作按钮。
- 原有 `AgentSpaceHeader` 逻辑可保留或改名迁移，避免一次性重写过多。

行为保持：

- user agent：可 pin、编辑详情、归档。
- builtin agent：可 pin、克隆为我的智能体；不可编辑定义、不可归档。

### 6.3 Composer 与 Recents

Composer 不改业务逻辑：

- prompt 提交仍创建 agent-bound conversation。
- model picker 与 submit 位置不变。

Recents 做轻量视觉整理：

- 最近会话行与 masthead 风格一致，但不做 card 套 card。
- 空态文案保留现有 i18n。

### 6.4 右侧 rail

右侧 rail 功能不改，只做与新 masthead 的视觉协调：

- rail 宽度保持约 `340px`。
- card 边框、背景、间距沿用 token。
- builtin agent 的 Instructions / Skills 只读逻辑保持现状。

窄屏策略：

- 主区域先显示 masthead 与 composer。
- rail 堆叠到主内容下方。
- preview 浮层仍覆盖当前可视区域右侧或全宽，视现有 `PreviewPane` 约束实现。

## 7. i18n

更新 `src/i18n/locales/zh/agents.json` 与 `src/i18n/locales/en/agents.json`：

- tab 文案：全部 / 我的 / 官方；All / Mine / Official。
- 来源文案：我的智能体 / 官方智能体；My agent / Official agent。
- 空态文案：按 tab 区分。
- 更新时间标签可复用当前日期显示，若加 label 则补 i18n。

`agentSpace.builtinBadge` 已存在，继续复用，避免重复 key。

## 8. 可访问性

- tab 使用 button 语义，设置 `aria-pressed` 或 `role="tablist"` / `role="tab"`。实现时优先简单 button + `aria-pressed`，减少无必要的 roving tabindex。
- AgentCard 保持整卡 button，并提供可见 focus ring。
- 视觉封面 `aria-hidden`，不重复朗读。
- 官方 seal 是文本，不只靠颜色识别。
- 操作图标按钮继续使用现有 `aria-label`。

## 9. 测试计划

前端测试：

- 为 tab 过滤补组件测试：全部、我的、官方计数与过滤结果正确。
- AgentCard builtin badge 渲染不回归。
- AgentSpaceHeader builtin 行为不回归：显示克隆入口、隐藏编辑/归档入口。

验证命令：

```bash
bun test src/features/agent-workspaces
bunx tsc --noEmit -p tsconfig.app.json
bun run build
```

视觉验证：

- 本地 dev server 打开 `/agents` 与 `/agents/:id`。
- 检查 light/dark mode 下封面、seal、tab active 状态可读。
- 检查移动宽度下无横向滚动，card 文本不溢出。

## 10. 非目标

- 不新增后端 role/category 字段。
- 不引入远程图片、Unsplash、picsum 或运行时图片生成。
- 不重做 Customize mock 智能体面板。
- 不改变内置 agent 的只读规则、clone 规则、skills mounted 规则。
- 不改 composer、run 创建、memory、folders、links 的业务行为。

## 11. 实施顺序

1. 新增 `AgentVisualCover`，先只被 `AgentCard` 使用。
2. 改造 `AgentCard` 为 gallery card，并补 builtin badge/metadata。
3. 在 `AgentsView` 增加 tab 过滤、计数和空态。
4. 把 `AgentVisualCover` 接入详情页 masthead，整理 `AgentSpaceHeader` 结构。
5. 补 i18n。
6. 补测试并跑验证命令。
