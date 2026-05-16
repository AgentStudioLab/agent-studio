# Agent Studio · PRD

> 任务驱动的 agentic AI 工作台 · 桌面端
> 文档版本 v1.0 · 2026-05-16

---

## 1. 产品概述

### 1.1 定位

**Agent Studio** 是一款桌面端 agentic AI 工作台。与"聊天 App"不同，它以 **task（任务）** 为最小执行单元——用户提出意图，agent 自主分解、执行、产出工件；用户可以看到完整的任务链、touch 的文件、加载的工具，并可以介入、调整、暂停、复跑。

### 1.2 与对标产品的差异

| 维度 | ChatGPT / 通用聊天 App | Agent Studio |
|------|-----------------------|-------------|
| 单元 | 对话 message | task (含 plan + chain + 工件) |
| 视图 | 聊天流 | task 进度链 + 实时工件 |
| 上下文 | 单会话历史 | project (跨任务持久 instructions + memory + files) |
| 触发 | 用户即时输入 | 即时 / 定时 / @mention / 远程触发 |
| 工具加载 | 不透明 | 显式列出 Skills + MCP servers + Allowed projects |
| 产出 | 文字回复 | xlsx / pptx / md / 代码文件 / live dashboard |

### 1.3 核心价值主张

1. **让 agentic 工作"看得见"** — task chain 可视化（圆圈连线），用户随时知道 agent 在做什么、卡在哪一步
2. **任务而非对话** — 用户思考"我要完成什么"，而不是"我要和 AI 聊什么"
3. **项目级上下文复用** — instructions / files / memory 跨任务持久
4. **可分配的智能体** — 不同领域不同 agent + 不同 skills，避免万能 AI 的能力发散

---

## 2. 目标用户与场景

### 2.1 主要用户

| 画像 | 高频任务 |
|------|---------|
| **开发者** | 重构代码、写测试、扫描不活跃项目、生成文档 |
| **设计师** | HTML 原型、设计变体探索、Figma 联动 |
| **产品经理** | 周报、需求文档、用户访谈纪要、数据分析 |
| **研究员** | 网搜综合、读 PDF、生成研究总结 |
| **运营 / 商务** | 邮件分类、日程协调、Excel 报表自动化 |

### 2.2 核心场景

| 场景 | 频率 | 触发 |
|------|------|------|
| **一次性大任务** | 每周数次 | 用户当下输入 prompt（例: "扫描 ~/Workspace 找出不活跃项目, 生成 xlsx + pptx 报表"）|
| **定时重复任务** | 每天/每周 | 已配置的 Scheduled task（例: 每天 9 点跑 Daily brief）|
| **项目级长任务** | 持续 | Project 内多个相关任务（例: jay project 下的项目结构分析 / Refactor / 调试）|
| **跨工具集成** | 任务嵌入 | 通过 MCP servers 调 filesystem / Gmail / GitHub / Slack / Notion 等 |

---

## 3. 信息架构

### 3.1 顶层视图列表

```
新建类:        New task (空状态输入框)
任务执行类:    Task in progress (chat-style + 任务链)
项目类:        Projects 列表 / Project 详情
定时类:        Scheduled 列表 / Scheduled 详情
配置类:        Customize (Skills / Agents / Plugins)
设置类:        Settings (General 唯一 section)
```

### 3.2 全局 chrome（永远存在）

#### macOS window
- 红绿灯（traffic lights）
- 居中标题: "Agent Studio"
- Settings / Customize 模式下隐藏标题文字

#### Sidebar（左侧 260px）
- **顶部 icon bar**: 收起侧栏 / 搜索 (⌘K)
- **主 nav (4 项)**:
  - `+ New task`
  - `📁 Projects`
  - `🕐 Scheduled`
  - `✨ Customize`
- **Pinned section**（用户固定的 project / task）
  - 项目 pin: 📁 folder icon + 粗体名 → 点击进 project 详情
  - 任务 pin: ○ 圆圈 + 普通名 → 点击进 task 详情
