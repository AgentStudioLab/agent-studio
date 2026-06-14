// Provider profile registry. This is the sidecar-side single source of truth
// for built-in provider metadata, API defaults, model discovery strategy, and
// fallback model ids.

export type ProviderProfileId =
  | "anthropic"
  | "deepseek"
  | "gemini"
  | "openai"
  | "minimax"
  | "openrouter"
  | "novita"
  | "bedrock"
  | "dashscope"
  | "siliconflow-cn"
  | "siliconflow"
  | "zhipu"
  | "moonshot-cn"
  | "moonshot-global"
  | "doubao"
  | "volcengine-ark"
  | "bailian"
  | "qianfan"
  | "hunyuan"
  | "custom";

export interface ProfileModel {
  id: string;
  displayName: string;
  description: string;
}

export type ModelListStrategy =
  | { strategy: "static" }
  | { strategy: "anthropic"; path?: string }
  | { strategy: "openai-compatible"; path?: string }
  | { strategy: "gemini" }
  | { strategy: "bedrock" };

export interface AgentRuntimeCapabilities {
  text: boolean;
  tools: boolean;
  fileCheckpoint: boolean;
}

export type AgentRuntime =
  | {
      protocol: "anthropic";
      baseUrl: string;
      auth: "x-api-key" | "bearer";
      capabilities: AgentRuntimeCapabilities;
    }
  | {
      protocol: "openai-compatible";
      baseUrl: string;
      auth: "bearer";
      capabilities: AgentRuntimeCapabilities;
    }
  | {
      protocol: "unsupported";
      reason: string;
      capabilities: AgentRuntimeCapabilities;
    };

export interface ProviderProfile {
  id: Exclude<ProviderProfileId, "custom">;
  label: string;
  region?: "Global" | "China" | "Cloud";
  baseUrl: string;
  modelList: ModelListStrategy;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
  models: ProfileModel[];
}

type ProviderProfileInput =
  Omit<ProviderProfile, "supportsRemoteModels" | "agentRuntime"> & {
    agentRuntime?: AgentRuntime;
  };
const RUNTIME_COMPATIBILITY_NOTE =
  "OpenAI-compatible runtime currently supports text streaming only; tool calls and file rewind are not connected yet.";

const ANTHROPIC_FULL_CAPABILITIES: AgentRuntimeCapabilities = {
  text: true,
  tools: true,
  fileCheckpoint: true,
};

const OPENAI_TEXT_CAPABILITIES: AgentRuntimeCapabilities = {
  text: true,
  tools: false,
  fileCheckpoint: false,
};

const UNSUPPORTED_CAPABILITIES: AgentRuntimeCapabilities = {
  text: false,
  tools: false,
  fileCheckpoint: false,
};

function anthropicRuntime(
  baseUrl: string,
  auth: "x-api-key" | "bearer" = "x-api-key",
): AgentRuntime {
  return {
    protocol: "anthropic",
    baseUrl,
    auth,
    capabilities: ANTHROPIC_FULL_CAPABILITIES,
  };
}

function openAICompatibleRuntime(baseUrl: string): AgentRuntime {
  return {
    protocol: "openai-compatible",
    baseUrl,
    auth: "bearer",
    capabilities: OPENAI_TEXT_CAPABILITIES,
  };
}

function fallbackModel(id: string, displayName: string): ProfileModel {
  return {
    id,
    displayName,
    description: "Curated fallback model",
  };
}

function defineProfile(profile: ProviderProfileInput): ProviderProfile {
  return {
    ...profile,
    agentRuntime:
      profile.agentRuntime ??
      ({
        protocol: "unsupported",
        reason: "Agent runtime is not implemented for this provider.",
        capabilities: UNSUPPORTED_CAPABILITIES,
      } satisfies AgentRuntime),
    compatibilityNote:
      profile.compatibilityNote ??
      (profile.id === "anthropic" || profile.id === "deepseek"
        ? undefined
        : RUNTIME_COMPATIBILITY_NOTE),
    supportsRemoteModels: profile.modelList.strategy !== "static",
  };
}

export const ANTHROPIC_PROFILE: ProviderProfile = defineProfile({
  id: "anthropic",
  label: "Anthropic",
  region: "Global",
  baseUrl: "https://api.anthropic.com",
  modelList: { strategy: "anthropic", path: "/v1/models" },
  agentRuntime: anthropicRuntime("https://api.anthropic.com", "x-api-key"),
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
});

export const DEEPSEEK_PROFILE: ProviderProfile = defineProfile({
  id: "deepseek",
  label: "深度求索",
  region: "Global",
  baseUrl: "https://api.deepseek.com/anthropic",
  modelList: { strategy: "static" },
  agentRuntime: anthropicRuntime(
    "https://api.deepseek.com/anthropic",
    "x-api-key",
  ),
  compatibilityNote: "Uses DeepSeek's Anthropic-compatible endpoint.",
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
});

