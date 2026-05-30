import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Switch } from "@/components/ui/switch";
import {
  useAgentFolders,
  useCreateAgentFolderMutation,
  useDeleteAgentFolderMutation,
  useSetAgentFolderWritableMutation,
} from "@/lib/data/agent-folder-queries";

export function AgentFoldersCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data: folders } = useAgentFolders(agentId);
  const createFolder = useCreateAgentFolderMutation(agentId);
  const setWritable = useSetAgentFolderWritableMutation(agentId);
  const deleteFolder = useDeleteAgentFolderMutation(agentId);

  const handleAdd = async () => {
    try {
      const picked = await openDialog({ directory: true, multiple: false });
      if (typeof picked === "string") createFolder.mutate({ path: picked });
    } catch {
      // Native dialog unavailable (plain-browser dev) — no-op.
    }
  };

  const list = folders ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">
            {t("agentSpace.folders.title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("agentSpace.folders.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={createFolder.isPending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-hidden hover:bg-state-hover hover:text-foreground disabled:opacity-50"
        >
          <Plus className="size-3.5" /> {t("agentSpace.folders.add")}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {t("agentSpace.folders.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-state-hover"
            >
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {f.folderName}
                </div>
                <div className="truncate text-xs text-muted-foreground">{f.path}</div>
              </div>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                {t("agentSpace.folders.allowWrite")}
                <Switch
                  size="sm"
                  checked={f.writable}
                  onCheckedChange={(writable) =>
                    setWritable.mutate({ folderId: f.id, writable })
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => deleteFolder.mutate(f.id)}
                aria-label={t("agentSpace.folders.remove")}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground outline-hidden hover:bg-state-hover hover:text-foreground"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
