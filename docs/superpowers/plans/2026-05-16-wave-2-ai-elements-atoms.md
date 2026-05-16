# Wave 2 · ai-elements + Atoms + Visual Reconciliation 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. **Always invoke the `design-tokens` skill BEFORE editing any component styling.** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 安装 13 个 ai-elements 组件 + 11 个 shadcn atoms + 4 个 Agent Studio 自定义 atoms，每个 ai-elements 走 visual reconciliation 流程对齐 Anthropic 原型，所有组件在 Storybook 里有 default + dark stories。反 AI slop 规则写到 preview.tsx 和 CLAUDE.md。

**Architecture:**
- Layer 1（shadcn）补全到 `src/components/ui/` 共 ~12 个 atoms
- Layer 2（ai-elements）装到 `src/components/ai-elements/` 共 13 个，每个走视觉对齐
- Agent Studio 自定义 atoms 放 `src/features/_atoms/`（4 个：BrandStar / InitialsAvatar / ThemeSegment / StatusDot）
- Stories 与组件 co-located（旁边 `.stories.tsx`）
- 反 slop 规则 = 不许紫色渐变 / emoji icon / 圆角左 border 色条 / SVG 头像

**Tech Stack:** Vite 8 + React 19 + Tailwind v4 + Storybook 10 + ai-elements@latest + shadcn@latest + Bun

**预计工期：** 5 个工作日（17 个 task）

---

## Wave 2 前置约束（每个 task 都必须遵守）

1. **每次编辑组件 className / style 前，先 invoke `design-tokens` skill**——它在 `.claude/skills/design-tokens/SKILL.md`
2. **禁止硬编码** hex / 原始 HSL 在 `src/components/` 或 `src/features/`。值必须来自 token 链
3. **ai-elements 视觉对齐 fallback 规则**：单个组件如改动 > 50% className 或动 JSX 结构 → 放弃 ai-elements，在 `src/features/<feature>/` 自己写。决策写进 commit message
4. **`shadcn-alias.css` 缺 token 修复必须先**：装新组件后，grep 引用的 shadcn token 名，对照 `shadcn-alias.css`，缺什么补什么
5. **每 task 完成 = git commit**：树绿不绿（`bun run build` + `bun run build-storybook` 双过）是 commit 前置条件

---

## ai-elements 视觉对齐 Template A（每个 ai-elements task 引用）

每个 ai-elements 组件 task 都走这个固定流程：

1. **安装组件：**
   ```bash
   bunx --bun ai-elements@latest add <name>
   ```
   写入 `src/components/ai-elements/<name>.tsx`。

2. **审计 shadcn token 使用：**
   ```bash
   grep -oE "(bg|text|border|ring|outline)-[a-z-]+" src/components/ai-elements/<name>.tsx | sort -u
   ```
   把列出的每个 utility class 跟 `src/styles/shadcn-alias.css` 的 `--<name>` 比对。如果用到 `bg-chart-1` / `text-card-foreground` 这种 alias 里没有的 → **先补 alias**：
   - 加 primitive（如需，进 `src/styles/primitives/colors.css`）
   - 加 semantic（进 `src/styles/semantic/colors.css`，**记得加 dark mode override**）
   - 加 shadcn-alias entry（`hsl(var(--<semantic>))`）
   - `@theme inline` 入口（在 `src/index.css`）

3. **写默认 + dark stories：**
   创建 `src/components/ai-elements/<name>.stories.tsx`：
   ```tsx
   import type { Meta, StoryObj } from "@storybook/react-vite";
   import { <name> } from "@/components/ai-elements/<name>";

   const meta: Meta<typeof <name>> = {
     title: "AI Elements/<Name>",
     component: <name>,
     parameters: { layout: "centered" },
   };

   export default meta;
   type Story = StoryObj<typeof <name>>;

   export const Default: Story = {
     args: { /* per-component mock data */ },
   };
   // dark 状态由 storybook toolbar theme toggle 触发，无需独立 story
   // 但下面这个 inline rendering 让两态同屏对比更直接
   export const SideBySide: Story = {
     render: (args) => (
       <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
         <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}><<name> {...args} /></div>
         <div data-mode="dark" style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
           <<name> {...args} />
         </div>
       </div>
     ),
     args: { /* per-component mock data */ },
   };
   ```

