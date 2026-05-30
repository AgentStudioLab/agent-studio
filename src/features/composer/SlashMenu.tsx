import {
  forwardRef,
  Fragment,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { CalendarClock, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Built-in command (e.g. 计划任务) vs a discovered skill. Drives grouping. */
export type SlashItemKind = "builtin" | "skill";

export interface SlashSkillItem {
  id: string;
  label: string;
  description: string;
  /** Which menu section this item belongs to. */
  kind: SlashItemKind;
  /** Extra alias text matched during filtering (e.g. the original skill name
   *  when the display label is localized). Optional. */
  keywords?: string;
  /** Built-in only: text inserted after the chip (a fill-in-the-blanks
   *  template). Includes any leading space. Skills insert just a space. */
  template?: string;
  /** Built-in only: a substring of `template` to select after insertion so
   *  the user's next keystroke overwrites it. */
  templatePlaceholder?: string;
}

interface SlashMenuProps {
  items: SlashSkillItem[];
  command: (item: SlashSkillItem) => void;
}

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * Slash-command suggestion popup rendered above the editor by tippy.js.
 * Owns selection-index state and exposes onKeyDown so the Tiptap suggestion
 * plugin can forward Up/Down/Enter without React losing focus to the popup.
 */
export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  ({ items, command }, ref) => {
    const { t } = useTranslation();
    const [selected, setSelected] = useState(0);

    // Reset selection whenever the filtered list changes shape so the
    // highlight always points at a valid index.
    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event) => {
          if (items.length === 0) return false;
          if (event.key === "ArrowUp") {
            setSelected((s) => (s + items.length - 1) % items.length);
            return true;
          }
          if (event.key === "ArrowDown") {
            setSelected((s) => (s + 1) % items.length);
            return true;
          }
          if (event.key === "Enter") {
            const item = items[selected];
            if (item) command(item);
            return true;
          }
          return false;
        },
      }),
      [items, selected, command],
    );

    if (items.length === 0) {
      return (
        <div className="w-[280px] rounded-lg border border-border bg-popover p-3 text-[12.5px] text-muted-foreground shadow-md">
          {t("composer.slash.empty")}
        </div>
      );
    }

    return (
      <div className="w-[280px] rounded-lg border border-border bg-popover p-1 shadow-md">
        {items.map((item, idx) => {
          const active = idx === selected;
          // Section header whenever the kind changes. Items arrive pre-sorted
          // builtin-first, so this yields at most two groups: 内置指令 then 技能.
          const showHeader = items[idx - 1]?.kind !== item.kind;
          const Icon = item.kind === "builtin" ? CalendarClock : ScrollText;
          return (
            <Fragment key={item.id}>
              {showHeader && (
                <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">
                  {t(
                    item.kind === "builtin"
                      ? "composer.slash.group.builtin"
                      : "composer.slash.group.skill",
                  )}
                </div>
              )}
              <button
                type="button"
                onMouseEnter={() => setSelected(idx)}
                onClick={() => command(item)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  active ? "bg-muted" : "hover:bg-muted",
                )}
              >
                <Icon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-foreground">
                    {item.label}
                  </div>
                  {item.description && (
                    <div className="truncate text-[11.5px] text-muted-foreground">
                      {item.description}
                    </div>
                  )}
                </div>
              </button>
            </Fragment>
          );
        })}
      </div>
    );
  },
);
SlashMenu.displayName = "SlashMenu";
