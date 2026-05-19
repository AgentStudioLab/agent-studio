import { ScrollText, LayoutGrid, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type CustomizeNavSection = "home" | "skills" | "agents" | "plugins";

interface CustomizeNavProps {
  active: CustomizeNavSection;
  onChange: (section: CustomizeNavSection) => void;
}

export function CustomizeNav({ active, onChange }: CustomizeNavProps) {
  const { t } = useTranslation();
  return (
    <nav className="flex w-[240px] shrink-0 flex-col gap-1 border-r border-border bg-sidebar px-3 py-4">
      <NavLink
        active={active === "skills"}
        onClick={() => onChange("skills")}
        icon={ScrollText}
        label={t("customize.nav.skills")}
      />
      <NavLink
        active={active === "agents"}
        onClick={() => onChange("agents")}
        icon={LayoutGrid}
        label={t("customize.nav.agents")}
      />
      <div className="my-2 h-px bg-border" />
      <div className="flex items-center justify-between px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{t("customize.nav.personalPlugins")}</span>
        <button
          type="button"
          className="rounded-md p-0.5 hover:bg-muted hover:text-foreground"
          aria-label={t("customize.nav.addPersonalPlugin")}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <p className="px-2 text-xs text-muted-foreground">
        {t("customize.nav.personalPluginsHint")}
      </p>
      <button
        type="button"
        onClick={() => onChange("plugins")}
        className={cn(
          "mt-2 rounded-md px-3 py-1.5 text-left text-sm",
          active === "plugins"
            ? "bg-sidebar-accent text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        )}
      >
        {t("customize.nav.browsePlugins")}
      </button>
    </nav>
  );
}

interface NavLinkProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}

function NavLink({ active, onClick, icon: Icon, label }: NavLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
        active
          ? "bg-sidebar-accent text-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
