import { FolderOpen, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import {
  useAgentFolders,
  useDeleteAgentFolderMutation,
  useSetAgentFolderWritableMutation,
} from "@/lib/data/agent-folder-queries";

/** Body-only: the mounted-folder list. Adding a folder is driven by the
 *  ContextCard ＋ dropdown ("Choose a folder"); the card chrome + title live
 *  in the enclosing RailSection. */
export function AgentFoldersCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data: folders } = useAgentFolders(agentId);
  const setWritable = useSetAgentFolderWritableMutation(agentId);
  const deleteFolder = useDeleteAgentFolderMutation(agentId);

  const list = folders ?? [];

  if (list.length === 0) {
    return (
      <p className="py-0.5 text-sm text-muted-foreground">
        {t("agentSpace.folders.empty")}
      </p>
    );
  }

  return (
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
  );
}
