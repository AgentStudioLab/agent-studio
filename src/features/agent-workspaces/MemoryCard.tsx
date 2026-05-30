import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAgentMemories,
  useCreateAgentMemoryMutation,
  useDeleteAgentMemoryMutation,
} from "@/lib/data/agent-memory-queries";

/** Cross-session memory: agent-written (remember tool) + user-authored entries. */
export function MemoryCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data: memories } = useAgentMemories(agentId);
  const createMemory = useCreateAgentMemoryMutation(agentId);
  const deleteMemory = useDeleteAgentMemoryMutation(agentId);
  const [draft, setDraft] = useState("");

  const list = memories ?? [];

  const handleAdd = () => {
    const content = draft.trim();
    if (content.length === 0) return;
    createMemory.mutate(content, { onSuccess: () => setDraft("") });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium text-foreground">
          {t("agentSpace.memory.title")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("agentSpace.memory.description")}
        </p>
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
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={draft.trim().length === 0 || createMemory.isPending}
        >
          {t("agentSpace.memory.add")}
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">
          {t("agentSpace.memory.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((m) => (
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
                onClick={() => deleteMemory.mutate(m.id)}
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
