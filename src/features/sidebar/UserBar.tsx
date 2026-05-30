import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { UserPopover } from "@/features/sidebar/UserPopover";

interface UserBarProps {
  name?: string | null;
  initials?: string;
  email?: string | null;
  credits?: number;
  signedIn: boolean;
  loading?: boolean;
  onLogin?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
}

export function UserBar({
  name,
  initials,
  email,
  credits,
  signedIn,
  loading = false,
  onLogin,
  onSettings,
  onLogout,
}: UserBarProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const displayName = loading
    ? "..."
    : signedIn
      ? (name || email || t("sidebar.user.signedOut"))
      : t("sidebar.user.signedOut");
  const emailText = !loading && signedIn && name && email ? email : "";
  const creditsText =
    !loading && signedIn && typeof credits === "number"
      ? t("sidebar.user.credits", { count: credits })
      : "";
  const avatarInitials =
    initials ||
    (signedIn ? (name || email || "AS").slice(0, 2) : "AS");
  const hasSecondary = Boolean(emailText || creditsText);

  return (
    <UserPopover
      open={open}
      onOpenChange={setOpen}
      email={email}
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
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[hsl(var(--bg-100)/0.6)]"
      >
        <InitialsAvatar initials={avatarInitials} size={20} shape="round" tone="subtle" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="min-w-0 truncate text-[12px] leading-4 text-[hsl(var(--text-100))]">
            {displayName}
          </span>
          {hasSecondary && (
            <span className="flex min-w-0 items-center gap-1 text-[11px] leading-3 text-[hsl(var(--text-300))]">
              {emailText && <span className="min-w-0 truncate">{emailText}</span>}
              {emailText && creditsText && (
                <span className="shrink-0 text-[hsl(var(--text-400))]">·</span>
              )}
              {creditsText && <span className="shrink-0">{creditsText}</span>}
            </span>
          )}
        </span>
      </button>
    </UserPopover>
  );
}
