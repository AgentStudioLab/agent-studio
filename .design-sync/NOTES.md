# design-sync NOTES — agent-studio → claude.ai/design

本仓库是 **Tauri 应用**，不是发布的组件库。为走 storybook-shape 转换器，做了一套
「合成设计系统包」+ 若干 stub/fork。**首次同步的所有关键决策都记在这里，re-sync 必读。**

## 架构总览

- **合成 DS 包**：`.design-sync/ds-package/`（由 `.design-sync/gen-ds-package.mjs` 生成）。
  - `entry.tsx`：barrel，`export *` 每个有 story 的组件源模块 → bundle 成 `window.AgentStudio.*`。
    顶部复刻 App.tsx 根 provider 栈所需导出（QueryClientProvider / MemoryRouter /
    AuthProvider / MessageQueueProvider / TooltipProvider / dsQueryClient），并在模块加载时
    种下 `data-brand`（复刻 preview.tsx）。
  - `entry.d.ts`：把 barrel 的值导出名声明为 `any`，供转换器 `exportedNames()` 识别。
    **⚠ any 类型 = 上传的 `<Name>.d.ts`/Props 契约很薄。** 后续可用 `tsc --emitDeclarationOnly`
    或 react-docgen 生成真实 prop 类型再喂给转换器，提升设计 agent 的 API 准确度。
  - `tsconfig.bundle.json`：打包/预览编译专用 path 映射（见下「stub 清单」）。
  - `package.json`：`name=agent-studio-ds`、`module`/`types` 指向上面两个文件。
- **生成器** `gen-ds-package.mjs`：扫描 `sb-reference/index.json` 列出的 story 文件，提取它们
  导入的 `@/`（及相对）组件源模块，解析值导出名、去重，生成 barrel + d.ts。`buildCmd` 即它。
- **同步专用 storybook 配置** `.storybook-sync/`（**必须在仓库根**，见「Tailwind 陷阱」）：
  复用仓库 stories，但 preview 包一层 App.tsx 根 provider 栈，使依赖
  Router/Auth/AppShell/MessageQueue 的组件能在 oracle 里渲染。仓库自带 `.storybook/` 不动。
- **cfg.provider**：QueryClient > MemoryRouter > Auth > AppShell > MessageQueue > Tooltip，
  与 `.storybook-sync/preview.tsx` 一致，全用 bundle 自身实例（共享 React context）。

## 构建/同步步骤（re-sync 必须按序）

```bash
# 1) 重建同步 oracle（务必 -c .storybook-sync，从仓库根运行）
npx storybook build -c .storybook-sync -o .design-sync/sb-reference --quiet
# 2) 重生成合成包
NODE_PATH="$(pwd)/.ds-sync/node_modules" node .design-sync/gen-ds-package.mjs
# 3) 转换器（注意 NODE_OPTIONS 提高堆，整图较大）
NODE_OPTIONS=--max-old-space-size=8192 NODE_PATH="$(pwd)/.ds-sync/node_modules" \
  node .ds-sync/package-build.mjs --config design-sync.config.json \
  --node-modules ./node_modules --entry .design-sync/ds-package/entry.tsx --out ./ds-bundle
# 4) 拷贝 public 资源进 bundle（build 会清空 OUT，必须在 build 之后！见「public 资源」）
cp -r public/logo public/agent-covers public/file-icons ds-bundle/
# 5) 校验 + 比对
node .ds-sync/package-validate.mjs ./ds-bundle
node .ds-sync/storybook/compare.mjs --out ./ds-bundle --storybook-static .design-sync/sb-reference
```

## 关键全局修复（每条都救了「整批组件」）

- **[GENERAL] Tailwind 陷阱（最坑）**：同步 storybook 配置**必须放仓库根**（`.storybook-sync/`）。
  storybook 把 Vite root 设为「配置目录的父目录」并从那里加载 `vite.config.ts`。放在
  `.design-sync/` 子目录会让 root 落在 `.design-sync/`、加载不到 `vite.config.ts`（含
  `@tailwindcss/vite`）→ **不生成任何 Tailwind 工具类 → 所有组件无样式**（CSS 只有 token、
  无 `.bg-primary`/`.inline-flex`）。判据：sb-reference 最大 css 应 ~140KB+ 且含 `bg-primary`；
  若只有 ~57KB 且无工具类，就是踩了这个坑。
- **[GENERAL] CSS fork**（`.design-sync/overrides/css-fallback.mjs`，cfg.libOverrides 已声明）：
  合成 barrel 的 JS 图里有零散相对 `.css` 副作用导入（office-doc.css 等）被 esbuild 打进
  `_ds_bundle.css`（>500B），上游守卫据此跳过 storybook CSS 抓取 → 无样式。fork 改为
  「只要有 storybook 就用 iframe 已编译 CSS 替换 `_ds_bundle.css`」。判据：build 日志应有
  `[CSS_FROM_STORYBOOK] ... replaced with ... (140 KB)`，`_ds_bundle.css` 应 ~140KB。
- **[GENERAL] cfg.provider 全栈**：复刻 App.tsx 根 provider，否则 useLocation/useAuth/
  useAppShell/useMessageQueue 直接抛错、整组件空白。

## stub 清单（`tsconfig.bundle.json` paths + `.design-sync/ds-package/*-stub.ts`）

