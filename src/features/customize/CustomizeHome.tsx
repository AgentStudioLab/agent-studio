import { Wrench, Link as LinkIcon, ScrollText, Puzzle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export type CustomizeHomeAction = "connect" | "skills" | "plugins";

interface CustomizeHomeProps {
  onSelectAction?: (action: CustomizeHomeAction) => void;
}

export function CustomizeHome({ onSelectAction }: CustomizeHomeProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center px-8 py-12">
      <div className="flex max-w-2xl flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Wrench className="size-8" />
        </div>
        <h1 className="font-serif text-[28px] font-normal text-foreground">
          {t("customize.home.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("customize.home.subtitle")}
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ActionCard
            icon={LinkIcon}
            title={t("customize.home.connect.title")}
            description={t("customize.home.connect.description")}
            onClick={() => onSelectAction?.("connect")}
          />
          <ActionCard
            icon={ScrollText}
            title={t("customize.home.skills.title")}
            description={t("customize.home.skills.description")}
            onClick={() => onSelectAction?.("skills")}
          />
          <ActionCard
            icon={Puzzle}
            title={t("customize.home.plugins.title")}
            description={t("customize.home.plugins.description")}
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
