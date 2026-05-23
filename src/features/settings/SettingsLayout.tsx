import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "account", labelKey: "settings.nav.account" },
  { to: "model", labelKey: "settings.nav.model" },
  { to: "permissions", labelKey: "settings.nav.permissions" },
  { to: "appearance", labelKey: "settings.nav.appearance" },
] as const;

export function SettingsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("settings.back")}
        >
          <ChevronLeft className="size-4" />
        </button>
        <h1 className="text-sm font-medium text-foreground">
          {t("settings.title")}
        </h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[240px] shrink-0 flex-col gap-1 border-r border-border bg-sidebar px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )
              }
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background px-8 py-8">
          <div className="flex max-w-2xl flex-col gap-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
