import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Archive, Copy, MoreHorizontal, Pencil, Pin, PinOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentWorkspace } from "@/lib/data/types";
import {
  useCloneAgentWorkspaceMutation,
  useUpdateAgentWorkspaceMutation,
} from "@/lib/data/agent-queries";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { hueForAgent, initialsFromName } from "@/shared/atoms/agent-avatar";
import { NewAgentModal } from "./NewAgentModal";

const ICON_BTN =
  "flex size-7 items-center justify-center rounded-md text-muted-foreground outline-hidden hover:bg-state-hover hover:text-foreground";

/** Agent detail header: name + pin toggle + 3-dot menu (Pin/Unpin, Edit
 *  details, Archive). Archiving navigates back to the agent list. */
export function AgentSpaceHeader({ agent }: { agent: AgentWorkspace }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const update = useUpdateAgentWorkspaceMutation();
  const clone = useCloneAgentWorkspaceMutation();
  const [editOpen, setEditOpen] = useState(false);
  // 内置(官方只读)：定义不可改、不可归档；只保留 pin 与"克隆为我的智能体"。
  const isBuiltin = agent.source === "builtin";

  const togglePin = () =>
    update.mutate({ id: agent.id, patch: { pinned: !agent.pinned } });
  const archive = () =>
    update.mutate(
      { id: agent.id, patch: { archived: true } },
      { onSuccess: () => navigate("/agents") },
    );
  const cloneAgent = () =>
    clone.mutate(agent.id, { onSuccess: (created) => navigate(`/agents/${created.id}`) });

  return (
    <header data-tauri-drag-region className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <InitialsAvatar
          initials={initialsFromName(agent.name)}
          hue={hueForAgent(agent)}
          size={40}
        />
        <h1 className="truncate font-serif text-[32px] font-normal leading-none text-foreground">
          {agent.name}
        </h1>
        {isBuiltin && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t("agentSpace.builtinBadge")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={togglePin}
          aria-label={agent.pinned ? t("agentSpace.header.unpin") : t("agentSpace.header.pin")}
          className={agent.pinned ? ICON_BTN.replace("text-muted-foreground", "text-foreground") : ICON_BTN}
        >
          {agent.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("agentSpace.header.moreActions")}
            className={ICON_BTN}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={togglePin}>
              {agent.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {agent.pinned ? t("agentSpace.header.unpin") : t("agentSpace.header.pin")}
            </DropdownMenuItem>
            {isBuiltin ? (
              // 内置：定义只读 → 用克隆代替编辑/归档。
              <DropdownMenuItem onSelect={cloneAgent} disabled={clone.isPending}>
                <Copy className="size-4" />
                {t("agentSpace.header.clone")}
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  {t("agentSpace.header.editDetails")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={archive} variant="destructive">
                  <Archive className="size-4" />
                  {t("agentSpace.header.archive")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!isBuiltin && (
        <NewAgentModal
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          initialName={agent.name}
          initialAvatar={agent.avatar}
          onSave={({ name, avatar }) => update.mutate({ id: agent.id, patch: { name, avatar } })}
        />
      )}
    </header>
  );
}
