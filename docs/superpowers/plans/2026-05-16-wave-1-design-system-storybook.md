# Wave 1 · Design System Migration + Storybook 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Anthropic Design System 完整迁入项目，替换掉 shadcn init 留下的 oklch 默认 token，让 Tauri app 和 Storybook 两条链路在 light/dark 双主题下都跑通，并通过一个 sanity Button story 验证。

**Architecture:**
- 颜色系统：`[data-theme="claude"]` × `[data-mode="dark"]` 双轴，theme-init.js 写 `data-mode` 防 FOUC
- Token 别名：`src/index.css` 把 shadcn 标准名（`--background` / `--foreground` / …）赋值为 `hsl(var(--bg-100))` 等 Anthropic token，让 shadcn UI 自动继承 Anthropic 调色板
- Tailwind dark 变体：`@custom-variant dark (&:where([data-mode="dark"] *))` 走 `data-mode` 而非 `.dark` class
- Storybook 独立 dev server（端口 6006）与 Vite app dev server（端口 1420）并存，stories 与组件 co-located

**Tech Stack:** Vite 8 + React 19 + Tailwind v4 + Storybook 8 (latest)+ @storybook/addon-themes + Anthropic DS（CSS + theme-init.js + useThemeMode hook）

**预计工期：** 1 个工作日（8 个 task）

---

## Task 1: 拷贝 DS 源文件到项目目标路径

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/typography.css`
- Create: `src/styles/theme.css`
- Create: `public/theme-init.js`
- Create: `src/lib/useThemeMode.ts`

源目录是 `原型稿/Claude Desktop/_deliverables/anthropic-design-system/`。文件 1:1 拷贝，**不要修改内容**。

- [ ] **Step 1: 拷贝 5 个文件**

```bash
cp "原型稿/Claude Desktop/_deliverables/anthropic-design-system/src/styles/tokens.css" src/styles/tokens.css
cp "原型稿/Claude Desktop/_deliverables/anthropic-design-system/src/styles/typography.css" src/styles/typography.css
cp "原型稿/Claude Desktop/_deliverables/anthropic-design-system/src/styles/theme.css" src/styles/theme.css
cp "原型稿/Claude Desktop/_deliverables/anthropic-design-system/public/theme-init.js" public/theme-init.js
cp "原型稿/Claude Desktop/_deliverables/anthropic-design-system/src/hooks/useThemeMode.ts" src/lib/useThemeMode.ts
```

- [ ] **Step 2: 验证文件落点**

```bash
ls src/styles/ src/lib/useThemeMode.ts public/theme-init.js
```

Expected output 包含：`tokens.css typography.css theme.css`、`src/lib/useThemeMode.ts`、`public/theme-init.js`。

- [ ] **Step 3: Commit**

```bash
git add src/styles/ src/lib/useThemeMode.ts public/theme-init.js
git commit -m "$(cat <<'EOF'
feat(ds): import anthropic design system source files

Bring tokens.css, typography.css, theme.css, theme-init.js, and
useThemeMode hook from 原型稿/.../anthropic-design-system into the
project tree. No content changes yet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 重写 `src/index.css` — Anthropic tokens + shadcn 别名层

**Files:**
- Modify: `src/index.css`（完整替换）

当前 `src/index.css` 是 shadcn init 留下的默认 oklch token，跟 Anthropic DS 风格不符。重写成：
1. `@import` Tailwind / Anthropic DS 三件套 / shadcn 桥
2. 留 `@theme inline` 块（让 Tailwind utility 类名仍可用 `bg-background`、`text-foreground`）
3. 在 `[data-theme="claude"]` selector 里把 shadcn 标准 token 赋值为 `hsl(var(--<anthropic-token>))`

**关键决策**：保留 `--font-sans: 'Geist Variable'` 是 shadcn init 时强加的，要替换成 Anthropic 的字体栈（typography.css 里的 `--font-ui`）。