- **Recents section**（滚动列表，最近活跃的任务/对话）
- **Footer**:
  - Update card（Relaunch to update + 版本号）
  - **UserBar**（点击弹气泡 popover）
    - email
    - ⚙ Settings `⌘,`
    - ↗ Log out

#### Sidebar 隐藏的视图
- Settings 全屏接管 → 隐藏 sidebar
- Customize 全屏接管 → 隐藏 sidebar

---

## 4. 功能模块详细

### 4.1 New task · empty state

**目的**: 用户进入新任务的输入页。

**关键元素**:
- 大衬线 H1: "Let's knock something off your list"
- 橙色 8 角星 icon（品牌 mark）
- 安全链接: "Learn how to use Agent Studio safely."
- 大输入框 "How can I help you today?"
  - 左下: `+` 附加按钮
  - 右下: 🎤 语音
- 工具栏（输入框下方）:
  - `📦 Work in a project ⌄`（项目选择器）
  - `🖐 Ask ⌄`（mode 选择）
  - 右侧 `Legacy Model ⌄`（model 选择）

**交互**:
- 输入 prompt → 发送 → 切换到 Task in progress 视图

---

### 4.2 Task in progress · task 执行视图

**目的**: 实时展示 agent 的执行过程 + 用户介入调整。

**布局**: 三栏
- 主对话区（flex 主体）
- 右栏: tabs `Process | Files | Context`，或文件预览面板 PreviewPane

**主对话区**:
- Header: task 标题（点击 ⌄ 弹出 7 项菜单：Schedule / Turn into skill / Move to project › / Pin / Rename / Archive / Delete）
- 对话流（多轮）:
  - **用户消息**: 右对齐，深色气泡（`hsl(var(--bg-300))`），明显对比
  - **AI 回复**: 左对齐，无气泡
    - PresetQuestion（衬线问答卡片）
    - **ToolCallTimeline**（可折叠，默认展开）— 任务链
      - 每步: icon + 名称 + 状态 chip（Result/Script/+N/-M）
      - 支持子步骤树（如 Visual QA on cells → 7 reading files）
      - 末尾 Done indicator（圆圈 + check）
    - 文本段落（含 inline code / bold / link）
    - **ArtifactInlineCard**（生成的工件 chip + opener 选择器，如 wpsoffice）
    - MessageActions（复制 / 👍 / 👎）
  - 加载中：旋转橙色 8 角星
- 底部 input: "Write a message..." + 工具栏 + disclaimer

**右栏 · Process tab**（默认 active）:
- 任务链（plan checklist）
- 每步状态: ✓ done（绿勾）/ ▶ active（橙脉冲）/ ○ pending（虚线圈）/ × failed（红叉）
- 底部状态条: "● Task running · 02:13 elapsed"

**右栏 · Files tab**:
- 当前 task 工作树文件列表
- 文件 item 显示: icon（.md/.xlsx/.pptx 不同颜色）+ 名字 + 可选 `new` 标签
- 点击 → 触发 PreviewPane 滑入
- 底部 "+ Add files to working tree"

**右栏 · Context tab**:
- **Skills** subsection: 已加载 skills（字母方块 chip + 中文描述）
- **MCP servers** subsection: 连接状态（绿点 on / 灰点 off + 描述）

**PreviewPane**（点 Files 文件后右侧滑入）:
- 滑入动画: `translateX(60px) → 0`，0.28s cubic-bezier
- 左边缘 6px hot zone，hover 显示 2px 白条 resize handle
- 拖拽改宽度，限制 [360px, 720px]
- Header: 文件名 · 类型 + opener 选择器 + 刷新 + ✕ 关闭
- 内容根据 type 渲染:
  - `.pptx` → PPT slides（深色科技风 mock）
  - `.xlsx` → 表格 (Project / Last commit / Days idle / Status chip)
  - `.md` → markdown 渲染
