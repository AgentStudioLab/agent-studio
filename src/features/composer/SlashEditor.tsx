import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import { PluginKey } from "@tiptap/pm/state";
import { useSkills } from "@/lib/agui/react/useSkills";
import { createSkillSuggestion } from "./skillSuggestion";
import { SkillMentionView } from "./SkillMentionView";
import type { SlashSkillItem } from "./SlashMenu";
import { cn } from "@/lib/utils";

// Extend Mention with a React node view so the rendered chip can host a
// hover-triggered Tooltip showing the skill description. The configure()
// call below still applies — Tiptap merges `extend()` and `configure()`.
const SkillMention = Mention.extend({
  addNodeView() {
    return ReactNodeViewRenderer(SkillMentionView);
  },
});

// The one built-in command surfaced in the slash menu as 内置指令 / 计划任务.
// Built-in skills are id-namespaced `agent-studio:<name>` by the sidecar
// skillRegistry, so the schedule skill's id is stable.
const SCHEDULE_SKILL_ID = "agent-studio:schedule";

// In Tiptap v3 the Mention extension assigns a fresh PluginKey per
// suggestion internally unless one is provided. We supply this stable key
// so the editor-level Enter handler can query the suggestion plugin state
// (open / closed) without needing access to the editor's plugin list.
const slashSuggestionKey = new PluginKey("slash-skill-suggestion");

interface SlashEditorProps {
  placeholder?: string;
  /** Number of visible rows (used to seed min-height). Default 2. */
  rows?: number;
  /** Raw keydown listener; called before Tiptap's internal handling.
   *  Set `event.preventDefault()` to suppress Tiptap. */
  onKeyDown?: (event: KeyboardEvent) => void;
  /** Disabled state — relays to ProseMirror's `editable: false`. */
  disabled?: boolean;
  /** Optional plain-text seed used by agent pack sample tasks. */
  value?: string;
  /** Bump when the same value should be re-applied. */
  valueVersion?: number;
  className?: string;
}

/**
 * Tiptap-backed rich textarea with `/`-triggered skill mention chips.
 *
 * Designed as a drop-in replacement for `<PromptInputTextarea>` inside an
 * ai-elements `<PromptInput>` form. We sync the rendered text into a hidden
 * `<input name="message">` so PromptInput's FormData submit pipeline keeps
 * working unchanged — Tiptap's contenteditable isn't a form control.
 *
 * Submit semantics: Enter (no shift, not composing) → form.requestSubmit().
 * Shift+Enter inserts a hard break. We listen on the form's `reset` event
 * to clear the editor after a successful submit, mirroring how the textarea
 * gets cleared via `form.reset()`.
 *
 * Mention chips serialize back as `/<skill-label>` literal text so the
 * agent sees the same prompt string the user composed — no special server
 * handling required.
 */
