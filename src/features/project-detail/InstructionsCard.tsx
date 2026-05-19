import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsibleCard } from "@/features/project-detail/CollapsibleCard";

interface InstructionsCardProps {
  instructions?: string;
  onEdit?: () => void;
}

export function InstructionsCard({ instructions, onEdit }: InstructionsCardProps) {
  const { t } = useTranslation();
  const hasInstructions = !!instructions && instructions.trim().length > 0;
  return (
    <CollapsibleCard
      title={t("projectDetail.sections.instructions")}
      action={
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3" /> {t("projectDetail.actions.edit")}
        </button>
      }
    >
      {hasInstructions ? (
        <p className="whitespace-pre-wrap text-sm text-foreground">{instructions}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("projectDetail.empty.instructions")}</p>
      )}
    </CollapsibleCard>
  );
}
