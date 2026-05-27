// Types for the AskUserQuestion form card. Mirrors the sidecar's interrupt
// payload + the protocol decision shape resume routes expect. Kept here
// (feature-local) rather than in lib/agui to avoid bloating the runtime
// public surface with UI-only concerns.

export interface AskUserOption {
  label: string;
  description: string;
  /** Optional preview content per SDK schema; not rendered in the inline card yet. */
  preview?: string;
}

export interface AskUserQuestionDef {
  question: string;
  header: string;
  multiSelect: boolean;
  options: AskUserOption[];
}

/** Decoded payload of an interrupt with reason === "ask_user". */
export interface AskUserPayload {
  toolName: "AskUserQuestion";
  questions: AskUserQuestionDef[];
}

/**
 * Per-question state held in AskUserCard. The discriminator carries everything
 * the resume payload needs; "untouched" represents a question the user hasn't
 * acted on yet (close on this == skipped, but kept separate from explicit
 * skip so we can render a different visual state).
 */
export type AskUserAnswer =
  | { kind: "selected"; labels: string[] } // single: 1 label; multi: ≥1
  | { kind: "custom"; text: string }
  | { kind: "skipped" }
  | { kind: "untouched" };

/** One entry in the resume payload's `decisions[0].answers` array. */
export type AskUserAnswerEntry =
  | { question: string; selected: string[] }
  | { question: string; custom: string }
  | { question: string; skipped: true };

/** Decision payload posted to /runs/:id/resume for ask_user interrupts. */
export interface AskUserAnswersDecision {
  type: "ask_user_answers";
  answers: AskUserAnswerEntry[];
}
