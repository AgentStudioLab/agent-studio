/**
 * File-extension helpers shared by SkillFilePreviewHeader (decides if the
 * mode toggle is visible) and SkillFilePreviewBody (picks the renderer).
 */

export function fileExt(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

export function isMarkdown(ext: string): boolean {
  return ext === "md" || ext === "markdown";
}

export function isHtml(ext: string): boolean {
  return ext === "html" || ext === "htm";
}

/** True when the renderer supports a preview/source toggle. */
export function supportsModeToggle(ext: string): boolean {
  return isMarkdown(ext) || isHtml(ext);
}
