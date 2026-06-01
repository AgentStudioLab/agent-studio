import {
  ChevronDown,
  Calendar,
  Wand2,
  Pin,
  Pencil,
  Archive,
  Trash2,
  PanelRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAppShell } from "@/app/AppShellContext";
import { useAgentWorkspace } from "@/lib/data/agent-queries";
import { MoveToAgentSubmenu } from "@/shared/MoveToAgentSubmenu";
import { cn } from "@/lib/utils";

interface TaskHeaderProps {
  conversationId: string;
  title?: string;
  /** When the conversation belongs to an agent space, its title shows a
   *  "<agent> / <title>" breadcrumb. */
  agentWorkspaceId?: string | null;
  onSchedule?: () => void;
  onTurnIntoSkill?: () => void;
  onPin?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function TaskHeader({
  conversationId,
  title,
  agentWorkspaceId,
  onSchedule,
  onTurnIntoSkill,
  onPin,
  onRename,
  onArchive,
  onDelete,
}: TaskHeaderProps) {
  const { toggleAside, sidebarCollapsed } = useAppShell();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: agent } = useAgentWorkspace(agentWorkspaceId ?? null);
  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 px-6",
        // When collapsed the MacTitlebar overlays the SidebarToggle behind the
        // 80px traffic-light slot (toggle spans ~80-104px). Clear it: 80 +
        // 24px button + gap, so the title button doesn't sit under the toggle.
        sidebarCollapsed && "pl-28",
      )}
    >
      <div className="flex min-w-0 items-center gap-0.5">
        {agent && (
          <>
            <button
              type="button"
              onClick={() => navigate(`/agents/${agent.id}`)}
              className="max-w-[180px] shrink-0 truncate rounded-md px-1.5 py-1 text-[14px] font-medium text-muted-foreground outline-hidden hover:bg-state-hover hover:text-foreground"
            >
              {agent.name}
            </button>
            <span className="shrink-0 text-[14px] text-muted-foreground">/</span>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("task.header.menu")}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[14px] font-medium text-foreground outline-hidden hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="truncate">{title ?? conversationId}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={onSchedule}>
            <Calendar /> {t("task.header.schedule")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTurnIntoSkill}>
            <Wand2 /> {t("task.header.turnIntoSkill")}
          </DropdownMenuItem>
          <MoveToAgentSubmenu
            conversationId={conversationId}
            label={t("task.header.moveToAgentSpace")}
          />
          <DropdownMenuItem onSelect={onPin}>
            <Pin /> {t("task.header.pin")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>
            <Pencil /> {t("task.header.rename")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onArchive}>
            <Archive /> {t("task.header.archive")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> {t("task.header.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1" />
      {/* Stop control lives in the composer (PromptInputSubmit toggles between
          Send icon and Square icon while streaming). No duplicate Stop button
          in the header. */}
      <button
        type="button"
        onClick={toggleAside}
        aria-label={t("task.header.toggleRightPanel")}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-state-hover hover:text-foreground"
      >
        <PanelRight className="size-4" />
      </button>
    </header>
  );
}
