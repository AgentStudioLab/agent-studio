import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useAgentInstructions,
  useSaveAgentInstructionsMutation,
} from "@/lib/data/agent-instruction-queries";

/** Edits the agent's `<home>/CLAUDE.md` (auto-loaded into every run's prompt). */
export function InstructionsCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data } = useAgentInstructions(agentId);
  const save = useSaveAgentInstructionsMutation(agentId);
  const [draft, setDraft] = useState("");

  // Seed the editor from the server, and re-sync whenever the saved value
  // changes (initial load, or after a successful save sets the cache).
  useEffect(() => {
    setDraft(data ?? "");
  }, [data]);

  const dirty = draft !== (data ?? "");

  // Body-only: the RailSection ("Instructions") owns the card chrome + title.
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {t("agentSpace.instructions.description")}
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("agentSpace.instructions.placeholder")}
        rows={6}
        className="resize-y text-sm"
      />
      <div className="flex items-center justify-end gap-2">
        {!dirty && save.isSuccess && (
          <span className="text-xs text-muted-foreground">
            {t("agentSpace.instructions.saved")}
          </span>
        )}
        <Button
          size="sm"
          onClick={() => save.mutate(draft)}
          disabled={!dirty || save.isPending}
        >
          {t("agentSpace.instructions.save")}
        </Button>
      </div>
    </div>
  );
}
