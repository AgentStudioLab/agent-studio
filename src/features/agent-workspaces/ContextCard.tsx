import { useState } from "react";
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
import { AgentFoldersCard, type OpenFolderFile } from "@/shared/agent-context/AgentFoldersCard";
import { AgentLinksCard } from "./AgentLinksCard";
import { AddLinkModal } from "./AddLinkModal";
import { MemoryFilesCard } from "@/shared/agent-context/MemoryFilesCard";

/** Context rail card: external folders ("On your computer"), reference Links,
 *  and the agent's Memory, under one collapsible. The ＋ dropdown adds a folder
 *  or a link. */
export function ContextCard({
  agentId,
  onOpenFile,
}: {
  agentId: string;
  onOpenFile?: OpenFolderFile;
}) {
  const { t } = useTranslation();
  const createFolder = useCreateAgentFolderMutation(agentId);
  const [addLinkOpen, setAddLinkOpen] = useState(false);

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
        <DropdownMenuItem onSelect={() => setAddLinkOpen(true)}>
          {t("agentSpace.context.addLink")}
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
          <AgentFoldersCard agentId={agentId} onOpenFile={onOpenFile} />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("agentSpace.context.links")}
          </h3>
          <AgentLinksCard agentId={agentId} />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("agentSpace.memory.title")}
          </h3>
          <MemoryFilesCard agentId={agentId} onOpenFile={onOpenFile} />
        </section>
      </div>
      <AddLinkModal agentId={agentId} open={addLinkOpen} onOpenChange={setAddLinkOpen} />
    </RailSection>
  );
}
