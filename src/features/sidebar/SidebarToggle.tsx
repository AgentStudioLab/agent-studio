import { PanelLeft } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useAppShell } from "@/app/AppShellContext";
import { SidebarContent } from "@/features/sidebar/SidebarContent";

/**
 * Shown when the sidebar is collapsed. Renders a small icon at top-left of
 * the main area. Hovering shows the full sidebar content as a popover;
 * clicking the icon expands the sidebar fully.
 */
export function SidebarToggle() {
  const { setSidebarCollapsed } = useAppShell();
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label="Open sidebar"
          onClick={() => setSidebarCollapsed(false)}
          className="absolute left-3 top-2 z-40 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeft className="size-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="flex max-h-[calc(100vh-80px)] w-[260px] flex-col overflow-hidden bg-sidebar p-0 text-sidebar-foreground"
      >
        <SidebarContent />
      </HoverCardContent>
    </HoverCard>
  );
}
