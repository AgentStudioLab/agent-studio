import type { ReactNode } from "react";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { useAppShell } from "@/app/AppShellContext";

interface AppShellProps {
  main: ReactNode;
  aside?: ReactNode;
}

export function AppShell({ main, aside }: AppShellProps) {
  const { hideSidebar, asideOpen } = useAppShell();
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      {!hideSidebar && <Sidebar />}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">{main}</main>
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
