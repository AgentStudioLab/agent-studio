import { useState } from "react";
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
 *
 * UX detail: when the sidebar is collapsed via the in-sidebar collapse button,
 * the cursor is already sitting on top of this toggle — so the HoverCard would
 * fire instantly and shove a popover into the user's face. We arm hover only
 * after the cursor has moved off the trigger at least once. After that, normal
 * hover-to-open / leave-to-close behaves as expected.
 */
export function SidebarToggle() {
  const { setSidebarCollapsed } = useAppShell();
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <HoverCard
      open={open}
      onOpenChange={(next) => {
        // Always honor close requests; ignore open requests until armed.
        if (next && !armed) return;
        setOpen(next);
      }}
      openDelay={120}
      closeDelay={120}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label="Open sidebar"
          onClick={() => setSidebarCollapsed(false)}
          onMouseLeave={() => {
            if (!armed) setArmed(true);
          }}
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
