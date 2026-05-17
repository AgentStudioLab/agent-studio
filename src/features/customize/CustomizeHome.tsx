import { Wrench, Link as LinkIcon, ScrollText, Puzzle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type CustomizeHomeAction = "connect" | "skills" | "plugins";

interface CustomizeHomeProps {
  onSelectAction?: (action: CustomizeHomeAction) => void;
}

export function CustomizeHome({ onSelectAction }: CustomizeHomeProps) {
  return (
    <div className="flex h-full items-center justify-center px-8 py-12">
      <div className="flex max-w-2xl flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Wrench className="size-8" />
        </div>
        <h1 className="font-serif text-3xl font-semibold text-foreground">
          Customize Agent Studio
        </h1>
        <p className="text-sm text-muted-foreground">
          Skills, connectors, and plugins shape how Agent Studio works with you.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ActionCard
            icon={LinkIcon}
            title="Connect your apps"
            description="Let Agent Studio read and write to the tools you already use."
            onClick={() => onSelectAction?.("connect")}
          />
          <ActionCard
            icon={ScrollText}
            title="Create new skills"
            description="Teach Agent Studio your processes, team norms, and expertise."
            onClick={() => onSelectAction?.("skills")}
          />
          <ActionCard
            icon={Puzzle}
            title="Browse plugins"
            description="Add pre-built knowledge for your field."
            onClick={() => onSelectAction?.("plugins")}
          />
        </div>
      </div>
    </div>
  );
}

interface ActionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick?: () => void;
}

function ActionCard({ icon: Icon, title, description, onClick }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted"
    >
      <Icon className="size-5 text-muted-foreground" />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
