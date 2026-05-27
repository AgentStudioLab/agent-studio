// Checkbox-based multi-select list. Unlike single-select, selecting a row
// only toggles its membership in the selected set — does NOT advance the
// page. The parent footer's → / Skip buttons drive page advancement.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AskUserOption } from "./types";

interface MultiSelectListProps {
  options: AskUserOption[];
  selected: ReadonlySet<string>;
  onToggle: (label: string) => void;
}

export function MultiSelectList({
  options,
  selected,
  onToggle,
}: MultiSelectListProps) {
  return (
    <ul className="flex flex-col">
      {options.map((opt) => {
        const active = selected.has(opt.label);
        return (
          <li key={opt.label}>
            <button
              type="button"
              onClick={() => onToggle(opt.label)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                active
                  ? "bg-[hsl(var(--bg-200))]"
                  : "hover:bg-[hsl(var(--bg-200)/0.5)]",
              )}
              aria-pressed={active}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition",
                  active ? "" : "border",
                )}
                style={{
                  background: active
                    ? "hsl(var(--brand-100))"
                    : "transparent",
                  borderColor: "hsl(var(--border-300) / 0.4)",
                  color: active ? "hsl(var(--oncolor-100))" : "transparent",
                }}
              >
                <Check size={12} strokeWidth={3} />
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
            </button>
          </li>
        );
      })}
    </ul>
  );
}
