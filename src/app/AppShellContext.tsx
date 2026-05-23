import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import type { MockFile } from "@/lib/mock/types";

// Routes that render their own full-bleed layout — Sidebar should NOT show.
// Kept as a Set for O(1) membership checks; pathname comparison handles
// nested URLs (e.g. /customize/skills) via .startsWith.
const FULLSCREEN_ROUTES = ["/customize", "/settings"];

interface PreviewState {
  file: MockFile | null;
  open: boolean;
}

interface AppShellContextValue {
  hideSidebar: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  asideOpen: boolean;
  toggleAside: () => void;
  preview: PreviewState;
  openPreview: (file: MockFile) => void;
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
  // not here. Entity ids (threadId, projectId, scheduledId) live in the URL
  // — consume them via `useParams` in the corresponding view.
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [asideOpen, setAsideOpen] = useState(true);
  const [preview, setPreview] = useState<PreviewState>({ file: null, open: false });
  const [pendingFirstPrompt, setPendingFirstPrompt] = useState<{
    conversationId: string;
    text: string;
    permissionMode?: "ask" | "act-without-asking";
    model?: string;
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

  // Sidebar visibility is now derived from the route, not from a context
  // setting — eliminates the "set view + forget to also set hideSidebar"
  // class of bug.
  const hideSidebar = FULLSCREEN_ROUTES.some((p) =>
    location.pathname.startsWith(p),
  );

  const value = useMemo<AppShellContextValue>(
    () => ({
      hideSidebar,
      sidebarCollapsed,
      setSidebarCollapsed,
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
