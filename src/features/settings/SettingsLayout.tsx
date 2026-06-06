import { BarChart3, Brain, Cable, ChevronLeft, Palette, ShieldCheck, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PageColumn } from "@/shared/layout/PageColumn";

const NAV_ITEMS = [
  { to: "account", labelKey: "settings.nav.account", icon: User },
  { to: "model", labelKey: "settings.nav.model", icon: Brain },
  { to: "permissions", labelKey: "settings.nav.permissions", icon: ShieldCheck },
  { to: "remote-connections", labelKey: "settings.nav.remoteConnections", icon: Cable },
  { to: "appearance", labelKey: "settings.nav.appearance", icon: Palette },
  { to: "usage", labelKey: "settings.nav.usage", icon: BarChart3 },
] as const;

export function SettingsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* `pl-20` reserves the 80px macOS traffic-light slot — this is a
       *  hideSidebar route, so the MacTitlebar overlay has no sidebar
       *  segment to claim that zone. */}
      <header
        data-tauri-drag-region
        className="flex h-9 shrink-0 items-center gap-3 border-b border-border pl-20 pr-4"
      >
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-state-hover hover:text-foreground"
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
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-state-selected text-foreground"
                      : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background px-8 py-8">
          <PageColumn className="flex max-w-2xl flex-col gap-10">
            <Outlet />
          </PageColumn>
        </main>
      </div>
    </div>
  );
}
