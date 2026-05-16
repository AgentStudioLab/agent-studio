# Wave 1 · Design System Migration + Storybook 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Anthropic Design System 完整迁入项目，替换掉 shadcn init 留下的 oklch 默认 token，让 Tauri app 和 Storybook 两条链路在 light/dark 双主题下都跑通，并通过一个 sanity Button story 验证。

**Architecture:**
- 颜色系统：单 dimension（`data-mode="light|dark"`），theme-init.js 写 `data-mode` 防 FOUC，无 `data-theme`
- 三层 Token：`src/styles/{primitives,semantic,components}/` + `shadcn-alias.css` + `globals.css`。primitives 是静态 HSL 调色板，semantic 引用 primitives 并按 `data-mode` 切换，components 占位，shadcn-alias 让 shadcn / ai-elements 自动继承 Anthropic 调色板
- Tailwind dark 变体：`@custom-variant dark (&:where([data-mode="dark"] *))` 走 `data-mode` 而非 `.dark` class
- Storybook 独立 dev server（端口 6006）与 Vite app dev server（端口 1420）并存，stories 与组件 co-located

**Tech Stack:** Vite 8 + React 19 + Tailwind v4 + Storybook 8 (latest)+ @storybook/addon-themes + Anthropic DS（CSS + theme-init.js + useThemeMode hook）

**预计工期：** 1 个工作日（8 个 task）

---

## Task 1: 建立三层 token 文件夹结构

**Files (create all):**
- `src/styles/primitives/colors.css`
- `src/styles/primitives/spacing.css`
- `src/styles/primitives/radius.css`
- `src/styles/primitives/typography.css`
- `src/styles/semantic/colors.css`
- `src/styles/semantic/spacing.css`
- `src/styles/semantic/radius.css`
- `src/styles/components/button.css`
- `src/styles/components/input.css`
- `src/styles/components/card.css`
- `src/styles/shadcn-alias.css`
- `src/styles/globals.css`
- `public/theme-init.js`（1:1 拷贝 DS 源文件）
- `src/lib/useThemeMode.ts`（1:1 拷贝 DS 源文件）

三层架构：
```
primitives  →  semantic  →  components ┐
                       └→  shadcn-alias ┴→  Tailwind utility (via @theme inline)
```

主题维度：`<html>` 上仅 `data-mode="light|dark"`，**不**用 `data-theme`。

- [ ] **Step 1: 创建子目录**

```bash
mkdir -p src/styles/primitives src/styles/semantic src/styles/components
```

- [ ] **Step 2: 写 `src/styles/primitives/colors.css`**

颜色 primitives — Tailwind 风格 hue + 阶梯。HSL 三元组（不带 `hsl()` 包装，符合 shadcn 约定，使用时 `hsl(var(--color-xxx))`）。这套色板从 Anthropic DS 提取去重得到。

