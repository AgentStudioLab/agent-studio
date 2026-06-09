import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Clock,
  MessageSquare,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useAppShell } from "@/app/AppShellContext";
import {
  useGlobalSearch,
  type SearchResult,
  type SearchResultType,
} from "@/features/search/useGlobalSearch";

/** 每个类别对应的图标，沿用侧边栏导航的视觉语言。 */
const TYPE_ICON: Record<SearchResultType, LucideIcon> = {
  conversation: MessageSquare,
  scheduled: Clock,
  agent: Briefcase,
  skill: ScrollText,
};

/**
 * 全局搜索命令面板（⌘K）。在 App 顶层挂载一次，由 AppShellContext 的
 * searchOpen 驱动 —— 不放在 SidebarContent 里，因为后者会在「停靠侧边栏」
 * 和「收起态浮层」两处渲染，放进去会导致弹窗重复挂载或随浮层关闭而卸载。
 */
export function GlobalSearchDialog() {
  const { t } = useTranslation();
  const { searchOpen, setSearchOpen } = useAppShell();
  return (
    <CommandDialog
      open={searchOpen}
      onOpenChange={setSearchOpen}
      title={t("sidebar.search.dialogTitle")}
      description={t("sidebar.search.dialogDescription")}
      className="sm:max-w-xl"
    >
      <SearchCommandBody onClose={() => setSearchOpen(false)} />
    </CommandDialog>
  );
}

/**
 * 面板主体。作为 CommandDialog 的 children，只在弹窗打开时挂载，
 * 因此内部的数据 hook 也只在打开时才真正发起请求。
 */
function SearchCommandBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { groups } = useGlobalSearch(query);
  const isEmptyQuery = query.trim().length === 0;

  const handleSelect = (route: string) => {
    onClose();
    navigate(route);
  };

  /** 右侧次要信息：技能显示来源，其余实体显示相对更新时间。 */
  const metaFor = (item: SearchResult): string | null => {
    if (item.skillSource) {
      return t(`sidebar.search.skillSource.${item.skillSource}`);
    }
    if (item.updatedAt == null) return null;
    return formatRelativeTime(item.updatedAt, t);
  };

  return (
    // shouldFilter={false}：过滤完全由 useGlobalSearch 负责（要匹配描述/prompt
    // 等不可见字段），交给 cmdk 内置过滤会按可见 value 二次过滤、把结果吃掉。
    <Command shouldFilter={false}>
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder={t("sidebar.search.placeholder")}
      />
      <CommandList>
        {groups.length === 0 ? (
          // 已输入但无结果才提示「没有找到」；空查询且无最近记录时保持空白。
          !isEmptyQuery ? (
            <CommandEmpty>{t("sidebar.search.empty")}</CommandEmpty>
          ) : null
        ) : (
          groups.map((group) => {
            const Icon = TYPE_ICON[group.type];
            // 空查询时对话分组标题用「最近」，输入后切回「对话任务」。
            const heading =
              isEmptyQuery && group.type === "conversation"
                ? t("sidebar.search.recent")
                : t(`sidebar.search.groups.${group.type}`);
            return (
              <CommandGroup key={group.type} heading={heading}>
                {group.items.map((item) => {
                  const meta = metaFor(item);
                  return (
                    <CommandItem
                      key={`${group.type}:${item.id}`}
                      value={`${group.type}:${item.id}`}
                      onSelect={() => handleSelect(item.route)}
                    >
                      <Icon className="text-muted-foreground" />
                      <span className="truncate">{item.title}</span>
                      {meta && (
                        // 用 CommandShortcut 承载右侧信息：它带 data-slot 会让
                        // CommandItem 末尾的占位勾选图标自动隐藏。tracking-normal
                        // 覆盖掉为快捷键设计的宽字距。
                        <CommandShortcut className="pl-2 tracking-normal">
                          {meta}
                        </CommandShortcut>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })
        )}
      </CommandList>
    </Command>
  );
}

/** 把 epoch ms 映射为「今天 / 昨天 / 本周内 / 具体日期」。前端环境可用 Date。 */
function formatRelativeTime(
  ts: number,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const DAY = 86_400_000;
  if (ts >= startOfToday) return t("sidebar.search.time.today");
  if (ts >= startOfToday - DAY) return t("sidebar.search.time.yesterday");
  if (ts >= startOfToday - 7 * DAY) return t("sidebar.search.time.thisWeek");
  return new Date(ts).toLocaleDateString();
}
