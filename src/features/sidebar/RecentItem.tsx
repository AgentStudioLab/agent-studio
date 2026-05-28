import { cn } from "@/lib/utils";
import type { MockRecentItem } from "@/lib/mock/types";
import { StatusDot } from "@/shared/atoms/StatusDot";
import { SidebarItemContextMenu } from "@/features/sidebar/SidebarItemContextMenu";

interface RecentItemProps {
  item: MockRecentItem;
  active?: boolean;
  isPinned?: boolean;
  onClick?: () => void;
  onPin?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onMoveToProject?: () => void;
}

export function RecentItem({
  item,
  active,
  isPinned,
  onClick,
  onPin,
  onRename,
  onArchive,
  onDelete,
  onMoveToProject,
}: RecentItemProps) {
  // All real entries come from /conversations (kind="conversation"). The
  // status is computed in SidebarContent's aguiToMockStatus from
  // /conversations/status — "active" when a run is in flight (drives the
  // pulse halo in StatusDot), otherwise "done"/"failed"/"pending".
  const status = item.status ?? "pending";
  return (
    <div className="group relative w-full">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-md py-1.5 pl-3 pr-9 text-left text-[13.5px] transition-colors",
          active
            ? "bg-state-selected text-[hsl(var(--text-100))]"
            : "text-[hsl(var(--text-300))] hover:bg-state-hover hover:text-[hsl(var(--text-100))]",
        )}
      >
        <span className="flex size-3 shrink-0 items-center justify-center">
          <StatusDot status={status} size={12} />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{item.title}</span>
      </button>
      <SidebarItemContextMenu
        pinMode={isPinned ? "unpin" : "pin"}
        onPinToggle={onPin}
        onRename={onRename}
        onArchive={onArchive}
        onDelete={onDelete}
        onMoveToProject={onMoveToProject}
        triggerClassName="absolute right-1.5 top-1/2 -translate-y-1/2 size-auto p-1 rounded text-[hsl(var(--text-400))] hover:bg-[hsl(var(--bg-200))] hover:text-[hsl(var(--text-100))] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        iconSize={13}
      />
    </div>
  );
}
