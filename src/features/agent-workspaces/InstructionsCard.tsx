import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
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
  useAgentInstructions,
  useSaveAgentInstructionsMutation,
} from "@/lib/data/agent-instruction-queries";
import { RailSection } from "./RailSection";

/** Instructions rail card: read-only preview of the agent's CLAUDE.md; the
 *  pencil action opens a modal to edit it (no inline save button). */
export function InstructionsCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data } = useAgentInstructions(agentId);
  const [editOpen, setEditOpen] = useState(false);
  const content = (data ?? "").trim();

  const pencil = (
    <button
      type="button"
      onClick={() => setEditOpen(true)}
      aria-label={t("agentSpace.instructions.edit")}
      className="shrink-0 rounded-md p-1 text-muted-foreground outline-hidden hover:bg-state-hover hover:text-foreground"
    >
      <Pencil className="size-4" />
    </button>
  );

  return (
    <>
      <RailSection title={t("agentSpace.instructions.title")} action={pencil}>
        {content ? (
          <div
            role="region"
            aria-label={t("agentSpace.instructions.title")}
            tabIndex={0}
            className="max-h-56 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md pr-1 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {/* 说明可能很长，预览区保留内部滚动，避免拖高整个右侧栏。 */}
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{content}</p>
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            {t("agentSpace.instructions.description")}
          </p>
        )}
      </RailSection>
      <EditInstructionsModal
        agentId={agentId}
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={data ?? ""}
      />
    </>
  );
}

function EditInstructionsModal({
  agentId,
  open,
  onOpenChange,
  initial,
}: {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string;
}) {
  const { t } = useTranslation();
  const save = useSaveAgentInstructionsMutation(agentId);
  const [draft, setDraft] = useState(initial);

  // Re-seed each time the modal opens (or the saved value changes).
  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const handleSave = () => {
    save.mutate(draft, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t("agentSpace.instructions.editTitle")}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("agentSpace.instructions.editPlaceholder")}
          rows={12}
          // shadcn Textarea 基类带 field-sizing-content（按内容高度，忽略 rows 属性），
          // 且 min-h-16 只有约 4 行。用 min-h 覆盖出 ≥6 行的起始高度（≈8 行）；
          // resize-y + field-sizing 仍允许内容增长与手动拖高。
          className="min-h-[180px] resize-y text-sm"
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("agentSpace.instructions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {t("agentSpace.instructions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
