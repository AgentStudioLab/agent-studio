import { useCallback } from "react";
import {
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Presentation,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThreadFiles } from "@/lib/agui/react/useThreadFiles";
import type { TouchedFile } from "@/lib/agui/runtime/derivations";
import type { ChatState } from "@/lib/agui/runtime/types";

type LucideIcon = typeof FileIcon;

interface IconMeta {
  Icon: LucideIcon;
  color: string;
}

// Per-extension icon + color. The two literal HSL values (xlsx green,
// pptx terracotta) are categorical-palette identifiers from the prototype —
// see the design-tokens skill's exception clause.
function metaForPath(path: string): IconMeta {
  const lower = path.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".csv")) {
    return { Icon: FileSpreadsheet, color: "hsl(125 40% 50%)" };
  }
  if (lower.endsWith(".pptx") || lower.endsWith(".key")) {
    return { Icon: Presentation, color: "hsl(15 75% 55%)" };
  }
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif") || lower.endsWith(".svg")) {
    return { Icon: ImageIcon, color: "hsl(var(--text-400))" };
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return { Icon: FileText, color: "hsl(var(--text-400))" };
  }
  if (lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".py") || lower.endsWith(".rs") || lower.endsWith(".go")) {
    return { Icon: FileText, color: "hsl(var(--accent-pro-100))" };
  }
  return { Icon: FileIcon, color: "hsl(var(--text-400))" };
}

function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

interface FilesTabProps {
  state: ChatState | null;
  workingDir: string | null;
  onOpenFile?: (file: TouchedFile) => void;
}

export function FilesTab({ state, workingDir, onOpenFile }: FilesTabProps) {
  const { t } = useTranslation();
  const { files } = useThreadFiles(state, workingDir);

  const handleSelect = useCallback(
    (file: TouchedFile) => {
      onOpenFile?.(file);
    },
    [onOpenFile],
  );

  if (files.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
        {t("task.filesTab.empty")}
      </div>
    );
  }

  const folderName = workingDir ? basename(workingDir) : "";

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
          const { Icon, color } = metaForPath(file.relativePath);
          const isNew = file.firstTool === "Write";
          return (
            <button
              key={file.absolutePath}
              type="button"
              onClick={() => handleSelect(file)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-200/60 transition text-left"
            >
              <Icon size={14} className="shrink-0" style={{ color }} />
              <span className="text-[13px] text-text-200 truncate flex-1">
                {file.relativePath}
              </span>
              {isNew && (
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
    </div>
  );
}
