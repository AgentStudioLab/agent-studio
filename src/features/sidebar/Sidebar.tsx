import { SidebarContent } from "@/features/sidebar/SidebarContent";

export function Sidebar() {
  // `pt-9` reserves the 36px row at the top for the MacTitlebar overlay's
  // sidebar segment (traffic lights + collapse + search). Sidebar bg fills
  // up to y=0, but the nav content starts below the overlay so nothing
  // sits under the always-on-top buttons.
  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col bg-sidebar pt-9 text-sidebar-foreground"
      style={{ borderRight: "1px solid hsl(var(--sidebar-border))" }}
    >
      <SidebarContent />
    </aside>
  );
}
