import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useRecentConversations,
  usePinnedConversations,
  useTogglePinMutation,
  useArchiveConversationMutation,
  useDeleteConversationMutation,
} from "@/lib/data/queries";
import {
  useAgentWorkspaces,
  useUpdateAgentWorkspaceMutation,
} from "@/lib/data/agent-queries";
import { MoveToAgentSubmenu } from "@/shared/MoveToAgentSubmenu";
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
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RenameDialog } from "@/shared/RenameDialog";
import { useAppShell } from "@/app/AppShellContext";
import type { MockPinnedItem, MockRecentItem } from "@/lib/mock/types";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useThreadStatuses } from "@/lib/agui/react/useThreadStatuses";
import { useThreadUnread } from "@/lib/agui/react/useThreadUnread";
import { NavItem } from "@/features/sidebar/NavItem";
import { PinnedItem } from "@/features/sidebar/PinnedItem";
import { RecentItem } from "@/features/sidebar/RecentItem";
import { ScheduledNavItem } from "@/features/sidebar/ScheduledNavItem";
import { UserBar } from "@/features/sidebar/UserBar";
import { useScheduledTasks } from "@/lib/data/scheduled-queries";
import { useAuth } from "@/features/auth/useAuth";

import type { Status } from "@/lib/mock/types";
import type { ThreadStatusItem } from "@/lib/agui/react/useThreadStatuses";

