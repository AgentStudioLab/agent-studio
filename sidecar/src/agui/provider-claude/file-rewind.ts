// File checkpoint rewind helper.
//
// The SDK's `rewindFiles()` lives on a *live* Query object and cannot be called
// after the original turn's stream has closed ("ProcessTransport is not ready").
// The documented pattern is to resume the session with an EMPTY prompt, grab
// the first streamed message, call rewindFiles, then close. This module
// encapsulates that dance so the provider can offer a one-shot
// `rewindFiles(checkpointUuid)`.
//
// Scope/limits (per SDK docs): only Write/Edit/NotebookEdit changes are
// tracked — Bash-produced files are NOT rolled back. Rewinding restores files
// on disk only; it does not touch the conversation transcript.

import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";

export interface RewindSessionFilesInput {
  /** SDK session id to resume (same session that captured the checkpoint). */
  sessionId: string;
  cwd: string;
  env: Record<string, string>;
  /** Effective model — kept consistent with the run; harmless for the no-op
   *  empty-prompt turn but avoids the SDK picking a different default. */
  model?: string;
  /** User-message uuid to restore files to. */
  checkpointUuid: string;
  signal?: AbortSignal;
}

export interface RewindResult {
  canRewind: boolean;
  error?: string;
  /** Number of files restored/removed by the rewind (for diagnostics). */
  filesChanged?: number;
}

/**
 * Resume the session with an empty prompt and rewind files to `checkpointUuid`.
 * Best-effort: returns `{ canRewind: false, error }` on any failure (no
 * session, no checkpoint, SDK error) and never throws.
 */
export async function rewindSessionFiles(
  input: RewindSessionFilesInput,
): Promise<RewindResult> {
  const ac = new AbortController();
  if (input.signal) {
    if (input.signal.aborted) ac.abort(input.signal.reason);
    else
      input.signal.addEventListener("abort", () => ac.abort(input.signal!.reason), {
        once: true,
      });
  }

  let q: ReturnType<typeof sdkQuery> | null = null;
  try {
    q = sdkQuery({
      prompt: "", // empty prompt just opens a live connection on the session
      options: {
        resume: input.sessionId,
        enableFileCheckpointing: true,
        extraArgs: { "replay-user-messages": null },
        cwd: input.cwd,
        env: input.env,
        ...(input.model ? { model: input.model } : {}),
        abortController: ac,
      },
    });
    for await (const _ of q) {
      const res = await q.rewindFiles(input.checkpointUuid);
      return {
        canRewind: !!res?.canRewind,
        error: res?.error,
        filesChanged: Array.isArray(res?.filesChanged)
          ? res.filesChanged.length
          : undefined,
      };
    }
    return { canRewind: false, error: "no_messages" };
  } catch (err) {
    return {
      canRewind: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      q?.close();
    } catch {
      /* best-effort cleanup */
    }
  }
}
