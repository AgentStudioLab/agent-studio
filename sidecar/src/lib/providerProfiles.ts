// Provider profile registry. Single source of truth for built-in
// (anthropic, deepseek) baseUrl + model list, plus Custom which gets its
// list from user-provided JSON.
//
// Why sidecar-side: the SDK CLI runs out of the sidecar, so model ids must
// be validated where they're consumed. Frontend pulls profiles via
// GET /settings/provider — no duplication.

export interface ProfileModel {
  id: string;
  displayName: string;
  description: string;
}

export interface ProviderProfile {
  /** Discriminator. Custom is user-defined. */
  id: "anthropic" | "deepseek" | "custom";
  /** Display label for the Settings dropdown. */
  label: string;
  /** Endpoint forwarded to the SDK CLI as ANTHROPIC_BASE_URL. */
  baseUrl: string;
  /** Curated model list shown in the picker. */
  models: ProfileModel[];
}

export const ANTHROPIC_PROFILE: ProviderProfile = {
  id: "anthropic",
  label: "Anthropic",
  baseUrl: "https://api.anthropic.com",
  models: [
    {
      id: "claude-opus-4-7",
      displayName: "Opus 4.7",
      description: "Most capable for ambitious work",
    },
    {
      id: "claude-sonnet-4-6",
      displayName: "Sonnet 4.6",
      description: "Responsive everyday work",
    },
    {
      id: "claude-haiku-4-5",
      displayName: "Haiku 4.5",
      description: "Fastest, most efficient",
    },
  ],
};

// DeepSeek's Anthropic-compatible endpoint. Their two flagship models map
// cleanly: chat (V3.x) and reasoner (R1). If they ship new ids, add here.
export const DEEPSEEK_PROFILE: ProviderProfile = {
  id: "deepseek",
  label: "DeepSeek",
  baseUrl: "https://api.deepseek.com/anthropic",
  models: [
    {
      id: "deepseek-chat",
      displayName: "DeepSeek Chat",
      description: "General-purpose conversational model",
    },
    {
      id: "deepseek-reasoner",
      displayName: "DeepSeek Reasoner",
      description: "Reasoning-optimized, slower but stronger",
    },
  ],
};

export const BUILT_IN_PROFILES: ProviderProfile[] = [
  ANTHROPIC_PROFILE,
  DEEPSEEK_PROFILE,
];

export function getBuiltInProfile(
  id: string,
): ProviderProfile | undefined {
  return BUILT_IN_PROFILES.find((p) => p.id === id);
}
