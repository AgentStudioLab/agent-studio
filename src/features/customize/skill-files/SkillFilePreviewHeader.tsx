import { Check, Code2, Copy, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type FilePreviewMode = "preview" | "source";

interface SkillFilePreviewHeaderProps {
  /** Filename to show at the left. Caller passes the basename, not the full path. */
  name: string;
  /** Show preview/source toggle. Hide for plain code files. */
  showModeToggle: boolean;
  mode: FilePreviewMode;
  onModeChange: (next: FilePreviewMode) => void;
  /** True when content is utf8 — copy is disabled for binary. */
  copyEnabled: boolean;
  copied: boolean;
  onCopy: () => void;
}

/**
 * Header strip for the skill file preview pane.
 *
 * Layout: filename on the left (truncates), action cluster on the right
 * containing — in order — the optional preview/source toggle and the copy
 * button. Mode state is owned by the parent so the toggle stays purely
 * presentational (same shape as task/preview/MarkdownViewToggle).
 */
export function SkillFilePreviewHeader({
  name,
  showModeToggle,
  mode,
  onModeChange,
  copyEnabled,
  copied,
  onCopy,
}: SkillFilePreviewHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2">
      <div
        className="min-w-0 flex-1 truncate text-[13px] font-medium"
        title={name}
        style={{ color: "hsl(var(--text-100))" }}
      >
        {name}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showModeToggle && (
          <div
            className="inline-flex items-center rounded-md p-0.5"
            style={{ background: "hsl(var(--bg-200) / 0.6)" }}
            role="group"
          >
            <ToggleButton
              active={mode === "preview"}
              label={t("task.preview.markdownMode.preview")}
              onClick={() => onModeChange("preview")}
            >
              <Eye className="size-3.5" />
            </ToggleButton>
            <ToggleButton
              active={mode === "source"}
              label={t("task.preview.markdownMode.source")}
              onClick={() => onModeChange("source")}
            >
              <Code2 className="size-3.5" />
            </ToggleButton>
          </div>
        )}
        <button
          type="button"
          onClick={onCopy}
          disabled={!copyEnabled}
          aria-label={
            copied ? t("task.preview.copied") : t("task.preview.copyContent")
          }
          title={
            copied ? t("task.preview.copied") : t("task.preview.copyContent")
          }
          className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: "hsl(var(--text-300))" }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
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