```css
/* ============================================================
 * Primitives · Colors
 * ----------
 * Static color palette. HSL bare triples (use `hsl(var(--color-xxx))`).
 * Naming: Tailwind-style <hue>-<step>. Step 50=lightest, 950=darkest.
 * Do NOT reference any other token here — primitives must be self-contained.
 * ============================================================ */
:root {
    /* ---- Absolute ---- */
    --color-pure-white: 0 0% 100%;
    --color-pure-black: 0 0% 0%;

    /* ---- Stone (warm neutral) — Anthropic 灰色阶梯 ---- */
    --color-stone-25:  60 6.7% 97.1%;
    --color-stone-50:  48 33.3% 97.1%;
    --color-stone-75:  53 28.6% 94.5%;
    --color-stone-100: 48 25% 92.2%;
    --color-stone-200: 50 20.7% 88.6%;
    --color-stone-300: 51 16.5% 84.5%;
    --color-stone-400: 50 9% 73.7%;
    --color-stone-500: 48 4.8% 59.2%;
    --color-stone-600: 51 3.1% 43.7%;
    --color-stone-700: 48 3.4% 29.2%;
    --color-stone-750: 60 2.5% 23.3%;
    --color-stone-800: 60 2.1% 18.4%;
    --color-stone-850: 60 2.7% 14.5%;
    --color-stone-900: 30 3.3% 11.8%;
    --color-stone-950: 60 2.6% 7.6%;

    /* ---- Orange (brand) ---- */
    --color-orange-500: 15 63.1% 59.6%;
    --color-orange-600: 15 54.2% 51.2%;

    /* ---- Blue (accent) ---- */
    --color-blue-100: 210 72% 90%;
    --color-blue-400: 210 65.5% 67.1%;
    --color-blue-600: 210 70.9% 51.6%;
    --color-blue-700: 210 73.7% 40.2%;
    --color-blue-900: 210 55.9% 24.6%;

    /* ---- Purple (accent-pro) ---- */
    --color-purple-100: 251 33.3% 91.8%;
    --color-purple-200: 251 84.6% 74.5%;
    --color-purple-300: 251 61% 72.2%;
    --color-purple-500: 251 40.2% 54.1%;
    --color-purple-600: 251 40% 45.1%;
    --color-purple-700: 251 34.2% 33.3%;
    --color-purple-900: 250 25.3% 19.4%;

    /* ---- Red (danger) ---- */
    --color-red-50:  0 50% 95%;
    --color-red-300: 0 98.4% 75.1%;
    --color-red-500: 0 67% 59.6%;
    --color-red-600: 0 56.2% 45.4%;
    --color-red-700: 0 58.6% 34.1%;
    --color-red-800: 0 46.5% 27.8%;

    /* ---- Green (success) ---- */
    --color-green-50:  86 45.1% 90%;
    --color-green-500: 97 59.1% 46.1%;
    --color-green-700: 97 75% 32.9%;
    --color-green-800: 103 72.3% 26.9%;
    --color-green-900: 125 100% 18%;
    --color-green-950: 127 100% 13.9%;

    /* ---- Amber (warning) ---- */
    --color-amber-100: 38 65.9% 92%;
    --color-amber-500: 40 71% 50%;
    --color-amber-600: 39 93.4% 35.9%;
    --color-amber-700: 39 88.8% 28%;
    --color-amber-800: 45 91.8% 19%;
    --color-amber-900: 45 94.8% 15.1%;
}
```

- [ ] **Step 3: 写 `src/styles/primitives/spacing.css`**

```css
/* ============================================================
 * Primitives · Spacing
 * ----------
 * Tailwind v4 base unit. Utilities (p-1, gap-2 etc.) multiply this.
 * Components should prefer semantic spacing names — see semantic/spacing.css.
 * ============================================================ */
:root {
    --spacing: 0.25rem;  /* 4px base */
}
```

- [ ] **Step 4: 写 `src/styles/primitives/radius.css`**

```css
/* ============================================================
 * Primitives · Border Radius
 * ----------
 * Static radius scale. Components should prefer semantic radius names
 * — see semantic/radius.css.
 * ============================================================ */
:root {
    --radius-none:  0;
    --radius-xs:    0.125rem;
    --radius-sm:    0.25rem;
    --radius-md:    0.375rem;
    --radius-lg:    0.5rem;
    --radius-xl:    0.75rem;
    --radius-2xl:   1rem;
    --radius-3xl:   1.5rem;
    --radius-full:  9999px;
}
```

- [ ] **Step 5: 写 `src/styles/primitives/typography.css`**

```css
/* ============================================================
 * Primitives · Typography
 * ----------
 * Font families (with system fallback stacks), size scale with paired
 * line-heights (Tailwind v4 syntax), and weight scale tuned for variable
 * fonts (430/550/580 are non-standard mid-weights that read cleaner at
 * low DPI than 400/500/600).
 * ============================================================ */
:root {
    --font-family-sans:
        "Inter", system-ui, -apple-system, BlinkMacSystemFont,
        "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-family-serif:
        "Source Serif 4", "Tiempos Text", Georgia, Cambria,
        "Times New Roman", Times, serif;
    --font-family-mono:
        "JetBrains Mono", ui-monospace, "SF Mono", Monaco, "Cascadia Code",
        "Roboto Mono", Menlo, Consolas, "Courier New", monospace;

    /* Size scale with paired line-heights */
    --font-size-xs:   0.75rem;
    --font-size-xs--line-height:   calc(1 / 0.75);
    --font-size-sm:   0.875rem;
    --font-size-sm--line-height:   calc(1.25 / 0.875);
    --font-size-base: 1rem;
    --font-size-base--line-height: 1.5;
    --font-size-lg:   1.125rem;
    --font-size-lg--line-height:   calc(1.75 / 1.125);
    --font-size-xl:   1.25rem;
    --font-size-xl--line-height:   calc(1.75 / 1.25);
    --font-size-2xl:  1.5rem;
    --font-size-2xl--line-height:  calc(2 / 1.5);
    --font-size-3xl:  1.875rem;
    --font-size-3xl--line-height:  1.2;
    --font-size-4xl:  2.25rem;
    --font-size-4xl--line-height:  calc(2.5 / 2.25);
    --font-size-5xl:  3rem;
    --font-size-5xl--line-height:  1;

    /* Weight scale (variable font friendly) */
    --font-weight-thin:       100;
    --font-weight-extralight: 200;
    --font-weight-light:      300;
    --font-weight-normal:     430;
    --font-weight-medium:     550;
    --font-weight-semibold:   580;
    --font-weight-bold:       700;
    --font-weight-extrabold:  800;
    --font-weight-black:      900;

    /* Tracking + line-height utilities */
    --tracking-wide:   0.025em;
    --tracking-wider:  0.05em;
    --leading-tight:   1.25;
    --leading-snug:    1.375;
    --leading-normal:  1.5;
    --leading-relaxed: 1.625;
}
```

