import { cn } from "@/lib/utils";
import { Check, Clock, Minus, X } from "lucide-react";

type Status =
  | "done"
  | "active"
  | "awaiting"
  | "pending"
  | "failed"
  | "scheduled"
  | "cancelled";

interface StatusDotProps {
  status: Status;
  className?: string;
  /** Container size in px. Prototype sidebar uses 12 (w-3 h-3). */
  size?: number;
}

/**
 * Status indicator that matches the Claude Desktop prototype sidebar item.
 * - active:   success-100/30 pulse halo + success-100 center dot (running)
 * - awaiting: brand-100/30 pulse halo + brand-100 center dot (HITL approval
 *             pending — same pulse shape, orange palette so the sidebar
 *             clearly signals "user action required" vs "agent thinking")
 * - done:     success-100 fill + white check
 * - failed:   danger-100 fill + white X
 * - cancelled: text-400 fill + white horizontal line (user-initiated stop;
 *              visually neutral so it doesn't read as a system error)
 * - scheduled: accent-100 clock icon, no fill
 * - pending (idle): empty circle with text-400/0.55 border
 */
export function StatusDot({ status, className, size = 12 }: StatusDotProps) {
  if (status === "active") {
    return (
      <span
        role="status"
        aria-label="running"
        className={cn(
          "relative inline-flex items-center justify-center",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <span
          className="absolute inset-0 animate-pulse rounded-full"
          style={{ background: "hsl(var(--success-100) / 0.3)" }}
        />
        <span
          className="relative rounded-full"
          style={{
            width: size * 0.5,
            height: size * 0.5,
            background: "hsl(var(--success-100))",
          }}
        />
      </span>
    );
  }

  if (status === "awaiting") {
    return (
      <span
        role="status"
        aria-label="awaiting approval"
        className={cn(
          "relative inline-flex items-center justify-center",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <span
          className="absolute inset-0 animate-pulse rounded-full"
          style={{ background: "hsl(var(--brand-100) / 0.3)" }}
        />
        <span
          className="relative rounded-full"
          style={{
            width: size * 0.5,
            height: size * 0.5,
            background: "hsl(var(--brand-100))",
          }}
        />
      </span>
    );
  }

  if (status === "done") {
    return (
      <span
        role="status"
        aria-label="done"
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          className,
        )}
        style={{
          width: size,
          height: size,
          background: "hsl(var(--success-100))",
        }}
      >
        <Check
          strokeWidth={3.5}
          style={{
            width: size * 0.67,
            height: size * 0.67,
            color: "hsl(var(--oncolor-100))",
          }}
        />
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        role="status"
        aria-label="failed"
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          className,
        )}
        style={{
          width: size,
          height: size,
          background: "hsl(var(--danger-100))",
        }}
      >
        <X
          strokeWidth={3.5}
          style={{
            width: size * 0.5,
            height: size * 0.5,
            color: "hsl(var(--oncolor-100))",
          }}
        />
      </span>
    );
  }

  if (status === "cancelled") {
    return (
      <span
        role="status"
        aria-label="cancelled"
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          className,
        )}
        style={{
          width: size,
          height: size,
          background: "hsl(var(--text-400))",
        }}
      >
        <Minus
          strokeWidth={3.5}
          style={{
            width: size * 0.6,
            height: size * 0.6,
            color: "hsl(var(--oncolor-100))",
          }}
        />
      </span>
    );
  }

  if (status === "scheduled") {
    return (
      <span
        role="status"
        aria-label="scheduled"
        className={cn(
          "inline-flex items-center justify-center",
          className,
        )}
        style={{
          width: size,
          height: size,
          color: "hsl(var(--accent-100))",
        }}
      >
        <Clock strokeWidth={2.2} style={{ width: size - 1, height: size - 1 }} />
      </span>
    );
  }

  // pending / idle
  return (
    <span
      role="status"
      aria-label="pending"
      className={cn("inline-block rounded-full", className)}
      style={{
        width: size,
        height: size,
        border: "1.5px solid hsl(var(--text-400) / 0.55)",
      }}
    />
  );
}
