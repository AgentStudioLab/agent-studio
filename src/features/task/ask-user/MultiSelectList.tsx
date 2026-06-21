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
  disabled?: boolean;
}

export function MultiSelectList({
  options,
  selected,
  onToggle,
  disabled = false,
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
              disabled={disabled}
              className={cn(
                "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors disabled:cursor-default",
                active
                  ? "bg-accent text-accent-foreground ring-1 ring-primary/25"
                  : "hover:bg-muted/60",
              )}
              aria-pressed={active}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-transparent",
                )}
              >
                <Check size={12} strokeWidth={3} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-tight text-foreground">
                  {opt.label}
                </div>
                {opt.description && (
                  <div className="mt-0.5 text-[12px] leading-[1.45] text-muted-foreground">
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