- PreviewPane 替代 TaskContextPanel 位置

---

### 4.3 Projects 列表

**Header**:
- H1 "Projects"（衬线大字）
- 右上: ⇅ 排序 / 🔍 搜索 / `New project`（白底黑字按钮）

**Body**:
- 3 列 grid，每个 Project Card 显示:
  - 项目名（衬线大字）
  - 最近活动时间（灰色小字）
- 点击 → 进入 Project detail

---

### 4.4 Project 详情

**Header**:
- 项目名（大衬线 40px）
- 右上: 📌 Pin / Unpin · ⋮ 更多

**主对话区**:
- 大输入框 "What would you like to work on in this project?"
- 工具栏: `📦 [项目名] +1 ⌄` / `🖐 Ask ⌄` / `Legacy Model ⌄`
- **Recents** 区: 项目内对话卡片
  - 每条: 💬 chat icon + 标题 + preview 文字 + 时间

**右栏（3 段 collapsible card）**:
- **Instructions**（✏️ 编辑）: 项目级 system prompt
- **Scheduled**（+ 添加）: 项目下的定时任务
- **Context**（+ 添加）:
  - **On your computer**: 关联的本地文件夹（`📁 jay` / `📁 webCode`）
  - **Memory**: 项目记忆库

---

### 4.5 Scheduled 列表

**Header**:
- H1 "Scheduled tasks"（衬线）
- 副文字: "Run tasks on a schedule or whenever you need them. Type `/schedule` in any existing task to set one up."
- 右上: ⇅ / 🔍 / `+ New task ⌄`（白底黑字 + chevron）

**Keep awake banner**:
- ⓘ icon + "Scheduled tasks only run while your computer is awake."
- 右侧: ☀ `Keep awake` toggle

**Task cards grid (3 列)**:
- 每张紧凑卡片:
  - 标题（中等字号 medium）
  - 描述（灰色 2 行）
  - 频率 chip（🕐 + 绿色高亮文字）
- 点击 → Scheduled detail

**More ideas**（底部居中）:
- 圆角 chip: ☕ Daily brief / ☷ Weekly review
- 点击 → 打开 New task modal（预填 template）

**New task modal**（点 `+ New task` 触发）:
- 半透明 backdrop（hsla 0 0 0 / 0.55 + blur）
- Modal card max-w 640px:
  - H2 "Create scheduled task" + ✕
  - Fields:
    - Name *（input）
    - Description *（input）
    - Prompt body（textarea + 工具栏: Work in a project / Ask / Default model）
    - Frequency: dropdown（Manual / Hourly / Daily ✓ / Weekdays / Weekly）+ 时间 input (09:00)
    - 提示文字: "Add a randomized delay of several minutes for server performance."
  - Footer: Cancel / Save（白底黑字，name & description 为空时 disabled）
- Save → 新 task 加到 grid 顶部 + modal 关闭
- 点击 backdrop / ✕ / Cancel 关闭

---

### 4.6 Scheduled 详情

**Header**:
- 返回链接 "← All scheduled tasks"
- 大衬线 task 名 (36px)
- 右上: ✏️ 编辑 / 🗑 删除 / `▶ Run now`（白底黑字）

**Meta row**:
- on/off toggle
- 🕐 Active chip（绿色）
- "Next run: tomorrow at ~9:00"

**详情 sections**:
- **Instructions**: 完整 prompt 内容
- **Repeats**: 频率说明（"Every day at ~9:00"）
- **Always allowed**: 审批历史区，副文字 "Approvals you grant during a run appear here."

---

### 4.7 Customize（全屏）

**Top header**:
- ← 返回到原 view
- "Customize" 标题

**左侧 nav (240px)**:
- 📜 Skills
- ⊞ Agents
- 分隔线
- **Personal plugins** label + `+` 按钮
- 描述: "Give Agent Studio role-level expertise with plugins"
- `Browse plugins` 按钮（→ Plugins tab）

**右侧 body**（根据 nav 切换）:

