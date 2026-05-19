import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { MockFile, MockPinnedItem, MockRecentItem } from "@/lib/mock/types";
import { pinned as pinnedFixtures } from "@/lib/mock/pinned";
import { recents as recentFixtures } from "@/lib/mock/recents";

type ViewKey =
  | "new-task"
  | "task"
  | "projects"
  | "project-detail"
  | "scheduled-list"
  | "scheduled-detail"
  | "customize"
  | "settings";

const FULLSCREEN_VIEWS: ViewKey[] = ["customize", "settings"];

interface PreviewState {
  file: MockFile | null;
  open: boolean;
}

interface StreamState {
  status: "streaming" | "done" | "aborted" | "error";
  textBuffer: string;
  messageId: string | null;
  errorMessage?: string;
}

interface AppShellContextValue {
  currentView: ViewKey;
  setView: (v: ViewKey) => void;
  hideSidebar: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  asideOpen: boolean;
  toggleAside: () => void;
  preview: PreviewState;
  openPreview: (file: MockFile) => void;
  closePreview: () => void;
  // Active entity ids: persisted across view switches so that list-view → detail-view
  // navigation can carry which entity was clicked (without ids, detail views fall back
  // to the first mock fixture and silently lie about content).
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  activeScheduledId: string | null;
  setActiveScheduledId: (id: string | null) => void;
  // Sidebar pinned/recents live on the provider, not inside SidebarContent — collapsing
  // the sidebar unmounts SidebarContent and the floating popover remounts a fresh
  // instance. Local state there would discard pin/unpin/delete actions on every collapse.
  pinned: MockPinnedItem[];
  setPinned: (next: MockPinnedItem[] | ((prev: MockPinnedItem[]) => MockPinnedItem[])) => void;
  recents: MockRecentItem[];
  setRecents: (next: MockRecentItem[] | ((prev: MockRecentItem[]) => MockRecentItem[])) => void;
  streamingByConversation: Map<string, StreamState>;
  setStreamState: (conversationId: string, state: StreamState) => void;
  clearStreamState: (conversationId: string) => void;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({
  children,
  initialView = "task" as ViewKey,
}: {
  children: ReactNode;
  initialView?: ViewKey;
}) {
  const [currentView, setView] = useState<ViewKey>(initialView);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [asideOpen, setAsideOpen] = useState(true);
  const [preview, setPreview] = useState<PreviewState>({ file: null, open: false });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeScheduledId, setActiveScheduledId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<MockPinnedItem[]>(pinnedFixtures);
  const [recents, setRecents] = useState<MockRecentItem[]>(recentFixtures);
  const [streamingByConversation, setStreamingByConversation] = useState<Map<string, StreamState>>(
    new Map(),
  );

  const toggleAside = useCallback(() => setAsideOpen((v) => !v), []);

  const setStreamState = useCallback((conversationId: string, state: StreamState) => {
    setStreamingByConversation((prev) => {
      const next = new Map(prev);
      next.set(conversationId, state);
      return next;
    });
  }, []);

  const clearStreamState = useCallback((conversationId: string) => {
    setStreamingByConversation((prev) => {
      const next = new Map(prev);
      next.delete(conversationId);
      return next;
    });
  }, []);
  const openPreview = useCallback((file: MockFile) => setPreview({ file, open: true }), []);
  const closePreview = useCallback(() => setPreview((p) => ({ ...p, open: false })), []);

  const value = useMemo<AppShellContextValue>(
    () => ({
      currentView,
      setView,
      hideSidebar: FULLSCREEN_VIEWS.includes(currentView),
      sidebarCollapsed,
      setSidebarCollapsed,
      asideOpen,
      toggleAside,
      preview,
      openPreview,
      closePreview,
      activeProjectId,
      setActiveProjectId,
      activeScheduledId,
      setActiveScheduledId,
      pinned,
      setPinned,
      recents,
      setRecents,
      streamingByConversation,
      setStreamState,
      clearStreamState,
    }),
    [
      currentView,
      sidebarCollapsed,
      asideOpen,
      preview,
      toggleAside,
      openPreview,
      closePreview,
      activeProjectId,
      activeScheduledId,
      pinned,
      recents,
      streamingByConversation,
      setStreamState,
      clearStreamState,
    ],
  );
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used inside AppShellProvider");
  return ctx;
}
