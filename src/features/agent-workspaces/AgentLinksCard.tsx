import { ExternalLink, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import {
  useAgentLinks,
  useDeleteAgentLinkMutation,
} from "@/lib/data/agent-link-queries";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Body-only: the agent's reference links. Each row opens the URL in the system
 *  browser; hover reveals a × to remove. Links are agent context (injected into
 *  the prompt for WebFetch), added via the Context card's ＋ dropdown. */
export function AgentLinksCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data: links } = useAgentLinks(agentId);
  const deleteLink = useDeleteAgentLinkMutation(agentId);
  const list = links ?? [];

  if (list.length === 0) {
    return (
      <p className="py-0.5 text-sm text-muted-foreground">{t("agentSpace.links.empty")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {list.map((l) => (
        <div
          key={l.id}
          className="group/link flex items-center gap-1 rounded-lg bg-muted/50 px-2 py-1.5"
        >
          <button
            type="button"
            onClick={() => void shellOpen(l.url).catch(() => {})}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-hidden"
            title={l.url}
          >
            <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm text-foreground">{l.title}</span>
            <span className="truncate text-xs text-muted-foreground">{hostOf(l.url)}</span>
          </button>
          <button
            type="button"
            onClick={() => deleteLink.mutate(l.id)}
            aria-label={t("agentSpace.links.remove")}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 outline-hidden hover:bg-state-hover hover:text-foreground group-hover/link:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
