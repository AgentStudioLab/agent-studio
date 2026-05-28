import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArchiveRestore,
  FolderInput,
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
  onMoveToProject?: () => void;
  /** Custom trigger element. Defaults to a small "⋯" ghost button. */
  trigger?: ReactNode;
  /** Extra classes for the default trigger (e.g. opacity/group-hover). */
  triggerClassName?: string;
  /** Icon pixel size for the default trigger. Defaults to 16. */
  iconSize?: number;
  align?: "start" | "center" | "end";
}

/**
 * Sidebar item context menu — order matches prototype HTML 463-470:
 *   Move to project / --- / Pin · Rename / --- / Archive · Delete (danger)
 */
export function SidebarItemContextMenu({
  pinMode,
  archived = false,
  onPinToggle,
  onRename,
  onArchive,
  onDelete,
  onMoveToProject,
  trigger,
  triggerClassName,
  iconSize = 16,
  align = "end",
}: SidebarItemContextMenuProps) {
  const { t } = useTranslation();
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
        <DropdownMenuItem onSelect={onMoveToProject}>
          <FolderInput className="size-4" />
          {t("sidebar.contextMenu.moveToProject")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onPinToggle}>
          {pinMode === "pin" ? <Pin className="size-4" /> : <PinOff className="size-4" />}
          {pinMode === "pin"
            ? t("sidebar.contextMenu.pin")
            : t("sidebar.contextMenu.unpin")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="size-4" />
          {t("sidebar.contextMenu.rename")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
        <DropdownMenuItem onSelect={onDelete} variant="destructive">
          <Trash2 className="size-4" />
          {t("sidebar.contextMenu.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