#### 4.7.1 Customize home（empty state）
- 工具箱 illustration (toolbox SVG)
- H1 "Customize Agent Studio"（衬线）
- 副文字: "Skills, connectors, and plugins shape how Agent Studio works with you."
- 3 张 ActionCard:
  - ⊞ Connect your apps · "Let Agent Studio read and write to the tools you already use."
  - 📜 Create new skills · "Teach Agent Studio your processes, team norms, and expertise."
  - 🔌 Browse plugins · "Add pre-built knowledge for your field."

#### 4.7.2 Skills body
**中栏 (340px)**: Skills 列表
- Personal skills 分组（active: skill-creator 展开显示子文件树）
  - SKILL.md / agents/ / assets/ / eval-viewer/ / references/ / scripts/ / LICENSE.txt
- Built-in skills 分组（schedule / setup-cowork / context）

**右栏 (flex)**: Skill 详情
- 名字 + on/off toggle + ⋮
- Added by / Trigger
- Description（含 ⓘ tooltip icon）
- SKILL.md 渲染（衬线 H2 + bullet list）+ 视图切换 (👁 preview / `</>` code)

#### 4.7.3 Agents body
**中栏 (340px)**: Agents 列表（自建 + 内置分组）
- 每个 agent 显示: emoji 头像 + 名字 + 一行描述

**右栏 (flex)**: Agent 详情
- 大 emoji 头像（圆形 56px）+ 名字（衬线 26px）+ 描述
- 右侧: on/off toggle + ⋮
- Meta: Added by / Trigger
- **System prompt**（衬线 italic 文本框 + Edit 按钮）
- **Allowed skills** (n): 颜色字母 chip 列表 + Add skill
- **MCP servers** (n): 绿点 chip 列表 + Add server
- **Allowed projects**: project chip + Add project（无配置时显示 "All projects (无限制)"）

**预设 6 个 agents**:
| Type | Emoji | Name | Purpose | Skills |
|------|-------|------|---------|--------|
| My | 🖥️ | 电脑管家智能体 | 磁盘扫描、识别不活跃项目 | filesystem · disk-analyzer · xlsx · cleanup-advisor |
| My | 💼 | 办公智能体 | 邮件、日程、会议纪要、周报 | gmail · calendar · pptx · docx · xlsx |
| My | 🔍 | 研究助手 | 网搜、读 PDF、做总结 | web-search · pdf-reader · citation · summarize |
| Built-in | 🎨 | 设计助手 | UI/UX 原型、HTML、Figma | huashu-design · figma |
| Built-in | ✍️ | 写作助手 | 博客、文档、营销文案 | markdown · writing-style |
| Built-in | 📊 | 数据分析师 | Excel 自动化、可视化 | xlsx · pandas · plotly |

#### 4.7.4 Plugins body（marketplace）
- "Browse plugins" 标题 + 副文字
- 分类 chips: All / Productivity / Research / Development / Communication / Design / Data
- 3 列 plugin card grid，每张:
  - 彩色字母 avatar (10x10)
  - Plugin name + by Author
  - 描述 (2-3 行)
  - 评分 ★ + installs 计数
  - `Install` / `✓ Installed` 按钮

---

### 4.8 Settings（全屏）

**Top header**: ← 返回 / "Settings"

**左侧 nav (240px)**: 只有 `General`（active）

**右侧 body**:

#### Profile section
- Avatar 行（右侧 JY 圆形头像）
- Full name（input "Jay Yang"）
- What should Agent Studio call you?（input）
- What best describes your work?（Select ⌄ dropdown）
- Instructions for Agent Studio:
  - 副文字: "Agent Studio will keep these in mind across chats and Cowork within Anthropic's guidelines. Learn more"
  - textarea placeholder "e.g. ask clarifying questions before giving detailed answers"

#### Appearance section
- Theme · 3 段 segment 控件:
  - 💻 跟随系统 (`system`，pref 默认值)
  - ☀ 明亮 (`light`)
  - 🌙 暗黑 (`dark`)
