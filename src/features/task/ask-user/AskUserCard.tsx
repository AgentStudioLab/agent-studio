// AskUserQuestion form card.
//
// Drives:
//   - per-question state (answers Map<pageIndex, AskUserAnswer>)
//   - "Something else" draft text (separate map so the draft survives page
//      switches even before the user commits)
//   - pagination + auto-advance on single-select
//   - keyboard shortcuts (1-9, ←/→, Enter, Esc)
//   - flush on Send / X — translates internal state into the
//     ask_user_answers decision payload that resume expects.
//
// 快捷键是 Agent Studio 的交互增强，不声明与 Claude Code 默认 UI 完全一致。
//
// The card renders inline in the chat stream replacing what would otherwise
// be a generic <ToolApprovalCard>. Both share the same interrupt mechanic
// but the resume payload shape differs (see types.ts / protocol.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AskUserHeader } from "./AskUserHeader";
import { SingleSelectList } from "./SingleSelectList";
import { MultiSelectList } from "./MultiSelectList";
import { SomethingElseRow } from "./SomethingElseRow";
import { AskUserFooter } from "./AskUserFooter";
import type {
  AskUserAnswer,
  AskUserAnswerEntry,
  AskUserAnswersDecision,
  AskUserQuestionDef,
} from "./types";

/**
 * Pure mapper from internal answers state to the wire decision shape.
 * Lifted out of the component so setTimeout callbacks can use it with a
 * snapshot of the answers map captured at click-time — avoids the classic
 * "send() captured stale answers" bug where the deferred fire happens
 * before React commits the state update.
 */
function buildDecisionFromMap(
  answers: ReadonlyMap<number, AskUserAnswer>,
  questions: AskUserQuestionDef[],
): AskUserAnswersDecision {
  const entries: AskUserAnswerEntry[] = questions.map((q, i) => {
    const a = answers.get(i) ?? { kind: "untouched" as const };
    const question = q.question || "";
    switch (a.kind) {
      case "selected":
        return { question, selected: a.labels };
      case "custom":
        return { question, custom: a.text };
      case "skipped":
      case "untouched":
      default:
        return { question, skipped: true as const };
    }
  });
  return { type: "ask_user_answers", answers: entries };
}

interface AskUserCardProps {
  questions: AskUserQuestionDef[];
  /** Submits the assembled decision to /resume. Called once per card. */
  onSubmit: (decision: AskUserAnswersDecision) => void;
}

const AUTO_ADVANCE_DELAY = 150; // ms, lets the row's selected state animate

