// OpenerMenu — header dropdown for "open with [system default app] / Show in
// Folder".
//
// The trigger button shows the actual default app for this file path as
// resolved by macOS LaunchServices (see useDefaultApp). When LaunchServices
// has no registered handler (or we're not on macOS / not in a Tauri host),
// the trigger falls back to a neutral "Open with system default" label —
// the action still works via `shellOpen`, only the displayed name is
// generic.
//
// Badge letter: first character of the app name. Office-style file types
// (xlsx/pptx) get brand-orange to match the rest of the brand surface; code
// + markdown + others get accent-blue. Future: extract icon from the .app
// bundle for a real glyph.

import { ChevronDown, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDefaultApp, revealInFolder } from "@/lib/useDefaultApp";
import type { MockFile } from "@/lib/mock/types";

interface OpenerMenuProps {
  file: MockFile;
}

function badgeBackground(file: MockFile): string {
  // Office-ish file types get brand-orange; code/markdown/etc gets accent-blue.
  if (file.type === "spreadsheet" || file.type === "presentation") {
    return "hsl(var(--brand-100))";
  }
  return "hsl(var(--accent-100))";
}

export function OpenerMenu({ file }: OpenerMenuProps) {
  const { t } = useTranslation();
  const { app, isLoading } = useDefaultApp(file.path);

  const displayName = app?.name ?? t("task.preview.openWithFallback");

  // 徽标三态:① 解析到应用且有图标 → 真实 app 图标;② 解析到应用但图标缺失
  // → 单字母彩色徽标(优雅降级);③ 未解析到应用(通用回退) → 不显示徽标。
  // 图标自带配色,纯装饰,故 alt 留空 + aria-hidden,名称由相邻文本承载。
  const badge = app?.iconDataUrl ? (
    <img
      src={app.iconDataUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="size-[22px] shrink-0 rounded-[6px]"
    />
  ) : app ? (
    <span
      className="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-[12px] font-bold"
      style={{
        background: badgeBackground(file),
        color: "hsl(var(--oncolor-100))",
      }}
    >
      {app.name.slice(0, 1).toUpperCase()}
    </span>
  ) : null;

  const handleOpenWith = () => {
    void (async () => {
      try {
        // Confirm before invoking the system default app. The path lives in
        // the message body so the user sees exactly what will be opened — and
        // the action is gated behind an explicit click rather than firing
        // silently from the dropdown.
        const ok = await ask(
          `${t("task.preview.confirmOpen.body")}\n\n${file.path}`,
          {
            title: t("task.preview.confirmOpen.title"),
            okLabel: t("task.preview.confirmOpen.allow"),
            cancelLabel: t("task.preview.confirmOpen.cancel"),
          },
        );
        if (!ok) return;
        await shellOpen(file.path);
      } catch (err) {
        console.error("[OpenerMenu] failed to open", err);
      }
    })();
  };

  const handleReveal = () => {
    void revealInFolder(file.path);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-[12px] transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          style={{
            color: "hsl(var(--text-200))",
            border: "1px solid hsl(var(--border-300) / 0.15)",
          }}
          disabled={isLoading}
        >
          {badge}
          <span className="max-w-[140px] truncate">{displayName}</span>
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      {/* w-auto 覆盖 shadcn 基类的 w-(--radix-…-trigger-width)（宽度锁成触发按钮宽度
          会逼文字换行）；让气泡按内容撑开。 */}
      <DropdownMenuContent align="end" className="w-auto min-w-[160px]">
        <DropdownMenuItem
          onSelect={handleOpenWith}
          className="whitespace-nowrap"
        >
          {badge}
          {app
            ? t("task.preview.openWith", { name: app.name })
            : t("task.preview.openWithFallback")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleReveal}>
          <FolderOpen className="size-3.5" />
          {t("task.preview.revealInFolder")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
