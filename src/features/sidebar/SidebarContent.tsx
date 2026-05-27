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
import { Briefcase, Clock, Plus, Sparkles } from "lucide-react";
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
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useThreadStatuses } from "@/lib/agui/react/useThreadStatuses";
import { useThreadUnread } from "@/lib/agui/react/useThreadUnread";
import { NavItem } from "@/features/sidebar/NavItem";
import { PinnedItem } from "@/features/sidebar/PinnedItem";
import { RecentItem } from "@/features/sidebar/RecentItem";
import { UserBar } from "@/features/sidebar/UserBar";

import type { Status } from "@/lib/mock/types";
import type { ThreadStatusItem } from "@/lib/agui/react/useThreadStatuses";

/**
 * `completed` is the only status that participates in the unread/read split:
 *   - unread (user hasn't opened this thread since the run finished) → "done"
 *     → green ✓
 *   - read → "pending" → gray hollow circle (the same visual as idle threads,
 *     which is intentional: "nothing here demanding your attention").
 * Other terminal states keep their distinctive icon regardless of read state
 * (failed = red ✗, cancelled = gray −) so the user always notices errors and
 * remembers their own stops.
 */
function aguiToMockStatus(
  status: ThreadStatusItem["status"] | undefined,
  isUnread: boolean,
): Status {
  switch (status) {
    case "running":
      return "active";
    case "awaiting_approval":
      return "awaiting";
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "completed":
      return isUnread ? "done" : "pending";
    case "idle":
    default:
      return "pending";
  }
}

function toRecentItem(
  c: Conversation,
  entry: ThreadStatusItem | undefined,
  isUnread: (threadId: string, lastRunId: string | null | undefined) => boolean,
): MockRecentItem {
  return {
    id: c.id,
    kind: "conversation",
    title: c.title,
    status: aguiToMockStatus(entry?.status, isUnread(c.id, entry?.lastRunId)),
    time: new Date(c.updatedAt).toLocaleString(),
  };
}

function toPinnedItem(
  c: Conversation,
  entry: ThreadStatusItem | undefined,
  isUnread: (threadId: string, lastRunId: string | null | undefined) => boolean,
): MockPinnedItem {
  return {
    id: c.id,
    kind: "task",
    name: c.title,
    status: aguiToMockStatus(entry?.status, isUnread(c.id, entry?.lastRunId)),
  };
}

/**
 * Inner content of the sidebar: top icon row + nav + pinned + recents + footer.
 * Used both in the docked full Sidebar (260px aside) and in the floating
 * mini-sidebar popover that appears when the sidebar is collapsed.
 */
export function SidebarContent() {
  const navigate = useNavigate();
  const location = useLocation();
  // URL is the source of truth for "which view is active". useMatch would
  // also work but a single useParams + a substring check on pathname is
  // enough for the few sidebar slots we light up.
  const { threadId: routeThreadId } = useParams<{ threadId: string }>();
  const pathname = location.pathname;
  // Pulse-dot prototype shows the selected thread with a darker fill
  // (bg-000) — only counts when the task view is the one in focus.
  const selectedTaskId = routeThreadId ?? null;
  const { t } = useTranslation();
  // searchOpen is shared with MacTitlebar (which renders the search trigger),
  // so it lives in AppShellContext rather than local state here.
  const { searchOpen, setSearchOpen } = useAppShell();

  const { data: recentsData = [] } = useRecentConversations();
  const { data: pinnedData = [] } = usePinnedConversations();
  const { data: threadStatuses = [] } = useThreadStatuses();
  const togglePinMutation = useTogglePinMutation();
  const deleteMutation = useDeleteConversationMutation();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { isUnread, markRead } = useThreadUnread();

  const entryByThread = useMemo(() => {
    const m = new Map<string, ThreadStatusItem>();
    for (const t of threadStatuses) m.set(t.threadId, t);
    return m;
  }, [threadStatuses]);
  // Hide already-pinned conversations from Recents so a single thread doesn't
  // appear in both sections. /conversations (recents) returns all threads by
  // updated_at; only the client knows the union state at render time.
  const recents = useMemo(() => {
    const pinnedIds = new Set(pinnedData.map((c) => c.id));
    return recentsData
      .filter((c) => !pinnedIds.has(c.id))
      .map((c) => toRecentItem(c, entryByThread.get(c.id), isUnread));
  }, [recentsData, pinnedData, entryByThread, isUnread]);
  const pinned = useMemo(
    () => pinnedData.map((c) => toPinnedItem(c, entryByThread.get(c.id), isUnread)),
    [pinnedData, entryByThread, isUnread],
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
    if (pendingDeleteId === routeThreadId) {
      navigate("/");
    }
    deleteMutation.mutate(pendingDeleteId);
    setPendingDeleteId(null);
  };

  return (
    <>
      {/* Main nav — collapse / search controls now live in MacTitlebar (next
       *  to the traffic lights) so the sidebar header section can start with
       *  the navigation items directly. */}
      <nav className="flex shrink-0 flex-col gap-0.5 px-2 pt-3">
        <NavItem
          icon={Plus}
          label={t("sidebar.nav.newTask")}
          active={pathname === "/"}
          onClick={() => navigate("/")}
        />
        <NavItem
          icon={Briefcase}
          label={t("sidebar.nav.projects")}
          active={pathname.startsWith("/projects")}
          onClick={() => navigate("/projects")}
        />
        <NavItem
          icon={Clock}
          label={t("sidebar.nav.scheduled")}
          active={pathname.startsWith("/scheduled")}
          onClick={() => navigate("/scheduled")}
        />
        <NavItem
          icon={Sparkles}
          label={t("sidebar.nav.customize")}
          active={pathname === "/customize"}
          onClick={() => navigate("/customize")}
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
                    const runId = entryByThread.get(item.id)?.lastRunId;
                    if (runId) markRead(item.id, runId);
                    navigate(`/task/${item.id}`);
                  } else {
                    navigate(`/projects/${item.id}`);
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
              const runId = entryByThread.get(item.id)?.lastRunId;
              if (runId) markRead(item.id, runId);
              navigate(`/task/${item.id}`);
            }}
            onPin={() => void handlePin(item)}
            onDelete={() => requestDelete(item.id)}
          />
        ))}
      </div>

      {/* Footer — divider line removed per design; UpdateCard temporarily
       *  hidden until the auto-update flow is wired up. UserBar still
       *  anchored at the bottom of the sidebar. */}
      <div className="flex shrink-0 flex-col gap-2 px-3 pb-3 pt-2">
        <UserBar
          onSettings={() => navigate("/settings")}
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
