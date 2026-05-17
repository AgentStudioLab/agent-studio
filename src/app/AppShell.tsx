import type { ReactNode } from "react";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { SidebarToggle } from "@/features/sidebar/SidebarToggle";
import { useAppShell } from "@/app/AppShellContext";

interface AppShellProps {
  main: ReactNode;
  aside?: ReactNode;
  /**
   * If true, the `aside` ReactNode owns its own outer element (width, border,
   * scroll). AppShell will render it directly as a sibling of <main> without
   * the default `<aside w-[320px]>` wrapper. Used by PreviewPane which
   * self-manages drag-to-resize width.
   */
  bareAside?: boolean;
}

export function AppShell({ main, aside, bareAside = false }: AppShellProps) {
  const { hideSidebar, sidebarCollapsed, asideOpen } = useAppShell();
  const showSidebar = !hideSidebar && !sidebarCollapsed;
  const showSidebarToggle = !hideSidebar && sidebarCollapsed;
  const asideVisible = aside && asideOpen;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      {showSidebar && <Sidebar />}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        {showSidebarToggle && <SidebarToggle />}
        {main}
      </main>
      {asideVisible &&
        (bareAside ? (
          aside
        ) : (
          <aside
            className="flex w-[320px] shrink-0 flex-col bg-background"
            style={{ borderLeft: "1px solid hsl(var(--border-300) / 0.12)" }}
          >
            {aside}
          </aside>
        ))}
    </div>
  );
}