- [ ] **Step 1: 用以下内容完整替换 `src/index.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* Anthropic Design System */
@import "./styles/tokens.css";
@import "./styles/typography.css";
@import "./styles/theme.css";

/* dark 变体走 data-mode，与 theme-init.js 一致 */
@custom-variant dark (&:where([data-mode="dark"] *));

@theme inline {
    --font-heading: var(--font-ui-serif);
    --font-sans: var(--font-ui);
    --font-serif: var(--font-ui-serif);
    --font-mono: var(--font-mono);

    /* shadcn 颜色 utility 入口 — 解析到 :root 下定义的 shadcn alias */
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-destructive: var(--destructive);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
    --color-sidebar: var(--sidebar);
    --color-sidebar-foreground: var(--sidebar-foreground);
    --color-sidebar-primary: var(--sidebar-primary);
    --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
    --color-sidebar-accent: var(--sidebar-accent);
    --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
    --color-sidebar-border: var(--sidebar-border);
    --color-sidebar-ring: var(--sidebar-ring);

    --radius-sm: 0.25rem;
    --radius-md: 0.375rem;
    --radius-lg: 0.5rem;
    --radius-xl: 0.75rem;
    --radius-2xl: 1rem;
}

/* shadcn 标准 token → Anthropic 调色板别名
 * 这一层让任何用 bg-background / text-foreground / border-border 的 shadcn / ai-elements
 * 组件，自动跟换到 Anthropic 调色板. dark mode 由 data-mode 在 tokens.css 内驱动. */
[data-theme="claude"] {
    --background: hsl(var(--bg-100));
    --foreground: hsl(var(--text-100));
    --card: hsl(var(--bg-200));
    --card-foreground: hsl(var(--text-100));
    --popover: hsl(var(--bg-100));
    --popover-foreground: hsl(var(--text-100));
    --primary: hsl(var(--brand-100));
    --primary-foreground: hsl(var(--oncolor-100));
    --secondary: hsl(var(--bg-300));
    --secondary-foreground: hsl(var(--text-100));
    --muted: hsl(var(--bg-200));
    --muted-foreground: hsl(var(--text-400));
    --accent: hsl(var(--accent-100));
    --accent-foreground: hsl(var(--oncolor-100));
    --destructive: hsl(var(--danger-100));
    --border: hsl(var(--border-300) / 0.15);
    --input: hsl(var(--border-300) / 0.15);
    --ring: hsl(var(--brand-100));

    /* sidebar tokens — Anthropic 没有专门的 sidebar 系列，沿用 bg-200 配色 */
    --sidebar: hsl(var(--bg-200));
    --sidebar-foreground: hsl(var(--text-100));
    --sidebar-primary: hsl(var(--brand-100));
    --sidebar-primary-foreground: hsl(var(--oncolor-100));
    --sidebar-accent: hsl(var(--bg-300));
    --sidebar-accent-foreground: hsl(var(--text-100));
    --sidebar-border: hsl(var(--border-300) / 0.15);
    --sidebar-ring: hsl(var(--brand-100));

    --radius: 0.5rem;
}

@layer base {
    * {
        @apply border-border outline-ring/50;
    }
    body {
        @apply bg-background text-foreground;
    }
    html {
        @apply font-sans;
    }
}
```

- [ ] **Step 2: 跑 Vite dev 验证编译无错**

```bash
bun run dev
```

打开 http://localhost:1420，hello-world 应该仍能加载（颜色变了——bg 变米白色 `#F8F6F0` 区间，字体变 Inter）。

- [ ] **Step 3: 验证 dark 模式触发**

浏览器 DevTools console 跑：

```js
document.documentElement.setAttribute('data-mode', 'dark')
```

页面背景应立刻切到 Anthropic dark (`#252523` 区间)。改回 light：

```js
document.documentElement.setAttribute('data-mode', 'light')
```

如果颜色没切，先确认 `<html>` 元素当前 attribute 是不是 `data-theme="claude"`（如果还没有，Task 3 会加）。本 task 暂时手动加：

```js
document.documentElement.setAttribute('data-theme', 'claude')
```

- [ ] **Step 4: Ctrl-C 停掉 vite dev，commit**

