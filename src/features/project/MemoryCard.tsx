import { Plus } from "lucide-react";
import { CollapsibleCard } from "@/features/project/CollapsibleCard";

interface MemoryCardProps {
  memory?: string[];
  onAdd?: () => void;
  /** When true, render only the heading + list without the outer CollapsibleCard wrapper. */
  embedded?: boolean;
}

function Body({ memory }: { memory?: string[] }) {
  if (!memory || memory.length === 0) {
    return <p className="text-sm text-muted-foreground">No memory entries.</p>;
  }
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {memory.map((entry, i) => (
        <li key={i} className="text-sm text-muted-foreground">
          {entry}
        </li>
      ))}
    </ul>
  );
}

export function MemoryCard({ memory, onAdd, embedded = false }: MemoryCardProps) {
  if (embedded) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Memory
        </h3>
        <Body memory={memory} />
      </div>
    );
  }
  return (
    <CollapsibleCard
      title="Memory"
      action={
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3" /> Add
        </button>
      }
    >
      <Body memory={memory} />
    </CollapsibleCard>
  );
}
