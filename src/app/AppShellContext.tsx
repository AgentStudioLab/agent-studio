import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
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
  asideOpen: boolean;
  toggleAside: () => void;
  preview: PreviewState;
  openPreview: (file: MockFile) => void;
  closePreview: () => void;
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
  const [asideOpen, setAsideOpen] = useState(true);
  const [preview, setPreview] = useState<PreviewState>({ file: null, open: false });
  const value = useMemo(
    () => ({
      currentView,
      setView,
      hideSidebar: FULLSCREEN_VIEWS.includes(currentView),
      asideOpen,
      toggleAside: () => setAsideOpen((v) => !v),
      preview,
      openPreview: (file: MockFile) => setPreview({ file, open: true }),
      closePreview: () => setPreview((p) => ({ ...p, open: false })),
    }),
    [currentView, asideOpen, preview],
  );
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used inside AppShellProvider");
  return ctx;
}
