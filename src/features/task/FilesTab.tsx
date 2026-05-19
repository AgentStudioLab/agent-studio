import { useCallback } from "react";
import {
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Plus,
  Presentation,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { MockFile } from "@/lib/mock/types";

type LucideIcon = typeof FileIcon;

// Per-file-type icon + color. The two literal HSL values (xlsx green, pptx
// terracotta) are categorical-palette identifiers from the prototype — they
// brand the file format itself (Excel green, PowerPoint orange-red), much
// like InitialsAvatar's hue picker. This is the documented exception clause
// in the design-tokens skill: minting --xlsx-100 / --pptx-100 semantic tokens
// would just rename primitives 1:1 with no added meaning.
const TYPE_META: Record<
  MockFile["type"],
  { Icon: LucideIcon; color: string }
> = {
  markdown: { Icon: FileText, color: "hsl(var(--text-400))" },
  spreadsheet: { Icon: FileSpreadsheet, color: "hsl(125 40% 50%)" },
  presentation: { Icon: Presentation, color: "hsl(15 75% 55%)" },
  code: { Icon: FileText, color: "hsl(var(--accent-pro-100))" },
  image: { Icon: ImageIcon, color: "hsl(var(--text-400))" },
  generic: { Icon: FileIcon, color: "hsl(var(--text-400))" },
};

interface FilesTabProps {
  files: MockFile[];
  folderName?: string;
  onOpenFile?: (file: MockFile) => void;
  onAddFiles?: () => void;
}

export function FilesTab({
  files,
  folderName = "stuio",
  onOpenFile,
  onAddFiles,
}: FilesTabProps) {
  const { t } = useTranslation();
  const handleSelect = useCallback(
    (file: MockFile) => {
      onOpenFile?.(file);
    },
    [onOpenFile]
  );

  if (files.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
        {t("task.rightPanel.empty")}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-2 pt-3 pb-2">
        <Folder size={14} className="text-text-300" />
        <span className="text-[13.5px] font-medium text-text-100">
          {folderName}
        </span>
        <span className="ml-auto text-[11px] text-text-400 font-mono">
          {t("task.filesTab.fileCount", { count: files.length })}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {files.map((file) => {
          const meta = TYPE_META[file.type];
          const Icon = meta.Icon;
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => handleSelect(file)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-200/60 transition text-left"
            >
              <Icon
                size={14}
                className="shrink-0"
                style={{ color: meta.color }}
              />
              <span className="text-[13px] text-text-200 truncate flex-1">
                {file.name}
              </span>
              {file.isNew && (
                <span
                  className="text-[10.5px] px-1.5 py-px rounded shrink-0"
                  style={{
                    background: "hsl(var(--brand-100) / 0.15)",
                    color: "hsl(var(--brand-100))",
                  }}
                >
                  {t("task.filesTab.newBadge")}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAddFiles}
        className={cn(
          "mt-3 w-full text-[12.5px] text-text-400 hover:text-text-200",
          "px-2 py-2 rounded-md flex items-center justify-center gap-1.5",
          "transition hover:bg-bg-200/40"
        )}
        style={{ border: "1px dashed hsl(var(--border-300) / 0.2)" }}
      >
        <Plus size={12} />
        {t("task.filesTab.addFiles")}
      </button>
    </div>
  );
}
