import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import { useRecentConversations } from "@/lib/data/queries";

function useRelativeTime() {
  const { i18n } = useTranslation();
  return (ts: number): string => {
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
    const min = Math.round((ts - Date.now()) / 60_000);
    if (Math.abs(min) < 60) return rtf.format(min, "minute");
    const hr = Math.round(min / 60);
    if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
    return rtf.format(Math.round(hr / 24), "day");
  };
}

/** Recent conversations bound to this agent (filtered server-side). */
export function AgentRecents({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const rel = useRelativeTime();
  const { data } = useRecentConversations(20, agentId);
  const list = data ?? [];

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm text-muted-foreground">
        {t("agentSpace.recents")}
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("agentSpace.recentsEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => navigate(`/task/${c.id}`)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 text-left outline-hidden hover:bg-state-hover"
              >
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {c.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {rel(c.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
