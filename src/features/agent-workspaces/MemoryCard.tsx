import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentMemory, MemoryBlock } from "@/lib/data/types";
import {
  useAgentMemories,
  useCreateAgentMemoryMutation,
  useDeleteAgentMemoryMutation,
} from "@/lib/data/agent-memory-queries";

// Soft budgets mirror the sidecar's MEMORY_BUDGETS (services/agentMemories.ts);
// keep these two numbers in sync with that source of truth.
const BLOCK_SOFT: Record<MemoryBlock, number> = { profile: 1500, facts: 2500 };
const BLOCK_ORDER: MemoryBlock[] = ["profile", "facts"];

/** Cross-session memory: agent-written (remember tool) + user-authored entries,
 *  split into 'profile' (about the user) and 'facts' (about the project/work). */
export function MemoryCard({ agentId }: { agentId: string }) {
  const { data: memories } = useAgentMemories(agentId);
  const createMemory = useCreateAgentMemoryMutation(agentId);
  const deleteMemory = useDeleteAgentMemoryMutation(agentId);
  const list = memories ?? [];

  // Body-only: the enclosing Context "Memory" subsection owns the heading.
  return (
    <div className="flex flex-col gap-4">
      {BLOCK_ORDER.map((block) => (
        <MemoryBlockSection
          key={block}
          block={block}
          entries={list.filter((m) => m.block === block)}
          adding={createMemory.isPending}
          onAdd={(content) => createMemory.mutate({ content, block })}
          onDelete={(memId) => deleteMemory.mutate(memId)}
        />
      ))}
    </div>
  );
}

function MemoryBlockSection({
  block,
  entries,
  adding,
  onAdd,
  onDelete,
}: {
  block: MemoryBlock;
  entries: AgentMemory[];
  adding: boolean;
  onAdd: (content: string) => void;
  onDelete: (memId: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const used = entries.reduce((sum, m) => sum + m.content.length, 0);
  const soft = BLOCK_SOFT[block];
  const over = used > soft;

  const handleAdd = () => {
    const content = draft.trim();
    if (content.length === 0) return;
    onAdd(content);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-foreground">
          {block === "profile"
            ? t("agentSpace.memory.blockProfile")
            : t("agentSpace.memory.blockFacts")}
        </h3>
        <span
          className={`text-[10px] tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}
        >
          {used}/{soft}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={t("agentSpace.memory.placeholder")}
          className="text-sm"
        />
        <Button size="sm" onClick={handleAdd} disabled={draft.trim().length === 0 || adding}>
          {t("agentSpace.memory.add")}
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="py-0.5 text-sm text-muted-foreground">{t("agentSpace.memory.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((m) => (
            <li
              key={m.id}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-state-hover"
            >
              <span className="mt-0.5 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {m.source === "agent"
                  ? t("agentSpace.memory.sourceAgent")
                  : t("agentSpace.memory.sourceUser")}
              </span>
              <span className="min-w-0 flex-1 text-sm text-foreground">{m.content}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(m.id)}
                aria-label={t("agentSpace.memory.remove")}
                className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
