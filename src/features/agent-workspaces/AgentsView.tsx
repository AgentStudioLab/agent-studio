import { useState } from "react";
import { ArrowUpDown, Search, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { PageColumn } from "@/shared/layout/PageColumn";
import { AgentCard } from "@/features/agent-workspaces/AgentCard";
import { NewAgentModal } from "@/features/agent-workspaces/NewAgentModal";
import {
  buildAgentCategoryTabs,
  filterAgentsByCategory,
  type AgentCategoryTabId,
} from "@/features/agent-workspaces/agent-catalog";
import {
  useAgentWorkspaces,
  useCreateAgentWorkspaceMutation,
} from "@/lib/data/agent-queries";
import { cn } from "@/lib/utils";

export function AgentsView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: agents = [] } = useAgentWorkspaces();
  const createMutation = useCreateAgentWorkspaceMutation();
  const [modalOpen, setModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<AgentCategoryTabId>("all");
  const tabs = buildAgentCategoryTabs(agents);
  const selectedCategory = tabs.some((tab) => tab.id === activeCategory) ? activeCategory : "all";
  const visibleAgents = filterAgentsByCategory(agents, selectedCategory);

  const handleSave = (data: {
    name: string;
    avatar: string | null;
    category: Exclude<AgentCategoryTabId, "all">;
    coverImage: Exclude<AgentCategoryTabId, "all">;
    instructions: string;
  }) => {
    createMutation.mutate({
      name: data.name,
      avatar: data.avatar,
      category: data.category,
      coverImage: data.coverImage,
      instructions: data.instructions,
    });
  };

  return (
    <AppShell
      main={
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <header data-tauri-drag-region className="shrink-0 px-4 pb-5 pt-8 sm:px-8 sm:pt-12 lg:px-12">
            <PageColumn className="max-w-[1280px]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="font-serif text-[24px] font-normal leading-none text-foreground sm:text-[34px]">
                    {t("agents.title")}
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                    {t("agents.subtitle")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="size-4" /> {t("agents.newAgent")}
                  </button>
                </div>
              </div>
              <div
                role="tablist"
                aria-label={t("agents.title")}
                className="mt-6 flex flex-wrap gap-x-6 gap-y-2 overflow-hidden border-b border-border pb-0 sm:mt-7"
              >
                {tabs.map((tab) => {
                  const active = tab.id === selectedCategory;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveCategory(tab.id)}
                      className={cn(
                        "relative inline-flex shrink-0 items-center gap-1.5 pb-2 text-[13.5px] font-medium transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        active
                          ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span>{t(tab.labelKey)}</span>
                      <span
                        className={cn(
                          "text-xs font-normal tabular-nums",
                          active ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </PageColumn>
          </header>
          <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 sm:px-8 lg:px-12">
            <PageColumn className="max-w-[1280px]">
              {visibleAgents.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {visibleAgents.map((a) => (
                    <AgentCard
                      key={a.id}
                      agent={a}
                      onClick={() => navigate(`/agents/${a.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-card p-8 text-sm text-muted-foreground">
                  {agents.length === 0 ? t("agents.empty") : t("agents.filteredEmpty")}
                </div>
              )}
            </PageColumn>
          </section>
          <NewAgentModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            initialCategory={selectedCategory === "all" ? undefined : selectedCategory}
            onSave={handleSave}
          />
        </div>
      }
    />
  );
}
