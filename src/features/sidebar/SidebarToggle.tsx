import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PanelLeft } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useAppShell } from "@/app/AppShellContext";
import { SidebarContent } from "@/features/sidebar/SidebarContent";

/**
 * Shown in the MacTitlebar when the sidebar is collapsed: a flat icon to
 * the right of the traffic lights. Hovering it surfaces the full sidebar as
 * a floating panel; clicking re-pins the sidebar.
 *
 * UX detail: when the sidebar is collapsed via the in-sidebar collapse
 * button, the cursor is already sitting on top of this trigger — so the
 * HoverCard would fire instantly and shove the panel into the user's face.
 * We arm hover only after the cursor has moved off at least once. After
 * that, normal hover-to-open / leave-to-close behaves as expected.
 *
 * Positioning is the parent's responsibility (this component renders no
 * outer wrapper). The button itself is inline-block — the previous
 * `absolute left-3 top-2` was for the old in-main floating placement.
 */
export function SidebarToggle() {
  const { setSidebarCollapsed } = useAppShell();
  const { t } = useTranslation();
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
          aria-label={t("sidebar.toggle.open")}
          onClick={() => setSidebarCollapsed(false)}
          onMouseLeave={() => {
            if (!armed) setArmed(true);
          }}
          className="flex size-6 -translate-y-[2px] items-center justify-center rounded-md text-[hsl(var(--text-400))] transition-colors hover:bg-[hsl(var(--bg-100))] hover:text-[hsl(var(--text-200))]"
        >
          <PanelLeft className="size-[15px]" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="bottom"
        sideOffset={8}
        alignOffset={-72}
        className="flex max-h-[calc(100vh-60px)] w-[280px] flex-col overflow-hidden rounded-xl border border-[hsl(var(--border-300)/0.2)] bg-sidebar p-0 text-sidebar-foreground shadow-2xl"
      >
        <SidebarContent />
      </HoverCardContent>
    </HoverCard>
  );
}