4. **视觉对齐：**
   - 打开 `原型稿/Claude Desktop/Showcase 1 - Cowork.html`
   - `grep -n "<keyword>"` 找对应原型片段（每个 task 都给出 keyword 列表）
   - 同时打开同名截图（`原型稿/Claude Desktop/*.png`）作为对照
   - 跑 `bun run storybook`，切到本组件 Default story
   - 调 `src/components/ai-elements/<name>.tsx` 的 className 直到视觉匹配——主要是：
     - 圆角：原型用克制圆角 4-12px，ai-elements 默认 `rounded-lg` 太大 → 改 `rounded` 或 `rounded-md`
     - 边框：原型用 alpha border (`border-border` 已是 `border-300/0.15`) → 检查 ai-elements 用的 border class
     - 字体：display 用 `font-serif`（Source Serif 4），body 用 `font-sans`（Inter）
     - 间距：原型间距偏紧凑，跟 semantic spacing 对齐
   - 不要改 JSX 结构（除非 fallback 触发）

5. **截图存档：**
   `mkdir -p .superpowers/brainstorm/wave2-screenshots/`，在 storybook 浏览器里截 light + dark 两态，保存为 `<name>-light.png` 和 `<name>-dark.png`。

6. **双 build 验证：**
   ```bash
   bun run build && bun run build-storybook
   ```
   两条都 0 退出。

7. **Commit：**
   ```
   feat(ai-elements): add <name> + visual reconcile to anthropic palette
   ```
   commit body 包括：组件来自 ai-elements / 改动了哪些 className / 是否新增 shadcn-alias entry。

**如果 fallback 触发**（改动 > 50%）：
- 删除 `src/components/ai-elements/<name>.tsx`
- 在 `src/features/_atoms/<NameCustom>.tsx` 自己写一个等价组件
- Commit message 说明放弃 ai-elements 的原因

---

## Task 1: Wave 2 baseline 验证

**Files:** 无（验证 task）

确认 Wave 1 close 状态干净，开 Wave 2 之前没有 regression。

- [ ] **Step 1: 检查 git 状态**
   ```bash
   cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio
   git status --short
   git log --oneline -5
   ```
   Expected: working tree clean, HEAD 是 `53116ea` (design-tokens skill commit) 或更新。

- [ ] **Step 2: 双 build 双绿**
   ```bash
   bun run build 2>&1 | tail -3
   bun run build-storybook 2>&1 | tail -3
   rm -rf storybook-static dist
   ```
   Expected: 两条都 exit 0。

- [ ] **Step 3: token grep 无残留 data-theme**
   ```bash
   grep -rn "data-theme" src/ public/ index.html .storybook/ 2>/dev/null
   ```
   Expected: 无输出。

- [ ] **Step 4: design-tokens skill 存在**
   ```bash
   ls .claude/skills/design-tokens/SKILL.md
   ```
   Expected: 文件存在。

无 commit。如有任何 expected 不达成，BLOCKED 并报告。

---

## Task 2: 安装 11 个 shadcn atoms（批量）

**Files:**
- Create: `src/components/ui/{input,textarea,select,avatar,tooltip,dropdown-menu,dialog,popover,scroll-area,separator,badge}.tsx`

shadcn 安装是 1:1 拷贝，每个组件 < 50 行 TSX。批量装一次。

- [ ] **Step 1: 一次性装 11 个**

```bash
cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-studio
bunx shadcn@latest add input textarea select avatar tooltip dropdown-menu dialog popover scroll-area separator badge --yes 2>&1 | tail -10
```

可能 shadcn 会问交互问题——`--yes` 应该绕过。如出现 prompt → STOP 报告。

- [ ] **Step 2: 列出实际创建的文件**

```bash
find src/components/ui -newer src/components/ui/button.tsx -type f | sort
```

