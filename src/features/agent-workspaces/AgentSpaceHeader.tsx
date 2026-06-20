import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Archive, BadgeCheck, Copy, MoreHorizontal, Pencil, Pin, PinOff } from "lucide-react";
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
import {
  AGENT_CATEGORY_META,
  agentCoverSrc,
  coverImageForAgent,
  normalizeAgentCategory,
} from "./agent-catalog";
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
  const category = normalizeAgentCategory(agent.category);
  const coverImage = coverImageForAgent(agent);

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
    <header data-tauri-drag-region className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative min-h-[178px]">
        <img
          src={agentCoverSrc(coverImage)}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
        <span className="absolute inset-0 bg-gradient-to-r from-bg-100/95 via-bg-100/72 to-bg-100/20" />
        <span className="absolute inset-0 bg-gradient-to-t from-bg-100/90 via-transparent to-bg-100/10" />

        <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={togglePin}
            aria-label={agent.pinned ? t("agentSpace.header.unpin") : t("agentSpace.header.pin")}
            className={
              agent.pinned
                ? ICON_BTN.replace("text-muted-foreground", "text-foreground") + " bg-bg-200/80 backdrop-blur"
                : ICON_BTN + " bg-bg-200/80 backdrop-blur"
            }
          >
            {agent.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t("agentSpace.header.moreActions")}
              className={ICON_BTN + " bg-bg-200/80 backdrop-blur"}
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

        <div className="relative z-10 flex min-h-[178px] items-end p-5">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-bg-200/85 px-2 py-1 text-[11.5px] font-medium text-text-200 shadow-sm backdrop-blur">
                {t(AGENT_CATEGORY_META[category].labelKey)}
              </span>
              {isBuiltin && (
                <span className="inline-flex items-center gap-1 rounded-md bg-bg-200/85 px-2 py-1 text-[11.5px] font-medium text-text-100 shadow-sm backdrop-blur">
                  <BadgeCheck className="size-3.5 text-primary" />
                  {t("agents.official")}
                </span>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <InitialsAvatar
                initials={initialsFromName(agent.name)}
                hue={hueForAgent(agent)}
                size={42}
                className="shadow-sm"
              />
              <div className="min-w-0">
                <h1 className="truncate font-serif text-[32px] font-normal leading-none text-foreground">
                  {agent.name}
                </h1>
                <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                  {t(AGENT_CATEGORY_META[category].descriptionKey)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {!isBuiltin && (
        <NewAgentModal
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          initialName={agent.name}
          initialAvatar={agent.avatar}
          initialCategory={agent.category}
          onSave={({ name, avatar, category, coverImage }) =>
            update.mutate({ id: agent.id, patch: { name, avatar, category, coverImage } })
          }
        />
      )}
    </header>
  );
}
