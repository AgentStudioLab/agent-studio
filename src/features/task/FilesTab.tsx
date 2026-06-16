import { useCallback } from "react";
import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "@/features/task/FileTypeIcon";
import { useThreadFiles } from "@/lib/agui/react/useThreadFiles";
import type { TouchedFile } from "@/lib/agui/runtime/derivations";
import type { ChatState } from "@/lib/agui/runtime/types";

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
          const isNew = file.firstTool === "Write";
          return (
            <button
              key={file.absolutePath}
              type="button"
              onClick={() => handleSelect(file)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-200/60 transition text-left"
            >
              <FileTypeIcon name={file.relativePath} size={16} className="shrink-0" />
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
