import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { MockFile } from "@/lib/mock/types";

// Routes that render their own full-bleed layout — Sidebar should NOT show.
// Kept as a Set for O(1) membership checks; pathname comparison handles
// nested URLs (e.g. /customize/skills) via .startsWith.
const FULLSCREEN_ROUTES = ["/customize", "/settings"];

interface PreviewState {
  file: MockFile | null;
  open: boolean;
  /** Sandbox cwd for `/files/content`. Omitted → caller uses the conversation
   *  cwd; set when previewing a file outside cwd (e.g. a mounted folder). */
  workingDir?: string | null;
}

/** Collapsible sidebar section groups (all default-expanded). */
export type SidebarSection = "scheduled" | "pinned" | "recents";

interface AppShellContextValue {
  hideSidebar: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Sidebar global search dialog. Lifted from SidebarContent so the titlebar
   *  (which lives outside the sidebar's DOM tree) can open it too. */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /**
   * Collapsed/expanded state of the sidebar's section groups. Lives here (not
   * in SidebarContent) because SidebarContent is rendered twice — the docked
   * Sidebar and the collapsed-sidebar floating popover — and remounts on
   * navigation; local state would reset. App-level state is in-memory only, so
   * it survives view switches but resets when the app is closed.
   */
  sidebarCollapsedSections: Record<SidebarSection, boolean>;
  toggleSidebarSection: (section: SidebarSection) => void;
  asideOpen: boolean;
  toggleAside: () => void;
  preview: PreviewState;
  openPreview: (file: MockFile, workingDir?: string | null) => void;
  closePreview: () => void;
  // NewTaskView → TaskView handoff: NewTaskView creates a thread, drops the
  // prompt here + navigates. TaskView reads it once and POST /ag-ui/run, clears.
  // permissionMode is carried so the first turn honors the dropdown choice the
  // user made on the home screen (no separate "ask/act" picker on TaskView's
  // input is needed before the first send).
  pendingFirstPrompt: {
    conversationId: string;
    text: string;
    permissionMode?: "ask" | "act-without-asking";
    model?: string;
  } | null;
  setPendingFirstPrompt: (
    v: {
      conversationId: string;
      text: string;
      permissionMode?: "ask" | "act-without-asking";
      model?: string;
    } | null,
  ) => void;
  // Streaming state lives in the per-thread AG-UI ChatRuntime (see useChat),
  // not here. Entity ids (threadId, agentWorkspaceId, scheduledId) live in the URL
  // — consume them via `useParams` in the corresponding view.
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsedSections, setSidebarCollapsedSections] = useState<
    Record<SidebarSection, boolean>
  >({ scheduled: false, pinned: false, recents: false });
  const [asideOpen, setAsideOpen] = useState(true);
  const [preview, setPreview] = useState<PreviewState>({ file: null, open: false });
  const [pendingFirstPrompt, setPendingFirstPrompt] = useState<{
    conversationId: string;
    text: string;
    permissionMode?: "ask" | "act-without-asking";
    model?: string;
  } | null>(null);

  const toggleAside = useCallback(() => setAsideOpen((v) => !v), []);
  const toggleSidebarSection = useCallback((section: SidebarSection) => {
    setSidebarCollapsedSections((s) => ({ ...s, [section]: !s[section] }));
  }, []);
  const openPreview = useCallback(
    (file: MockFile, workingDir?: string | null) =>
      setPreview({ file, open: true, workingDir: workingDir ?? null }),
    [],
  );
  const closePreview = useCallback(
    () => setPreview((p) => ({ ...p, open: false })),
    [],
  );

  // Sidebar visibility is now derived from the route, not from a context
  // setting — eliminates the "set view + forget to also set hideSidebar"
  // class of bug.
  const hideSidebar = FULLSCREEN_ROUTES.some((p) =>
    location.pathname.startsWith(p),
  );

  // PreviewPane state is app-wide, not thread-scoped. Without this reset,
  // switching threads (or going to /new) would keep the previous thread's
  // file mounted — `useFileContent` then rejects it as outside the new
  // thread's cwd ("文件不在工作目录内"). Clearing on pathname change is
  // intentional: any preview the user wants on the new page must be
  // re-opened explicitly.
  useEffect(() => {
    setPreview({ file: null, open: false });
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key !== "," && event.code !== "Comma") return;

      event.preventDefault();
      navigate("/settings");
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const value = useMemo<AppShellContextValue>(
    () => ({
      hideSidebar,
      sidebarCollapsed,
      setSidebarCollapsed,
      searchOpen,
      setSearchOpen,
      sidebarCollapsedSections,
      toggleSidebarSection,
      asideOpen,
      toggleAside,
      preview,
      openPreview,
      closePreview,
      pendingFirstPrompt,
      setPendingFirstPrompt,
    }),
    [
      hideSidebar,
      sidebarCollapsed,
      searchOpen,
      sidebarCollapsedSections,
      toggleSidebarSection,
      asideOpen,
      toggleAside,
      preview,
      openPreview,
      closePreview,
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