Expected: 11 个 .tsx 文件（可能加上 form.tsx / label.tsx 等 shadcn 自动拉的依赖）。

- [ ] **Step 3: token 缺漏审计**

```bash
grep -hoE "(bg|text|border|ring|outline)-[a-z][a-z0-9-]*" src/components/ui/*.tsx | sort -u
```

把结果跟 `src/styles/shadcn-alias.css` 比对，列出 alias 没有的（应该没有，因为 shadcn 标准 token 已全部覆盖；只可能漏 `chart-1..5` 系列）。

如果发现缺漏：先 invoke `design-tokens` skill 思考，再补 alias 层。

- [ ] **Step 4: 双 build 验证**

```bash
bun run build 2>&1 | tail -3
bun run build-storybook 2>&1 | tail -3
rm -rf storybook-static dist
```

Expected: 双 0 退出。

- [ ] **Step 5: commit**

```bash
git add src/components/ui/ components.json
git commit -m "$(cat <<'EOF'
feat(ui): install shadcn atoms (input/textarea/select/avatar/tooltip/...)

Bulk-install 11 shadcn primitives needed across the project:
input, textarea, select, avatar, tooltip, dropdown-menu, dialog,
popover, scroll-area, separator, badge.

All consume the existing shadcn-alias bridge — no new tokens required.
Verified via bun run build + bun run build-storybook.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Tasks 3-15: ai-elements 视觉对齐（13 个组件，1 组件 / 1 task）

每个 task 引用 **Template A**。下面 13 个 task 给出 per-component 的：
- 安装名（CLI 参数）
- Showcase HTML grep keyword（找原型片段）
- 同名 PNG 截图建议
- Mock data 示例
- 已知 token 风险
- Commit message 关键内容

### Task 3: ai-element `message`

**Showcase 关键词:** `ChatBubble`、`MessageContent`、`MessageResponse`、对话气泡 HSL
**截图参考:** `v11-task-multi-round-dark.png`
**Mock data:**
```tsx
args: {
  from: "user", // 或 "assistant"
  children: <MessageContent>测试消息</MessageContent>,
}
```
**已知 token 风险:** ai-elements 默认 `message` 用 `bg-primary` 给 user 气泡——但 PRD 描述 user 气泡是 `bg-300`（深一档的中性色，非 brand 色），需要改 className 或加 `user-bubble` 样式覆盖。检查并决定：(a) 改 ai-elements 源码，(b) 在 components/message.css 加变量，(c) Tailwind 类直接换 `bg-secondary`。

**Commit:** `feat(ai-elements): add message + reconcile user bubble to bg-secondary`

走 **Template A** 全部 7 步。

### Task 4: ai-element `prompt-input`

**Showcase 关键词:** `Write a message`、`How can I help you today`、输入框工具栏
**截图参考:** `final-default-dark.png`
**Mock data:** `args: { placeholder: "Write a message..." }`
**已知 token 风险:** 输入框圆角 ai-elements 默认 `rounded-2xl`，原型用 `rounded-xl` 偏方一些。底部工具栏图标颜色用 `text-muted-foreground`（OK）。检查 `bg-input` token 是否在 shadcn-alias 内（Wave 1 已加）。

**Commit:** `feat(ai-elements): add prompt-input + reconcile rounding + toolbar layout`

### Task 5: ai-element `tool`

**Showcase 关键词:** `ToolCallTimeline`、`tool-call`、状态 chip Result/Script
**截图参考:** `v11-task-multi-round-dark.png`、`v8-task-process-dark.png`
**Mock data:**
```tsx
args: {
  type: "tool-bash",
  state: "output-available",
  input: { command: "ls -la" },
  output: "total 16\\ndrwxr-xr-x ...",
}
```
**已知 token 风险:** Tool block 用 `bg-muted` 作为容器底，原型可能更深一档（`bg-200` 或 `bg-300`），调整后看是否要在 alias 层新增 `--tool-bg` 还是 className 改 `bg-card`。状态 chip 颜色：done=success-100, active=brand-100, failed=danger-100, pending=text-400。检查 ai-elements 实现是否一致。

**Commit:** `feat(ai-elements): add tool + reconcile container bg + state chip colors`

### Task 6: ai-element `artifact`

**Showcase 关键词:** `ArtifactInlineCard`、`wpsoffice`、`pptx`/`xlsx`/`md` opener chip
**截图参考:** `v10-preview-xlsx-dark.png`、`v10-preview-pptx-dark.png`
**Mock data:** `args: { title: "Q4 报表.xlsx", type: "spreadsheet", opener: "wpsoffice" }`
**已知 token 风险:** Artifact chip 通常 `bg-card` + border + 小图标。原型 chip 圆角 4px (`rounded-sm`)。ai-elements 可能用 `rounded-lg`——调小。

**Commit:** `feat(ai-elements): add artifact + reconcile chip rounding + opener style`

### Task 7: ai-element `shimmer`

**Showcase 关键词:** loading、橙色 8 角星旋转
**截图参考:** 无专门截图（loading 状态）
**Mock data:** `args: { text: "Thinking..." }`
**已知 token 风险:** 默认 shimmer 用灰阶动画——原型 loading 是橙星旋转，可能 fallback 自己写（用 BrandStar + CSS spin）。**这个组件最可能触发 fallback**——记得 50% 阈值规则。

**Commit:** `feat(ai-elements): add shimmer` 或 `feat(features): replace ai-elements/shimmer with custom BrandStar loading (fallback)`

### Task 8: ai-element `plan`

**Showcase 关键词:** `Process tab`、plan checklist、`Plan` 标题、`✓ done`、`▶ active`、`○ pending`
**截图参考:** `v8-task-process-dark.png`
**Mock data:**
```tsx
args: {
  steps: [
    { status: "completed", description: "扫描 ~/Workspace" },
    { status: "in-progress", description: "生成报表" },
    { status: "pending", description: "格式化为 xlsx" },
  ],
}
```
**已知 token 风险:** Step 状态色：done=success-100, active=brand-100, pending=text-400, failed=danger-100。确认 ai-elements 的 status color 跟我们的 mapping 一致。

**Commit:** `feat(ai-elements): add plan + reconcile step state colors`

### Task 9: ai-element `task`

**Showcase 关键词:** task chain item、子步骤 tree
**截图参考:** `v9-task-timeline-dark.png`
**Mock data:** （task 是 plan 的子单元，参考 ai-elements docs）
**已知 token 风险:** 跟 plan 共享 state color。可能 task icon 用 `bg-pictogram-100`——确认。

**Commit:** `feat(ai-elements): add task + reconcile icon + connector styling`

### Task 10: ai-element `file-tree`

**Showcase 关键词:** `Files tab`、`📁`、`new` 标签、`Add files to working tree`
**截图参考:** `v11-task-multi-round-dark.png`（右栏 Files tab）
**Mock data:**
```tsx
args: {
  files: [
    { name: "report.xlsx", type: "spreadsheet", isNew: true },
    { name: "plan.md", type: "markdown" },
  ],
}
```
**已知 token 风险:** 文件 icon 用 lucide-react 单色 icon。原型可能用不同颜色按 type 区分（`.md`=蓝 / `.xlsx`=绿 / `.pptx`=橙）——需要在 `components/file-tree.css` 加 `--file-icon-<type>` 还是直接 className 选用现成 status color。

**Commit:** `feat(ai-elements): add file-tree + reconcile per-type icon colors`

### Task 11: ai-element `chain-of-thought`

**Showcase 关键词:** reasoning、扩展 thinking、折叠区
**截图参考:** Showcase HTML 内搜
**Mock data:** `args: { content: "用户想要 ..." }`
**已知 token 风险:** Chain-of-thought 通常用 `bg-muted` + 较弱字色（`text-muted-foreground`）。原型如果不强调这块，可能简化。

**Commit:** `feat(ai-elements): add chain-of-thought + tune muted styling`

### Task 12: ai-element `canvas`

**Showcase 关键词:** `PreviewPane`、Canvas、HTML 渲染区
**截图参考:** `v10-preview-pptx-dark.png`、`v10-preview-xlsx-dark.png`
**Mock data:** `args: { children: <div>...</div> }`
**已知 token 风险:** Canvas 作为 PreviewPane 的渲染容器，背景应该是 `bg-card` 或 `bg-100`，边框 alpha 细。

**Commit:** `feat(ai-elements): add canvas + reconcile preview container styling`

### Task 13: ai-element `code-block`

**Showcase 关键词:** code 渲染、复制按钮、语法高亮
**截图参考:** Showcase 内代码示例（搜 `<code>` 或 `pre`）
**Mock data:** `args: { code: "const x = 1;", language: "typescript" }`
**已知 token 风险:** 代码块字体必须 `font-mono`（JetBrains Mono）。复制按钮位置（右上）+ icon button 样式跟原型对齐。

**Commit:** `feat(ai-elements): add code-block + force JetBrains Mono + reconcile copy button`

### Task 14: ai-element `toolbar`

**Showcase 关键词:** `MessageActions`、复制 / 👍 / 👎、悬浮工具栏
**截图参考:** `v11-task-multi-round-dark.png`（消息下方）
**Mock data:** `args: { children: [<button>👍</button>, <button>👎</button>] }`
**已知 token 风险:** Toolbar 按钮间距 + icon button 大小。原型用 32x32 icon button + `gap-1`。

**Commit:** `feat(ai-elements): add toolbar + reconcile icon button sizes`

### Task 15: ai-element `confirmation`

**Showcase 关键词:** `Always allowed`、`approval`、permission dialog
**截图参考:** `v9-scheduled-detail-dark.png`（"Always allowed" 区）
**Mock data:** `args: { title: "Allow shell command?", description: "ls -la /Users/..." }`
**已知 token 风险:** Confirmation dialog 通常基于 `dialog` shadcn 组件。要确保 dialog 已在 Task 2 装好。按钮组用 `bg-primary` (confirm) + `variant=outline` (cancel)。

**Commit:** `feat(ai-elements): add confirmation + reconcile dialog button styling`

---

## Task 16: Agent Studio 自定义 atoms

**Files:**
- Create: `src/features/_atoms/BrandStar.tsx` + `BrandStar.stories.tsx`
- Create: `src/features/_atoms/InitialsAvatar.tsx` + `InitialsAvatar.stories.tsx`
- Create: `src/features/_atoms/ThemeSegment.tsx` + `ThemeSegment.stories.tsx`
- Create: `src/features/_atoms/StatusDot.tsx` + `StatusDot.stories.tsx`

四个 Agent Studio 特有的原子。PRD § 4 多次提到：BrandStar 橙星品牌 mark，InitialsAvatar 字母方块避免 SVG 头像 slop，ThemeSegment 3 段 system/light/dark 切换，StatusDot 4 状态点（done/active/pending/failed）。

每个组件 invoke `design-tokens` skill 后再写——不许硬编码 hex。

- [ ] **Step 1: BrandStar**

`src/features/_atoms/BrandStar.tsx`:
```tsx
import { cn } from "@/lib/utils";

