# Anthropic Design System · 可移植版

从 Claude Desktop · Cowork 原型抽出来的设计系统，**剥离了所有原型业务耦合**，只保留可以直接迁移到任意前端项目的部分:

- 完整的颜色 / 字体 / 间距 / 圆角 / 阴影 / 动效 token
- 双轴主题 (`data-theme` × `data-mode`) 实现
- `theme-init.js` 防 FOUC 脚本
- 与 Tailwind v4 集成的 `@layer theme` 块（v3 也提供 config 兜底）
- React hook (`useThemeMode`) 参考实现

适用栈: React / Vue / Svelte / 原生 HTML，配不配 Tailwind 都可用。

---

## 文件结构

```
anthropic-design-system/
├── src/
│   ├── styles/
│   │   ├── tokens.css       # 颜色 token (light/dark + media 兜底)
│   │   ├── typography.css   # 字体家族 + @font-face + 字重档位
│   │   ├── theme.css        # @layer theme (尺寸/字号/圆角/动效/color utility)
│   │   ├── globals.css      # @import 上述 + reset + 滚动条 + 焦点环
│   │   └── tailwind.css     # Tailwind v4 入口
│   └── hooks/
│       └── useThemeMode.ts  # React hook (system / light / dark)
├── public/
│   └── theme-init.js        # 防 FOUC 主题初始化脚本
├── tailwind.config.cjs      # Tailwind v3 fallback (v4 用户不需要)
├── index.html               # Demo 页面 (双击运行)
└── README.md                # 本文档
```

---

## 5 分钟接入

### 1. 复制文件到目标项目

把 `src/styles/` 和 `public/theme-init.js` 拷到你的项目对应位置:

```
your-project/
├── src/styles/  ← 整个 styles 目录拷过来
└── public/theme-init.js
```

### 2. 在 HTML 根上挂主题属性 + 加载脚本

```html
<html lang="zh-CN" data-theme="claude">
  <head>
    <!-- ⚠️ 必须放在第一个 script, 否则首屏会闪 -->
    <script src="/theme-init.js"></script>
    <!-- Google Fonts (开源字体替代) -->
    <link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..700;1,8..60,400..700&family=Inter:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap" />
    <!-- 设计系统 -->
    <link rel="stylesheet" href="/src/styles/globals.css" />
  </head>
  <body>...</body>
</html>
```

如果你的工程已经接了 Tailwind v4，把 `globals.css` 换成 `tailwind.css`:

```js
// 你的入口 (main.tsx / app.tsx / 等)
import "./styles/tailwind.css";
```

### 3. (Tailwind v3 用户) 把 `tailwind.config.cjs` 合并进你的 config

把 `tailwind.config.cjs` 里的 `theme.extend` 合并到你现有的 `tailwind.config.js` 即可。所有颜色会注册成 utility (`bg-bg-100` / `text-text-200` / `border-border-300` 等)。

### 4. (React) 加 theme toggle UI

```tsx
import { useThemeMode } from "./hooks/useThemeMode";

function ThemeToggle() {
  const { pref, setPref } = useThemeMode();
  return (
    <div role="radiogroup">
      <button onClick={() => setPref("system")} aria-pressed={pref === "system"}>跟随系统</button>
      <button onClick={() => setPref("light")}  aria-pressed={pref === "light"}>明亮</button>
      <button onClick={() => setPref("dark")}   aria-pressed={pref === "dark"}>暗黑</button>
    </div>
  );
}
```

---

## 使用约定（**重要 — 容易踩坑**）

### 1. 颜色 token 用 HSL 三元组裸值

```css
/* ❌ 错: */ color: var(--brand-100);             /* 会失效 */
/* ✅ 对: */ color: hsl(var(--brand-100));
/* ✅ 派生 alpha: */ background: hsl(var(--brand-100) / 0.3);
```

或者直接消费 `--color-*` 别名（已包好 `hsl()`）:

```css
color: var(--color-brand-100);
```

### 2. Tailwind 用 utility class，最短

```jsx
<div className="bg-bg-100 text-text-200 border border-border-300 rounded-xl" />
```

### 3. `--text-*` 同时承载 size 和 color

- `--text-xs` / `--text-sm` / `--text-base` / ... = **字号** (rem)
- `--text-000` / `--text-100` / ... / `--text-500` = **前景色阶** (HSL 三元组)

不会编译冲突（数字 vs 字母后缀），但 grep 时会同时命中。

### 4. `border-*` 阶梯靠 alpha 派生，不是色阶差

`--border-100` 到 `--border-400` 的 HSL 三元组**完全相同**。差异在 `--color-border-*` 别名层用 `/ 0.4` `/ 0.3` `/ 0.15` `/ 0.15` 实现。

