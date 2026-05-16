import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

type Status = "done" | "active" | "pending" | "failed";

interface StatusDotProps {
  status: Status;
  className?: string;
  size?: number;
}

const statusStyles: Record<Status, { bg: string; ring?: boolean; icon: "check" | "x" | "dot" | null }> = {
  done: { bg: "hsl(var(--success-100))", icon: "check" },
  active: { bg: "hsl(var(--brand-100))", ring: true, icon: "dot" },
  pending: { bg: "transparent", icon: null },
  failed: { bg: "hsl(var(--danger-100))", icon: "x" },
};

export function StatusDot({ status, className, size = 20 }: StatusDotProps) {
  const s = statusStyles[status];
  return (
    <span
      role="status"
      aria-label={status}
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        status === "pending" && "border border-dashed border-[hsl(var(--text-400))]",
        s.ring && "ring-2 ring-[hsl(var(--brand-100)/0.3)] animate-pulse",
        className
      )}
      style={{ width: size, height: size, background: s.bg }}
    >
      {s.icon === "check" && <Check className="size-3 text-[hsl(var(--oncolor-100))]" />}
      {s.icon === "x" && <X className="size-3 text-[hsl(var(--oncolor-100))]" />}
      {s.icon === "dot" && <span className="size-1.5 rounded-full bg-[hsl(var(--oncolor-100))]" />}
    </span>
  );
}