export function AskUserCard({ questions, onSubmit }: AskUserCardProps) {
  const total = questions.length;
  const [page, setPage] = useState(0);
  // answers/drafts keyed by page index. Maps are immutable per render — we
  // create a new instance on every update so React picks up the change.
  const [answers, setAnswers] = useState<Map<number, AskUserAnswer>>(
    () => new Map(),
  );
  const [drafts, setDrafts] = useState<Map<number, string>>(() => new Map());
  // Guard re-entry: a single card should submit at most once, otherwise a
  // rapid Send+X or Enter twice would post two resume decisions for the
  // same interrupt id. Mirror in a ref so deferred setTimeout callbacks
  // see the latest value without depending on closure capture.
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);
  const pageRef = useRef(page);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceSeqRef = useRef(0);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(
    () => () => {
      if (autoAdvanceTimerRef.current !== null) {
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    },
    [],
  );

  const submit = useCallback(
    (snapshot: ReadonlyMap<number, AskUserAnswer>) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitted(true);
      onSubmit(buildDecisionFromMap(snapshot, questions));
    },
    [onSubmit, questions],
  );

  const current = questions[page];
  const currentAnswer = answers.get(page) ?? { kind: "untouched" as const };

  const setAnswerForPage = useCallback(
    (idx: number, a: AskUserAnswer) => {
      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(idx, a);
        return next;
      });
    },
    [],
  );

  const advance = useCallback(() => {
    setPage((p) => Math.min(p + 1, total - 1));
  }, [total]);

  const skip = useCallback(() => {
    if (submittedRef.current) return;
    setAnswerForPage(page, { kind: "skipped" });
    advance();
  }, [advance, page, setAnswerForPage]);

  const send = useCallback(() => {
    if (submittedRef.current) return;
    submit(answers);
  }, [answers, submit]);

  // --- single-select: choosing an option auto-advances (or sends if last) ---
  const onSelectSingle = useCallback(
    (label: string) => {
      if (submittedRef.current) return;
      if (autoAdvanceTimerRef.current !== null) {
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
      const next = new Map(answers);
      next.set(page, { kind: "selected", labels: [label] });
      setAnswers(next);
      const isLast = page === total - 1;
      const seq = ++autoAdvanceSeqRef.current;
      const expectedPage = page;
      autoAdvanceTimerRef.current = setTimeout(() => {
        if (seq === autoAdvanceSeqRef.current) {
          autoAdvanceTimerRef.current = null;
        }
        if (
          submittedRef.current ||
          seq !== autoAdvanceSeqRef.current ||
          pageRef.current !== expectedPage
        ) {
          return;
        }
        if (isLast) submit(next);
        else advance();
      }, AUTO_ADVANCE_DELAY);
    },
    [advance, answers, page, submit, total],
  );

  // --- multi-select: toggle without advancing ---
  const onToggleMulti = useCallback(
    (label: string) => {
      if (submittedRef.current) return;
      setAnswers((prev) => {
        const next = new Map(prev);
        const cur = next.get(page);
        const set = new Set<string>(
          cur?.kind === "selected" ? cur.labels : [],
        );
        if (set.has(label)) set.delete(label);
        else set.add(label);
        if (set.size === 0) next.set(page, { kind: "untouched" });
        else next.set(page, { kind: "selected", labels: [...set] });
        return next;
      });
    },
    [page],
  );

  // --- something else: focus, edit, commit ---
  const onCustomFocus = useCallback(() => {
    if (submittedRef.current) return;
    setAnswerForPage(page, {
      kind: "custom",
      text: drafts.get(page) ?? "",
    });
  }, [drafts, page, setAnswerForPage]);

  const onCustomChange = useCallback(
    (text: string) => {
      if (submittedRef.current) return;
      setDrafts((prev) => {
        const next = new Map(prev);
        next.set(page, text);
        return next;
      });
      setAnswerForPage(page, { kind: "custom", text });
    },
    [page, setAnswerForPage],
  );

  const onCustomCommit = useCallback(() => {
    if (submittedRef.current) return;
    const isLast = page === total - 1;
    if (isLast) send();
    else advance();
  }, [advance, page, send, total]);

  // Footer button state.
  const isLast = page === total - 1;
  const selectedCount =
    currentAnswer.kind === "selected" ? currentAnswer.labels.length : 0;
  // Advance is enabled when the user has SOMETHING for this page — either a
  // selected option, a non-empty custom answer, or an explicit skip. For
  // multi-select pages this guards against "Send while 0 selected" sending
  // an empty answer (the user can still Skip to force-skip).
  const canAdvance = useMemo(() => {
    if (currentAnswer.kind === "selected") return currentAnswer.labels.length > 0;
    if (currentAnswer.kind === "custom") return currentAnswer.text.trim().length > 0;
    // skipped / untouched → user must explicitly Skip via the Skip button
    return false;
  }, [currentAnswer]);

  const handleAdvance = useCallback(() => {
    if (submittedRef.current) return;
    if (isLast) send();
    else advance();
  }, [advance, isLast, send]);

  // --- keyboard ---
  useEffect(() => {
    if (submitted) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement | null)?.isContentEditable === true;

      if (e.key === "ArrowLeft" && !inField) {
        if (page > 0) {
          e.preventDefault();
          setPage(page - 1);
        }
        return;
      }
      if (e.key === "ArrowRight" && !inField) {
        if (page < total - 1) {
          e.preventDefault();
          setPage(page + 1);
        }
        return;
      }
      if (e.key === "Escape" && !inField) {
        e.preventDefault();
        skip();
        return;
      }
      if (inField) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (canAdvance) handleAdvance();
        return;
      }
      // 1-9: pick option by index. Single-select auto-advances; multi-select
      // toggles. Out-of-range numbers are ignored.
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9) {
        const opt = current?.options?.[n - 1];
        if (!opt) return;
        e.preventDefault();
        if (current.multiSelect) onToggleMulti(opt.label);
        else onSelectSingle(opt.label);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    canAdvance,
    current,
    handleAdvance,
    onSelectSingle,
    onToggleMulti,
    page,
    skip,
    submitted,
    total,
  ]);

  const selectedSet = useMemo(
    () =>
      currentAnswer.kind === "selected"
        ? new Set<string>(currentAnswer.labels)
        : new Set<string>(),
    [currentAnswer],
  );

  if (!current) return null;

  const showCustomActive = currentAnswer.kind === "custom";
  const customDraft = drafts.get(page) ?? "";
  const options = current.options ?? [];
  const header = current.header ?? "";
  const multiSelect = current.multiSelect === true;

  return (
    <div className="rounded-md border border-border bg-card text-card-foreground">
      <AskUserHeader
        header={header}
        page={page}
        total={total}
        onPrev={() => setPage(Math.max(0, page - 1))}
        onNext={() => setPage(Math.min(total - 1, page + 1))}
        onClose={send}
        submitted={submitted}
      />
      {/* Question text — full sentence under the header chip. */}
      <p className="px-4 pt-1 pb-2 text-[14px] leading-[1.55] text-foreground">
        {current.question}
      </p>
      <div className="px-2 pb-2">
        {multiSelect ? (
          <MultiSelectList
            options={options}
            selected={selectedSet}
            onToggle={onToggleMulti}
            disabled={submitted}
          />
        ) : (
          <SingleSelectList
            options={options}
            selectedLabel={
              currentAnswer.kind === "selected" && currentAnswer.labels.length === 1
                ? currentAnswer.labels[0]!
                : null
            }
            onSelect={onSelectSingle}
            disabled={submitted}
          />
        )}
        <SomethingElseRow
          value={customDraft}
          active={showCustomActive}
          onChange={onCustomChange}
          onFocus={onCustomFocus}
          onCommit={onCustomCommit}
          disabled={submitted}
        />
      </div>
      <AskUserFooter
        selectedCount={selectedCount}
        showSelectedCount={multiSelect}
        isLastPage={isLast}
        canAdvance={canAdvance}
        submitted={submitted}
        onSkip={skip}
        onAdvance={handleAdvance}
      />
    </div>
  );
}