interface BrandStarProps {
  className?: string;
  spinning?: boolean;
  size?: number;
}

export function BrandStar({ className, spinning = false, size = 16 }: BrandStarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="hsl(var(--brand-100))"
      className={cn(spinning && "animate-spin-slow", className)}
      role="img"
      aria-label="Agent Studio brand mark"
    >
      {/* 8-point Anthropic star path */}
      <path d="M12 0L13.4 8.5L20.5 3.5L15.5 10.6L24 12L15.5 13.4L20.5 20.5L13.4 15.5L12 24L10.6 15.5L3.5 20.5L8.5 13.4L0 12L8.5 10.6L3.5 3.5L10.6 8.5L12 0Z" />
    </svg>
  );
}
```

加 `animate-spin-slow` 关键帧到 `src/styles/globals.css`（base 段后）：
```css
@keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.animate-spin-slow { animation: spin-slow 2s linear infinite; }
```

Stories `BrandStar.stories.tsx`:
```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrandStar } from "@/features/_atoms/BrandStar";

const meta: Meta<typeof BrandStar> = { title: "Atoms/BrandStar", component: BrandStar };
export default meta;
type Story = StoryObj<typeof BrandStar>;
export const Default: Story = {};
export const Spinning: Story = { args: { spinning: true } };
export const Large: Story = { args: { size: 48 } };
```

- [ ] **Step 2: InitialsAvatar**

`src/features/_atoms/InitialsAvatar.tsx`:
```tsx
import { cn } from "@/lib/utils";

