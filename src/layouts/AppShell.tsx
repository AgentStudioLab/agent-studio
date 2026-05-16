import type { ReactNode } from "react";
import { Plus, FolderOpen, Clock, Sparkles } from "lucide-react";
import { useAppShell } from "@/lib/AppShellContext";

interface AppShellProps {
  main: ReactNode;
  aside?: ReactNode;
}

const NAV_ITEMS = [
  { icon: Plus, label: "New task" },
  { icon: FolderOpen, label: "Projects" },
  { icon: Clock, label: "Scheduled" },
  { icon: Sparkles, label: "Customize" },
];

export function AppShell({ main, aside }: AppShellProps) {
  // currentView read for future view switching wire-up; unused here yet
  useAppShell();
  return (
    <div className="flex h-screen min-h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside
        className="flex w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground"
        style={{ borderRight: "1px solid hsl(var(--border-300) / 0.15)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3 text-sm font-medium">Agent Studio</div>
        <nav className="flex flex-col gap-1 px-2 py-2">
          {NAV_ITEMS.map(({ icon: Icon, label }) => (
            <button
              key={label}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent"
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">{main}</main>
      {aside && (
        <aside
          className="flex w-[320px] shrink-0 flex-col bg-background"
          style={{ borderLeft: "1px solid hsl(var(--border-300) / 0.12)" }}
        >
          {aside}
        </aside>
      )}
    </div>
  );
}