- [ ] **Step 6: 写 `src/styles/semantic/colors.css`**

语义颜色 — light 默认 + dark 覆写。所有 `--bg-*` / `--text-*` / `--brand-*` 等都引用 primitive。

```css
/* ============================================================
 * Semantic · Colors
 * ----------
 * UI-purpose color names (bg/text/brand/accent/status/...).
 * Light values on :root, dark overrides on :root[data-mode="dark"].
 * Every value must reference a primitive — no raw HSL here.
 * ============================================================ */
:root {
    /* Absolute (never change with mode) */
    --always-white: var(--color-pure-white);
    --always-black: var(--color-pure-black);

    /* Surfaces */
    --bg-000: var(--color-pure-white);
    --bg-100: var(--color-stone-50);
    --bg-200: var(--color-stone-75);
    --bg-300: var(--color-stone-100);
    --bg-400: var(--color-stone-200);
    --bg-500: var(--color-stone-200);

    /* Text */
    --text-000: var(--color-stone-950);
    --text-100: var(--color-stone-950);
    --text-200: var(--color-stone-750);
    --text-300: var(--color-stone-750);
    --text-400: var(--color-stone-600);
    --text-500: var(--color-stone-600);

    /* Brand (orange terracotta) */
    --brand-000: var(--color-orange-600);
    --brand-100: var(--color-orange-600);
    --brand-200: var(--color-orange-500);
    --brand-900: var(--color-pure-black);
    --accent-brand: var(--color-orange-500);

    /* Accent (blue) */
    --accent-000: var(--color-blue-700);
    --accent-100: var(--color-blue-600);
    --accent-200: var(--color-blue-600);
    --accent-900: var(--color-blue-100);

    /* Accent Pro (purple) */
    --accent-pro-000: var(--color-purple-700);
    --accent-pro-100: var(--color-purple-600);
    --accent-pro-200: var(--color-purple-300);
    --accent-pro-900: var(--color-purple-100);

    /* Border (consumers usually apply alpha at point-of-use) */
    --border-100: var(--color-stone-900);
    --border-200: var(--color-stone-900);
    --border-300: var(--color-stone-900);
    --border-400: var(--color-stone-900);

    /* Status */
    --danger-000: var(--color-red-700);
    --danger-100: var(--color-red-600);
    --danger-200: var(--color-red-600);
    --danger-900: var(--color-red-50);

    --success-000: var(--color-green-900);
    --success-100: var(--color-green-800);
    --success-200: var(--color-green-800);
    --success-900: var(--color-green-50);

    --warning-000: var(--color-amber-800);
    --warning-100: var(--color-amber-700);
    --warning-200: var(--color-amber-700);
    --warning-900: var(--color-amber-100);

    /* Foreground on tinted surfaces (oncolor) */
    --oncolor-100: var(--color-pure-white);
    --oncolor-200: var(--color-stone-25);
    --oncolor-300: var(--color-stone-25);

    /* Pictogram (decorative surfaces) */
    --pictogram-100: var(--color-stone-200);
    --pictogram-200: var(--color-stone-300);
    --pictogram-300: var(--color-pure-white);
    --pictogram-400: var(--color-stone-50);
}

:root[data-mode="dark"] {
    --bg-000: var(--color-stone-800);
    --bg-100: var(--color-stone-850);
    --bg-200: var(--color-stone-900);
    --bg-300: var(--color-stone-950);
    --bg-400: var(--color-pure-black);
    --bg-500: var(--color-pure-black);

    --text-000: var(--color-stone-50);
    --text-100: var(--color-stone-50);
    --text-200: var(--color-stone-400);
    --text-300: var(--color-stone-400);
    --text-400: var(--color-stone-500);
    --text-500: var(--color-stone-500);

    --brand-000: var(--color-orange-600);
    --brand-100: var(--color-orange-500);
    --brand-200: var(--color-orange-500);

    --accent-000: var(--color-blue-400);
    --accent-900: var(--color-blue-900);

    --accent-pro-000: var(--color-purple-200);
    --accent-pro-100: var(--color-purple-500);
    --accent-pro-200: var(--color-purple-600);
    --accent-pro-900: var(--color-purple-900);

    --border-100: var(--color-stone-300);
    --border-200: var(--color-stone-300);
    --border-300: var(--color-stone-300);
    --border-400: var(--color-stone-300);

    --danger-000: var(--color-red-300);
    --danger-100: var(--color-red-500);
    --danger-200: var(--color-red-500);
    --danger-900: var(--color-red-800);

    --success-000: var(--color-green-500);
    --success-100: var(--color-green-700);
    --success-200: var(--color-green-700);
    --success-900: var(--color-green-950);

    --warning-000: var(--color-amber-500);
    --warning-100: var(--color-amber-600);
    --warning-200: var(--color-amber-600);
    --warning-900: var(--color-amber-900);

    --pictogram-100: var(--color-stone-700);
    --pictogram-200: var(--color-stone-750);
    --pictogram-300: var(--color-stone-800);
    --pictogram-400: var(--color-stone-850);
}
```

