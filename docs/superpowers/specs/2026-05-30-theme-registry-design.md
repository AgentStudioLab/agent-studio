# 主题注册表(品牌主题色)— 设计

日期:2026-05-30
状态:已确认,待实施

## 背景

当前设计系统是**单轴**的——只有 `data-mode="light|dark"`,没有 `data-theme`。品牌色(赤陶橙)+ accent(蓝)的具体色值硬写在 `src/styles/semantic/colors.css` 的 `:root` / `:root[data-mode="dark"]` 上。

目标:在 `src/styles/` 下建立一个**主题目录 + 统一注册表 + meta**,引入第二根轴 `data-brand`,让"品牌主题色"可被切换、且外部可方便注册新主题。

本 spec 只覆盖**基础设施层**。运行时切换(`useBrandTheme` hook、扩展 `theme-init.js` 防闪屏)和设置页 UI(`BrandSegment`)是后续单独的步骤。

## 已确认的决策

1. **主题定义形式**:CSS 存色值 + TS 注册表(混合)。TS 是"有哪些主题"的唯一真相源;CSS 管实际色值,继续走三层 token。
2. **代码位置**:全部放 `src/styles/themes/`(含 `registry.ts`)。
3. **切换范围**:`--brand-*` 簇(brand-000/100/200/900 + accent-brand)+ `--accent-*` 簇(accent-000/100/200/900),亮/暗双档。`--accent-pro-*`(紫)**不**随主题变。
4. **默认值处理**:单一来源——把 brand + accent 从 `semantic/colors.css` 挪进 `themes/terracotta.css`。
5. **默认主题保证**:`index.html` 的 `<html>` 静态带 `data-brand="terracotta"`,保证该属性首屏即存在。每个主题文件统一只用 `[data-brand]` 作用域,无裸 `:root` 特例。

## 目录结构

```
src/styles/themes/
├ registry.ts        # ThemeMeta 类型 + 注册表 + registerTheme()/listThemes()/getTheme()/defaultThemeId()
├ registry.test.ts   # bun:test 单测
├ terracotta.css     # 内置主题:赤陶橙(brand 橙 + accent 蓝,亮/暗)
└ index.css          # @import 各主题 css(再被 globals.css @import)
```

## registry.ts(meta + 入库 API)

```ts
export interface ThemeMeta {
  id: string;            // 稳定 id = data-brand 值 + 未来 storage key,永不翻译
  nameKey: string;       // i18n key,如 "settings.appearance.brands.terracotta"
  swatch: { brand: string; accent: string }; // 选择器色块预览用的 primitive 变量名(调色板例外)
  order: number;         // 选择器排序
  isDefault?: boolean;   // 默认主题(与 index.html 的 data-brand 静态值保持一致)
}

const registry = new Map<string, ThemeMeta>();
export function registerTheme(meta: ThemeMeta): void;   // 外部注册入口
export function listThemes(): ThemeMeta[];              // 按 order 排序
export function getTheme(id: string): ThemeMeta | undefined;
export function defaultThemeId(): string;               // isDefault 的 id,兜底 "terracotta"
```

内置注册(模块加载时执行):
```ts
registerTheme({
  id: "terracotta",
  nameKey: "settings.appearance.brands.terracotta",
  swatch: { brand: "--color-orange-600", accent: "--color-blue-600" },
  order: 0,
  isDefault: true,
});
```

**外部注册新主题** = ① 写 `themes/<id>.css`(`[data-brand="<id>"]` 的 token 块,亮+暗)并在 `index.css` 引入 ② 调 `registerTheme({...})`。

## CSS 约定(data-brand 轴)

每个主题文件**统一**写法(以赤陶橙为例,值与当前 `semantic/colors.css` 逐字一致):

```css
:root[data-brand="terracotta"] {
  --brand-000: var(--color-orange-600);
  --brand-100: var(--color-orange-600);
  --brand-200: var(--color-orange-500);
  --brand-900: var(--color-pure-black);
  --accent-brand: var(--color-orange-500);
  --accent-000: var(--color-blue-700);
  --accent-100: var(--color-blue-600);
  --accent-200: var(--color-blue-600);
  --accent-900: var(--color-blue-100);
}
:root[data-brand="terracotta"][data-mode="dark"] {
  --brand-000: var(--color-orange-600);
  --brand-100: var(--color-orange-500);
  --brand-200: var(--color-orange-500);
  --accent-000: var(--color-blue-400);
  --accent-900: var(--color-blue-900);
}
```

**契约**:每个主题必须在亮色块定义完整的 brand + accent 集合;暗色块定义所有"亮暗有差异"的 token。`[data-brand="x"][data-mode="dark"]`(0,3,0)恒高于任何亮色块(0,2,0),保证 dark 正确覆盖、且不同主题间不泄漏。

## 改动清单

| 文件 | 改动 |
|---|---|
| `src/styles/themes/registry.ts` | 新建:类型 + 注册表 + API + terracotta 注册 |
| `src/styles/themes/terracotta.css` | 新建:`[data-brand="terracotta"]` 亮+暗 |
| `src/styles/themes/index.css` | 新建:`@import "./terracotta.css";` |
| `src/styles/themes/registry.test.ts` | 新建:register/list/get/default 单测 |
| `src/styles/globals.css` | 在 semantic 之后加 `@import "./themes/index.css";` |
| `src/styles/semantic/colors.css` | 删除 brand + accent 两簇(亮+暗),留指针注释;accent-pro 保留 |
| `index.html` | `<html lang="zh-CN" data-brand="terracotta">` |
| `src/i18n/locales/{en,zh}/settings.json` | `appearance.brands.terracotta` = "Terracotta" / "赤陶橙" |

## 验证

- 默认外观与改动前**像素一致**(brand 橙 / accent 蓝 / focus ring / 侧边栏选中态,亮暗都对)。
- `bunx tsc --noEmit -p tsconfig.app.json` 通过(忽略既有 `.stories.tsx` 报错)。
- `bun test src/styles/themes/registry.test.ts` 通过。
- `bun run build` 通过(CSS 编译、无悬空 var 引用)。

## 不在本步范围(后续)

- 运行时切换:`useBrandTheme` hook + 扩展 `theme-init.js` 读 `preferred_brand` 写 `data-brand`(防闪屏)。
- 设置页 `BrandSegment`(放进 `AppearanceSection`)。
- 第二个内置主题 + 每个新主题的对比度(白字压 brand)验证。
