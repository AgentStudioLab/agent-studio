import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Folder, Lock, Unlock, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AgentFolder } from "@/lib/data/types";
import type { MockFile } from "@/lib/mock/types";
import type { FolderTreeNode } from "@/lib/data/agent-folders";
import {
  useAgentFolders,
  useAgentFolderTree,
  useDeleteAgentFolderMutation,
  useSetAgentFolderWritableMutation,
} from "@/lib/data/agent-folder-queries";

/** Open a file from a folder tree in the preview pane. `workingDir` is the
 *  mounted folder's path (the /files/content sandbox cwd). */
export type OpenFolderFile = (file: MockFile, workingDir: string) => void;

function fileTypeFromName(name: string): MockFile["type"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".xlsx") || lower.endsWith(".csv")) return "spreadsheet";
  if (lower.endsWith(".pptx") || lower.endsWith(".key")) return "presentation";
  if (/\.(png|jpe?g|gif|svg|webp)$/.test(lower)) return "image";
  if (/\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|hpp|json|css|sh|toml|ya?ml)$/.test(lower)) return "code";
  return "generic";
}

function collectFilePaths(nodes: FolderTreeNode[], acc: Set<string>): Set<string> {
  for (const n of nodes) {
    if (n.kind === "file") acc.add(n.path);
    else collectFilePaths(n.children ?? [], acc);
  }
  return acc;
}

function renderNodes(nodes: FolderTreeNode[]): ReactNode {
  return nodes.map((n) =>
    n.kind === "dir" ? (
      <FileTreeFolder key={n.path} path={n.path} name={n.name}>
        {renderNodes(n.children ?? [])}
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={n.path} path={n.path} name={n.name} />
    ),
  );
}

/** Body-only: each mounted folder as a collapsible block showing its file tree
 *  (lazy-loaded on expand). No path shown; hover reveals a write toggle + ×.
 *  Clicking a file calls `onOpenFile` (→ preview pane). */
export function AgentFoldersCard({
  agentId,
  onOpenFile,
}: {
  agentId: string;
  onOpenFile?: OpenFolderFile;
}) {
  const { t } = useTranslation();
  const { data: folders } = useAgentFolders(agentId);
  const list = folders ?? [];

  if (list.length === 0) {
    return (
      <p className="py-0.5 text-sm text-muted-foreground">
        {t("agentSpace.folders.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {list.map((f) => (
        <FolderTreeBlock key={f.id} agentId={agentId} folder={f} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}

function FolderTreeBlock({
  agentId,
  folder,
  onOpenFile,
}: {
  agentId: string;
  folder: AgentFolder;
  onOpenFile?: OpenFolderFile;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: tree, isLoading } = useAgentFolderTree(agentId, folder.id, open);
  const setWritable = useSetAgentFolderWritableMutation(agentId);
  const deleteFolder = useDeleteAgentFolderMutation(agentId);
  const nodes = tree?.tree ?? [];
  const filePaths = useMemo(() => collectFilePaths(nodes, new Set<string>()), [nodes]);

  const handleSelect = (relPath: string) => {
    // FileTree fires onSelect for folders too — only files open a preview.
    if (!onOpenFile || !filePaths.has(relPath)) return;
    onOpenFile(
      {
        name: relPath.split("/").pop() ?? relPath,
        path: `${folder.path}/${relPath}`,
        type: fileTypeFromName(relPath),
      },
      folder.path,
    );
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/folder rounded-lg bg-muted/50"
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 outline-hidden">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/folder:rotate-90" />
          <Folder className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm text-foreground">{folder.folderName}</span>
        </CollapsibleTrigger>
        <button
          type="button"
          onClick={() =>
            setWritable.mutate({ folderId: folder.id, writable: !folder.writable })
          }
          aria-label={t("agentSpace.folders.allowWrite")}
          className={cn(
            "shrink-0 rounded p-1 outline-hidden hover:bg-state-hover",
            folder.writable
              ? "text-foreground"
              : "text-muted-foreground opacity-0 group-hover/folder:opacity-100",
          )}
        >
          {folder.writable ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => deleteFolder.mutate(folder.id)}
          aria-label={t("agentSpace.folders.remove")}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 outline-hidden hover:bg-state-hover hover:text-foreground group-hover/folder:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <CollapsibleContent className="px-2 pb-2 pl-3">
        {isLoading ? (
          <p className="py-0.5 text-xs text-muted-foreground">…</p>
        ) : nodes.length === 0 ? (
          <p className="py-0.5 text-xs italic text-muted-foreground">
            {t("agentSpace.folders.emptyFolder")}
          </p>
        ) : (
          <FileTree onSelect={handleSelect}>{renderNodes(nodes)}</FileTree>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
