import { useState } from "react";
import { ArrowUpDown, Search, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { PageColumn } from "@/shared/layout/PageColumn";
import { AgentCard } from "@/features/agent-workspaces/AgentCard";
import { NewAgentModal } from "@/features/agent-workspaces/NewAgentModal";
import {
  useAgentWorkspaces,
  useCreateAgentWorkspaceMutation,
} from "@/lib/data/agent-queries";

export function AgentsView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: agents = [] } = useAgentWorkspaces();
  const createMutation = useCreateAgentWorkspaceMutation();
  const [modalOpen, setModalOpen] = useState(false);

  const handleSave = (data: { name: string; avatar: string | null }) => {
    createMutation.mutate({ name: data.name, avatar: data.avatar });
  };

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header data-tauri-drag-region className="px-12 pb-4 pt-12">
            <PageColumn>
              <div className="flex items-start justify-between gap-4">
                <h1 className="font-serif text-[32px] font-normal leading-none text-foreground">
                  {t("agents.title")}
                </h1>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md p-2 text-muted-foreground hover:bg-state-hover hover:text-foreground"
                    aria-label={t("agents.sort")}
                  >
                    <ArrowUpDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-2 text-muted-foreground hover:bg-state-hover hover:text-foreground"
                    aria-label={t("agents.search")}
                  >
                    <Search className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
                  >
                    <Plus className="size-4" /> {t("agents.newAgent")}
                  </button>
                </div>
              </div>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {t("agents.subtitle")}
              </p>
            </PageColumn>
          </header>
          <section className="px-12 pb-12">
            <PageColumn className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {agents.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  onClick={() => navigate(`/agents/${a.id}`)}
                />
              ))}
            </PageColumn>
          </section>
          <NewAgentModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSave={handleSave}
          />
        </div>
      }
    />
  );
}
