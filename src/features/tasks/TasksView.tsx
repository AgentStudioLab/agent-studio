import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Archive, Check, FolderInput, Minus, Search, Trash2, X } from "lucide-react";
import { AppShell } from "@/app/AppShell";
import { cn } from "@/lib/utils";
import type { ArchivedFilter } from "@/lib/data/conversations";
import {
  useArchiveConversationMutation,
  useConversationsList,
  useDeleteConversationMutation,
} from "@/lib/data/queries";
import { TaskListRow } from "@/features/tasks/TaskListRow";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: items = [] } = useConversationsList(tab);
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

  const selectionMode = selectedIds.size > 0;
  const selectedCount = selectedIds.size;
  const allSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelectAll = () => {
    // Master checkbox is only visible in selection mode (≥1 selected), so it's
    // either fully checked (→ clear) or indeterminate (→ select every visible).
    if (allSelected) clearSelection();
    else setSelectedIds(new Set(filtered.map((c) => c.id)));
  };

  const archiveSelected = () => {
    for (const id of selectedIds) archive.mutate({ id, archived: true });
    clearSelection();
  };
  const deleteSelected = () => {
    for (const id of selectedIds) del.mutate(id);
    clearSelection();
    setConfirmDelete(false);
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

            {selectionMode && (
              <TooltipProvider delayDuration={300}>
                <div className="flex shrink-0 items-center gap-3 px-9 pb-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    aria-label={t("tasks.selection.selectAll")}
                    className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-primary bg-primary text-primary-foreground"
                  >
                    {allSelected ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : (
                      <Minus className="size-3.5" strokeWidth={3} />
                    )}
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {t("tasks.selection.selected", { count: selectedCount })}
                  </span>
                  {/* Move-to-project is reserved for a future picker. */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground"
                      >
                        <FolderInput className="size-[18px]" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("tasks.selection.moveToProject", { count: selectedCount })}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={archiveSelected}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground"
                      >
                        <Archive className="size-[18px]" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("tasks.selection.archive", { count: selectedCount })}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="flex size-8 items-center justify-center rounded-md text-[hsl(var(--danger-100))] transition-colors hover:bg-[hsl(var(--danger-100)/0.12)]"
                      >
                        <Trash2 className="size-[18px]" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("tasks.selection.delete", { count: selectedCount })}
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={clearSelection}
                    aria-label={t("tasks.selection.exit")}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground"
                  >
                    <X className="size-[18px]" />
                  </button>
                </div>
              </TooltipProvider>
            )}

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
                    selected={selectedIds.has(c.id)}
                    selectionMode={selectionMode}
                    onOpen={() => navigate(`/task/${c.id}`)}
                    onToggleSelect={() => toggleSelect(c.id)}
                  />
                ))
              )}
            </div>
          </div>
        }
      />

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tasks.deleteDialog.title", { count: selectedCount })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("tasks.deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("tasks.deleteDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSelected}
              className="bg-[hsl(var(--danger-100))] text-white hover:bg-[hsl(var(--danger-100)/0.9)]"
            >
              {t("tasks.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
