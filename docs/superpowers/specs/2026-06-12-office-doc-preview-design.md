# Office 文档预览增强设计（docx / pdf / xlsx）

日期：2026-06-12
状态：已实施（见 §11 实施记录）

## 1. 背景与问题

文件预览面板（`src/features/task/preview/`）目前的分发链路：

1. `FilesTab` 列出 `TouchedFile` → 用户点击 → `TaskView.touchedFileToPreview()` 按扩展名映射出 `MockFile.type` → `<PreviewPane file>`。
2. `PreviewPane` 调 `useFileContent(path, cwd)` → `GET /files/content` → `{ content, encoding: "utf8"|"base64", size }`，**上限 2 MiB**。
3. `PreviewBody` 按 `(encoding, file.type)` 分发渲染器。

**缺口**：`touchedFileToPreview` 把 `.xlsx/.csv → spreadsheet`、`.pptx → presentation`，但 **`.pdf`、`.docx` → `generic`**。而 sidecar 把二进制文件返回为 **base64**，`PreviewBody` 对“base64 且非 image”一律走 `BinaryFallbackRenderer`（“无法在此预览”）。结果：

- `.docx`、`.pdf`、二进制 `.xlsx` 全部落到 fallback；
- 只有 `.csv`（utf8）能到 `SpreadsheetRenderer`。

这正是“无法预览 docx/pdf/excel”的根因。

## 2. 目标与范围