**陷阱**: `hsl(var(--border-300))` 在 light 模式下会渲染成几乎全黑（色阶 11.8%）。**用 `var(--color-border-*)` 而不是裸 `--border-*`**。

### 5. Dark 模式系统性减重仅对 variable font 生效

`typography.css` 第二部分给 dark 模式整体减重 30-70（应对白字在黑底视觉变粗）。如果换成静态字体，这段无意义，可删。

---

## Token 速查

### 颜色（角色 / 阶梯）

| 角色 | 阶梯 | 推荐用法 |
|---|---|---|
| 中性背景 | `--bg-000` ~ `--bg-500` | `--bg-100` 主区背景, 阶梯越大越深(dark)/越浅(light) |
| 中性文字 | `--text-000` ~ `--text-500` | `--text-100` 主标题、`--text-200/300` 正文、`--text-400/500` 次要 |
| 边框 | `--border-100` ~ `--border-400` | 用 `--color-border-*` 别名（alpha 已包好） |
| 品牌（暖橙） | `--brand-100` / `--brand-200` | `--brand-200` 是 hover 加亮版 |
| 强调（冷蓝） | `--accent-100` | 链接、focus ring、信息提示 |
| Pro 强调（紫） | `--accent-pro-100` | 高级 / 付费入口 |
| 危险 | `--danger-100` | 错误、删除、不可逆 |
| 成功 | `--success-100` | 完成、保存确认 |
| 警告 | `--warning-100` | 阻塞性提示 |
| 反色文字 | `--oncolor-100` | 实色按钮上的白字 |
| 图标背板 | `--pictogram-100` ~ `--pictogram-400` | 圆形头像底、icon 容器 |
| 永远不变 | `--always-white` / `--always-black` | 不希望随主题切的纯黑/白 |

`-000` 是该角色"最饱满"的形态，`-900` 是"最弱化"的（背景、低对比装饰）。

### 设计常量

```
--spacing            : 0.25rem (4px 基准)
--container-{xs..7xl}: 20..80 rem
--text-{xs..5xl}     : 0.75rem .. 3rem (含 --text-*--line-height)
--radius-{sm..3xl}   : 0.25rem .. 1.5rem
--ease-{in,out,in-out}: cubic-bezier 缓动函数
--blur-{sm,md,xl}    : 8 / 12 / 24 px
--default-transition-duration: 0.15s
```

---

## 字体许可提示

文档里出现的 **Anthropic Sans / Anthropic Serif / Anthropic Mono** 是 Anthropic 自有字体，版权属于 Anthropic。**默认配置已替换为开源字体** (Inter / Source Serif 4 / JetBrains Mono)，可放心直接用。

如需启用 Anthropic 字体（合规授权场景）:
1. 把 5 个 woff2 文件放进 `public/fonts/`
2. 取消 `typography.css` 末尾 `@font-face` 块的注释
3. 把字体栈第一项从 `"Inter"` / `"Source Serif 4"` / `"JetBrains Mono"` 改为 `"Anthropic Sans"` / `"Anthropic Serif"` / `"Anthropic Mono"`

---

## 多品牌扩展

当前默认只有 `[data-theme="claude"]`。需要多品牌时:

1. 在 `tokens.css` 末尾仿照 `[data-theme="claude"]` 写一个 `[data-theme="enterprise"]` block
2. `<html>` 上挂 `data-theme="enterprise"` 即可切换
3. 同一品牌的 light/dark 通过 `data-mode` 切换

`tokens.css` 文件末尾有 `[data-theme="console"]` 注释示范。

---

## 验证清单

接入后请确认:

- [ ] DevTools 把 `<html data-mode>` 改成 `light` / `dark` → token 正确切换
- [ ] 系统主题切换 → 页面立即跟随（如果用户没显式选择）
- [ ] 刷新页面 → 用户上次选择被记住（无闪屏）
- [ ] `noscript` 环境 → 依然能根据 `prefers-color-scheme` 显示正确
- [ ] `@import` 顺序: tokens → typography → theme → globals
- [ ] Tailwind utility (`bg-bg-100` / `text-text-200`) 能正常生成

---

## 已知限制

- **不含组件库**: 按钮、表单、模态框等组件不在范围内。建议基于本设计系统的 token 自己搭，或引入 shadcn/ui 等无样式 primitives 把它的颜色 token 替换成本系统的。
- **未做 WCAG 验证**: 提供颜色 token，但**没有验证 AA / AAA 对比度**。生产前应该用工具（如 Polypane / WAVE）抽查关键文字组合。
- **dark 模式减重对静态字体无意义**: 只在 variable font 时打开。

---

## 试一下

```bash
# 在 anthropic-design-system/ 目录下
open index.html   # macOS
# 或双击 index.html
```

会看到 demo 页面 — 包含 color swatches / typography 样本 / 主题切换按钮。
