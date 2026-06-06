import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useThemeMode } from "@/lib/useThemeMode";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { UserPopover } from "@/features/sidebar/UserPopover";

interface UserBarProps {
  userId?: string | null;
  name?: string | null;
  initials?: string;
  email?: string | null;
  image?: string | null;
  credits?: number;
  signedIn: boolean;
  loading?: boolean;
  onLogin?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
}

export function UserBar({
  userId,
  name,
  initials,
  email,
  image,
  credits,
  signedIn,
  loading = false,
  onLogin,
  onSettings,
  onLogout,
}: UserBarProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { mode, toggle } = useThemeMode();
  const displayName = loading
    ? "..."
    : signedIn
      ? (name || email || t("sidebar.user.signedIn"))
      : t("sidebar.user.signedOut");
  const avatarInitials =
    initials ||
    (signedIn ? (name || email || "AS").slice(0, 2) : "AS");
  const nextThemeLabel =
    mode === "dark"
      ? t("sidebar.user.switchToLight")
      : t("sidebar.user.switchToDark");
  const ThemeIcon = mode === "dark" ? Sun : Moon;

  return (
    <div className="flex w-full items-center gap-1.5">
      <UserPopover
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        name={name}
        email={email}
        image={image}
        credits={credits}
        signedIn={signedIn}
        onLogin={() => {
          setOpen(false);
          onLogin?.();
        }}
        onSettings={() => {
          setOpen(false);
          onSettings?.();
        }}
        onLogout={() => {
          setOpen(false);
          onLogout?.();
        }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[hsl(var(--bg-100)/0.6)]"
        >
          {image ? (
            <img
              src={image}
              alt=""
              className="size-7 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <InitialsAvatar initials={avatarInitials} size={28} shape="round" tone="subtle" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm leading-5 text-[hsl(var(--text-100))]">
            {displayName}
          </span>
        </button>
      </UserPopover>

      <Tooltip>
        <TooltipTrigger asChild>
          {/* 主题切换独立于账号菜单，避免同一个点击区域承担两种动作。 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={nextThemeLabel}
            onClick={toggle}
            className="size-8 shrink-0 text-[hsl(var(--text-300))] transition-colors hover:bg-transparent hover:text-[hsl(var(--text-100))]"
          >
            <ThemeIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{nextThemeLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}
