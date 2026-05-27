import { PanelLeftClose, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppShell } from "@/app/AppShellContext";
import { SidebarToggle } from "@/features/sidebar/SidebarToggle";

const SIDEBAR_WIDTH = 260; // px — matches Sidebar's w-[260px]
const TRAFFIC_LIGHT_SLOT = 80; // px reserved for native macOS traffic lights

/**
 * Mac-style top bar: a 36px drag region that visually continues the
 * sidebar / canvas split instead of sitting as a single uniform strip.
 *
 * The left segment matches the sidebar's width and bg, so the area around
 * the macOS traffic lights reads as part of the sidebar (no canvas-coloured
 * "缺一块" gap). Inside the left segment, right of the traffic lights, sit
 * the sidebar collapse and global-search buttons — keeps the icons aligned
 * with the system chrome (Anthropic / Cowork pattern) rather than under
 * their own row in the sidebar body.
 *
 * The right segment is canvas bg. When the sidebar is collapsed or hidden
 * the left segment width drops to 0 and a single collapse-open button is
 * exposed at the top of the canvas segment so users can bring the sidebar
 * back.
 */
export function MacTitlebar() {
  const { t } = useTranslation();
  const {
    hideSidebar,
    sidebarCollapsed,
    setSidebarCollapsed,
    setSearchOpen,
  } = useAppShell();
  const sidebarVisible = !hideSidebar && !sidebarCollapsed;
  const sidebarWidth = sidebarVisible ? SIDEBAR_WIDTH : 0;
  const toggleLabel = sidebarCollapsed
    ? t("sidebar.toggle.open")
    : t("sidebar.toggle.collapse");

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none"
    >
      {/* Tauri v2 inspects `event.target` (not the ancestor chain) when
       *  deciding whether a mousedown should start a window drag, so each
       *  visible child carries its own `data-tauri-drag-region` — otherwise
       *  clicking the left / right colour segments wouldn't trigger drag.
       *  The button elements inside are auto-excluded from drag by Tauri. */}
      <div
        data-tauri-drag-region
        className="flex shrink-0 items-center gap-1 bg-sidebar"
        style={{
          width: sidebarWidth,
          paddingLeft: sidebarVisible ? TRAFFIC_LIGHT_SLOT : 0,
          borderRight:
            sidebarWidth > 0
              ? "1px solid hsl(var(--sidebar-border))"
              : undefined,
        }}
      >
        {sidebarVisible && (
          <>
            <button
              type="button"
              aria-label={toggleLabel}
              onClick={() => setSidebarCollapsed(true)}
              className="flex size-6 -translate-y-[2px] items-center justify-center rounded-md text-[hsl(var(--text-400))] transition-colors hover:bg-[hsl(var(--bg-100))] hover:text-[hsl(var(--text-200))]"
            >
              <PanelLeftClose className="size-[15px]" />
            </button>
            <button
              type="button"
              aria-label={t("sidebar.search.ariaLabel")}
              onClick={() => setSearchOpen(true)}
              className="flex size-6 -translate-y-[2px] items-center justify-center rounded-md text-[hsl(var(--text-400))] transition-colors hover:bg-[hsl(var(--bg-100))] hover:text-[hsl(var(--text-200))]"
            >
              <Search className="size-[15px]" />
            </button>
          </>
        )}
      </div>
      {/* Right segment: canvas bg + drag region. When the sidebar is
       *  collapsed/hidden, the <SidebarToggle> button sits here (right of
       *  the traffic-light slot) and surfaces the sidebar as a floating
       *  hover panel — matches the reference UX where the toggle lives on
       *  the same row as the macOS traffic lights, not floating in main. */}
      <div
        data-tauri-drag-region
        className="flex flex-1 items-center gap-1 bg-background"
        style={{
          paddingLeft: sidebarVisible ? 0 : TRAFFIC_LIGHT_SLOT,
        }}
      >
        {!sidebarVisible && !hideSidebar && <SidebarToggle />}
      </div>
    </div>
  );
}
