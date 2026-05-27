// 2-button segmented toggle for markdown preview vs source view, surfaced
// in PreviewPane's header.
//
// Stateless — caller owns the active mode + onChange. This keeps the toggle
// reusable for other renderers that adopt the same pattern (e.g. xlsx
// formula-vs-value, future binary-vs-extracted-text modes).

import { Code2, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type MarkdownViewMode = "preview" | "source";

interface MarkdownViewToggleProps {
  value: MarkdownViewMode;
  onChange: (next: MarkdownViewMode) => void;
}

export function MarkdownViewToggle({ value, onChange }: MarkdownViewToggleProps) {
  const { t } = useTranslation();
  return (
    <div
      className="inline-flex items-center rounded-md p-0.5"
      style={{ background: "hsl(var(--bg-200) / 0.6)" }}
      role="group"
    >
      <ToggleButton
        active={value === "preview"}
        label={t("task.preview.markdownMode.preview")}
        onClick={() => onChange("preview")}
      >
        <Eye className="size-3.5" />
      </ToggleButton>
      <ToggleButton
        active={value === "source"}
        label={t("task.preview.markdownMode.source")}
        onClick={() => onChange("source")}
      >
        <Code2 className="size-3.5" />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-6 w-7 items-center justify-center rounded transition",
        active ? "shadow-sm" : "hover:bg-muted/70",
      )}
      style={{
        background: active ? "hsl(var(--bg-100))" : "transparent",
        color: active ? "hsl(var(--text-100))" : "hsl(var(--text-300))",
      }}
    >
      {children}
    </button>
  );
}