interface InitialsAvatarProps {
  initials: string;
  className?: string;
  size?: number;
  /** Hue from the primitives palette: orange/blue/purple/red/green/amber/stone */
  hue?: "orange" | "blue" | "purple" | "red" | "green" | "amber" | "stone";
}

const hueBgVar: Record<NonNullable<InitialsAvatarProps["hue"]>, string> = {
  orange: "--color-orange-500",
  blue: "--color-blue-600",
  purple: "--color-purple-500",
  red: "--color-red-500",
  green: "--color-green-700",
  amber: "--color-amber-600",
  stone: "--color-stone-500",
};

export function InitialsAvatar({ initials, className, size = 32, hue = "stone" }: InitialsAvatarProps) {
  return (
    <div
      className={cn("flex items-center justify-center font-medium text-[hsl(var(--oncolor-100))] rounded-sm", className)}
      style={{
        width: size,
        height: size,
        background: `hsl(var(${hueBgVar[hue]}))`,
        fontSize: size * 0.4,
      }}
      role="img"
      aria-label={initials}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}
```

Stories: 7 hues 横排展示。

- [ ] **Step 3: ThemeSegment**

`src/features/_atoms/ThemeSegment.tsx`:
```tsx
import { Monitor, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeMode } from "@/lib/useThemeMode";

export function ThemeSegment({ className }: { className?: string }) {
  const { pref, setPref } = useThemeMode();
  return (
    <div className={cn("inline-flex p-1 bg-muted rounded-md", className)} role="radiogroup">
      {[
        { value: "system" as const, icon: Monitor, label: "跟随系统" },
        { value: "light" as const, icon: Sun, label: "明亮" },
        { value: "dark" as const, icon: Moon, label: "暗黑" },
      ].map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          onClick={() => setPref(value)}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-sm rounded-sm transition-colors",
            pref === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
```

Stories: Default 一个；交互测试通过 storybook 手动点。

- [ ] **Step 4: StatusDot**

`src/features/_atoms/StatusDot.tsx`:
```tsx
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

type Status = "done" | "active" | "pending" | "failed";

interface StatusDotProps {
  status: Status;
  className?: string;
  size?: number;
}

const statusStyles: Record<Status, { bg: string; ring?: boolean; icon: "check" | "x" | "dot" | null }> = {
  done: { bg: "hsl(var(--success-100))", icon: "check" },
  active: { bg: "hsl(var(--brand-100))", ring: true, icon: "dot" },
  pending: { bg: "transparent", icon: null },
  failed: { bg: "hsl(var(--danger-100))", icon: "x" },
};

export function StatusDot({ status, className, size = 20 }: StatusDotProps) {
  const s = statusStyles[status];
  return (
    <span
      role="status"
      aria-label={status}
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        status === "pending" && "border border-dashed border-[hsl(var(--text-400))]",
        s.ring && "ring-2 ring-[hsl(var(--brand-100)/0.3)] animate-pulse",
        className
      )}
      style={{ width: size, height: size, background: s.bg }}
    >
      {s.icon === "check" && <Check className="size-3 text-[hsl(var(--oncolor-100))]" />}
      {s.icon === "x" && <X className="size-3 text-[hsl(var(--oncolor-100))]" />}
      {s.icon === "dot" && <span className="size-1.5 rounded-full bg-[hsl(var(--oncolor-100))]" />}
    </span>
  );
}
```

Stories: 4 个状态横排 + AllStates。

- [ ] **Step 5: 双 build 验证**
```bash
bun run build && bun run build-storybook
rm -rf storybook-static dist
```

- [ ] **Step 6: commit**

```bash
git add src/features/_atoms/ src/styles/globals.css
git commit -m "$(cat <<'EOF'
feat(atoms): add BrandStar / InitialsAvatar / ThemeSegment / StatusDot

Four Agent Studio-specific atoms consumed throughout the UI:
- BrandStar: 8-point orange brand mark, optional spin for loading
- InitialsAvatar: letter-block avatar (anti-AI-slop replacement for SVG faces)
- ThemeSegment: 3-segment system/light/dark switcher backed by useThemeMode
- StatusDot: 4-state indicator (done/active/pending/failed) for task chain

All four go through the semantic token chain — no hardcoded hex.
Stories cover every state. animate-spin-slow keyframe added to globals.css.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: 反 AI slop 规则文档化 + Wave 2 close

**Files:**
- Modify: `.storybook/preview.tsx`（顶部加 banner 注释）
- Modify: `CLAUDE.md`（"Critical conventions" 加 #8）

把反 slop 4 条规则写到代码里：在 `.storybook/preview.tsx` 文件顶部加 docblock，让所有 story 作者看到；同时 CLAUDE.md 加一条 critical convention，长期约束。

- [ ] **Step 1: 给 `.storybook/preview.tsx` 加 docblock**

在文件顶部 import 上方插入：
```tsx
/**
 * Anti-AI-slop rules — enforce in every story / component:
 *
 * ❌ Purple gradients               → use single accent (brand-100 orange only)
 * ❌ Emoji icons in decorative role → use lucide-react inline SVG
 * ❌ Left-border colored bar (l-4)  → use top-strip or full-card hue tinting
 * ❌ SVG-drawn faces / portraits    → use InitialsAvatar (letter blocks)
 *
 * Failing any of these in a PR review is a hard block, not a nit.
 * Anthropic visual identity is restraint: warm neutrals, single brand
 * orange, serif display, sans body, alpha borders. See PRD § 5.4 and
 * the design-tokens skill.
 */
```

- [ ] **Step 2: 给 `CLAUDE.md` 的 Critical conventions 加 #8**

在 #7 design tokens 之后加：
```md
8. **反 AI slop（必守）：** ❌ 紫色渐变 / ❌ emoji 装饰 icon / ❌ 圆角左 border 色条 / ❌ SVG 画的头像。改用：单一 brand-100 橙色 / lucide-react inline SVG / InitialsAvatar 字母方块。code review 期间任一条违反 = block，不是 nit。Anthropic 视觉身份是克制。
```

- [ ] **Step 3: Wave 2 sanity sweep**

```bash
bun run build 2>&1 | tail -3
bun run build-storybook 2>&1 | tail -3
rm -rf storybook-static dist
grep -rn "data-theme" src/ public/ index.html .storybook/ 2>/dev/null  # expected empty
grep -rEn "#[0-9a-f]{6}|hsl\\([0-9]" src/components/ src/features/ 2>/dev/null  # expected empty (no hardcoded colors)
```

Expected:
- 双 build 0 退出
- 两个 grep 都无输出（无 data-theme，无硬编码 hex/HSL）

- [ ] **Step 4: Wave 2 close commit**

```bash
git add .storybook/preview.tsx CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: codify anti-AI-slop rules in preview.tsx + CLAUDE.md

Wave 2 close: write the 4 anti-slop rules in two enforcement locations:

- .storybook/preview.tsx top-of-file docblock so every story author
  sees them when wiring a new component
- CLAUDE.md Critical conventions #8 makes them a code-review hard block

Anti-slop rules:
- No purple gradients (single brand-100 only)
- No emoji decorative icons (lucide-react inline SVG)
- No left-border colored bars (top-strip or full-card hue tinting)
- No SVG-drawn faces (InitialsAvatar letter blocks)

Wave 2 deliverables:
- 11 shadcn atoms installed (input/textarea/select/avatar/tooltip/
  dropdown-menu/dialog/popover/scroll-area/separator/badge)
- 13 ai-elements components installed + visually reconciled to
  Anthropic palette
- 4 Agent Studio custom atoms (BrandStar/InitialsAvatar/ThemeSegment/
  StatusDot) added under src/features/_atoms/
- All ~28 components have Storybook stories (default + dark)
- Anti-slop rules documented and enforceable

Next: Wave 3 — assemble TaskView (3-pane layout, ChatStream composing
ai-elements/message + tool + artifact, right panel with Process/Files/
Context tabs, PreviewPane slide-in).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## 验收 checklist（Wave 2 完成态）

- [ ] `src/components/ui/` 共 12 个 atoms（包括预存 button.tsx + 11 新装）
- [ ] `src/components/ai-elements/` 共 13 个文件 + 13 个 stories（每个 .tsx 旁有 .stories.tsx）
- [ ] `src/features/_atoms/` 共 4 个原子 + 4 个 stories
- [ ] 至少 25 个 stories 在 Storybook 显示（视觉抽查）
- [ ] `bun run build` 通过
- [ ] `bun run build-storybook` 通过
- [ ] `tauri:dev` 仍能跑（未改动 Rust / sidecar）
- [ ] `grep -rEn "#[0-9a-f]{6}|hsl\\([0-9]" src/components/ src/features/` 无输出（无硬编码颜色）
- [ ] `grep -rn "data-theme" src/ .storybook/` 无输出
- [ ] `.storybook/preview.tsx` 顶部有反 slop docblock
- [ ] `CLAUDE.md` 有 critical convention #8 反 slop 规则
- [ ] `.superpowers/brainstorm/wave2-screenshots/` 至少 13 个 light + 13 个 dark 截图（每个 ai-elements 组件 light/dark 各一张）
- [ ] git log 显示 ~17 个 commit（一个 task 一个 commit + 可能的小修）

---

## 风险点

1. **ai-elements 默认样式跟 Anthropic 差距过大**：某个组件 className 改动 > 50% 触发 fallback 写自定义。预期 13 个里 2-3 个可能 fallback（最可能：`shimmer` / `chain-of-thought`）。fallback 不算失败，只是工作量从"对齐"变"写"。

2. **shadcn-alias.css 缺 token**：某些 shadcn / ai-elements 组件可能用到 `chart-1..5`、`sidebar-*` 之外的 token。每次装新组件后必须 grep 确认。补 token 是常规活——design-tokens skill 描述了流程。

3. **ai-elements CLI 在 Bun 环境的怪异行为**：Wave 1 装 Storybook 时遇到 init 过激（拉 vitest/playwright）。ai-elements CLI 类似 shadcn 风格 = 文件拷贝，预期更稳，但仍可能在 `components.json` 解析或路径上有意外。如失败，回退手动 npm 包安装：`bun add ai-elements`。

4. **storybook story 渲染失败**：某些 ai-elements 组件依赖 `useChat` from `@ai-sdk/react`，stories 用 mock 数据 props 应该绕过。如果某组件 hard-coded 调用 `useChat()` → 报 "no provider"，需要在 story 里用 `<MockChatProvider>` wrap。

5. **视觉对齐工时不可控**：13 个 ai-elements × 平均 30 分钟视觉对齐 = 6.5 小时。如果实际平均 60 分钟（复杂组件），变 13 小时。**Mitigation:** 装一个对齐一个，及时停损；超过 1 小时还没对齐就用 fallback 写。

---

## Wave 3 预告

完成本 wave 后进入：

> **Wave 3** — TaskView 装配（2-3 天）：`src/layouts/AppShell.tsx` 三栏布局 + `src/features/task/` 内 TaskHeader / TaskChatStream（用 message + tool + artifact 拼）/ TaskRightPanel（tabs 切 Process/Files/Context）/ ProcessTab（用 plan + task）/ FilesTab（用 file-tree）/ ContextTab / PreviewPane（滑入动画 + resize handle）。Mock 一个完整 task fixture。

Wave 3 plan 在 Wave 2 close 后写，避免本 plan 一次性塞太多未知。
