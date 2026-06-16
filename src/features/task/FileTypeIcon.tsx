import { useState } from "react";
import { getIconForFile, DEFAULT_FILE } from "vscode-icons-js";

/** 取路径/文件名的 basename(同时容忍 Windows 反斜杠)。 */
function basename(nameOrPath: string): string {
  const trimmed = nameOrPath.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/** vscode-icons 的 SVG 已 vendored 到 public/file-icons/,用根绝对路径离线引用。 */
function iconSrc(svg: string): string {
  return `/file-icons/${svg}`;
}

interface FileTypeIconProps {
  /** 文件名或完整路径,内部取 basename 后交给 getIconForFile 匹配。 */
  name: string;
  /** 渲染尺寸(正方形,px)。 */
  size: number;
  className?: string;
}

/**
 * 基于 vscode-icons-js 的彩色文件类型图标(用 <img> 渲染 vendored 的 SVG)。
 *
 * 仅用于「对话详情生成的文件」(ArtifactInlineCard)与「侧边栏 Files 模块」
 * (FilesTab) —— 文件树不使用本组件。getIconForFile 只返回图标文件名,真正的
 * SVG 由 scripts/vendor-file-icons.ts 拉取到 public/file-icons/。图标自带配色,
 * 不参与主题 token;装饰性元素,故 alt 留空 + aria-hidden,文件名由相邻文本承载。
 */
export function FileTypeIcon({ name, size, className }: FileTypeIconProps) {
  // getIconForFile 匹配不到时返回 undefined → 回退到 default_file.svg。
  const resolved = getIconForFile(basename(name)) ?? DEFAULT_FILE;
  const [src, setSrc] = useState(() => iconSrc(resolved));

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      // vendored 图标集与映射表可能有个别漂移(如新版重命名),加载失败时
      // 兜底到 default_file.svg;再失败也不会无限循环。
      onError={() => {
        const fallback = iconSrc(DEFAULT_FILE);
        if (src !== fallback) setSrc(fallback);
      }}
    />
  );
}
