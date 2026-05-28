import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Info, X } from "lucide-react";
import { useThreadStatuses } from "@/lib/agui/react/useThreadStatuses";

interface ToastItem {
  threadId: string;
  title: string;
}

/**
 * App-level watcher: when the scheduler spawns a fresh run (a new conversation
 * tagged with a scheduledTaskId appears in the status poll), slide a toast in
 * from the right announcing it. Mounted above the router so it survives
 * navigation and isn't re-seeded mid-session.
 */
export function ScheduledRunWatcher() {
  const { data: statuses } = useThreadStatuses();
  const navigate = useNavigate();
  const { t } = useTranslation();
  // null until the first poll resolves — seeds the "already seen" set so we
  // don't announce runs that existed before this session started.
  const seen = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (!statuses) return;
    const scheduled = statuses.filter((s) => s.scheduledTaskId);
    if (seen.current === null) {
      seen.current = new Set(scheduled.map((s) => s.threadId));
      return;
    }
    const fresh = scheduled.filter((s) => !seen.current!.has(s.threadId));
    if (fresh.length === 0) return;
    for (const s of fresh) seen.current!.add(s.threadId);
    setToasts((prev) => [
      ...prev,
      ...fresh.map((s) => ({ threadId: s.threadId, title: s.title })),
    ]);
  }, [statuses]);

  const dismiss = (threadId: string) =>
    setToasts((prev) => prev.filter((tt) => tt.threadId !== threadId));

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-12 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <ScheduledToast
          key={toast.threadId}
          message={t("scheduled.toast.started", { name: toast.title })}
          viewLabel={t("scheduled.toast.view")}
          dismissLabel={t("scheduled.toast.dismiss")}
          onView={() => {
            dismiss(toast.threadId);
            navigate(`/task/${toast.threadId}`);
          }}
          onDismiss={() => dismiss(toast.threadId)}
        />
      ))}
    </div>
  );
}

interface ScheduledToastProps {
  message: string;
  viewLabel: string;
  dismissLabel: string;
  onView: () => void;
  onDismiss: () => void;
}

function ScheduledToast({
  message,
  viewLabel,
  dismissLabel,
  onView,
  onDismiss,
}: ScheduledToastProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
    // Mount-once timer; onDismiss only filters by a stable id so staleness is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-border bg-popover px-4 py-3 shadow-lg animate-in slide-in-from-right-5 fade-in">
      <Info className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {message}
      </span>
      <button
        type="button"
        onClick={onView}
        className="shrink-0 text-sm font-medium text-foreground underline underline-offset-2 hover:opacity-80"
      >
        {viewLabel}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-state-hover hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
