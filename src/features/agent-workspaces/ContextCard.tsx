import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateAgentFolderMutation } from "@/lib/data/agent-folder-queries";
import { RailSection } from "./RailSection";
import { AgentFoldersCard } from "./AgentFoldersCard";
import { MemoryCard } from "./MemoryCard";

/** Context rail card: external folders ("On your computer") + the agent's
 *  Memory, under one collapsible. The ＋ dropdown adds a folder (Add-a-link is
 *  deferred to a later spec, so it's intentionally absent for now). */
export function ContextCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const createFolder = useCreateAgentFolderMutation(agentId);

  const handleChooseFolder = async () => {
    try {
      const picked = await openDialog({ directory: true, multiple: false });
      if (typeof picked === "string") createFolder.mutate({ path: picked });
    } catch {
      // Native dialog unavailable (plain-browser dev) — no-op.
    }
  };

  const addAction = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("agentSpace.context.add")}
        className="shrink-0 rounded-md p-1 text-muted-foreground outline-hidden hover:bg-state-hover hover:text-foreground"
      >
        <Plus className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={handleChooseFolder}>
          {t("agentSpace.context.chooseFolder")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <RailSection title={t("agentSpace.context.title")} action={addAction}>
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("agentSpace.context.onYourComputer")}
          </h3>
          <AgentFoldersCard agentId={agentId} />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("agentSpace.memory.title")}
          </h3>
          <MemoryCard agentId={agentId} />
        </section>
      </div>
    </RailSection>
  );
}
