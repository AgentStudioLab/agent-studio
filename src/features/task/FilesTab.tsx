import { useCallback } from "react";
import {
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Plus,
  Presentation,
} from "lucide-react";
import {
  FileTree,
  FileTreeActions,
  FileTreeFile,
  FileTreeIcon,
  FileTreeName,
} from "@/components/ai-elements/file-tree";
import { cn } from "@/lib/utils";
import type { MockFile } from "@/lib/mock/types";

type LucideIcon = typeof FileIcon;

const TYPE_META = {
  markdown: { Icon: FileText, color: "text-[hsl(var(--accent-100))]" },
  spreadsheet: {
    Icon: FileSpreadsheet,
    color: "text-[hsl(var(--success-100))]",
  },
  presentation: { Icon: Presentation, color: "text-[hsl(var(--brand-100))]" },
  code: { Icon: FileText, color: "text-[hsl(var(--accent-pro-100))]" },
  image: { Icon: FileIcon, color: "text-muted-foreground" },
  generic: { Icon: FileIcon, color: "text-muted-foreground" },
} satisfies Record<MockFile["type"], { Icon: LucideIcon; color: string }>;

interface FilesTabProps {
  files: MockFile[];
  onOpenFile?: (file: MockFile) => void;
  onAddFiles?: () => void;
}

export function FilesTab({ files, onOpenFile, onAddFiles }: FilesTabProps) {
  const handleSelect = useCallback(
    (path: string) => {
      const file = files.find((f) => f.path === path);
      if (file) onOpenFile?.(file);
    },
    [files, onOpenFile]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <FileTree className="border-none bg-transparent" onSelect={handleSelect}>
          {files.map((file) => {
            const meta = TYPE_META[file.type];
            return (
              <FileTreeFile key={file.path} path={file.path} name={file.name}>
                {/* Spacer matches FileTreeFile's default layout (no folder chevron at root) */}
                <span className="size-4 shrink-0" />
                <FileTreeIcon>
                  <meta.Icon className={cn("size-4", meta.color)} />
                </FileTreeIcon>
                <FileTreeName>{file.name}</FileTreeName>
                {file.isNew && (
                  <FileTreeActions>
                    <span className="rounded-sm bg-[hsl(var(--success-100)/0.15)] px-1.5 py-0.5 font-medium text-[hsl(var(--success-100))] text-xs">
                      new
                    </span>
                  </FileTreeActions>
                )}
              </FileTreeFile>
            );
          })}
        </FileTree>
      </div>
      <div className="border-t border-border px-2 py-2">
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground text-sm hover:bg-muted hover:text-foreground"
          onClick={onAddFiles}
          type="button"
        >
          <Plus className="size-4" />
          Add files to working tree
        </button>
      </div>
    </div>
  );
}
