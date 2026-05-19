import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Settings, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface UserPopoverProps {
  email: string;
  onSettings?: () => void;
  onLogout?: () => void;
  children: ReactNode;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UserPopover({
  email,
  onSettings,
  onLogout,
  children,
  open,
  onOpenChange,
}: UserPopoverProps) {
  const { t } = useTranslation();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-60 p-1.5">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">{email}</div>
        <Separator className="my-1" />
        <button
          type="button"
          onClick={onSettings}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
        >
          <Settings className="size-4 text-muted-foreground" />
          <span className="flex-1 text-left">{t("sidebar.user.settings")}</span>
          <kbd className="text-xs text-muted-foreground tracking-widest">⌘,</kbd>
        </button>
        <Separator className="my-1" />
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
        >
          <LogOut className="size-4 text-muted-foreground" />
          <span className="flex-1 text-left">{t("sidebar.user.logout")}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