- [ ] **Step 7: 写 `src/styles/semantic/spacing.css`**

```css
/* ============================================================
 * Semantic · Spacing
 * ----------
 * UI-purpose spacing aliases. Components prefer these names over raw
 * `var(--spacing) * N` so a single edit re-flows the whole UI.
 * ============================================================ */
:root {
    --spacing-inline-gap:        calc(var(--spacing) * 2);   /*  8px */
    --spacing-component-padding: calc(var(--spacing) * 3);   /* 12px */
    --spacing-stack-gap:         calc(var(--spacing) * 4);   /* 16px */
    --spacing-section-gap:       calc(var(--spacing) * 6);   /* 24px */
    --spacing-page-padding:      calc(var(--spacing) * 8);   /* 32px */
    --spacing-sidebar-width:     calc(var(--spacing) * 65);  /* 260px */
    --spacing-aside-width:       calc(var(--spacing) * 80);  /* 320px */
}
```

- [ ] **Step 8: 写 `src/styles/semantic/radius.css`**

```css
/* ============================================================
 * Semantic · Border Radius
 * ----------
 * UI-purpose radius aliases. Components reference these by intent
 * (--radius-button, --radius-card) rather than primitive sizes.
 * ============================================================ */
:root {
    --radius-button:    var(--radius-md);
    --radius-input:     var(--radius-md);
    --radius-chip:      var(--radius-sm);
    --radius-card:      var(--radius-lg);
    --radius-modal:     var(--radius-xl);
    --radius-thumbnail: var(--radius-sm);
    --radius-pill:      var(--radius-full);
}
```

- [ ] **Step 9: 写 `src/styles/components/button.css`**

骨架占位 — 真正 Button 样式在 shadcn `button.tsx` 里。这里只放将来局部覆盖时会用到的变量入口。

```css
/* ============================================================
 * Components · Button
 * ----------
 * Skeleton placeholder. Populated when Button visuals are derived
 * from Showcase / screenshots in later waves.
 * ============================================================ */
:root {
    --button-bg-default: var(--brand-100);
    --button-fg-default: var(--oncolor-100);
    --button-bg-hover:   var(--brand-200);
    --button-radius:     var(--radius-button);
}
```

- [ ] **Step 10: 写 `src/styles/components/input.css`**

```css
/* ============================================================
 * Components · Input
 * ----------
 * Skeleton placeholder.
 * ============================================================ */
:root {
    --input-bg:     var(--bg-100);
    --input-fg:     var(--text-100);
    --input-border: var(--border-300);
    --input-radius: var(--radius-input);
}
```

