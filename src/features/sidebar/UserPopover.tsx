import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Coins, LogIn, LogOut, Settings } from "lucide-react";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface UserPopoverProps {
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  credits?: number;
  signedIn: boolean;
  onLogin?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
  children: ReactNode;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UserPopover({
  userId,
  name,
  email,
  image,
  credits,
  signedIn,
  onLogin,
  onSettings,
  onLogout,
  children,
  open,
  onOpenChange,
}: UserPopoverProps) {
  const { t } = useTranslation();
  const title = signedIn ? (name || email || t("sidebar.user.signedIn")) : t("sidebar.user.signedOut");
  const initials = signedIn ? (name || email || "AS").slice(0, 2) : "AS";
  const accountId = userId ? t("sidebar.user.accountId", { id: userId }) : "";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-60 p-1.5">
        <div className="flex items-center gap-2 px-2 py-1.5">
          {image ? (
            <img
              src={image}
              alt=""
              className="size-8 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <InitialsAvatar initials={initials} size={32} shape="round" tone="subtle" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{title}</div>
            {signedIn && email && name && (
              <div className="truncate text-xs text-muted-foreground">{email}</div>
            )}
            {signedIn && !email && accountId && (
              <div className="truncate text-xs text-muted-foreground">{accountId}</div>
            )}
          </div>
        </div>
        <Separator className="my-1" />
        {!signedIn && (
          <button
            type="button"
            onClick={onLogin}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <LogIn className="size-4 text-muted-foreground" />
            <span className="flex-1 text-left">{t("sidebar.user.login")}</span>
          </button>
        )}
        {signedIn && typeof credits === "number" && (
          <>
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
              <Coins className="size-4 text-muted-foreground" />
              <span className="flex-1 text-left">
                {t("sidebar.user.credits", { count: credits })}
              </span>
            </div>
            <Separator className="my-1" />
          </>
        )}
        <button
          type="button"
          onClick={onSettings}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
        >
          <Settings className="size-4 text-muted-foreground" />
          <span className="flex-1 text-left">{t("sidebar.user.settings")}</span>
          <kbd className="text-xs text-muted-foreground tracking-widest">⌘,</kbd>
        </button>
        {signedIn && (
          <>
            <Separator className="my-1" />
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <LogOut className="size-4 text-muted-foreground" />
              <span className="flex-1 text-left">{t("sidebar.user.logout")}</span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
