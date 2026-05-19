import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Briefcase,
  Clock,
  PanelLeftClose,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppShell } from "@/app/AppShellContext";
import type { MockPinnedItem, MockRecentItem } from "@/lib/mock/types";
import { NavItem } from "@/features/sidebar/NavItem";
import { PinnedItem } from "@/features/sidebar/PinnedItem";
import { RecentItem } from "@/features/sidebar/RecentItem";
import { UpdateCard } from "@/features/sidebar/UpdateCard";
import { UserBar } from "@/features/sidebar/UserBar";

const APP_VERSION = "0.1.0";

/**
 * Inner content of the sidebar: top icon row + nav + pinned + recents + footer.
 * Used both in the docked full Sidebar (260px aside) and in the floating
 * mini-sidebar popover that appears when the sidebar is collapsed.
 */
export function SidebarContent() {
  const {
    currentView,
    setView,
    sidebarCollapsed,
    setSidebarCollapsed,
    pinned,
    setPinned,
    recents,
    setRecents,
  } = useAppShell();
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  const handlePin = (recent: MockRecentItem) => {
    setRecents((prev) => prev.filter((r) => r.id !== recent.id));
    setPinned((prev) => [
      ...prev,
      { id: recent.id, kind: "task", name: recent.title },
    ]);
  };

  const handleUnpin = (item: MockPinnedItem) => {
    setPinned((prev) => prev.filter((p) => p.id !== item.id));
    setRecents((prev) => [
      {
        id: item.id,
        kind: item.kind === "project" ? "conversation" : "task",
        title: item.name,
        time: "just now",
        ...(item.kind === "task" ? { status: "pending" as const } : {}),
      },
      ...prev,
    ]);
  };

  const handleRemoveRecent = (id: string) =>
    setRecents((prev) => prev.filter((r) => r.id !== id));

  const handleRemovePinned = (id: string) =>
    setPinned((prev) => prev.filter((p) => p.id !== id));

  const toggleLabel = sidebarCollapsed
    ? t("sidebar.toggle.open")
    : t("sidebar.toggle.collapse");

  return (
    <>
      {/* Top icon bar */}
      <div className="flex shrink-0 items-center gap-1 px-3 pt-3">
        <button
          type="button"
          aria-label={toggleLabel}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="rounded-md p-1.5 text-[hsl(var(--text-400))] transition-colors hover:bg-[hsl(var(--bg-100))] hover:text-[hsl(var(--text-200))]"
        >
          <PanelLeftClose className="size-[15px]" />
        </button>
        <button
          type="button"
          aria-label={t("sidebar.search.ariaLabel")}
          onClick={() => setSearchOpen(true)}
          className="rounded-md p-1.5 text-[hsl(var(--text-400))] transition-colors hover:bg-[hsl(var(--bg-100))] hover:text-[hsl(var(--text-200))]"
        >
          <Search className="size-[15px]" />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex shrink-0 flex-col gap-0.5 px-2 pt-4">
        <NavItem
          icon={Plus}
          label={t("sidebar.nav.newTask")}
          active={currentView === "new-task"}
          onClick={() => setView("new-task")}
        />
        <NavItem
          icon={Briefcase}
          label={t("sidebar.nav.projects")}
          active={
            currentView === "projects" || currentView === "project-detail"
          }
          onClick={() => setView("projects")}
        />
        <NavItem
          icon={Clock}
          label={t("sidebar.nav.scheduled")}
          active={currentView === "scheduled-list"}
          onClick={() => setView("scheduled-list")}
        />
        <NavItem
          icon={Sparkles}
          label={t("sidebar.nav.customize")}
          active={currentView === "customize"}
          onClick={() => setView("customize")}
        />
      </nav>

      {/* Pinned */}
      {pinned.length > 0 && (
        <>
          <div className="px-3 pb-1 pt-5">
            <div className="px-2 text-[12px] font-medium text-[hsl(var(--text-400))]">
              {t("sidebar.sections.pinned")}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-0.5 px-2">
            {pinned.map((item) => (
              <PinnedItem
                key={item.id}
                item={item}
                onClick={() =>
                  setView(item.kind === "project" ? "project-detail" : "task")
                }
                onUnpin={() => handleUnpin(item)}
                onDelete={() => handleRemovePinned(item.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Recents */}
      <div className="px-3 pb-1 pt-4">
        <div className="px-2 text-[12px] font-medium text-[hsl(var(--text-400))]">
          {t("sidebar.sections.recents")}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {recents.map((item) => (
          <RecentItem
            key={item.id}
            item={item}
            onClick={() => setView("task")}
            onPin={() => handlePin(item)}
            onDelete={() => handleRemoveRecent(item.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div
        className="flex shrink-0 flex-col gap-2 px-3 pb-3 pt-2"
        style={{ borderTop: "1px solid hsl(var(--border-300) / 0.12)" }}
      >
        <div className="pt-2">
          <UpdateCard version={`v${APP_VERSION}`} />
        </div>
        <UserBar
          onSettings={() => setView("settings")}
          onLogout={() => console.log("logout")}
        />
      </div>

      {/* ⌘K placeholder dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sidebar.search.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("sidebar.search.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSearchOpen(false)}>
              {t("sidebar.search.ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
