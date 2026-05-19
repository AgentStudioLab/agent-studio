import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { MockFile } from "@/lib/mock/types";

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
  // navigation can carry which entity was clicked.
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  activeScheduledId: string | null;
  setActiveScheduledId: (id: string | null) => void;
  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;
  // NewTaskView → TaskView handoff: NewTaskView creates a thread, drops the
  // prompt here + navigates. TaskView reads it once and POST /ag-ui/run, clears.
  pendingFirstPrompt: { conversationId: string; text: string } | null;
  setPendingFirstPrompt: (v: { conversationId: string; text: string } | null) => void;
  // Streaming state lives in the per-thread AG-UI ChatRuntime (see useChat),
  // not here.
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({
  children,
  initialView = "new-task" as ViewKey,
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
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [pendingFirstPrompt, setPendingFirstPrompt] = useState<{
    conversationId: string;
    text: string;
  } | null>(null);

  const toggleAside = useCallback(() => setAsideOpen((v) => !v), []);
  const openPreview = useCallback(
    (file: MockFile) => setPreview({ file, open: true }),
    [],
  );
  const closePreview = useCallback(
    () => setPreview((p) => ({ ...p, open: false })),
    [],
  );

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
      activeTaskId,
      setActiveTaskId,
      pendingFirstPrompt,
      setPendingFirstPrompt,
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
      activeTaskId,
      pendingFirstPrompt,
    ],
  );
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used inside AppShellProvider");
  return ctx;
}
