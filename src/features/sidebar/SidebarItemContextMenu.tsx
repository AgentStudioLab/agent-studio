import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface SidebarItemContextMenuProps {
  /** "pin" for Recents row, "unpin" for Pinned row */
  pinMode: "pin" | "unpin";
  /** When true the row is already archived → action becomes "Unarchive". */
  archived?: boolean;
  onPinToggle?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  /** Optional "Move to agent space" submenu node (a <DropdownMenuSub>); shown at
   *  the top. Omit for rows where moving doesn't apply (e.g. pinned agents). */
  moveSlot?: ReactNode;
  /** Custom trigger element. Defaults to a small "⋯" ghost button. */
  trigger?: ReactNode;
  /** Extra classes for the default trigger (e.g. opacity/group-hover). */
  triggerClassName?: string;
  /** Icon pixel size for the default trigger. Defaults to 16. */
  iconSize?: number;
  align?: "start" | "center" | "end";
}

/**
 * Sidebar item context menu. Each item renders only when its handler is
 * provided, so the same component serves rich conversation rows (move / pin /
 * rename / archive / delete) and minimal agent rows (just unpin).
 */
export function SidebarItemContextMenu({
  pinMode,
  archived = false,
  onPinToggle,
  onRename,
  onArchive,
  onDelete,
  moveSlot,
  trigger,
  triggerClassName,
  iconSize = 16,
  align = "end",
}: SidebarItemContextMenuProps) {
  const { t } = useTranslation();
  const hasManage = onPinToggle || onRename;
  const hasDanger = onArchive || onDelete;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={t("sidebar.contextMenu.moreActions")}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover",
              triggerClassName,
            )}
          >
            <MoreHorizontal style={{ width: iconSize, height: iconSize }} />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44">
        {moveSlot}
        {moveSlot && hasManage && <DropdownMenuSeparator />}
        {onPinToggle && (
          <DropdownMenuItem onSelect={onPinToggle}>
            {pinMode === "pin" ? <Pin className="size-4" /> : <PinOff className="size-4" />}
            {pinMode === "pin"
              ? t("sidebar.contextMenu.pin")
              : t("sidebar.contextMenu.unpin")}
          </DropdownMenuItem>
        )}
        {onRename && (
          <DropdownMenuItem onSelect={onRename}>
            <Pencil className="size-4" />
            {t("sidebar.contextMenu.rename")}
          </DropdownMenuItem>
        )}
        {hasManage && hasDanger && <DropdownMenuSeparator />}
        {onArchive && (
          <DropdownMenuItem onSelect={onArchive}>
            {archived ? (
              <ArchiveRestore className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
            {archived
              ? t("sidebar.contextMenu.unarchive")
              : t("sidebar.contextMenu.archive")}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem onSelect={onDelete} variant="destructive">
            <Trash2 className="size-4" />
            {t("sidebar.contextMenu.delete")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
