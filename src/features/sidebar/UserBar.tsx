import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const displayName = loading
    ? "..."
    : signedIn
      ? (name || email || t("sidebar.user.signedIn"))
      : t("sidebar.user.signedOut");
  const avatarInitials =
    initials ||
    (signedIn ? (name || email || "AS").slice(0, 2) : "AS");

  return (
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
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[hsl(var(--bg-100)/0.6)]"
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
  );
}
