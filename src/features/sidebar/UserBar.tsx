import { useState } from "react";
import { InitialsAvatar } from "@/features/_atoms/InitialsAvatar";
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
  email = "jay.yang@ugreen.com",
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
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent"
      >
        <InitialsAvatar initials={initials} size={24} hue="orange" />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {plan}
        </span>
      </button>
    </UserPopover>
  );
}
