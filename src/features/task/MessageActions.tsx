import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MessageActionsProps {
  /** Plain text to copy — caller passes only `text` blocks (no tool calls
   *  or reasoning). */
  text: string;
}

/**
 * Copy action row below an assistant turn. Thumbs up / down were removed
 * (the UX wasn't wired to anything actionable — feedback loop wasn't built).
 */
export function MessageActions({ text }: MessageActionsProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!text) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch((err: unknown) => {
        console.error("[MessageActions] copy failed", err);
      });
  };

  return (
    <div className="-ml-1.5 flex items-center gap-1 pt-2">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={t("task.messageActions.copy")}
        className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))]"
        style={{ color: "hsl(var(--text-400))" }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}
