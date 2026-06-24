import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentCatalogMetadata } from "@/lib/data/types";

interface AgentPackOverviewProps {
  metadata: AgentCatalogMetadata;
  onUseSampleTask: (prompt: string) => void;
}

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export function AgentPackOverview({ metadata, onUseSampleTask }: AgentPackOverviewProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium text-foreground">{t("agentSpace.pack.title")}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{metadata.tagline}</p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">{t("agentSpace.pack.inputs")}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {metadata.inputTypes.map((input) => (
              <Chip key={input}>{input}</Chip>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">{t("agentSpace.pack.outputs")}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {metadata.outputTypes.map((output) => (
              <Chip key={output}>{output}</Chip>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">{t("agentSpace.pack.tools")}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {metadata.optionalTools.map((tool) => (
              <Chip key={tool}>{tool}</Chip>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">{t("agentSpace.pack.risks")}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {metadata.riskTags.map((risk) => (
              <Chip key={risk}>{risk}</Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-medium text-muted-foreground">
          {t("agentSpace.pack.sampleTasks")}
        </h3>
        <div className="mt-2 grid gap-2">
          {metadata.sampleTasks.map((task) => (
            <button
              key={task.title}
              type="button"
              onClick={() => onUseSampleTask(task.prompt)}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Play className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{task.title}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
