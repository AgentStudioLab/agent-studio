import { useState } from "react";
import { Plus, FolderOpen, Clock, Sparkles, PanelLeftClose, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppShell } from "@/app/AppShellContext";
import { pinned as pinnedFixtures } from "@/lib/mock/pinned";
import { recents as recentFixtures } from "@/lib/mock/recents";
import type { MockPinnedItem, MockRecentItem } from "@/lib/mock/types";
import { NavItem } from "@/features/sidebar/NavItem";
import { PinnedItem } from "@/features/sidebar/PinnedItem";
import { RecentItem } from "@/features/sidebar/RecentItem";
import { UpdateCard } from "@/features/sidebar/UpdateCard";
import { UserBar } from "@/features/sidebar/UserBar";

interface SidebarProps {
  onCollapse?: () => void;
}

const APP_VERSION = "0.1.0";

export function Sidebar({ onCollapse }: SidebarProps) {
  const { currentView, setView } = useAppShell();
  const [pinned, setPinned] = useState<MockPinnedItem[]>(pinnedFixtures);
  const [recents, setRecents] = useState<MockRecentItem[]>(recentFixtures);
  const [searchOpen, setSearchOpen] = useState(false);

  const handlePin = (recent: MockRecentItem) => {
    setRecents((prev) => prev.filter((r) => r.id !== recent.id));
    setPinned((prev) => [
      ...prev,
      { id: recent.id, kind: recent.kind === "task" ? "task" : "task", name: recent.title },
    ]);
  };

  const handleUnpin = (item: MockPinnedItem) => {
    setPinned((prev) => prev.filter((p) => p.id !== item.id));
    setRecents((prev) => [
      {
        id: item.id,
        kind: item.kind === "project" ? "conversation" : "task",
        title: item.name,
        time: "just now",
        ...(item.kind === "task" ? { status: "pending" as const } : {}),
      },
      ...prev,
    ]);
  };

  const handleRemoveRecent = (id: string) => {
    setRecents((prev) => prev.filter((r) => r.id !== id));
  };

  const handleRemovePinned = (id: string) => {
    setPinned((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <>
      <aside
        className="flex h-full w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground"
        style={{ borderRight: "1px solid hsl(var(--sidebar-border))" }}
      >
        {/* Top icon bar */}
        <div className="flex h-10 items-center justify-between px-2">
          <button
            type="button"
            aria-label="Collapse sidebar"
            onClick={onCollapse}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
          >
            <PanelLeftClose className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Search (Cmd+K)"
            onClick={() => setSearchOpen(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
          >
            <Search className="size-4" />
          </button>
        </div>

        {/* Main nav */}
        <nav className="flex flex-col gap-0.5 px-2 pb-2">
          <NavItem
            icon={Plus}
            label="New task"
            active={currentView === "new-task"}
            onClick={() => setView("new-task")}
          />
          <NavItem
            icon={FolderOpen}
            label="Projects"
            active={currentView === "projects"}
            onClick={() => setView("projects")}
          />
          <NavItem
            icon={Clock}
            label="Scheduled"
            active={currentView === "scheduled-list"}
            onClick={() => setView("scheduled-list")}
          />
          <NavItem
            icon={Sparkles}
            label="Customize"
            active={currentView === "customize"}
            onClick={() => setView("customize")}
          />
        </nav>

        {/* Pinned */}
        {pinned.length > 0 && (
          <div className="flex flex-col gap-0.5 px-2 pt-2">
            <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Pinned
            </div>
            {pinned.map((item) => (
              <PinnedItem
                key={item.id}
                item={item}
                onClick={() => setView(item.kind === "project" ? "project-detail" : "task")}
                onUnpin={() => handleUnpin(item)}
                onDelete={() => handleRemovePinned(item.id)}
              />
            ))}
          </div>
        )}

        {/* Recents */}
        <div className="mt-2 flex min-h-0 flex-1 flex-col px-2">
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Recents
          </div>
          <div className="flex flex-col gap-0.5 overflow-y-auto">
            {recents.map((item) => (
              <RecentItem
                key={item.id}
                item={item}
                onClick={() => setView("task")}
                onPin={() => handlePin(item)}
                onDelete={() => handleRemoveRecent(item.id)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="mt-2 flex flex-col gap-2 px-3 pb-3 pt-2"
          style={{ borderTop: "1px solid hsl(var(--border-300) / 0.12)" }}
        >
          <UpdateCard version={`v${APP_VERSION}`} />
          <UserBar
            onSettings={() => setView("settings")}
            onLogout={() => console.log("logout")}
          />
        </div>
      </aside>

      {/* ⌘K placeholder dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search ⌘K</DialogTitle>
            <DialogDescription>
              TODO: search across tasks, projects, recents.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSearchOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
