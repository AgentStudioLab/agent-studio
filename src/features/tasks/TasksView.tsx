import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { AppShell } from "@/app/AppShell";
import { cn } from "@/lib/utils";
import type { ArchivedFilter } from "@/lib/data/conversations";
import {
  useArchiveConversationMutation,
  useConversationsList,
  useDeleteConversationMutation,
  useTogglePinMutation,
} from "@/lib/data/queries";
import { TaskListRow } from "@/features/tasks/TaskListRow";
import { RenameDialog } from "@/shared/RenameDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TABS: ArchivedFilter[] = ["active", "archived", "all"];

export function TasksView() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ArchivedFilter>("active");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingRename, setPendingRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: items = [] } = useConversationsList(tab);
  const togglePin = useTogglePinMutation();
  const archive = useArchiveConversationMutation();
  const del = useDeleteConversationMutation();

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => c.title.toLowerCase().includes(q));
  }, [items, query]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const emptyMessage = query.trim()
    ? t("tasks.empty.noResults")
    : t(`tasks.empty.${tab}`);

  return (
    <>
      <AppShell
        main={
          <div className="flex h-full flex-col overflow-hidden">
            <header
              data-tauri-drag-region
              className="flex shrink-0 items-center justify-between gap-4 px-12 pt-12 pb-6"
            >
              <h1 className="font-serif text-[32px] font-normal leading-none text-foreground">
                {t("tasks.title")}
              </h1>
              <div className="flex items-center gap-2">
                {searchOpen ? (
                  <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-border px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                    <Search className="size-4 shrink-0 text-muted-foreground" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") closeSearch();
                      }}
                      placeholder={t("tasks.search.placeholder")}
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={closeSearch}
                      aria-label={t("tasks.search.clear")}
                      className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label={t("tasks.search.open")}
                    className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground"
                  >
                    <Search className="size-[18px]" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="h-9 rounded-lg bg-foreground px-3.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                >
                  {t("tasks.newTask")}
                </button>
              </div>
            </header>

            <div className="flex shrink-0 items-center gap-1 px-12 pb-4">
              {TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                    tab === id
                      ? "bg-state-selected text-foreground"
                      : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
                  )}
                >
                  {t(`tasks.tabs.${id}`)}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-9 pb-12">
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-sm text-muted-foreground">
                  {emptyMessage}
                </p>
              ) : (
                filtered.map((c) => (
                  <TaskListRow
                    key={c.id}
                    conversation={c}
                    locale={i18n.language}
                    onOpen={() => navigate(`/task/${c.id}`)}
                    onPinToggle={() =>
                      togglePin.mutate({ id: c.id, pinned: !c.pinned })
                    }
                    onRename={() =>
                      setPendingRename({ id: c.id, title: c.title })
                    }
                    onArchiveToggle={() =>
                      archive.mutate({ id: c.id, archived: !c.archived })
                    }
                    onDelete={() => setPendingDeleteId(c.id)}
                  />
                ))
              )}
            </div>
          </div>
        }
      />

      <RenameDialog
        open={pendingRename !== null}
        onOpenChange={(o) => {
          if (!o) setPendingRename(null);
        }}
        conversationId={pendingRename?.id ?? null}
        currentTitle={pendingRename?.title ?? ""}
      />

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("sidebar.deleteDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) del.mutate(pendingDeleteId);
                setPendingDeleteId(null);
              }}
              className="bg-[hsl(var(--danger-100))] text-white hover:bg-[hsl(var(--danger-100)/0.9)]"
            >
              {t("sidebar.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