- [ ] **Step 11: 写 `src/styles/components/card.css`**

```css
/* ============================================================
 * Components · Card
 * ----------
 * Skeleton placeholder.
 * ============================================================ */
:root {
    --card-bg:     var(--bg-200);
    --card-fg:     var(--text-100);
    --card-border: var(--border-300);
    --card-radius: var(--radius-card);
}
```

- [ ] **Step 12: 写 `src/styles/shadcn-alias.css`**

shadcn / ai-elements 的标准名 → 引用 semantic。**这是让 shadcn 自动跟换 Anthropic 调色板的关键**。

```css
/* ============================================================
 * shadcn alias layer
 * ----------
 * Maps shadcn-standard token names (--background / --primary / --border
 * / sidebar-* / ...) onto semantic Anthropic tokens.
 * Because semantic colors switch under :root[data-mode="dark"], this
 * alias layer automatically flips with mode — no nested overrides needed.
 * ============================================================ */
:root {
    --background:           hsl(var(--bg-100));
    --foreground:           hsl(var(--text-100));
    --card:                 hsl(var(--bg-200));
    --card-foreground:      hsl(var(--text-100));
    --popover:              hsl(var(--bg-100));
    --popover-foreground:   hsl(var(--text-100));
    --primary:              hsl(var(--brand-100));
    --primary-foreground:   hsl(var(--oncolor-100));
    --secondary:            hsl(var(--bg-300));
    --secondary-foreground: hsl(var(--text-100));
    --muted:                hsl(var(--bg-200));
    --muted-foreground:     hsl(var(--text-400));
    --accent:               hsl(var(--accent-100));
    --accent-foreground:    hsl(var(--oncolor-100));
    --destructive:          hsl(var(--danger-100));
    --border:               hsl(var(--border-300) / 0.15);
    --input:                hsl(var(--border-300) / 0.15);
    --ring:                 hsl(var(--brand-100));

    /* Sidebar slot (PRD § 3.2 chrome) — alias to bg-200 family */
    --sidebar:                       hsl(var(--bg-200));
    --sidebar-foreground:            hsl(var(--text-100));
    --sidebar-primary:               hsl(var(--brand-100));
    --sidebar-primary-foreground:    hsl(var(--oncolor-100));
    --sidebar-accent:                hsl(var(--bg-300));
    --sidebar-accent-foreground:     hsl(var(--text-100));
    --sidebar-border:                hsl(var(--border-300) / 0.15);
    --sidebar-ring:                  hsl(var(--brand-100));

    --radius: var(--radius-lg);
}
```

- [ ] **Step 13: 写 `src/styles/globals.css`**

入口 — 按顺序 import 三层 + alias + base 样式（reset / scrollbar / focus / dark 字重）。

```css
/* ============================================================
 * Globals
 * ----------
 * Entry point for the design system. Imports primitives → semantic →
 * components → shadcn-alias, then applies base reset, scrollbar,
 * focus ring, and dark-mode font-weight balancing.
 * ============================================================ */

/* Tier 1: primitives */
@import "./primitives/colors.css";
@import "./primitives/spacing.css";
@import "./primitives/radius.css";
@import "./primitives/typography.css";

/* Tier 2: semantic */
@import "./semantic/colors.css";
@import "./semantic/spacing.css";
@import "./semantic/radius.css";

/* Tier 3: components (placeholders) */
@import "./components/button.css";
@import "./components/input.css";
@import "./components/card.css";

/* Bridge to shadcn / ai-elements naming */
@import "./shadcn-alias.css";

/* ---- Base reset ---- */
html, body {
    font-family: var(--font-family-sans);
    color: hsl(var(--text-100));
    background: hsl(var(--bg-100));
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    transition: background-color 0.25s ease, color 0.25s ease;
}

/* ---- Scrollbar (Firefox + WebKit) ---- */
* {
    scrollbar-color: hsl(var(--border-300) / 0.35) transparent;
    scrollbar-width: thin;
}
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb {
    background: hsl(var(--border-300) / 0.35);
    border-radius: var(--radius-sm);
}
::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--border-300) / 0.55);
}
::-webkit-scrollbar-track { background: transparent; }

.u-hidden-scrollbar { scrollbar-width: none; }
.u-hidden-scrollbar::-webkit-scrollbar { display: none; }

/* ---- Focus ring ---- */
:focus-visible {
    outline: 2px solid hsl(var(--accent-100));
    outline-offset: 2px;
    border-radius: var(--radius-xs);
}

/* ---- Dark-mode font weight balancing (variable fonts only) ---- */
:root[data-mode="dark"] .font-normal   { font-weight: 400; }
:root[data-mode="dark"] .font-medium   { font-weight: 510; }
:root[data-mode="dark"] .font-semibold { font-weight: 540; }
:root[data-mode="dark"] b,
:root[data-mode="dark"] strong,
:root[data-mode="dark"] .font-bold {
    font-weight: 530;
}

/* ---- Display font utilities ---- */
.font-serif,
.font-display {
    font-family: var(--font-family-serif);
}
```

