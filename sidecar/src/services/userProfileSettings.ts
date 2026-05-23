import type { Database } from "bun:sqlite";

// Persisted shape — JSON-encoded into settings.value under key "user_profile".
// All fields are optional / can be empty strings. composeAppendPrompt skips
// any empty section so the agent prompt stays clean.
export interface UserProfile {
  /** How the agent should address the user (e.g. "Jay"). */
  callMe: string;
  /** Role/work key — composer turns this into a sentence. "" = skip. */
  work: string;
  /** Free-form per-user system prompt additions. */
  instructions: string;
}

export interface UserProfileSettingsState {
  current(): UserProfile;
  update(patch: Partial<UserProfile>): UserProfile;
  /** Subscribe to changes — server uses this to invalidate provider cache. */
  onChange(cb: () => void): () => void;
}

const KEY = "user_profile";

const EMPTY: UserProfile = { callMe: "", work: "", instructions: "" };

function readRow(db: Database): UserProfile | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(KEY) as { value: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as Partial<UserProfile>;
    // Coerce missing fields to "" so the rest of the code can treat them
    // as plain strings without null-checks.
    return {
      callMe: typeof parsed.callMe === "string" ? parsed.callMe : "",
      work: typeof parsed.work === "string" ? parsed.work : "",
      instructions:
        typeof parsed.instructions === "string" ? parsed.instructions : "",
    };
  } catch {
    return null;
  }
}

function writeRow(db: Database, value: UserProfile): void {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(KEY, JSON.stringify(value));
}

export function createUserProfileSettings(
  db: Database,
): UserProfileSettingsState {
  let cache: UserProfile = readRow(db) ?? EMPTY;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const fn of listeners) fn();
  };

  return {
    current(): UserProfile {
      return cache;
    },
    update(patch): UserProfile {
      cache = {
        callMe: patch.callMe ?? cache.callMe,
        work: patch.work ?? cache.work,
        instructions: patch.instructions ?? cache.instructions,
      };
      writeRow(db, cache);
      notify();
      return cache;
    },
    onChange(cb): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
