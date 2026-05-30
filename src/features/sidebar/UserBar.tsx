import { useState } from "react";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { UserPopover } from "@/features/sidebar/UserPopover";

interface UserBarProps {
  name?: string;
  initials?: string;
  email?: string;
  plan?: string;
  onSettings?: () => void;
  onLogout?: () => void;
}

export function UserBar({
  name = "Jay Yang",
  initials = "JY",
  email = "jay.yang@agent-studio.com",
  plan = "Max",
  onSettings,
  onLogout,
}: UserBarProps) {
  const [open, setOpen] = useState(false);
  return (
    <UserPopover
      open={open}
      onOpenChange={setOpen}
      email={email}
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
        <InitialsAvatar initials={initials} size={20} shape="round" tone="subtle" />
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <span className="min-w-0 truncate text-[12px] text-[hsl(var(--text-100))]">
            {name}
          </span>
          <span className="shrink-0 text-[12px] text-[hsl(var(--text-400))]">
            ·
          </span>
          <span className="shrink-0 text-[12px] text-[hsl(var(--text-300))]">
            {plan}
          </span>
        </span>
      </button>
    </UserPopover>
  );
}
