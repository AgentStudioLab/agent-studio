import { useState, type ReactNode } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UserMessageProps {
  children: ReactNode;
  /** DB id of this user message — passed to onRegenerate. */
  messageId?: string;
  /** Re-run this turn (discard it + later turns, roll back file edits). */
  onRegenerate?: (fromMessageId: string) => void;
  /** Number of later user-initiated rounds that regenerating would discard. */
  laterRounds?: number;
  /** Whether this turn's answer made Write/Edit/NotebookEdit file changes. */
  willRollbackFiles?: boolean;
  /** Disable regenerate (a run is active / awaiting approval). */
  regenerateDisabled?: boolean;
}

/**
 * Right-aligned bubble for user messages. Bubble surface is `--bg-300`
 * (matches prototype Showcase 1 lines 790-797). A copy + regenerate action
 * row sits below the bubble, revealed on hover. Copy lifts the message's plain
 * text. Regenerate re-runs this turn — when it would discard later rounds or
 * roll back file edits, it first asks for confirmation.
 */
export function UserMessage({
  children,
  messageId,
  onRegenerate,
  laterRounds = 0,
  willRollbackFiles = false,
  regenerateDisabled = false,
}: UserMessageProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  const canRegenerate = Boolean(messageId && onRegenerate);
  const needsConfirm = laterRounds > 0 || willRollbackFiles;

  const doRegenerate = () => {
    if (!messageId || !onRegenerate) return;
    onRegenerate(messageId);
  };

  const handleRegenerateClick = () => {
    if (!canRegenerate || regenerateDisabled) return;
    if (needsConfirm) setConfirmOpen(true);
    else doRegenerate();
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
          onClick={handleRegenerateClick}
          disabled={!canRegenerate || regenerateDisabled}
          aria-label={t("task.messageActions.regenerate")}
          className="rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--bg-200))] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: "hsl(var(--text-400))" }}
        >
          <RotateCcw size={13} />
        </button>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o) setConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("task.regenerate.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {laterRounds > 0
                ? t("task.regenerate.descLater", { count: laterRounds })
                : t("task.regenerate.descFilesOnly")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("task.regenerate.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doRegenerate}>
              {t("task.regenerate.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
