import { Pencil } from "lucide-react";
import { CollapsibleCard } from "@/features/project/CollapsibleCard";

interface InstructionsCardProps {
  instructions?: string;
  onEdit?: () => void;
}

export function InstructionsCard({ instructions, onEdit }: InstructionsCardProps) {
  const hasInstructions = !!instructions && instructions.trim().length > 0;
  return (
    <CollapsibleCard
      title="Instructions"
      action={
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3" /> Edit
        </button>
      }
    >
      {hasInstructions ? (
        <p className="whitespace-pre-wrap text-sm text-foreground">{instructions}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No instructions yet.</p>
      )}
    </CollapsibleCard>
  );
}
