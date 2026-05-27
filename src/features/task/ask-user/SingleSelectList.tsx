// Numbered single-select rows. Each row shows 1-based index square + label +
// description. Selecting a row fires onSelect with the option's label and the
// parent (AskUserCard) handles auto-advance.

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AskUserOption } from "./types";

interface SingleSelectListProps {
  options: AskUserOption[];
  selectedLabel: string | null;
  onSelect: (label: string) => void;
}

export function SingleSelectList({
  options,
  selectedLabel,
  onSelect,
}: SingleSelectListProps) {
  return (
    <ul className="flex flex-col">
      {options.map((opt, i) => {
        const active = opt.label === selectedLabel;
        return (
          <li key={opt.label}>
            <button
              type="button"
              onClick={() => onSelect(opt.label)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                active
                  ? "bg-[hsl(var(--bg-200))]"
                  : "hover:bg-[hsl(var(--bg-200)/0.5)]",
              )}
              data-state={active ? "active" : "inactive"}
            >
              {/* Index square. The number doubles as a keyboard hint (1-9). */}
              <div
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-medium"
                style={{
                  background: "hsl(var(--bg-300))",
                  color: "hsl(var(--text-300))",
                }}
              >
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[13px] font-medium leading-tight"
                  style={{ color: "hsl(var(--text-100))" }}
                >
                  {opt.label}
                </div>
                {opt.description && (
                  <div
                    className="mt-0.5 text-[12px] leading-[1.45]"
                    style={{ color: "hsl(var(--text-400))" }}
                  >
                    {opt.description}
                  </div>
                )}
              </div>
              {/* The arrow appears on hover/active — affordance that selecting
                  immediately advances to the next question. */}
              <div
                className={cn(
                  "mt-1 shrink-0 transition-opacity",
                  active
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100",
                )}
                style={{ color: "hsl(var(--text-300))" }}
              >
                <ArrowRight size={14} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
