import type { Database } from "bun:sqlite";
import {
  BUILT_IN_PROFILES,
  getBuiltInProfile,
  type ProfileModel,
  type ProviderProfile,
} from "../lib/providerProfiles";

// Persisted shape — JSON-encoded into settings.value under key "provider".
// `apiKey` lives here too so all provider-related state is one row. The
// existing settings.value column is TEXT NOT NULL so we always write JSON.
//
// `customModels` is meaningful only when profileId = "custom". For built-in
// profiles we ignore it (and don't even surface the textarea on the frontend).
interface PersistedProvider {
  profileId: "anthropic" | "deepseek" | "custom";
  baseUrl: string;
  apiKey: string;
  customModels: ProfileModel[];
}

export interface ProviderSettingsState {
  /** Current profile-as-resolved (built-in profile inflated, custom synthesized). */
  current(): ResolvedProvider;
  /** Read the live API key. Defaults to env on first boot when no row exists. */
  getApiKey(): string;
  /** Persist a partial update — only provided fields are touched. */
  update(patch: Partial<PersistedProvider>): ResolvedProvider;
  /** Subscribe to changes — server uses this to invalidate the cached provider. */
  onChange(cb: () => void): () => void;
}

export interface ResolvedProvider {
  profileId: PersistedProvider["profileId"];
  label: string;
  baseUrl: string;
  apiKey: string;
  models: ProfileModel[];
}

const KEY = "provider";

function readRow(db: Database): PersistedProvider | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(KEY) as { value: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as PersistedProvider;
    // Defensive validation. A corrupted row shouldn't crash the sidecar —
    // fall back to defaults and the user can re-save from Settings.
    if (
      typeof parsed.profileId !== "string" ||
      typeof parsed.baseUrl !== "string" ||
      typeof parsed.apiKey !== "string" ||
      !Array.isArray(parsed.customModels)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRow(db: Database, value: PersistedProvider): void {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(KEY, JSON.stringify(value));
}

function resolve(persisted: PersistedProvider): ResolvedProvider {
  if (persisted.profileId === "custom") {
    return {
      profileId: "custom",
      label: "Custom",
      baseUrl: persisted.baseUrl,
      apiKey: persisted.apiKey,
      models: persisted.customModels,
    };
  }
  const builtIn = getBuiltInProfile(persisted.profileId);
  if (!builtIn) {
    // Profile id removed in a future release — degrade gracefully to Anthropic.
    return {
      profileId: "anthropic",
      label: "Anthropic",
      baseUrl: persisted.baseUrl || BUILT_IN_PROFILES[0]!.baseUrl,
      apiKey: persisted.apiKey,
      models: BUILT_IN_PROFILES[0]!.models,
    };
  }
  // For built-in profiles the baseUrl in persisted is *suggested*; user can
  // override (e.g. self-hosted Anthropic-compat gateway). Empty string falls
  // back to the profile's default.
  return {
    profileId: builtIn.id,
    label: builtIn.label,
    baseUrl: persisted.baseUrl || builtIn.baseUrl,
    apiKey: persisted.apiKey,
    models: builtIn.models,
  };
}

export function createProviderSettings(
  db: Database,
  envFallback: { apiKey?: string; baseUrl?: string },
): ProviderSettingsState {
  let cache: PersistedProvider = readRow(db) ?? {
    profileId: "anthropic",
    baseUrl: envFallback.baseUrl ?? "",
    apiKey: envFallback.apiKey ?? "",
    customModels: [],
  };

  const listeners = new Set<() => void>();
  const notify = () => {
    for (const fn of listeners) fn();
  };

  return {
    current(): ResolvedProvider {
      return resolve(cache);
    },
    getApiKey(): string {
      return cache.apiKey;
    },
    update(patch): ResolvedProvider {
      cache = {
        profileId: patch.profileId ?? cache.profileId,
        baseUrl: patch.baseUrl ?? cache.baseUrl,
        apiKey: patch.apiKey ?? cache.apiKey,
        customModels: patch.customModels ?? cache.customModels,
      };
      writeRow(db, cache);
      notify();
      return resolve(cache);
    },
    onChange(cb): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
