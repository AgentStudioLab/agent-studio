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

export interface InterruptBus {
  /**
   * Called from canUseTool: writes a synthetic RUN_FINISHED(outcome:"interrupt")
   * to the store, flips status to "awaiting_approval", returns a Promise
   * that resolves when /resume calls bus.resolve() (or with deny if cancelled).
   */
  requestApproval(req: ApprovalRequest): Promise<PermissionResult>;
  /**
   * Called from POST /runs/:runId/resume. Returns true if the deferred was
   * found and resolved; false if no matching pending interrupt.
   */
  resolve(runId: string, interruptId: string, result: PermissionResult): boolean;
  /**
   * Called from runWorker on terminal status: rejects every pending deferred
   * for the run as `deny` so the SDK side unblocks and tears down cleanly.
   */
  cancelAll(runId: string): void;
}

export interface CreateInterruptBusOptions {
  store: RunEventStore;
}

export function createInterruptBus(opts: CreateInterruptBusOptions): InterruptBus {
  const { store } = opts;
  // key: `${runId}:${interruptId}` — single map keeps lookup O(1)
  // for both resolve() and cancelAll() (the latter scans keys prefixed
  // with the runId).
  const deferreds = new Map<string, (r: PermissionResult) => void>();

  return {
    async requestApproval(req) {
      const key = `${req.runId}:${req.toolUseID}`;
      if (deferreds.has(key)) {
        throw new Error(`duplicate requestApproval for ${key}`);
      }

      const pending = new Promise<PermissionResult>((resolve) => {
        deferreds.set(key, resolve);
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

    resolve(runId, interruptId, result) {
      const key = `${runId}:${interruptId}`;
      const fn = deferreds.get(key);
      if (!fn) return false;
      deferreds.delete(key);
      fn(result);
      return true;
    },

    cancelAll(runId) {
      const prefix = `${runId}:`;
      for (const [key, fn] of deferreds) {
        if (!key.startsWith(prefix)) continue;
        deferreds.delete(key);
        fn({ behavior: "deny", message: "run cancelled" });
      }
    },
  };
}