- [ ] **Step 14: 拷贝 theme-init.js 和 useThemeMode.ts（1:1，无改动）**

```bash
cp "原型稿/Claude Desktop/_deliverables/anthropic-design-system/public/theme-init.js" public/theme-init.js
cp "原型稿/Claude Desktop/_deliverables/anthropic-design-system/src/hooks/useThemeMode.ts" src/lib/useThemeMode.ts
```

两个文件本身只读写 `data-mode`，符合单 dimension 主题模型，无需修改。

- [ ] **Step 15: 验证文件结构**

```bash
find src/styles public/theme-init.js src/lib/useThemeMode.ts -type f | sort
```

Expected output（按字典序）：
```
public/theme-init.js
src/lib/useThemeMode.ts
src/styles/components/button.css
src/styles/components/card.css
src/styles/components/input.css
src/styles/globals.css
src/styles/primitives/colors.css
src/styles/primitives/radius.css
src/styles/primitives/spacing.css
src/styles/primitives/typography.css
src/styles/semantic/colors.css
src/styles/semantic/radius.css
src/styles/semantic/spacing.css
src/styles/shadcn-alias.css
```

12 个 CSS + 1 个 JS + 1 个 TS = 14 个文件全部就位。

- [ ] **Step 16: Commit**

```bash
git add src/styles/ public/theme-init.js src/lib/useThemeMode.ts
git commit -m "$(cat <<'EOF'
feat(ds): build 3-tier design token architecture under src/styles/

Establish primitives → semantic → components → shadcn-alias layering
for high maintainability:

- primitives/ — static palette (Tailwind-style hue+step scale), spacing
  base, radius scale, typography families/sizes/weights. No cross-token
  references.
- semantic/ — UI-purpose names (bg-100, text-100, brand-100, …) that
  reference primitives. Light defaults on :root, dark overrides on
  :root[data-mode="dark"].
- components/ — skeleton placeholders for button/input/card.
- shadcn-alias.css — maps shadcn standard names (--background, --primary,
  sidebar-*, …) onto semantic, letting shadcn/ai-elements inherit the
  anthropic palette automatically.
- globals.css — imports all tiers + base reset + scrollbar + focus ring +
  dark-mode font-weight balancing.

Theme dimension is single-axis (data-mode only, no data-theme).
theme-init.js + useThemeMode.ts copied verbatim from anthropic DS.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 重写 `src/index.css` — import 三层 token，配置 Tailwind

**Files:**
- Modify: `src/index.css`（完整替换）

当前 `src/index.css` 是 shadcn init 留下的默认 oklch token + Geist 字体。Task 1 已经把全部 token 拆到 `src/styles/`，这里只需要：
1. import Tailwind / tw-animate-css / shadcn 桥 / 项目 globals.css
2. 配 `@theme inline`（让 Tailwind 知道 utility 类名映射到哪些 var）
3. 配 `@custom-variant dark`（走 `data-mode="dark"`）
4. `@layer base` 收尾

- [ ] **Step 1: 用以下内容完整替换 `src/index.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* Design system — primitives → semantic → components → shadcn-alias + base */
@import "./styles/globals.css";

/* dark 变体走 data-mode，匹配 theme-init.js 写入的属性 */
@custom-variant dark (&:where([data-mode="dark"] *));

