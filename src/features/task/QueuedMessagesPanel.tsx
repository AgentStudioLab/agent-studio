// Collapsible list of queued user messages mounted ABOVE the input box.
//
// Visibility rules:
//   - Empty queue → component returns null (no chrome)
//   - Non-empty → header "N Queued" + chevron + rows. Defaults to expanded.
//   - Each row exposes Trash (remove) + ArrowUp (send now / override) on
//     hover or keyboard focus.
//
// Action semantics live in the parent (TaskView) — this component only
// surfaces the user intent via onRemove / onSendNow callbacks. The send-now
// path means "cancel the active run, send THIS item immediately, dequeue
// just this entry" (per spec).

import { useState } from "react";
import { ArrowUp, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { QueueItem } from "./MessageQueueContext";

interface QueuedMessagesPanelProps {
  items: QueueItem[];
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
}

export function QueuedMessagesPanel({
  items,
  onRemove,
  onSendNow,
}: QueuedMessagesPanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (items.length === 0) return null;

  return (
    <div
      className="mb-2 overflow-hidden rounded-lg"
      style={{
        background: "hsl(var(--bg-200) / 0.55)",
        border: "1px solid hsl(var(--border-300) / 0.12)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition hover:bg-[hsl(var(--bg-200)/0.7)]"
        style={{ color: "hsl(var(--text-200))" }}
        aria-expanded={expanded}
        aria-label={expanded ? t("task.queue.collapse") : t("task.queue.expand")}
      >
        {expanded ? (
          <ChevronDown size={13} />
        ) : (
          <ChevronUp size={13} />
        )}
        <span className="font-medium">
          {t("task.queue.queuedCount", { count: items.length })}
        </span>
      </button>
      {expanded && (
        <ul className="flex max-h-[180px] flex-col overflow-y-auto pb-1">
          {items.map((item) => (
            <QueuedRow
              key={item.id}
              item={item}
              onRemove={() => onRemove(item.id)}
              onSendNow={() => onSendNow(item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueuedRow({
  item,
  onRemove,
  onSendNow,
}: {
  item: QueueItem;
  onRemove: () => void;
  onSendNow: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 text-[13px] transition-colors",
        "hover:bg-[hsl(var(--bg-200))]",
      )}
      style={{ color: "hsl(var(--text-100))" }}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full border"
        style={{ borderColor: "hsl(var(--border-300) / 0.4)" }}
      />
      <span className="min-w-0 flex-1 truncate" title={item.text}>
        {item.text}
      </span>
      {/* Hover-only actions. Keyboard users get them via focus-within. */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={t("task.queue.remove")}
          title={t("task.queue.remove")}
          onClick={onRemove}
          className="rounded p-1 transition hover:bg-muted"
          style={{ color: "hsl(var(--text-300))" }}
        >
          <Trash2 size={13} />
        </button>
        <button
          type="button"
          aria-label={t("task.queue.sendNow")}
          title={t("task.queue.sendNow")}
          onClick={onSendNow}
          className="rounded p-1 transition hover:bg-muted hover:text-foreground"
          style={{ color: "hsl(var(--text-300))" }}
        >
          <ArrowUp size={13} />
        </button>
      </div>
    </li>
  );
}
