import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export function NavItem({ icon: Icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-[14px] transition-colors",
        "text-[hsl(var(--text-200))] hover:bg-[hsl(var(--bg-100))] hover:text-[hsl(var(--text-100))]",
        "data-[active=true]:bg-[hsl(var(--bg-000))] data-[active=true]:text-[hsl(var(--text-100))]",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active
            ? "text-[hsl(var(--text-100))]"
            : "text-[hsl(var(--text-300))]",
        )}
      />
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
