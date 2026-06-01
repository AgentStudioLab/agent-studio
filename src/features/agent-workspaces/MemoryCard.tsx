import { useEffect, useState } from "react";
import { ChevronRight, MessageCircle, Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AgentMemory, MemoryBlock } from "@/lib/data/types";
import {
  useAgentMemories,
  useCreateAgentMemoryMutation,
  useDeleteAgentMemoryMutation,
} from "@/lib/data/agent-memory-queries";

const BLOCK_ORDER: MemoryBlock[] = ["profile", "facts"];

/** Cross-session memory as a single collapsible "Memory" block; expands to the
 *  user-profile / facts groups. Entries delete on hover (×); each group adds via
 *  a hover pencil → modal. No persistent add inputs. */
export function MemoryCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data: memories } = useAgentMemories(agentId);
  const list = memories ?? [];

  return (
    <Collapsible className="group/memory rounded-lg bg-muted/50">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-2 py-1.5 outline-hidden">
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/memory:rotate-90" />
        <MessageCircle className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm text-foreground">{t("agentSpace.memory.title")}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 px-2 pb-2 pl-3">
        {list.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            {t("agentSpace.memory.emptyHint")}
          </p>
        )}
        {BLOCK_ORDER.map((block) => (
          <MemoryGroup
            key={block}
            agentId={agentId}
            block={block}
            entries={list.filter((m) => m.block === block)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function MemoryGroup({
  agentId,
  block,
  entries,
}: {
  agentId: string;
  block: MemoryBlock;
  entries: AgentMemory[];
}) {
  const { t } = useTranslation();
  const deleteMemory = useDeleteAgentMemoryMutation(agentId);
  const [addOpen, setAddOpen] = useState(false);
  const label =
    block === "profile"
      ? t("agentSpace.memory.blockProfile")
      : t("agentSpace.memory.blockFacts");

  return (
    <div className="group/grp flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-label={`${t("agentSpace.memory.add")} · ${label}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 outline-hidden hover:bg-state-hover hover:text-foreground group-hover/grp:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
      {entries.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {entries.map((m) => (
            <li
              key={m.id}
              className="group/row flex items-start gap-2 rounded px-1.5 py-1 hover:bg-state-hover"
            >
              <span className="min-w-0 flex-1 text-sm text-foreground">{m.content}</span>
              <button
                type="button"
                onClick={() => deleteMemory.mutate(m.id)}
                aria-label={t("agentSpace.memory.remove")}
                className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 outline-hidden hover:text-foreground group-hover/row:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddMemoryModal agentId={agentId} block={block} label={label} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AddMemoryModal({
  agentId,
  block,
  label,
  open,
  onOpenChange,
}: {
  agentId: string;
  block: MemoryBlock;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const createMemory = useCreateAgentMemoryMutation(agentId);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft("");
  }, [open]);

  const handleSave = () => {
    const content = draft.trim();
    if (content.length === 0) return;
    createMemory.mutate({ content, block }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("agentSpace.memory.addTitle", { block: label })}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
          }}
          placeholder={t("agentSpace.memory.addPlaceholder")}
          rows={4}
          className="resize-y text-sm"
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("agentSpace.memory.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={draft.trim().length === 0 || createMemory.isPending}>
            {t("agentSpace.memory.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