```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
feat(ds): rewrite src/index.css with anthropic tokens + shadcn aliases

- Import tokens.css/typography.css/theme.css from anthropic DS.
- Map shadcn standard tokens (--background, --foreground, --primary,
  --border, sidebar-*, etc) onto anthropic palette via [data-theme="claude"]
  selector so shadcn/ai-elements components inherit anthropic colors.
- Wire @custom-variant dark to [data-mode="dark"] (matches theme-init.js).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 更新 `index.html` — data-theme、theme-init.js、Google Fonts

**Files:**
- Modify: `index.html`

当前 `index.html` 12 行，没挂 `data-theme`、没引 fonts。改完后 `<html>` 应有 `data-theme="claude"` 加 `lang="zh-CN"`，`<head>` 第一个 script 是 theme-init.js（同步执行），之后才是字体 link。

- [ ] **Step 1: 用以下内容完整替换 `index.html`**

```html
<!doctype html>
<html lang="zh-CN" data-theme="claude">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Studio</title>
    <!-- Theme init MUST be first to avoid FOUC -->
    <script src="/theme-init.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..700;1,8..60,400..700&family=Inter:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 跑 Vite dev 验证**

```bash
bun run dev
```

打开 http://localhost:1420，DevTools Elements 面板检查 `<html>` 标签应有 `data-theme="claude"` 和 `data-mode="light"` 或 `"dark"`（由系统偏好决定）。Network 面板应看到 Google Fonts CSS 加载成功（status 200）。控制台无 error。

- [ ] **Step 3: 主题切换 sanity check**

DevTools console：

```js
localStorage.setItem('preferred_theme_mode', 'dark')
location.reload()
```

刷新后页面应直接以 dark 模式呈现，**不闪屏**（theme-init.js 防 FOUC 的作用）。再切回：

```js
localStorage.removeItem('preferred_theme_mode')
location.reload()
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(ds): wire theme-init.js, data-theme, and google fonts in index.html

- Set <html lang="zh-CN" data-theme="claude">.
- Load /theme-init.js as the first <head> script (must precede stylesheets
  to avoid FOUC).
- Preconnect + load Source Serif 4, Inter, JetBrains Mono from Google Fonts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 验证 Tauri 链路仍能跑

**Files:** 无（只跑验证命令）

DS 改动后，确认 `tauri:dev` 链路不破。

- [ ] **Step 1: 跑 tauri:dev（后台）**

```bash
bun run tauri:dev
```

约 30s 后 Tauri 窗口应该打开，标题 "Agent Studio"，背景米白，hello-world 内容可见。如果窗口没出现或 panic，立刻 Ctrl-C 看 stderr。

- [ ] **Step 2: 主题切换 in Tauri window**

打开 Tauri 窗口的 DevTools（mac 右键 → Inspect 或 ⌥⌘I）：

```js
document.documentElement.setAttribute('data-mode', 'dark')
```

窗口背景应立刻切到暗色。

- [ ] **Step 3: Ctrl-C 停 tauri:dev**

无需 commit，本 task 是纯验证。

---

## Task 5: 安装 Storybook + addons

**Files:**
- Modify: `package.json`（安装命令自动更新）
- Create: `.storybook/main.ts`、`.storybook/preview.tsx`、`.storybook/manager.ts`（init 命令生成）

Storybook 8/9 init 会探测 Vite 项目并自动配置。**注意**：Vite 8 是 rolldown 底座，Storybook 9.x 才官方支持。装 `@latest` 让 Storybook 自己选最新稳定版（截至 2026-05 应为 9.x）。

- [ ] **Step 1: 跑 Storybook init**

```bash
bunx storybook@latest init --type react_vite --yes
```

预计 1-3 分钟。完成后会自动新增 `.storybook/` 目录、`src/stories/` 示例（暂留，后面删）、`package.json` 加 dev deps（`@storybook/react-vite`、`@storybook/addon-essentials`、`@storybook/blocks` 等）和 scripts（`storybook` / `build-storybook`）。

**如果 init 失败**（最常见原因：Vite 8 不兼容），按以下顺序处理：
1. 看错误信息——若提示 "Vite version unsupported"，跑 `bunx storybook@9 init --type react_vite --yes`（锁 9.x）
2. 若仍失败，按 `https://storybook.js.org/docs/get-started/install` 手动装 + 配（升级到 next 版）
3. 把失败原因+采用版本记在 Step 7 的 commit message 里

- [ ] **Step 2: 加 themes addon**

```bash
bun add -d @storybook/addon-themes
```

