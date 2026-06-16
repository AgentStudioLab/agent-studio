import { FileTypeIcon } from "@/features/task/FileTypeIcon";
import { OpenerMenu } from "@/features/task/preview/OpenerMenu";
import type { MockFile } from "@/lib/mock/types";

export type ArtifactKind = "Spreadsheet" | "Presentation" | "Document";

/**
 * Map the chat-side artifact kind to the MockFile.type that OpenerMenu uses
 * for badge coloring. Spreadsheet / Presentation stay in their office buckets
 * (brand orange badge); Document → markdown (accent blue badge) since the
 * Document bucket covers .md / .docx / .txt etc.
 */
function syntheticFile(
  absolutePath: string,
  title: string,
  kind: ArtifactKind,
): MockFile {
  let type: MockFile["type"];
  if (kind === "Spreadsheet") type = "spreadsheet";
  else if (kind === "Presentation") type = "presentation";
  else type = "markdown";
  return { path: absolutePath, name: title, type };
}

interface ArtifactInlineCardProps {
  title: string;
  kind: ArtifactKind;
  ext: string;
  /** Absolute filesystem path — used both for preview and OpenerMenu lookup. */
  absolutePath: string;
  /** Click on the icon+title area opens the in-app preview pane. */
  onOpen?: () => void;
}

/**
 * Inline artifact card (prototype Showcase 1 lines 882-896).
 *
 * Layout: 48x48 file-type icon container + title/subtitle button on the left
 * (clicking opens the in-app preview), and an OpenerMenu on the right that
 * provides the system-app dropdown (Open with [default app] / Show in
 * Folder) — same component PreviewPane's header uses, so the open-with
 * confirmation flow is consistent across surfaces.
 */
export function ArtifactInlineCard({
  title,
  kind,
  ext,
  absolutePath,
  onOpen,
}: ArtifactInlineCardProps) {
  const file = syntheticFile(absolutePath, title, kind);
  // title 即文件名(含扩展名);mock 数据偶有无扩展名的 title,用单独传入的
  // ext 补全,确保 getIconForFile 能按扩展名匹配到彩色图标。
  const iconName = title.includes(".") ? title : `${title}.${ext.toLowerCase()}`;

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-3"
      style={{
        background: "hsl(var(--bg-200) / 0.5)",
        border: "1px solid hsl(var(--border-300) / 0.12)",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition hover:bg-muted/40"
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
          style={{ background: "hsl(var(--bg-300))" }}
        >
          <FileTypeIcon name={iconName} size={28} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[14px] font-medium"
            style={{ color: "hsl(var(--text-100))" }}
          >
            {title}
          </div>
          <div
            className="mt-0.5 text-[12px]"
            style={{ color: "hsl(var(--text-400))" }}
          >
            {kind} · {ext}
          </div>
        </div>
      </button>
      <OpenerMenu file={file} />
    </div>
  );
}
