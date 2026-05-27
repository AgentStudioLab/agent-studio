import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import "tippy.js/dist/tippy.css";
import { SlashMenu, type SlashMenuHandle, type SlashSkillItem } from "./SlashMenu";

export interface SkillSuggestionDeps {
  getSkills: () => SlashSkillItem[];
}

const MAX_ITEMS = 8;

/**
 * Builds the Tiptap suggestion plugin config for the `/skill` mention chip.
 *
 * - `char: "/"`     — single trigger only; we don't surface other prefixes.
 * - `items()`       — pulls the latest skill list at query time via `getSkills`,
 *                     so the menu reflects new skills without rebuilding the
 *                     editor.
 * - `render()`      — wires a React popup (SlashMenu) into tippy.js, forwarding
 *                     keyboard events from ProseMirror so the editor never
 *                     loses focus while the user navigates the menu.
 * - `command()`     — inserts a Mention atom + trailing space, replacing the
 *                     `/<query>` range the user typed.
 */
export function createSkillSuggestion(
  deps: SkillSuggestionDeps,
): Omit<SuggestionOptions<SlashSkillItem>, "editor"> {
  return {
    char: "/",
    // Allow `/` after start-of-line or whitespace; suppresses false triggers
    // when the user is typing things like `https://...` mid-sentence.
    allowSpaces: false,
    startOfLine: false,

    items: ({ query }) => {
      const all = deps.getSkills();
      if (!query) return all.slice(0, MAX_ITEMS);
      const q = query.toLowerCase();
      return all
        .filter((item) => item.label.toLowerCase().includes(q))
        .slice(0, MAX_ITEMS);
    },

    command: ({ editor, range, props }) => {
      // Insert mention node + trailing space so the cursor lands ready for
      // the next token. `insertContentAt(range, ...)` replaces the `/<query>`
      // range we matched, which is what makes the chip feel atomic.
      //
      // `mentionSuggestionChar: "/"` is the chip's stored trigger char.
      // It defaults to "@" on the node attr, so we set it explicitly so
      // any consumer that uses the attribute (e.g., Mention's Backspace
      // keymap when `deleteTriggerWithBackspace` is false) sees "/" rather
      // than the unrelated default.
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "mention",
            attrs: {
              id: props.id,
              label: props.label,
              mentionSuggestionChar: "/",
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },

    render: () => {
      let component: ReactRenderer<SlashMenuHandle> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: SuggestionProps<SlashSkillItem>) => {
          component = new ReactRenderer(SlashMenu, {
            props: {
              items: props.items,
              command: props.command,
            },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy("body", {
            getReferenceClientRect: () =>
              props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "top-start",
            theme: "slash-menu",
            arrow: false,
            offset: [0, 8],
          });
        },

        onUpdate: (props: SuggestionProps<SlashSkillItem>) => {
          component?.updateProps({
            items: props.items,
            command: props.command,
          });

          if (!props.clientRect) return;
          popup?.[0]?.setProps({
            getReferenceClientRect: () =>
              props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
          });
        },

        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props.event) ?? false;
        },

        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
          popup = null;
          component = null;
        },
      };
    },
  };
}