**目标**：让 `.docx`、`.pdf`、`.xlsx` 在预览面板内直接渲染，复用 [vue-office 的 js-preview 系列](https://501351981.github.io/vue-office/examples/docs/guide/js-preview.html)（框架无关的纯 JS 库，适配本项目 React 技术栈）。

**范围内**：

- `.pdf` → `@js-preview/pdf`
- `.docx` → `@js-preview/docx`
- `.xlsx` → `@js-preview/excel`
- 大文件分片流式下载 + 进度反馈。

**范围外**（明确不做）：

- 旧版二进制 `.doc` / `.xls`：js-preview 仅支持 OOXML，无法解析，保持现有“外部打开”兜底。
- `.pptx`：js-preview 无对应包；保持 `presentation → fallback`。
- `.csv`：保持现有 `SpreadsheetRenderer`（utf8 表格），不变。

## 3. 关键决策（已与用户确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 字节来源 | **新增 `GET /files/raw` 原始字节端点** | 现有 `/files/content` 2 MiB 上限 + base64 膨胀，常见 PDF/xlsx 超限。raw 端点复用相同沙箱校验，返回原始字节流。 |
| 大文件加载 | **分片下载 + 进度条**（三种格式统一），字节齐了再渲染 | docx/xlsx 是 ZIP/OOXML，必须拿到完整文件才能解析，无法渐进渲染；PDF 也先下完（不做 Range 渐进，保持简单）。 |
| 大小上限 | **100 MiB** | 传输不再是瓶颈，但 docx/xlsx 解析需整文件入内存；超大文件会卡死 webview。超过上限返回 413 并提示“外部打开”。 |
| 库加载 | **动态 `import()` 懒加载** | pdf.js / exceljs / docx-preview 体积大，不应进主包；仅在真正预览对应格式时按需加载（含其 CSS）。 |

## 4. 架构与数据流

```
sidecar GET /files/raw?path&cwd
  ├─ 复用 /files/content 的沙箱校验（path 必须在 cwd 内）
  ├─ stat：不存在 404 / 非文件 404 / >100MiB 413
  └─ 200：流式返回原始字节（Bun.file(absPath)），带 Content-Length

frontend
  useStreamedFileBytes(path, cwd)              # 新 hook（无 React Query 缓存，避免大 blob 常驻）
    fetchSidecar('/files/raw?…')               # 自带 Bearer
    res.body.getReader() 循环读块
      → 按 Content-Length 累计 progress%
      → 拼成 ArrayBuffer
    错误映射为 FileContentError（与 useFileContent 一致）

  OfficeDocRenderer (kind=pdf|docx|xlsx)        # 新共享组件
    ├─ loading：进度条 / 百分比
    ├─ error：复用 binaryNotice + “外部打开” CTA
    └─ bytes 就绪：useJsPreview 把 js-preview 挂到容器 ref
         useJsPreview：
           await LOADERS[kind]()                # 动态 import 库 + CSS
           inst = lib.init(containerEl)
           await inst.preview(arrayBuffer)
           cleanup → inst.destroy()
```

**为什么自取而不复用 useFileContent**：rich 文档走 `/files/raw`（无 2 MiB 限制、无 base64）。因此 `PreviewPane` 对 rich 文档**禁用** `useFileContent`（传 `path=null`），避免对大文件先发一次注定 413 的请求；渲染器内部用流式 hook 自取。`types.ts` 的渲染器约定本就允许“需要更丰富数据的渲染器自取自己的端点”。

## 5. 文件改动清单

**sidecar（新增 1 路由 + 测试）**

- `sidecar/src/routes/fileContent.ts`：在现有 builder 内加 `GET /files/raw`（共享沙箱逻辑，`MAX_RAW_BYTES = 100 MiB`，流式返回）。
- `sidecar/src/routes/fileContent.test.ts`：新增 raw 端点用例（200 字节相等 / 403 越界 / 404 缺失 / 413 超限 / 400 缺参）。

**前端（新增）**

- `src/lib/agui/react/useStreamedFileBytes.ts`：流式取字节 + 进度 + 错误映射 hook。
- `src/features/task/preview/useJsPreview.ts`：js-preview 挂载生命周期 hook（懒加载 / init / preview / destroy / race-guard）。
- `src/features/task/preview/renderers/OfficeDocRenderer.tsx`：共享的“流式 Office 文档渲染器”，按 `kind` 选 loader。
- `src/features/task/preview/richDoc.ts`：`richDocKind(file): "pdf"|"docx"|"xlsx"|null` 纯函数（PreviewPane 与 PreviewBody 共用）。
- `src/features/task/preview/richDoc.test.ts`：`richDocKind` 单测。

**前端（改动）**

- `src/lib/mock/types.ts`：`MockFile.type` 并集追加 `"pdf" | "document"`。
- `src/features/task/TaskView.tsx`：`touchedFileToPreview` 增加 `.pdf → pdf`、`.docx → document`。
- `src/features/task/preview/PreviewBody.tsx`：先判 `richDocKind`，命中则渲染 `OfficeDocRenderer`；新增 `workingDir` prop 透传。
- `src/features/task/PreviewPane.tsx`：rich 文档禁用 `useFileContent`、走 full-bleed 布局（自管滚动，不套 zoom）、刷新按钮对 rich 走 remount nonce、把 `workingDir` 传给 `PreviewBody`。
- `src/features/task/FilesTab.tsx`：`metaForPath` 给 `.pdf`/`.docx` 配图标（可选打磨）。
- `src/i18n/locales/{en,zh}/task.json`：新增 `task.preview.streamingProgress`、`task.preview.renderFailed`。

## 6. 加载 / 进度 / 错误 UX

- **加载中**：居中显示“正在加载 NN%”（有 Content-Length 时）或不确定态文案；下方一条细进度条（轨道 `hsl(var(--bg-300))`，填充 `hsl(var(--brand-100))`）。全部走语义 token，禁止硬编码颜色。
- **流式错误 / 渲染失败**：复用现有 `binaryNotice` 文案 + “外部打开”按钮（与 `BinaryFallbackRenderer` 同款样式），让用户仍能用系统应用打开。
- **成功**：js-preview 渲染进容器；容器为 `flex-1 min-h-0 overflow-auto`，由库自管内部滚动与尺寸。

## 7. 懒加载与打包

- `LOADERS[kind]` 用动态 `import()`，使 pdf.js/exceljs/docx-preview 各自成为独立 chunk，不进主包。
- docx/excel 的 CSS 也在 loader 内动态 `import("@js-preview/docx/lib/index.css")`，随 chunk 懒加载。
- 验证：`bun run build` 后确认主包未显著增大、生成了对应 lazy chunk。

## 8. 测试计划

- **sidecar 单测**：`/files/raw` 的 200/403/404/413/400，且 200 时 `res.arrayBuffer()` 与磁盘字节逐字节相等。
- **前端纯函数单测**：`richDocKind`（pdf/docx/xlsx/csv/未知）；`useStreamedFileBytes` 的错误映射函数（若拆为纯函数）。
- **类型 + 构建**：`bunx tsc --noEmit -p tsconfig.app.json`、`cd sidecar && bunx tsc --noEmit`、`bun run build`。
- **手动验证**：`bun run tauri:dev` 中实际预览一个 docx、一个 xlsx、一个 PDF（重点确认 PDF 在 Tauri webview 内 worker 正常、不依赖 CDN）。

## 9. 风险与缓解

1. **pdf.js worker 在 Tauri 离线环境**：`@js-preview/pdf` 内部需 pdf.js worker。若库通过 `new URL(..., import.meta.url)` 引用，Vite 会产出同源资产，Tauri 可正常加载；若库默认指向 CDN，则离线失败。缓解：构建后手动验证；必要时显式把 `GlobalWorkerOptions.workerSrc` 指向 bundled 资产，或退化为直接集成 `pdfjs-dist`。（主要风险点。）
2. **100 MiB 内存压力**：docx/xlsx 解析需整文件入内存，分片拼装期短暂约 2× 文件大小。100 MiB 上限是经验折中；超限走 413 + 外部打开。
3. **旧格式不支持**：`.doc/.xls/.pptx` 仍走 fallback，属预期，不在本次范围。

## 10. 验收标准

- 点击 `.docx`/`.pdf`/`.xlsx` 文件，预览面板内分别由对应 js-preview 库渲染出内容；大文件显示下载进度。
- 超过 100 MiB 或解析失败时，显示“外部打开”兜底而非空白/崩溃。
- 主包体积不被三个库显著拉大（懒加载生效）。
- 全部既有预览类型（md/html/csv/code/image/generic 兜底）行为不变。

## 11. 实施记录（2026-06-12）

按 §5 清单实施完成，与设计的差异/确认项：

- **pdf.js worker 风险（§9.1）已解除**：`@js-preview/pdf@2.0.10` 将 worker 内联为
  data URI，离线可用；`staticFileUrl` 默认 unpkg 仅影响罕见的非内嵌字体 CJK PDF
  的 cMaps，保持默认未覆盖。
- **StrictMode 防御**：pdf.js 会把 ArrayBuffer transfer 给 worker（detach 原
  buffer），`useJsPreview` 在 preview 前 `bytes.slice(0)` 拷贝，StrictMode 双跑
  与刷新重渲染均安全。
- **413 超限测试**用稀疏文件（truncate 到 100MiB+1）模拟，不实际占盘。
- 依赖版本：`@js-preview/docx@1.6.4` / `@js-preview/excel@1.7.14` /
  `@js-preview/pdf@2.0.10`。
- 验证：sidecar 457 测试全过 + tsc 干净；前端 tsc 干净、richDocKind 5 用例全过、
  `bun run build` 通过且三库各自成为懒加载 chunk（pdf 2.3MB / excel 1.7MB /
  docx 330KB），主包零引用。前端套件中 1 个 ModelSection flake 为既有问题
  （bun mock.module 跨文件隔离），独跑 13/13 全过，与本次无关。
