import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useRecentConversations,
  usePinnedConversations,
  useTogglePinMutation,
  useDeleteConversationMutation,
} from "@/lib/data/queries";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Conversation } from "@/lib/data/types";
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
import { useThreadStatuses } from "@/lib/agui/react/useThreadStatuses";
import { NavItem } from "@/features/sidebar/NavItem";
import { PinnedItem } from "@/features/sidebar/PinnedItem";
import { RecentItem } from "@/features/sidebar/RecentItem";
import { UpdateCard } from "@/features/sidebar/UpdateCard";
import { UserBar } from "@/features/sidebar/UserBar";

import type { Status } from "@/lib/mock/types";
import type { ThreadStatusItem } from "@/lib/agui/react/useThreadStatuses";

function aguiToMockStatus(status: ThreadStatusItem["status"] | undefined): Status {
  switch (status) {
    case "running":
    case "awaiting_approval":
      return "active";
    case "error":
    case "cancelled":
      return "failed";
    default:
      return "done";
  }
}

function toRecentItem(
  c: Conversation,
  statusByThread: Map<string, ThreadStatusItem["status"]>,
): MockRecentItem {
  return {
    id: c.id,
    kind: "conversation",
    title: c.title,
    status: aguiToMockStatus(statusByThread.get(c.id)),
    time: new Date(c.updatedAt).toLocaleString(),
  };
}

function toPinnedItem(
  c: Conversation,
  statusByThread: Map<string, ThreadStatusItem["status"]>,
): MockPinnedItem {
  return {
    id: c.id,
    kind: "task",
    name: c.title,
    status: aguiToMockStatus(statusByThread.get(c.id)),
  };
}

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
    activeTaskId,
    setActiveTaskId,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useAppShell();
  // Pulse-dot prototype shows the selected thread with a darker fill
  // (bg-000) — only counts when the task view is the one in focus.
  const selectedTaskId = currentView === "task" ? activeTaskId : null;
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  const { data: recentsData = [] } = useRecentConversations();
  const { data: pinnedData = [] } = usePinnedConversations();
  const { data: threadStatuses = [] } = useThreadStatuses();
  const togglePinMutation = useTogglePinMutation();
  const deleteMutation = useDeleteConversationMutation();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const statusByThread = useMemo(() => {
    const m = new Map<string, ThreadStatusItem["status"]>();
    for (const t of threadStatuses) m.set(t.threadId, t.status);
    return m;
  }, [threadStatuses]);
  const recents = useMemo(
    () => recentsData.map((c) => toRecentItem(c, statusByThread)),
    [recentsData, statusByThread],
  );
  const pinned = useMemo(
    () => pinnedData.map((c) => toPinnedItem(c, statusByThread)),
    [pinnedData, statusByThread],
  );

  const handlePin = (recent: MockRecentItem) => {
    togglePinMutation.mutate({ id: recent.id, pinned: true });
  };

  const handleUnpin = (item: MockPinnedItem) => {
    togglePinMutation.mutate({ id: item.id, pinned: false });
  };

  // ContextMenu's onDelete fires immediately on click — we route through an
  // AlertDialog confirm step rather than mutating in-place. The destructive
  // action has no undo so a confirm gate is the cheapest safety net.
  const requestDelete = (id: string) => setPendingDeleteId(id);
  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    // If the deleted thread is the one currently open, leave the task view
    // before the mutation lands so the task pane doesn't try to fetch a
    // thread that's about to 404.
    if (pendingDeleteId === activeTaskId) {
      setActiveTaskId(null);
      setView("new-task");
    }
    deleteMutation.mutate(pendingDeleteId);
    setPendingDeleteId(null);
  };

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
                active={item.kind !== "project" && item.id === selectedTaskId}
                onClick={() => {
                  if (item.kind !== "project") {
                    setActiveTaskId(item.id);
                    setView("task");
                  } else {
                    setView("project-detail");
                  }
                }}
                onUnpin={() => void handleUnpin(item)}
                onDelete={() => requestDelete(item.id)}
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
            active={item.id === selectedTaskId}
            onClick={() => {
              setActiveTaskId(item.id);
              setView("task");
            }}
            onPin={() => void handlePin(item)}
            onDelete={() => requestDelete(item.id)}
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

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sidebar.deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-[hsl(var(--danger-100))] text-white hover:bg-[hsl(var(--danger-100)/0.9)]"
            >
              {t("sidebar.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
