import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface SlashSkillItem {
  id: string;
  label: string;
  description: string;
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
          return (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setSelected(idx)}
              onClick={() => command(item)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                active ? "bg-muted" : "hover:bg-muted",
              )}
            >
              <ScrollText
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
          );
        })}
      </div>
    );
  },
);
SlashMenu.displayName = "SlashMenu";
