import { useState, type ReactNode } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface UserMessageProps {
  children: ReactNode;
}

/**
 * Right-aligned bubble for user messages. Bubble surface is `--bg-300`
 * (matches prototype Showcase 1 lines 790-797). A copy + regenerate action
 * row sits below the bubble, revealed on hover. Regenerate is reserved UI
 * (handler wired later); copy lifts the message's plain text.
 */
export function UserMessage({ children }: UserMessageProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = typeof children === "string" ? children : "";

  const handleCopy = () => {
    if (!text) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch((err: unknown) => {
        console.error("[UserMessage] copy failed", err);
      });
  };

  return (
    <div className="group flex flex-col items-end gap-1">
      <div
        className="max-w-[78%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed"
        style={{
          background: "hsl(var(--bg-300))",
          color: "hsl(var(--text-100))",
        }}
      >
        {children}
      </div>
      <div className="-mr-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          onClick={handleCopy}
          aria-label={t("task.messageActions.copy")}
          className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))]"
          style={{ color: "hsl(var(--text-400))" }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button
          type="button"
          aria-label={t("task.messageActions.regenerate")}
          className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))]"
          style={{ color: "hsl(var(--text-400))" }}
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  );
}
