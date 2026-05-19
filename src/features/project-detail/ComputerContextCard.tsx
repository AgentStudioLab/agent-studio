import { FolderOpen, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsibleCard } from "@/features/project-detail/CollapsibleCard";

interface ComputerContextCardProps {
  context?: Array<{ path: string; folderName: string }>;
  onAdd?: () => void;
  /** When true, render only the heading + list without the outer CollapsibleCard wrapper. */
  embedded?: boolean;
}

function Body({ context }: { context?: ComputerContextCardProps["context"] }) {
  const { t } = useTranslation();
  if (!context || context.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("projectDetail.empty.computerContext")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {context.map((entry) => (
        <li
          key={entry.path}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
        >
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              {entry.folderName}
            </div>
            <div className="truncate text-xs text-muted-foreground">{entry.path}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ComputerContextCard({
  context,
  onAdd,
  embedded = false,
}: ComputerContextCardProps) {
  const { t } = useTranslation();
  if (embedded) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("projectDetail.sections.computerContext")}
        </h3>
        <Body context={context} />
      </div>
    );
  }
  return (
    <CollapsibleCard
      title={t("projectDetail.sections.computerContext")}
      action={
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3" /> {t("projectDetail.actions.add")}
        </button>
      }
    >
      <Body context={context} />
    </CollapsibleCard>
  );
}
