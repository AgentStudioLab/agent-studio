import { Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MockPinnedItem } from "@/lib/mock/types";
import { SidebarItemContextMenu } from "@/features/sidebar/SidebarItemContextMenu";
import { StatusDot } from "@/shared/atoms/StatusDot";

interface PinnedItemProps {
  item: MockPinnedItem;
  active?: boolean;
  onClick?: () => void;
  onUnpin?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onMoveToProject?: () => void;
}

export function PinnedItem({
  item,
  active,
  onClick,
  onUnpin,
  onRename,
  onArchive,
  onDelete,
  onMoveToProject,
}: PinnedItemProps) {
  const isProject = item.kind === "project";
  return (
    <div className="group relative w-full">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-md py-1.5 pl-3 pr-9 text-left text-[14px] transition-colors",
          active
            ? "bg-state-selected text-[hsl(var(--text-100))]"
            : "text-[hsl(var(--text-200))] hover:bg-state-hover hover:text-[hsl(var(--text-100))]",
        )}
      >
        {isProject ? (
          <Folder
            className={cn(
              "size-[15px] shrink-0",
              active
                ? "text-[hsl(var(--text-100))]"
                : "text-[hsl(var(--text-300))]",
            )}
          />
        ) : (
          <span className="flex size-3 shrink-0 items-center justify-center">
            <StatusDot status={item.status ?? "done"} size={12} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
      </button>
      <SidebarItemContextMenu
        pinMode="unpin"
        onPinToggle={onUnpin}
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
