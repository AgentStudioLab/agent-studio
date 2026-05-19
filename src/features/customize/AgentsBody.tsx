import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentCard } from "@/features/customize/AgentCard";
import { AgentDetail } from "@/features/customize/AgentDetail";
import { agents } from "@/lib/mock/agents";

export function AgentsBody() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | undefined>(agents[0]?.id);
  const activeAgent = agents.find((a) => a.id === activeId);
  const myAgents = agents.filter((a) => a.category === "my");
  const builtInAgents = agents.filter((a) => a.category === "built-in");

  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-r border-border bg-background px-3 py-4">
        <h3 className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("customize.agents.my")}
        </h3>
        <div className="flex flex-col gap-1">
          {myAgents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              active={a.id === activeId}
              onClick={() => setActiveId(a.id)}
            />
          ))}
        </div>
        <h3 className="mb-2 mt-6 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("customize.agents.builtIn")}
        </h3>
        <div className="flex flex-col gap-1">
          {builtInAgents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              active={a.id === activeId}
              onClick={() => setActiveId(a.id)}
            />
          ))}
        </div>
      </aside>
      <section className="flex flex-1 flex-col overflow-y-auto px-8 py-6">
        {activeAgent ? (
          <AgentDetail agent={activeAgent} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("customize.agents.empty")}
          </p>
        )}
      </section>
    </div>
  );
}