| 映射 | 目的 |
|---|---|
| `@/i18n`、`@/lib/agui/runtime` → `../../src/.../index.ts` | 目录-带-index 的裸导入：转换器 paths 插件 ext='' 优先会解析到目录报错，显式指 index 文件 |
| `@js-preview/{docx,excel,pdf}`(+css) → `empty-stub.ts` | 依赖 node built-ins，浏览器 IIFE 打不了；office 预览本就无意义 |
| `shiki` → `shiki-stub.ts` | shiki 全语言语法 ~8MB iife 无法 code-split、全量内联，超 5MB。CodeBlock 自带 createRawTokens 回退 → 降级为无语法着色的纯代码 |
| `@streamdown/{code,math,mermaid}` → `markdown-stub.ts` | 分别拖入 shiki(~16MB)/katex/mermaid(~5.5MB)。streamdown 的 PluginConfig 这些字段可选，置空即纯文本/纯 `<pre>` 渲染（无代码着色/图表/公式） |
| `@/lib/sidecar-client` → `sidecar-client-stub.ts` | 多个视图 react-query 带 refetchInterval(5s/2s) 轮询不存在的 sidecar，真实 `getSidecarInfo` 还有 15s `/health` 探测循环 → networkidle 永不收敛、validate 超时。stub 让所有 sidecar 调用立即拒绝、不发网络。**注意：只能拦 `@/lib/sidecar-client` 别名导入；`src/lib/data/*` 用相对 `../sidecar-client` 导入，tsconfig 拦不到**——这是排除 7 个视图的根因之一 |
| `tippy.js/dist/tippy.css` → `empty-stub.ts` | 防止 tippy.css 漏进 `_ds_bundle.css` 触发上游 CSS 跳过（现已有 fork 兜底，保留更稳） |

## 排除的组件（7 个，用户已确认「先上 45 个」）

`cfg.titleMap` 置 null：**AppShell, Sidebar, ProfileForm, TaskView, NewTaskView,
ScheduledListView, ScheduledDetailView**。原因：它们是与后端强耦合的整页视图/外壳，
通过 `src/lib/data/*` 的**相对**导入打到 sidecar（tsconfig stub 拦不到），15s `/health`
探测使 networkidle 不收敛、过不了 package-validate 渲染门；即使包含也只是空/加载态。
**re-sync 若要纳入**：需让数据层在预览环境停轮询（例如改 `src/lib/data/*` 改用 `@/lib/sidecar-client`
别名导入以便被 stub；或给数据层做 mock），并确认 validate 不再超时。

## public 资源（绝对路径）—— 已确认在设计端不可用

BrandStar 用 `<img src="/logo/logo.png">`、AgentCard 用 `/agent-covers/*.svg`、FileTypeIcon 用
`/file-icons/*.svg`——都是 `public/` 绝对路径。storybook 由 Vite 默认服务 `public/`；设计预览不会。
- **本地 compare**：build 后把 `public/{logo,agent-covers,file-icons}` 拷进 `ds-bundle/`，
  本地 compare 页面 origin = ds-bundle 根，故能正确加载（仅用于本地核对）。
- **claude.ai/design**：emitted 组件 html 用**相对**引用（`../../../_ds_bundle.js`），说明项目
  不在 origin 根服务，绝对路径 `/logo/...` 会打到 origin 根而非项目 → **必然 404**。因此
  **首次同步未上传 public 资源**（上传也无用）。**结果**：BrandStar / AgentCard / FileTypeIcon
  在 claude.ai/design 缺品牌图/封面/文件图标（组件结构、布局、文字仍正确，仅图片裂）。
- **彻底修复（需改源码，留待以后）**：让这些组件改用「打包导入的资源」（`import logo from
  "./logo.png"`，esbuild 会内联成 data URL）而非 public 绝对路径。

## 本次同步状态

- **已上传 45 个组件**到 claude.ai/design 项目 `Agent Studio Design System`
  （projectId `2cba6712-dddf-4e9c-86c5-30ed9d3d27d2`）。bundle 4MB、CSS 140KB（全 Tailwind）。
- **打分（compare 逐组件评级）按用户要求跳过**：全局修复已用 Button/Message/BrandStar 验证
  （样式、字体、品牌色都与 storybook 一致）；package-validate 干净（45/45 渲染）。但**未对全部
  45 个组件逐故事人工评级**。下次 re-sync 可补：跑 compare 后读 sheet 评级。
- **已知未理的 per-component 项**：UserPopover 是 portal（`[PORTAL?]`），产品卡可能有 overlay
  溢出，建议 `cfg.overrides.UserPopover.cardMode:"single"`；AgentDetail 有 7 个 story、compare
  默认只截前 6（`--max-stories 7` 可覆盖全）；StatusDot 在 validate 标 `thin`（小圆点，视觉正常）。

## Re-sync 风险（下次同步要盯的点）

1. **Tailwind 工具类**：改了 storybook 配置/位置后，先确认 sb-reference 最大 css ~140KB 且含工具类。
2. **any 类型 d.ts**：上传的 Props 契约薄；如需提升设计 agent 准确度，改为真实 .d.ts。
3. **stub 漂移**：升级 shiki/@streamdown/@js-preview/sidecar-client 的导出形状变了，stub 要跟。
   尤其 `src/lib/data/*` 若改用别名导入 sidecar-client，排除的 7 个视图可能可纳入。
4. **public 资源**：新增绝对路径资源目录要同步加进步骤 4 的 cp 和上传 writes。
5. **排除清单**：story 增删后重跑生成器；titleMap 的 7 个 null 仍需手动维护。