@theme inline {
    /* Font families */
    --font-sans:    var(--font-family-sans);
    --font-serif:   var(--font-family-serif);
    --font-mono:    var(--font-family-mono);
    --font-heading: var(--font-family-serif);

    /* Color utility 入口 — Tailwind 解析到 shadcn-alias.css 内 :root 上的 var */
    --color-background:                  var(--background);
    --color-foreground:                  var(--foreground);
    --color-card:                        var(--card);
    --color-card-foreground:             var(--card-foreground);
    --color-popover:                     var(--popover);
    --color-popover-foreground:          var(--popover-foreground);
    --color-primary:                     var(--primary);
    --color-primary-foreground:          var(--primary-foreground);
    --color-secondary:                   var(--secondary);
    --color-secondary-foreground:        var(--secondary-foreground);
    --color-muted:                       var(--muted);
    --color-muted-foreground:            var(--muted-foreground);
    --color-accent:                      var(--accent);
    --color-accent-foreground:           var(--accent-foreground);
    --color-destructive:                 var(--destructive);
    --color-border:                      var(--border);
    --color-input:                       var(--input);
    --color-ring:                        var(--ring);
    --color-sidebar:                     var(--sidebar);
    --color-sidebar-foreground:          var(--sidebar-foreground);
    --color-sidebar-primary:             var(--sidebar-primary);
    --color-sidebar-primary-foreground:  var(--sidebar-primary-foreground);
    --color-sidebar-accent:              var(--sidebar-accent);
    --color-sidebar-accent-foreground:   var(--sidebar-accent-foreground);
    --color-sidebar-border:              var(--sidebar-border);
    --color-sidebar-ring:                var(--sidebar-ring);
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

打开 http://localhost:1420。预期：
- 页面 bg 变成米白（`hsl(48 33.3% 97.1%)` ≈ `#F8F6F0`）
- 字体从 Geist 切到 Inter（如 Google Fonts 加载，否则 system-ui fallback；Google Fonts 在 Task 3 接入，此时可能仍是 fallback）
- 按钮（如有）是 brand 橙色 `hsl(15 54.2% 51.2%)` ≈ `#C66E51`

控制台不能有 CSS 解析 error。如有 "undefined variable" 错，说明某个 `@import` 顺序出问题——检查 `src/styles/globals.css` 内 import 顺序是 primitives → semantic → components → shadcn-alias。

- [ ] **Step 3: 验证 dark 模式触发**

浏览器 DevTools console 跑：

```js
document.documentElement.setAttribute('data-mode', 'dark')
```

页面背景立刻切到 Anthropic dark (`hsl(60 2.7% 14.5%)` ≈ `#252523`)。改回 light：

```js
document.documentElement.setAttribute('data-mode', 'light')
```

注意：本 task **不需要** `data-theme` 属性。如果 dark mode 不切换，先确认 `<html>` 上没有 `data-theme`（应该没有），然后检查 `semantic/colors.css` 的 `:root[data-mode="dark"]` 选择器拼写。

- [ ] **Step 4: Ctrl-C 停掉 vite dev，commit**

```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
feat(ds): rewrite src/index.css to import 3-tier tokens via globals.css

- Drop shadcn init's oklch defaults and Geist font setup.
- @import ./styles/globals.css to pull in primitives → semantic →
  components → shadcn-alias layers (defined in Task 1).
- @theme inline maps Tailwind utility names (--color-background etc) to
  the shadcn-alias variables. Tailwind utilities (bg-background, etc) now
  flow through the full token chain.
- @custom-variant dark wired to [data-mode="dark"] (matches theme-init.js).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 更新 `index.html` — theme-init.js + Google Fonts

**Files:**
- Modify: `index.html`

当前 `index.html` 12 行，没引 theme-init.js / fonts。改完后 `<html>` 上 **仅** `lang="zh-CN"`（**不**加 `data-theme`，单 dimension 主题模型），`<head>` 第一个 script 是 theme-init.js（同步执行，写 `data-mode`），之后是 Google Fonts。

- [ ] **Step 1: 用以下内容完整替换 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Studio</title>
    <!-- Theme init MUST be first to avoid FOUC. Writes data-mode on <html>. -->
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

打开 http://localhost:1420，DevTools Elements 面板检查 `<html>` 标签应有 `data-mode="light"` 或 `"dark"`（由系统偏好决定，theme-init.js 注入）。**不应**有 `data-theme` 属性。Network 面板应看到 Google Fonts CSS 加载成功（status 200）。控制台无 error。

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
feat(ds): wire theme-init.js + google fonts in index.html

- Set <html lang="zh-CN"> (no data-theme — single-dimension theme model).
- Load /theme-init.js as the first <head> script (must precede stylesheets
  to avoid FOUC). The script writes data-mode on <html>.
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
2. import 项目的 `src/index.css`（带 Tailwind + 三层 token + shadcn-alias）
3. 用 `@storybook/addon-themes` 的 `withThemeByDataAttribute` 切 `data-mode`
4. **不**包裹 `data-theme`——单 dimension 主题模型，整个项目都不需要 data-theme

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
      <div style={{ minHeight: "100vh", padding: "1rem" }}>
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
- preview.tsx: import src/index.css and use withThemeByDataAttribute on
  data-mode for light/dark toggle. No data-theme wrap (single-dimension
  theme model).
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
- index.html wires theme-init + Google Fonts (no data-theme)
- Storybook 9 installed with addon-themes, co-located stories glob
- Button sanity stories validate end-to-end light/dark switching

Next: Wave 2 — install 13 ai-elements components + visual reconciliation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## 验收 checklist（Wave 1 完成态）

- [ ] 三层 token 文件结构：`src/styles/primitives/{colors,spacing,radius,typography}.css` + `src/styles/semantic/{colors,spacing,radius}.css` + `src/styles/components/{button,input,card}.css` + `src/styles/shadcn-alias.css` + `src/styles/globals.css` 全部存在
- [ ] `public/theme-init.js` 与 `src/lib/useThemeMode.ts` 1:1 拷贝自 DS 源，内部仅读写 `data-mode`，无 `data-theme`
- [ ] `index.html` `<html>` 上**无** `data-theme`（只有 `lang="zh-CN"`），第一个 script 是 `/theme-init.js`，引了 Source Serif 4 / Inter / JetBrains Mono
- [ ] `src/index.css` 通过 `@import "./styles/globals.css"` 拉入三层 token，`@theme inline` 映射 Tailwind utility，`@custom-variant dark` 走 `[data-mode="dark"]`
- [ ] `primitives/colors.css` 中 HSL 三元组**只声明 primitive 名字**（如 `--color-orange-500`），不出现 `--bg-100` 这种 semantic 名字
- [ ] `semantic/colors.css` 中**所有**值都是 `var(--color-*)`，无原始 HSL
- [ ] `shadcn-alias.css` 中所有值都是 `hsl(var(--<semantic>))` 形式
- [ ] grep `data-theme` 全项目应**无**任何匹配（除 spec / plan 文档自身）
- [ ] `bun run dev` 跑通，hello-world 用 Inter 字体显示，按钮是橙色
- [ ] `bun run tauri:dev` 跑通，Tauri 窗口 + sidecar 协同正常
- [ ] `bun run storybook` 跑通，Button 6 个 stories 全可见
- [ ] Storybook toolbar 的 theme toggle 能切换 light/dark，颜色实际变化
- [ ] light/dark 切换 **无 FOUC**（首屏不闪）
- [ ] `bun run build` 通过
- [ ] `bun run build-storybook` 通过
- [ ] `storybook-static/` 在 `.gitignore` 内
- [ ] git log 至少 7 个 commit（三层 token 建立 / index.css / index.html / storybook init / storybook config / button stories / gitignore final）

最后一条 grep 自检命令：
```bash
grep -rn "data-theme" src/ public/ index.html .storybook/ 2>/dev/null
```
预期：无输出。

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
   - 应对：DevTools 看实际 computed style 找到出问题的 var，在 `src/styles/shadcn-alias.css` 补一行 alias，或在 `src/styles/semantic/colors.css` 检查 dark mode 是否覆写

4. **theme-init.js 在 Tauri 里 localStorage 失败**
   - 现象：Tauri 窗口里 console.log `localStorage.getItem('preferred_theme_mode')` 抛错或始终为 null
   - 应对：theme-init.js 自身已 try-catch，没问题；如必须持久化，未来 Wave 替换为 `tauri-plugin-store`

---

## Wave 2 预告

完成本 wave 后进入：

> **Wave 2** — 安装 13 个 ai-elements 组件（message / prompt-input / tool / artifact / shimmer / plan / task / file-tree / chain-of-thought / canvas / code-block / toolbar / confirmation），每个走 visual reconciliation 流程 + 写 default & dark stories；同时把 shadcn 缺的 atoms（input / textarea / select / avatar / tooltip 等约 11 个）补齐。

Wave 2 plan 在 Wave 1 完工并 review 通过后写，避免本 plan 一次性塞太多未知。