/**
 * `completed` is the only status that participates in the unread/read split:
 *   - unread (user hasn't opened this thread since the run finished) → "done"
 *     → green ✓
 *   - read → "pending" → gray hollow circle (the same visual as idle threads,
 *     which is intentional: "nothing here demanding your attention").
 * Other terminal states keep their distinctive icon regardless of read state
 * (failed = red ✗, cancelled = gray ⊘) so the user always notices errors and
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
  // Section collapse state lives in AppShellContext — see the note there:
  // SidebarContent renders in two places + remounts on nav, so local state
  // can't persist. (The global search dialog is mounted at the App level and
  // driven by searchOpen in the same context.)
  const { sidebarCollapsedSections, toggleSidebarSection } = useAppShell();

  const { data: recentsData = [] } = useRecentConversations();
  const { data: pinnedData = [] } = usePinnedConversations();
  const { data: threadStatuses = [] } = useThreadStatuses();
  const { data: scheduledTasks = [] } = useScheduledTasks();
  const { data: agentsData = [] } = useAgentWorkspaces();
  const auth = useAuth();
  const togglePinMutation = useTogglePinMutation();
  const updateAgentMutation = useUpdateAgentWorkspaceMutation();
  const archiveMutation = useArchiveConversationMutation();
  const deleteMutation = useDeleteConversationMutation();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingRename, setPendingRename] = useState<{
    id: string;
    title: string;
  } | null>(null);

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
    () =>
      pinnedData.map((c) => toPinnedItem(c, entryByThread.get(c.id), isUnread)),
    [pinnedData, entryByThread, isUnread],
  );
  // Pinned agent workspaces ride the same Pinned section, shown above pinned
  // conversations (Folder/Briefcase glyph vs the conversation status dot).
  const pinnedAgents = useMemo(
    () => agentsData.filter((a) => a.pinned),
    [agentsData],
  );
  // Group scheduler-spawned run threads by their origin task so each sidebar
  // Scheduled row can show its latest run's dot + an unviewed-run count.
  const scheduledRunsByTask = useMemo(() => {
    const m = new Map<string, ThreadStatusItem[]>();
    for (const s of threadStatuses) {
      if (!s.scheduledTaskId) continue;
      const arr = m.get(s.scheduledTaskId) ?? [];
      arr.push(s);
      m.set(s.scheduledTaskId, arr);
    }
    return m;
  }, [threadStatuses]);
  // The Scheduled row highlights when the open conversation is one of its runs.
  const activeScheduledTaskId = routeThreadId
    ? (entryByThread.get(routeThreadId)?.scheduledTaskId ?? null)
    : null;

  const handlePin = (recent: MockRecentItem) => {
    togglePinMutation.mutate({ id: recent.id, pinned: true });
  };

  const handleUnpin = (item: MockPinnedItem) => {
    togglePinMutation.mutate({ id: item.id, pinned: false });
  };

  // Archiving hides the thread from the sidebar. If the archived thread is the
  // one currently open, leave the task view first so it doesn't sit on a thread
  // that just vanished from every sidebar list.
  const handleArchive = (id: string) => {
    if (id === routeThreadId) navigate("/");
    archiveMutation.mutate({ id, archived: true });
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
          label={t("sidebar.nav.agents")}
          active={pathname === "/agents"}
          onClick={() => navigate("/agents")}
        />
        <NavItem
          icon={Clock}
          label={t("sidebar.nav.scheduled")}
          active={pathname.startsWith("/scheduled")}
          onClick={() => navigate("/scheduled")}
        />
        <NavItem
          icon={ScrollText}
          label={t("sidebar.nav.skills")}
          active={pathname.startsWith("/skills")}
          onClick={() => navigate("/skills")}
        />
      </nav>

      {/* Scheduled — the user's scheduled-task definitions, with a status dot
       *  and either the cadence label or an unviewed-run count. */}
      {scheduledTasks.length > 0 && (
        <>
          <div className="group/scheduled px-3 pb-0.5 pt-3.5">
            <button
              type="button"
              onClick={() => toggleSidebarSection("scheduled")}
              className="flex items-center gap-1 px-2 text-[11px] font-medium text-[hsl(var(--text-400))] transition-colors hover:text-[hsl(var(--text-200))]"
            >
              {t("sidebar.sections.scheduled")}
              <ChevronDown
                className={cn(
                  "size-3 opacity-0 transition-all group-hover/scheduled:opacity-100",
                  sidebarCollapsedSections.scheduled && "-rotate-90",
                )}
              />
            </button>
          </div>
          {!sidebarCollapsedSections.scheduled && (
            <div className="flex shrink-0 flex-col gap-0.5 px-2">
              {scheduledTasks.map((task) => {
                const runs = scheduledRunsByTask.get(task.id) ?? [];
                const latest = runs.reduce<ThreadStatusItem | undefined>(
                  (acc, r) => (!acc || r.updatedAt > acc.updatedAt ? r : acc),
                  undefined,
                );
                const newCount = runs.filter((r) =>
                  isUnread(r.threadId, r.lastRunId),
                ).length;
                const status = latest
                  ? aguiToMockStatus(
                      latest.status,
                      isUnread(latest.threadId, latest.lastRunId),
                    )
                  : "pending";
                return (
                  <ScheduledNavItem
                    key={task.id}
                    name={task.name}
                    status={status}
                    frequencyLabel={t(
                      `scheduled.frequencyChip.${task.frequency}`,
                    )}
                    newCount={newCount}
                    newLabel={t("sidebar.sections.scheduledNew", {
                      count: newCount,
                    })}
                    active={activeScheduledTaskId === task.id}
                    onClick={() => {
                      // The sidebar row opens the task's CONVERSATION (its latest
                      // run), not the config page. Config is reached by clicking
                      // the card on the /scheduled list. No runs yet → fall back
                      // to the config page so there's somewhere to land.
                      if (latest) {
                        if (latest.lastRunId)
                          markRead(latest.threadId, latest.lastRunId);
                        navigate(`/task/${latest.threadId}`);
                      } else {
                        navigate(`/scheduled/${task.id}`);
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Pinned — collapsible, matching Scheduled / Recents. */}
      {(pinned.length > 0 || pinnedAgents.length > 0) && (
        <>
          <div className="group/pinned px-3 pb-0.5 pt-3.5">
            <button
              type="button"
              onClick={() => toggleSidebarSection("pinned")}
              className="flex items-center gap-1 px-2 text-[11px] font-medium text-[hsl(var(--text-400))] transition-colors hover:text-[hsl(var(--text-200))]"
            >
              {t("sidebar.sections.pinned")}
              <ChevronDown
                className={cn(
                  "size-3 opacity-0 transition-all group-hover/pinned:opacity-100",
                  sidebarCollapsedSections.pinned && "-rotate-90",
                )}
              />
            </button>
          </div>
          {!sidebarCollapsedSections.pinned && (
            <div className="flex shrink-0 flex-col gap-0.5 px-2">
              {pinnedAgents.map((a) => (
                <PinnedItem
                  key={`agent-${a.id}`}
                  item={{ id: a.id, kind: "project", name: a.name }}
                  active={pathname === `/agents/${a.id}`}
                  onClick={() => navigate(`/agents/${a.id}`)}
                  onUnpin={() =>
                    updateAgentMutation.mutate({ id: a.id, patch: { pinned: false } })
                  }
                />
              ))}
              {pinned.map((item) => (
                <PinnedItem
                  key={item.id}
                  item={item}
                  active={item.id === selectedTaskId}
                  onClick={() => {
                    const runId = entryByThread.get(item.id)?.lastRunId;
                    if (runId) markRead(item.id, runId);
                    navigate(`/task/${item.id}`);
                  }}
                  onUnpin={() => void handleUnpin(item)}
                  onRename={() =>
                    setPendingRename({ id: item.id, title: item.name })
                  }
                  onArchive={() => handleArchive(item.id)}
                  onDelete={() => requestDelete(item.id)}
                  moveSlot={
                    <MoveToAgentSubmenu
                      conversationId={item.id}
                      label={t("sidebar.contextMenu.moveToAgentSpace")}
                    />
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Recents — header reveals a collapse chevron + "View all" on hover. */}
      <div className="group/recents px-3 pb-0.5 pt-3.5">
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => toggleSidebarSection("recents")}
            className="flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--text-400))] transition-colors hover:text-[hsl(var(--text-200))]"
          >
            {t("sidebar.sections.recents")}
            <ChevronDown
              className={cn(
                "size-3 opacity-0 transition-all group-hover/recents:opacity-100",
                sidebarCollapsedSections.recents && "-rotate-90",
              )}
            />
          </button>
          <button
            type="button"
            onClick={() => navigate("/tasks")}
            className="flex items-center gap-0.5 text-[11px] text-[hsl(var(--text-400))] opacity-0 transition-all hover:text-[hsl(var(--text-200))] group-hover/recents:opacity-100"
          >
            {t("sidebar.sections.viewAll")}
            <ChevronRight className="size-3" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {!sidebarCollapsedSections.recents &&
          recents.map((item) => (
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
              onRename={() =>
                setPendingRename({ id: item.id, title: item.title })
              }
              onArchive={() => handleArchive(item.id)}
              onDelete={() => requestDelete(item.id)}
              moveSlot={
                <MoveToAgentSubmenu
                  conversationId={item.id}
                  label={t("sidebar.contextMenu.moveToAgentSpace")}
                />
              }
            />
          ))}
      </div>

      {/* Footer — divider line removed per design; UpdateCard temporarily
       *  hidden until the auto-update flow is wired up. UserBar still
       *  anchored at the bottom of the sidebar, with extra top separation so
       *  the (now smaller, blended) user row stays out of the task list's way. */}
      <div className="flex shrink-0 flex-col gap-2 px-3 pb-1 pt-4">
        <UserBar
          signedIn={auth.status === "signed-in"}
          loading={auth.status === "loading"}
          userId={auth.user?.id}
          name={auth.user?.name}
          email={auth.user?.email}
          image={auth.user?.image}
          credits={auth.user?.credits.remainingCredits}
          onLogin={() => void auth.login()}
          onSettings={() => navigate("/settings")}
          onLogout={() => void auth.logout()}
        />
      </div>

      <RenameDialog
        open={pendingRename !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRename(null);
        }}
        conversationId={pendingRename?.id ?? null}
        currentTitle={pendingRename?.title ?? ""}
      />

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("sidebar.deleteDialog.cancel")}
            </AlertDialogCancel>
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
