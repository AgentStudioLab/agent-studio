import type { ReactNode } from "react";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { SidebarToggle } from "@/features/sidebar/SidebarToggle";
import { useAppShell } from "@/app/AppShellContext";

interface AppShellProps {
  main: ReactNode;
  aside?: ReactNode;
}

export function AppShell({ main, aside }: AppShellProps) {
  const { hideSidebar, sidebarCollapsed, asideOpen } = useAppShell();
  const showSidebar = !hideSidebar && !sidebarCollapsed;
  const showSidebarToggle = !hideSidebar && sidebarCollapsed;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      {showSidebar && <Sidebar />}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        {showSidebarToggle && <SidebarToggle />}
        {main}
      </main>
      {aside && asideOpen && (
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