- 选 system 时 `localStorage.preferred_theme_mode` 清空，跟随 OS

---

### 4.9 UserBar popover

- 触发: 点击 sidebar 底部 UserBar（JY · Jay Yang · Max）
- 位置: 弹出在 UserBar 上方
- 内容（极简）:
  - email（灰色小字）
  - ⚙ Settings · `⌘,`
  - 分隔线
  - ↗ Log out
- 关闭: 点击 outside / 选项后自动关闭

---

## 5. 视觉规范

完整 token 系统见交付包 `_deliverables/anthropic-design-system/`。

### 5.1 设计语言锚点
- 米白色调（light）/ 暖深灰（dark），**非纯黑**
- 单一品牌色 `--brand-100` 橙赭（dark 下更亮）
- 衬线大字用 Source Serif 4，body sans 用 Inter
- 圆角克制（4-12px），不用 16+ 大圆角
- 边线用 alpha border，不用色阶差

### 5.2 双轴主题
- `data-theme="claude"` × `data-mode="light"|"dark"`
- `theme-init.js` 防 FOUC（必须在所有样式表之前）
- `prefers-color-scheme` 兜底

### 5.3 字体
- Display: Source Serif 4（Anthropic Serif 开源替代）
- Body: Inter（Anthropic Sans 开源替代）
- Mono: JetBrains Mono（Anthropic Mono 开源替代）
- Dark 模式系统性减重 30-70（白字在黑底视觉变粗的应对）

### 5.4 反 AI slop（必守）
- ❌ 紫色渐变 / emoji 装饰 icon / 圆角左 border 色条 / SVG 画头像
- ✅ 单一 accent / lucide-react 风格 inline SVG / initials 字母方块 / 真实素材或诚实 placeholder

---

## 6. 关键交互流程

### 6.1 启动
1. theme-init.js 同步读 localStorage / OS → 设 `data-mode`
2. 渲染默认 view（一般是 last visited 或 jay project detail）

### 6.2 创建新一次性 task
1. Sidebar 点 `+ New task` → empty state
2. 输入 prompt → 选 project / mode / model
3. 发送 → 切到 Task in progress 视图
4. Agent 开始执行，Process tab 实时更新

### 6.3 创建定时 task
1. Sidebar 点 `Scheduled` → list
2. 点 `+ New task ⌄` → modal 弹出
3. 填 Name / Description / Prompt / Frequency
4. Save → 新 task 加入 grid 顶部

### 6.4 查看 / 编辑定时 task
1. Scheduled list → 点 task card
2. 进入 Scheduled detail
3. 可: toggle on/off · Run now · 编辑 · 删除

### 6.5 文件预览
1. 在 Task in progress 视图
2. 右栏切到 Files tab
3. 点文件 → PreviewPane 滑入（替代 TaskContextPanel）
4. 可拖拽左边缘改宽度
5. 点 ✕ → 恢复 TaskContextPanel

### 6.6 配置智能体
1. Sidebar 点 `Customize` → 全屏
2. 左 nav 选 `Agents`
3. 中栏选 agent（如 🖥️ 电脑管家）
4. 右栏编辑 System prompt / 加 Skills / 加 MCP / 加 Allowed projects

### 6.7 主题切换
1. Sidebar 点 UserBar → popover
2. 点 Settings → Settings 全屏
3. Appearance section → 3 段 segment 选 system/light/dark
4. 全局立即生效 + localStorage 持久化

### 6.8 Pin 操作
1. Recents 任一 item hover → 显示 ⋯
2. 点 ⋯ → context menu（5 项 sidebar 版）
3. 点 Pin → item 从 Recents 移到 Pinned section

---

## 7. 状态机