export function SlashEditor({
  placeholder,
  rows = 2,
  onKeyDown,
  disabled,
  value,
  valueVersion,
  className,
}: SlashEditorProps) {
  const { t } = useTranslation();
  const { skills } = useSkills();
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Stable factory closure: skillsRef ensures `getSkills` always reads the
  // latest list without rebuilding the editor (which would discard the
  // current draft text). Tiptap doesn't reconcile extension config changes.
  const skillsRef = useRef<SlashSkillItem[]>([]);
  useMemo(() => {
    const mapped: SlashSkillItem[] = skills.map((s) => {
      if (s.id === SCHEDULE_SKILL_ID) {
        // Re-present the schedule skill as the 计划任务 built-in: localized
        // label/description + a fill-in template inserted after the chip.
        return {
          id: s.id,
          label: t("composer.slash.schedule.label"),
          description: t("composer.slash.schedule.description"),
          kind: "builtin",
          keywords: `${s.name} schedule 计划任务`,
          template: t("composer.slash.schedule.template"),
          templatePlaceholder: t("composer.slash.schedule.templatePlaceholder"),
        };
      }
      return { id: s.id, label: s.name, description: s.description, kind: "skill" };
    });
    // Built-ins first so the menu groups 内置指令 above 技能 (sort is stable).
    mapped.sort((a, b) =>
      a.kind === b.kind ? 0 : a.kind === "builtin" ? -1 : 1,
    );
    skillsRef.current = mapped;
  }, [skills, t]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Drop block-level marks we don't want in a prompt input (lists,
        // headings, blockquote, code blocks). Inline marks like bold/italic
        // stay because they don't have a side effect — there's no shortcut
        // that would auto-trigger them from a plain prompt.
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: placeholder ?? t("composer.input.placeholder"),
      }),
      SkillMention.configure({
        HTMLAttributes: { class: "slash-skill-mention", "data-type": "skill" },
        renderText: ({ node }) =>
          `/${node.attrs.label ?? node.attrs.id ?? ""}`,
        renderHTML: ({ node, options }) => [
          "span",
          { ...options.HTMLAttributes, "data-id": node.attrs.id },
          `/${node.attrs.label ?? node.attrs.id ?? ""}`,
        ],
        // True deletes the chip cleanly. Default `false` would `tr.insertText`
        // the node's `mentionSuggestionChar` attribute back into the doc —
        // and since that attribute defaults to `@`, backspacing one of our
        // `/`-chips would leak an `@` into the prompt.
        deleteTriggerWithBackspace: true,
        suggestion: {
          ...createSkillSuggestion({ getSkills: () => skillsRef.current }),
          pluginKey: slashSuggestionKey,
        },
      }),
    ],
    editable: !disabled,
    editorProps: {
      attributes: {
        // The contenteditable carries `data-slot=input-group-control` so
        // ai-elements' InputGroup focus selectors (`has-[[data-slot=...]:
        // focus-visible]:border-ring`) latch onto the actual focusable
        // surface, not our layout wrapper.
        class: "slash-editor-content",
        "data-slot": "input-group-control",
        "aria-label": placeholder ?? "",
      },
      handleKeyDown: (view, event) => {
        // Let parent (e.g., TaskMessageInput) observe key events first so
        // it can set its `overrideIntentRef` for Cmd/Ctrl+Enter etc.
        onKeyDown?.(event);
        if (event.defaultPrevented) return true;

        // ProseMirror's `someProp` runs editorProps.handleKeyDown BEFORE
        // plugin handlers. If we eagerly handle Enter here, the suggestion
        // plugin's Up/Down/Enter never gets a chance — Enter on a menu
        // item would submit the form instead of inserting the chip. Defer
        // to the suggestion plugin whenever its state says it's open.
        const suggestion = slashSuggestionKey.getState(view.state) as
          | { active?: boolean }
          | null;
        if (suggestion?.active) return false;

        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.isComposing
        ) {
          event.preventDefault();
          const form = (event.target as HTMLElement | null)?.closest("form");
          form?.requestSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (!hiddenInputRef.current) return;
      // Mention chips serialize to `/<label>` via the renderText we set
      // above. blockSeparator "\n" collapses Tiptap's paragraph splits
      // into single newlines (default is "\n\n").
      hiddenInputRef.current.value = editor.getText({ blockSeparator: "\n" });
    },
  });

  // Mirror form.reset() into editor.clearContent(). PromptInput calls
  // form.reset() before invoking onSubmit, which clears the hidden input
  // but doesn't touch the contenteditable surface — we re-sync here.
  useEffect(() => {
    if (!editor) return;
    const form = editor.view.dom.closest("form");
    if (!form) return;
    const onReset = () => editor.commands.clearContent();
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [editor]);

  // Sample tasks in Agent Space can seed a prompt without taking over normal
  // editing. We only apply when the parent value/version changes, then Tiptap
  // remains the source of truth for user edits.
  useEffect(() => {
    if (!editor || value === undefined) return;
    if (editor.getText({ blockSeparator: "\n" }) !== value) {
      editor.commands.setContent(
        value.length > 0
          ? {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: value }],
                },
              ],
            }
          : "",
      );
    }
    if (hiddenInputRef.current) hiddenInputRef.current.value = value;
  }, [editor, value, valueVersion]);

  return (
    <div
      className={cn("slash-editor w-full flex-1 self-stretch px-4", className)}
      data-rows={rows}
      onClick={() => editor?.commands.focus()}
    >
      <input
        ref={hiddenInputRef}
        type="hidden"
        name="message"
        defaultValue=""
      />
      <EditorContent editor={editor} />
    </div>
  );
}
