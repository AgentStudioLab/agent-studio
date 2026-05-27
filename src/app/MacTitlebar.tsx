import { PanelLeftClose, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppShell } from "@/app/AppShellContext";
import { SidebarToggle } from "@/features/sidebar/SidebarToggle";

const SIDEBAR_WIDTH = 260; // px — matches Sidebar's w-[260px]
const TRAFFIC_LIGHT_SLOT = 80; // px reserved for native macOS traffic lights

/**
 * Mac-style top bar: a 36px-tall absolute overlay anchored to the window's
 * top edge so view-level chrome (TaskHeader, RightPanel tabs) can extend up
 * underneath it instead of leaving a gap.
 *
 * The OUTER wrapper sets `pointer-events-none` — by default everything
 * inside the strip is transparent to mouse events, so a TaskHeader button
 * sitting at y=0-36 underneath the overlay still gets clicks. Then we
 * re-enable pointer events on the bands that actually need them:
 *   - Left segment (sidebar bg + traffic-light slot + collapse / search
 *     buttons): `pointer-events-auto` + `data-tauri-drag-region` so window
 *     drag works from the sidebar header strip.
 *   - SidebarToggle (only when sidebar collapsed): inline `pointer-events-
 *     auto` wrapper so the toggle button is clickable; the surrounding
 *     canvas area stays click-through.
 *
 * Trade-off: drag-to-move only fires from the sidebar segment, not the
 * canvas segment. Acceptable — that matches macOS muscle memory where the
 * traffic-light row is the canonical drag handle.
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
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex h-9 select-none">
      <div
        data-tauri-drag-region
        className="pointer-events-auto flex shrink-0 items-center gap-1 bg-sidebar"
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
      <div
        className="flex flex-1 items-center gap-1"
        style={{
          paddingLeft: sidebarVisible ? 0 : TRAFFIC_LIGHT_SLOT,
        }}
      >
        {!sidebarVisible && !hideSidebar && (
          <div className="pointer-events-auto">
            <SidebarToggle />
          </div>
        )}
      </div>
    </div>
  );
}