const PROFILE_INPUTS: ProviderProfileInput[] = [
  ANTHROPIC_PROFILE,
  DEEPSEEK_PROFILE,
  {
    id: "gemini",
    label: "Gemini",
    region: "Global",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelList: { strategy: "gemini" },
    models: [fallbackModel("gemini-2.5-pro", "Gemini 2.5 Pro")],
  },
  {
    id: "openai",
    label: "OpenAI",
    region: "Global",
    baseUrl: "https://api.openai.com/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://api.openai.com/v1"),
    models: [fallbackModel("gpt-5.1", "GPT-5.1")],
  },
  {
    id: "minimax",
    label: "稀宇科技 MiniMax",
    region: "Global",
    baseUrl: "https://api.minimax.io/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://api.minimax.io/v1"),
    models: [fallbackModel("MiniMax-M1", "MiniMax M1")],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    region: "Global",
    baseUrl: "https://openrouter.ai/api/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://openrouter.ai/api/v1"),
    models: [fallbackModel("openai/gpt-5.1", "OpenAI GPT-5.1")],
  },
  {
    id: "novita",
    label: "Novita",
    region: "Global",
    baseUrl: "https://api.novita.ai/v3/openai",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://api.novita.ai/v3/openai"),
    models: [fallbackModel("deepseek/deepseek-v3-0324", "DeepSeek V3 0324")],
  },
  {
    id: "bedrock",
    label: "Amazon Bedrock",
    region: "Cloud",
    baseUrl: "https://bedrock-runtime.amazonaws.com",
    modelList: { strategy: "bedrock" },
    models: [fallbackModel("anthropic.claude-sonnet-4-5", "Claude Sonnet 4.5")],
  },
  {
    id: "dashscope",
    label: "阿里云灵积",
    region: "China",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime(
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    models: [fallbackModel("qwen-plus", "Qwen Plus")],
  },
  {
    id: "siliconflow-cn",
    label: "硅基流动（中国）",
    region: "China",
    baseUrl: "https://api.siliconflow.cn/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://api.siliconflow.cn/v1"),
    models: [fallbackModel("deepseek-ai/DeepSeek-V3", "DeepSeek V3")],
  },
  {
    id: "siliconflow",
    label: "硅基流动（全球）",
    region: "Global",
    baseUrl: "https://api.siliconflow.com/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://api.siliconflow.com/v1"),
    models: [fallbackModel("deepseek-ai/DeepSeek-V3", "DeepSeek V3")],
  },
  {
    id: "zhipu",
    label: "智谱 AI",
    region: "China",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://open.bigmodel.cn/api/paas/v4"),
    models: [fallbackModel("glm-4.6", "GLM-4.6")],
  },
  {
    id: "moonshot-cn",
    label: "月之暗面（中国）",
    region: "China",
    baseUrl: "https://api.moonshot.cn/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://api.moonshot.cn/v1"),
    models: [fallbackModel("kimi-k2-0711-preview", "Kimi K2 0711 Preview")],
  },
  {
    id: "moonshot-global",
    label: "月之暗面（全球）",
    region: "Global",
    baseUrl: "https://api.moonshot.ai/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://api.moonshot.ai/v1"),
    models: [fallbackModel("kimi-k2-0711-preview", "Kimi K2 0711 Preview")],
  },
  {
    id: "doubao",
    label: "豆包",
    region: "China",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime(
      "https://ark.cn-beijing.volces.com/api/v3",
    ),
    models: [fallbackModel("doubao-seed-1-6", "Doubao Seed 1.6")],
  },
  {
    id: "volcengine-ark",
    label: "火山方舟",
    region: "Cloud",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime(
      "https://ark.cn-beijing.volces.com/api/v3",
    ),
    models: [fallbackModel("doubao-seed-1-6", "Doubao Seed 1.6")],
  },
  {
    id: "bailian",
    label: "阿里云百炼",
    region: "Cloud",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime(
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    models: [fallbackModel("qwen-max", "Qwen Max")],
  },
  {
    id: "qianfan",
    label: "百度千帆",
    region: "Cloud",
    baseUrl: "https://qianfan.baidubce.com/v2",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://qianfan.baidubce.com/v2"),
    models: [fallbackModel("ernie-4.5-turbo-128k", "ERNIE 4.5 Turbo 128K")],
  },
  {
    id: "hunyuan",
    label: "腾讯混元",
    region: "Cloud",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    modelList: { strategy: "openai-compatible", path: "/models" },
    agentRuntime: openAICompatibleRuntime("https://api.hunyuan.cloud.tencent.com/v1"),
    models: [fallbackModel("hunyuan-turbos-latest", "Hunyuan TurboS")],
  },
];

export const BUILT_IN_PROFILES: ProviderProfile[] =
  PROFILE_INPUTS.map(defineProfile);

type BuiltInProfileLookup<T extends ProviderProfile["id"]> =
  ProviderProfile & { id: T };
type LegacyBuiltInProfileId = "anthropic" | "deepseek";
type LegacyProviderProfileId = LegacyBuiltInProfileId | "custom";

export function getBuiltInProfile<T extends ProviderProfile["id"]>(
  id: T,
): BuiltInProfileLookup<T> | undefined;
export function getBuiltInProfile(
  id: LegacyProviderProfileId,
): (ProviderProfile & { id: LegacyBuiltInProfileId }) | undefined;
export function getBuiltInProfile(id: string): ProviderProfile | undefined;
export function getBuiltInProfile(id: string): ProviderProfile | undefined {
  return BUILT_IN_PROFILES.find((p) => p.id === id);
}

export function isBuiltInProfileId(
  id: string,
): id is ProviderProfile["id"] {
  return getBuiltInProfile(id) !== undefined;
}
