// Per-thread tracker for skills the agent explicitly invoked at runtime via
// the built-in `Skill` tool.
//
// The SDK's system.init only carries the static `enabledSkills` list passed in
// at query() time; it does NOT report which of those skills the agent actually
// reached for during the turn. The Context Tab is more useful when it shows
// the runtime answer ("agent loaded `agent-studio:pptx`") instead of the
// static one ("18 skills configured"), so we tap PreToolUse and record each
// Skill invocation keyed by threadId.
//
// In-memory only — same lifetime / restart semantics as SessionMetadataStore.
// Sidecar restart clears the set; the user can re-invoke (rare) or we can
// add SQLite-backed persistence later.

import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

export class SkillInvocationStore {
  private byThread = new Map<string, Set<string>>();

  record(threadId: string, skillId: string): void {
    let set = this.byThread.get(threadId);
    if (!set) {
      set = new Set();
      this.byThread.set(threadId, set);
    }
    set.add(skillId);
  }

  list(threadId: string): string[] {
    const set = this.byThread.get(threadId);
    return set ? [...set] : [];
  }
}

/**
 * Hook factory: returns a PreToolUse hook scoped to a (store, threadId).
 * Detects the built-in `Skill` tool and records the requested skill id.
 * Fire-and-forget — never blocks the SDK, never returns a decision.
 */
export function createSkillInvocationsHook(
  store: SkillInvocationStore,
  threadId: string,
): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    if (input.tool_name !== "Skill") return {};
    const raw = input.tool_input as { skill?: unknown };
    if (typeof raw.skill !== "string" || !raw.skill) return {};
    store.record(threadId, raw.skill);
    return {};
  };
}