### 7.1 Recents/Pinned 任务状态
| 状态 | 视觉 | 含义 |
|------|------|------|
| running | 绿色圆点 + pulse 动画 | 正在执行 |
| done | 绿色圆 + 白勾 | 已完成 |
| failed | 红色圆 + 白点 | 失败 |
| scheduled | 蓝色时钟 icon | 等待定时触发 |
| idle | 空圆 + 灰色边 | 未运行 / 已暂停 |

### 7.2 任务链步骤状态（Process tab / ToolCallTimeline）
| 状态 | 视觉 | 含义 |
|------|------|------|
| done | 绿色填充圆 + 白勾 | 该步完成 |
| active | 橙色填充圆 + pulse + 白点 | 正在执行 |
| pending | 透明圆 + 灰色虚线边 | 待执行 |
| failed | 红色填充圆 + 白叉 | 该步失败 |

### 7.3 主题状态
- `pref`: `system` | `light` | `dark`
- `mode`（实际渲染）: `light` | `dark`
- 当 `pref === 'system'`: 从 `prefers-color-scheme` 派生
- 当 `pref === 'light' | 'dark'`: 直接使用

### 7.4 右栏状态（task 视图）
- 默认: TaskContextPanel · Process tab active
- 点 Files 文件 → PreviewPane 替代 TaskContextPanel
- 关闭 preview → TaskContextPanel 恢复，tab 保持上次

---

## 8. 技术约束

### 8.1 平台
- macOS 桌面 App（首发）
- Windows 桌面 App（同步）
- 移动端通过 Dispatch (Beta) 远程触发

### 8.2 技术栈推荐
- **前端**: React 18 + Tailwind v4 + shadcn/ui 命名
- **桌面**: Electron / Tauri
- **设计系统**: 见 `_deliverables/anthropic-design-system/`
- **图标**: lucide-react

### 8.3 视口
- 默认 1480px × 880px（mac-window 内容区）
- 最小: 1280px 宽（侧栏可折叠到 icon-only）
- 最大: 不限制，但 main content 有 max-w 限制（如 chat 760px，projects grid 自适应）

### 8.4 持久化
- `localStorage.preferred_theme_mode`: 主题偏好
- 任务 / 项目 / 设置数据: 后端 + 本地缓存
- Cowork session 状态: agent runtime

### 8.5 性能
- 防 FOUC: theme-init.js 同步执行（< 50ms）
- 字体加载: `font-display: swap`（先显示 fallback，后切换）
- Sidebar 长 Recents: 虚拟滚动（超过 50 条时）
- PreviewPane 大文件: 懒加载分段渲染

---

## 9. 验收标准

### 9.1 通用
- [ ] 双轴主题正常切换，无 FOUC
- [ ] 所有 view 在 light / dark 两种模式下视觉正确
- [ ] 字体 fallback 链路工作（Google Fonts 不可达时不崩）
- [ ] 键盘焦点环可见（`:focus-visible` outline）
- [ ] 滚动条样式一致（Firefox + WebKit）

### 9.2 各 view checklist

**New task**:
- [ ] 大标题居中，橙星可见
- [ ] 输入框 hover/focus 状态正确
- [ ] 工具栏在 light/dark 都清晰

**Task in progress**:
- [ ] 用户气泡明显（bg-300 深底）
- [ ] AI 回复段落、ToolCallTimeline、Artifact card 都正确渲染
- [ ] Round 2 / Round 3 多轮对话顺序正确
- [ ] 右栏 3 tabs 切换正常
- [ ] 加载星旋转动画工作

**Projects 列表**:
- [ ] grid 3 列自适应
- [ ] 项目卡片 hover 反馈正确
- [ ] New project 按钮可点

**Project 详情**:
- [ ] 项目名衬线大字
- [ ] 6 个 Recents 对话卡片显示
- [ ] 右栏 3 个 collapsible card 可折叠

**Scheduled**:
- [ ] 5 个预设 task 卡片显示
- [ ] Keep awake toggle 工作
- [ ] More ideas chips 可点
- [ ] `+ New task` modal 弹出 / 关闭 / Save 添加

