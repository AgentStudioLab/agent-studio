// "Something else" row — pencil icon (prefix-only, NOT a toggle) + inline
// editable textarea that takes over the row.
//
// Click anywhere on the row → focus the textarea (uncontrolled-on-click,
// controlled-after via `value` / `onChange`). Click outside or Esc → blur;
// non-empty input keeps the row visually selected. Enter inside textarea
// inserts newline (it's a textarea, not single-line input — the user might
// want to write a multi-line explanation).

import { useEffect, useRef } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface SomethingElseRowProps {
  value: string;
  active: boolean;
  onChange: (next: string) => void;
  /** Called when the user focuses the row — turns the row "selected" state on. */
  onFocus: () => void;
  /** Called on Cmd/Ctrl+Enter — single-shot commit (parent advances page). */
  onCommit: () => void;
  disabled?: boolean;
}

export function SomethingElseRow({
  value,
  active,
  onChange,
  onFocus,
  onCommit,
  disabled = false,
}: SomethingElseRowProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow up to 6 lines. Use scrollHeight measurement; reset to 0 first
  // so shrinking works too (otherwise scrollHeight clamps at max).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const lineHeight = 22;
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * 6)}px`;
  }, [value]);

  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        onFocus();
        ref.current?.focus();
      }}
      disabled={disabled}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors disabled:cursor-default",
        active ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground">
        <Pencil size={14} />
      </div>
      <textarea
        ref={ref}
        value={value}
        rows={1}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onCommit();
          }
        }}
        placeholder={t("task.askUser.somethingElsePlaceholder")}
        className="min-w-0 flex-1 resize-none border-0 bg-transparent text-[13px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground placeholder:opacity-60 disabled:cursor-default"
        // Prevent the parent <button>'s click handler from re-focusing/blurring
        // when the user clicks inside the textarea to move the caret.
        onClick={(e) => e.stopPropagation()}
      />
    </button>
  );
}