- [ ] **Step 3: 验证 scripts 存在**

```bash
grep -E '"(storybook|build-storybook)"' package.json
```

Expected: 两条都在。若 init 把 script 写成 `"storybook": "storybook dev -p 6006"` 就 OK。否则手动加。

- [ ] **Step 4: 第一次启动 sanity**

```bash
bun run storybook
```

应该在浏览器自动打开 http://localhost:6006，看到示例 stories（Button / Header / Page）。如果报错，常见原因+对策：

| 错误 | 对策 |
|--|--|
| `Cannot find module 'storybook/internal/...'` | `bun install` 重新装一次 |
| `Failed to load Vite config` | 检查 `.storybook/main.ts` 里 `viteFinal` 配置；如有重复 plugins 改名 |
| TypeScript 报错 | `.storybook/main.ts` 顶部加 `import type { StorybookConfig } from "@storybook/react-vite";` |

Ctrl-C 停止 Storybook。

- [ ] **Step 5: Commit**

```bash
git add .storybook/ package.json src/stories/ tsconfig*.json
git commit -m "$(cat <<'EOF'
feat(storybook): scaffold storybook with react-vite framework

- bunx storybook@latest init --type react_vite generated .storybook/
  config and example stories under src/stories/.
- Added @storybook/addon-themes for theme switching.
- New scripts: storybook (dev on :6006), build-storybook.

Note: example stories under src/stories/ will be removed in next task —
keep them in this commit for traceability.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 配置 `.storybook/main.ts` 和 `preview.tsx`

**Files:**
- Modify: `.storybook/main.ts`
- Modify (overwrite): `.storybook/preview.tsx`
- Delete: `src/stories/`（示例）

让 Storybook：
1. 扫描 `src/**/*.stories.@(ts|tsx)`（co-located 模式）
2. import 项目的 `src/index.css`（带 Tailwind + Anthropic tokens）
3. 用 `@storybook/addon-themes` 的 `withThemeByDataAttribute` 切 `data-mode`
4. 全局 wrap `<div data-theme="claude">` 包裹 stories

- [ ] **Step 1: 替换 `.storybook/main.ts` 为以下内容**

注意：保留 init 生成的 framework/addons 列表，只改 `stories` glob。下面是参考完整版（如果 init 生成的内容跟这个有出入，按这个为准）：

```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx|mdx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-themes",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;
```

- [ ] **Step 2: 替换 `.storybook/preview.tsx` 为以下内容**

如果 init 生成的是 `.ts` 不是 `.tsx`，把 `.ts` 删了改成 `.tsx`。

```tsx
import type { Preview } from "@storybook/react";
import { withThemeByDataAttribute } from "@storybook/addon-themes";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true }, // 主题切换替代背景控制
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark" },
      defaultTheme: "light",
      attributeName: "data-mode",
    }),
    (Story) => (
      <div data-theme="claude" style={{ minHeight: "100vh" }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
```

- [ ] **Step 3: 删除 init 生成的示例 stories**

```bash
rm -rf src/stories/
```

- [ ] **Step 4: 启 Storybook 验证**

```bash
bun run storybook
```

打开 http://localhost:6006。左侧 sidebar 应该是**空的**（stories 已删，新的还没加）。顶部 toolbar 应该看到一个**主题切换控件**（圆圈 icon + light/dark 选项）——这是 addon-themes 装好的标志。如果 toolbar 没出现，检查 Step 2 的 decorators 写法。

Ctrl-C 停止。

- [ ] **Step 5: Commit**

```bash
git add .storybook/
git rm -r src/stories/
git commit -m "$(cat <<'EOF'
feat(storybook): configure stories glob, anthropic theme decorator, addon-themes

- main.ts: co-located stories glob src/**/*.stories.@(ts|tsx|mdx).
- preview.tsx: import src/index.css, wrap with data-theme="claude",
  use withThemeByDataAttribute on data-mode for light/dark toggle.
- Removed example src/stories/ from init scaffolding.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 写第一个 sanity story — Button

**Files:**
- Modify (already exists): `src/components/ui/button.tsx`（不动）
- Create: `src/components/ui/button.stories.tsx`

用项目已有的 shadcn `Button` 作为 sanity case。一个 story 文件覆盖 3 个 variant（default / outline / ghost）+ disabled，验证：
1. Storybook 能正常加载本地 import 路径 `@/components/ui/button`
2. Anthropic 调色板正确——default Button 应该是 brand 橙色 `#C66E51` 区间
3. light/dark toggle 切换时颜色随之变

- [ ] **Step 1: 创建 `src/components/ui/button.stories.tsx`**

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/ui/button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  args: {
    children: "Click me",
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const Outline: Story = {
  args: { variant: "outline" },
};

export const Ghost: Story = {
  args: { variant: "ghost" },
};

export const Destructive: Story = {
  args: { variant: "destructive" },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <Button>Default</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};
```

- [ ] **Step 2: 跑 Storybook 验证**

```bash
bun run storybook
```

打开 http://localhost:6006，左侧 sidebar 应该出现 **UI > Button** 节点，下面 5 个 stories + AllVariants。

逐项检查：
- **Default**：button 是 brand 橙色实色（`#C66E51` 附近），白字
- **Outline**：透明底 + 细边框，文字色随主题
- **Ghost**：透明底 + 无边框，hover 时变深一档
- **Destructive**：红色实色（danger-100）
- **Disabled**：opacity 降低，cursor 变 not-allowed
- **AllVariants**：5 个按钮横排

- [ ] **Step 3: 切换主题验证**

Storybook toolbar 上点 **theme toggle icon** → 切到 **dark**。所有 5 个 button 颜色应跟着切：
- Default 按钮的橙色在 dark 下应更亮（`#DA8C75` 区间——`--brand-100` dark 值）
- Outline 的文字应变白
- Ghost 的 hover bg 应变 `--bg-300`
- 整个 canvas 背景应变 Anthropic dark（`#252523`）

切回 light 再确认一遍。两个 mode 都应该**没有**任何颜色看起来"shadcn 默认灰白"——只要看到这种灰白说明 token alias 没生效。

- [ ] **Step 4: Ctrl-C 停止，commit**

```bash
git add src/components/ui/button.stories.tsx
git commit -m "$(cat <<'EOF'
feat(storybook): add sanity Button stories covering all variants

Validates the end-to-end DS migration: shadcn Button consumes the
anthropic palette via shadcn-token alias layer, and light/dark toggle
through addon-themes flips data-mode correctly.

Variants: Default, Outline, Ghost, Destructive, Disabled, AllVariants.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 全链路 sanity + 文档化 Storybook 在 .gitignore

**Files:**
- Modify: `.gitignore`

最终验证三条命令都跑通，把 Storybook build 产物加入 `.gitignore`。

- [ ] **Step 1: `bun run dev` sanity**

```bash
bun run dev
```

打开 http://localhost:1420，hello-world App 加载、字体是 Inter（不是 Geist）、主题切换可用。Ctrl-C 停。

- [ ] **Step 2: `bun run storybook` sanity**

```bash
bun run storybook
```

打开 http://localhost:6006，Button stories 全部正常、theme toggle 可切。Ctrl-C 停。

- [ ] **Step 3: `bun run tauri:dev` sanity**

```bash
bun run tauri:dev
```

Tauri 窗口打开，App 内容正常显示。Ctrl-C 停（注意 tauri:dev 同时跑 sidecar，确认 sidecar 也清理掉了——`pgrep -f agent-studio-sidecar` 应无输出）。

- [ ] **Step 4: `bun run build` sanity（生产构建无破坏）**

```bash
bun run build
```

预期 `tsc -b && vite build` 通过，产出在 `dist/`。size 增量主要来自 Google Fonts CSS。

- [ ] **Step 5: `bun run build-storybook` sanity**

```bash
bun run build-storybook
```

产出在 `storybook-static/`，时间 ~30s，无 error。

- [ ] **Step 6: 把 Storybook build artifacts 加入 .gitignore**

`.gitignore` 末尾追加：

```
# Storybook
storybook-static/
```

可以用 sed 或 Edit tool：

```bash
echo "" >> .gitignore && echo "# Storybook" >> .gitignore && echo "storybook-static/" >> .gitignore
```

确认：

```bash
grep storybook-static .gitignore
```

Expected: `storybook-static/`

- [ ] **Step 7: 清理 dist + storybook-static 产物（可选）**

```bash
rm -rf dist/ storybook-static/
```

- [ ] **Step 8: Final commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore: gitignore storybook-static build artifacts

Wave 1 complete:
- DS migrated (tokens / typography / theme / theme-init / useThemeMode)
- src/index.css rewritten with shadcn-token aliases over anthropic palette
- index.html wires data-theme + theme-init + Google Fonts
- Storybook 9 installed with addon-themes, co-located stories glob
- Button sanity stories validate end-to-end light/dark switching

Next: Wave 2 — install 13 ai-elements components + visual reconciliation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## 验收 checklist（Wave 1 完成态）

- [ ] `src/styles/{tokens,typography,theme}.css` 存在且未被改动
- [ ] `public/theme-init.js` 存在
- [ ] `src/lib/useThemeMode.ts` 存在
- [ ] `index.html` `<html>` 上有 `data-theme="claude"`，第一个 script 是 `/theme-init.js`，引了 Source Serif 4 / Inter / JetBrains Mono
- [ ] `src/index.css` 里 shadcn token（`--background` / `--primary` / `--border` etc）全部赋值为 `hsl(var(--<anthropic>))`
- [ ] `@custom-variant dark` 走 `[data-mode="dark"]`
- [ ] `bun run dev` 跑通，hello-world 用 Inter 字体显示，按钮是橙色
- [ ] `bun run tauri:dev` 跑通，Tauri 窗口 + sidecar 协同正常
- [ ] `bun run storybook` 跑通，Button 6 个 stories 全可见
- [ ] Storybook toolbar 的 theme toggle 能切换 light/dark，颜色实际变化
- [ ] light/dark 切换 **无 FOUC**（首屏不闪）
- [ ] `bun run build` 通过
- [ ] `bun run build-storybook` 通过
- [ ] `storybook-static/` 在 `.gitignore` 内
- [ ] git log 至少 7 个 commit（DS 拷贝 / index.css / index.html / storybook init / storybook config / button stories / gitignore final）

---

## 风险点 + fallback

1. **Storybook 9 与 Vite 8 不兼容**（Task 5）
   - 现象：`bunx storybook init` 报 "Vite version unsupported" 或 storybook dev 启动 panic
   - 应对：先试 Storybook 8（`bunx storybook@8 init`），8 + Vite 5 兼容性老练；如必须 Vite 8，等 Storybook 9 patch
   - 决策：如降级 Storybook 失败影响整个 wave，把 Storybook 放到 Wave 2，本 wave 只完成 DS 迁移

2. **Google Fonts 加载失败**（Task 3 在受限网络下）
   - 现象：字体回落到 system-ui 而非 Inter / Source Serif 4
   - 应对：临时可接受 fallback；后期 Wave 2 改用 `@fontsource-variable` 系列（已有 `@fontsource-variable/geist`，加 `@fontsource-variable/inter` + `@fontsource-variable/source-serif-4`）

3. **shadcn `button.tsx` 用了某个未 alias 的 token**
   - 现象：Button 显示 oklch 残留颜色（不应该）
   - 应对：DevTools 看实际 computed style 找到出问题的 var，在 `src/index.css` 的 `[data-theme="claude"]` 块补一行 alias

4. **theme-init.js 在 Tauri 里 localStorage 失败**
   - 现象：Tauri 窗口里 console.log `localStorage.getItem('preferred_theme_mode')` 抛错或始终为 null
   - 应对：theme-init.js 自身已 try-catch，没问题；如必须持久化，未来 Wave 替换为 `tauri-plugin-store`

---

## Wave 2 预告

完成本 wave 后进入：

> **Wave 2** — 安装 13 个 ai-elements 组件（message / prompt-input / tool / artifact / shimmer / plan / task / file-tree / chain-of-thought / canvas / code-block / toolbar / confirmation），每个走 visual reconciliation 流程 + 写 default & dark stories；同时把 shadcn 缺的 atoms（input / textarea / select / avatar / tooltip 等约 11 个）补齐。

Wave 2 plan 在 Wave 1 完工并 review 通过后写，避免本 plan 一次性塞太多未知。