**Scheduled 详情**:
- [ ] 返回链接工作
- [ ] toggle / Active chip / Next run 显示
- [ ] 3 个 sections 内容正确

**Customize**:
- [ ] 左 nav Skills/Agents/Browse plugins 切换
- [ ] Skills 三栏布局 + skill-creator 默认 active
- [ ] Agents 6 个智能体显示 + 切换正常
- [ ] Plugins 9 张 card + Install/Installed 状态

**Settings**:
- [ ] 全屏接管 (sidebar 隐藏)
- [ ] Profile 5 个字段渲染
- [ ] Appearance 3 段 segment 可切换 system/light/dark

**UserBar popover**:
- [ ] 点击弹出 / 点外部关闭
- [ ] email / Settings / Log out 三项

**Pin 机制**:
- [ ] 项目 pin: folder icon + 粗体名
- [ ] 任务 pin: ○ + 普通名
- [ ] hover 显示 ⋯, 点击弹 5 项菜单
- [ ] task title chevron 点击弹 7 项菜单（多 Schedule + Turn into skill）

**PreviewPane**:
- [ ] 滑入动画 0.28s 流畅
- [ ] 左边缘 hover 出白条
- [ ] 拖拽改宽度，clamp 到 [360, 720]
- [ ] .pptx/.xlsx/.md 三种类型内容正确

---

## 10. V1 范围 / 后续规划

### 10.1 V1 在内
- New task / Task in progress / Projects / Project detail / Scheduled / Settings / Customize 全部页面
- Pin 机制 + 右键菜单
- 文件预览面板（pptx/xlsx/md）
- 双主题 + 主题切换 UI
- 用户档案 + Log out
- 6 预设 agents + 9 plugins marketplace

### 10.2 V1 外（后续）
- **Dispatch (Beta)** — 手机远程触发桌面 cowork session
- **Live artifacts** — 持久 HTML dashboard 自动 refresh
- **跨 device 同步** — iCloud / 自建 server
- **Team / Enterprise role** — Workspace 多人协作 + RBAC
- **Connectors marketplace 扩展** — 第三方 plugin 商店审核机制
- **Audit log** — 操作历史可追溯（合规需求）
- **Skill creator workflow** — 完整的 skill 创建/编辑流程

---

## 11. 附录

### 11.1 交付物清单
- `Showcase 1 - Cowork.html` — 完整可交互原型（单文件）
- `_deliverables/anthropic-design-system/` — 可移植设计系统（4 件套 CSS + theme-init.js + React hook + README）
- `_deliverables/agent-studio-prd.md` — 本文档

### 11.2 关键截图（按 view 列在 prototype 同目录）
- `final-default-dark.png` / `final-default-light.png` — 默认进入（jay project 详情）
- `v11-plugins-dark.png` — Plugins marketplace
- `v11-task-multi-round-dark.png` — Task 3 轮对话完整版
- `v11-project-jay-dark.png` — Project detail with 6 conversations
- `v10-preview-pptx-dark.png` — File preview (PPT mock)
- `v10-preview-xlsx-dark.png` — File preview (Excel mock)
- `v9-scheduled-detail-dark.png` — Scheduled detail
- `v8-scheduled-grid-dark.png` — Scheduled list + Keep awake
- `v8-scheduled-modal-dark.png` — Create scheduled task modal
- `v8-task-process-dark.png` — Task chain (Process tab)
- `v7-customize-agents-dark.png` — Customize · Agents
- `v7-customize-skills-dark.png` — Customize · Skills
- `v6-user-popover-dark.png` — UserBar popover
- `v6-settings-dark.png` — Settings 全屏
- 其他归档版本截图在 `_archive/` 下

### 11.3 参考资料
- Anthropic Claude Cowork 官方页: <https://www.anthropic.com/product/claude-cowork>
- Claude Help Center · Cowork: <https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork>
- Live artifacts: <https://support.claude.com/en/articles/14729249-use-live-artifacts-in-claude-cowork>
