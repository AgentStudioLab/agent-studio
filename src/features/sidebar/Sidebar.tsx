import { SidebarContent } from "@/features/sidebar/SidebarContent";

export function Sidebar() {
  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground"
      style={{ borderRight: "1px solid hsl(var(--sidebar-border))" }}
    >
      <SidebarContent />
    </aside>
  );
}
