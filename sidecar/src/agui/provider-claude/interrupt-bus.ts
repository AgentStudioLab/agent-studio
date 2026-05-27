import { EventType } from "@ag-ui/core";
import type { RunEventStore } from "../core/store-types";
import type { AGUIEvent } from "../core/types";

export type PermissionResult =
  | { behavior: "allow" }
  | { behavior: "deny"; message: string };

export interface ApprovalRequest {
  runId: string;
  threadId: string;
  toolUseID: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
}

/**
 * Structured answers from an AskUserQuestion form. Keyed by question text per
 * SDK's `AskUserQuestionOutput.answers`. Multi-select values are comma-joined
 * labels ("Option A,Option C"); a custom "Something else" answer is the raw
 * string; a skipped question is the empty string. Annotations are reserved
 * for future free-text notes per question.
 */
export interface AskUserAnswers {
  answers: Record<string, string>;
  annotations?: Record<string, { notes?: string; preview?: string }>;
}

/** Subset of the SDK's question schema we re-emit verbatim to the client. */
export interface AskUserQuestion {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string; preview?: string }[];
}

export interface AskUserRequest {
  runId: string;
  threadId: string;
  toolUseID: string;
  questions: AskUserQuestion[];
}

export interface InterruptBus {
  /**
   * Called from canUseTool: writes a synthetic RUN_FINISHED(outcome:"interrupt")
   * to the store, flips status to "awaiting_approval", returns a Promise
   * that resolves when /resume calls bus.resolve() (or with deny if cancelled).
   */
  requestApproval(req: ApprovalRequest): Promise<PermissionResult>;
  /**
   * Same RUN_FINISHED(interrupt) mechanic, but the interrupt's reason is
   * "ask_user" and the resolved value is the structured answers map. Used
   * by canUseTool when toolName === "AskUserQuestion".
   *
   * The two flows can't share a deferred map — the resolver types differ.
   * Keeping them separate also lets the resume route reject mismatched
   * payloads cleanly (asking for ask_user answers on a tool_approval
   * interrupt is a protocol error).
   */
  requestAskUser(req: AskUserRequest): Promise<AskUserAnswers>;
  /**
   * Called from POST /runs/:runId/resume. Returns true if the deferred was
   * found and resolved; false if no matching pending interrupt.
   */
  resolve(runId: string, interruptId: string, result: PermissionResult): boolean;
  /** Same as resolve, but for ask_user interrupts. */
  resolveAskUser(runId: string, interruptId: string, result: AskUserAnswers): boolean;
  /**
   * Called from runWorker on terminal status: rejects every pending deferred
   * for the run as `deny` (approval) / empty-answers (ask_user) so the SDK
   * side unblocks and tears down cleanly.
   */
  cancelAll(runId: string): void;
}

export interface CreateInterruptBusOptions {
  store: RunEventStore;
}

export function createInterruptBus(opts: CreateInterruptBusOptions): InterruptBus {
  const { store } = opts;
  // Two maps keyed by `${runId}:${interruptId}` — separate because the
  // resolver value type differs. resolve() / resolveAskUser() each look up
  // in their own map, so a stale or mistargeted resume request fails cleanly
  // (returns false) instead of forcing the wrong shape onto a deferred.
  const permissionDeferreds = new Map<string, (r: PermissionResult) => void>();
  const askUserDeferreds = new Map<string, (r: AskUserAnswers) => void>();

  return {
    async requestApproval(req) {
      const key = `${req.runId}:${req.toolUseID}`;
      if (permissionDeferreds.has(key)) {
        throw new Error(`duplicate requestApproval for ${key}`);
      }

      const pending = new Promise<PermissionResult>((resolve) => {
        permissionDeferreds.set(key, resolve);
      });

      const event = {
        type: EventType.RUN_FINISHED,
        threadId: req.threadId,
        runId: req.runId,
        outcome: "interrupt",
        interrupts: [
          {
            id: req.toolUseID,
            reason: "tool_approval",
            payload: {
              toolName: req.toolName,
              input: req.input,
              ...(req.title ? { title: req.title } : {}),
              ...(req.description ? { description: req.description } : {}),
            },
          },
        ],
      } as unknown as AGUIEvent;

      await store.appendEvent(req.runId, event);
      await store.finishRun(req.runId, "awaiting_approval");

      return pending;
    },

    async requestAskUser(req) {
      const key = `${req.runId}:${req.toolUseID}`;
      if (askUserDeferreds.has(key)) {
        throw new Error(`duplicate requestAskUser for ${key}`);
      }

      const pending = new Promise<AskUserAnswers>((resolve) => {
        askUserDeferreds.set(key, resolve);
      });

      const event = {
        type: EventType.RUN_FINISHED,
        threadId: req.threadId,
        runId: req.runId,
        outcome: "interrupt",
        interrupts: [
          {
            id: req.toolUseID,
            reason: "ask_user",
            payload: {
              toolName: "AskUserQuestion",
              questions: req.questions,
            },
          },
        ],
      } as unknown as AGUIEvent;

      await store.appendEvent(req.runId, event);
      await store.finishRun(req.runId, "awaiting_approval");

      return pending;
    },

    resolve(runId, interruptId, result) {
      const key = `${runId}:${interruptId}`;
      const fn = permissionDeferreds.get(key);
      if (!fn) return false;
      permissionDeferreds.delete(key);
      fn(result);
      return true;
    },

    resolveAskUser(runId, interruptId, result) {
      const key = `${runId}:${interruptId}`;
      const fn = askUserDeferreds.get(key);
      if (!fn) return false;
      askUserDeferreds.delete(key);
      fn(result);
      return true;
    },

    cancelAll(runId) {
      const prefix = `${runId}:`;
      for (const [key, fn] of permissionDeferreds) {
        if (!key.startsWith(prefix)) continue;
        permissionDeferreds.delete(key);
        fn({ behavior: "deny", message: "run cancelled" });
      }
      for (const [key, fn] of askUserDeferreds) {
        if (!key.startsWith(prefix)) continue;
        askUserDeferreds.delete(key);
        // Empty answers map → agent receives a no-op AskUserQuestion result;
        // it can decide whether to retry or move on. Matches the "X close
        // sends partial" spec when the partial is "nothing answered."
        fn({ answers: {} });
      }
    },
  };
}
