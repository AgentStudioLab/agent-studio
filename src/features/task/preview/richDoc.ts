// rich 文档类型判定 — PreviewPane 与 PreviewBody 共用的纯函数。
//
// 「rich 文档」指需要专用 JS 库解析渲染的二进制 Office/PDF 格式，
// 走 /files/raw 流式端点 + @js-preview/* 渲染，而非 useFileContent
// 的 utf8/base64 通道。判定按扩展名（与 touchedFileToPreview 一致），
// 不嗅探文件头。
//
// 明确不支持（保持「外部打开」兜底）：
//   - .doc / .xls：旧版二进制格式，js-preview 仅支持 OOXML
//   - .pptx：js-preview 无对应包
//   - .csv：走现有 SpreadsheetRenderer（utf8 文本表格）

import type { MockFile } from "@/lib/mock/types";

export type RichDocKind = "pdf" | "docx" | "xlsx";

/** 按文件路径扩展名判定 rich 文档类型；非 rich 文档返回 null。 */
export function richDocKind(file: Pick<MockFile, "path">): RichDocKind | null {
  const lower = file.path.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return null;
}
