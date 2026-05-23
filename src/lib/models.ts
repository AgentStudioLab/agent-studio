// Frontend model catalog — pulled from sidecar.
//
// The sidecar owns the model list per provider profile (Anthropic / DeepSeek /
// Custom). We just fetch and render. No client-side allowlist filtering, no
// i18n description keys — descriptions ship from the server alongside ids.
//
// If you used to import CURRENT_MODELS / DEFAULT_MODEL_ID directly:
//   - DEFAULT_MODEL_ID is no longer a compile-time constant. Use the hook's
//     `defaultModelId` (first id in the fetched list) and treat `null` as "no
//     default yet — wait for /models".

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSidecar } from "@/lib/sidecar-client";

export interface ModelEntry {
  id: string;
  displayName: string;
  description: string;
}

interface ModelsResponse {
  data: ModelEntry[];
}

async function fetchModels(): Promise<ModelEntry[]> {
  const res = await fetchSidecar("/models");
  if (!res.ok) throw new Error(`/models ${res.status}`);
  const json = (await res.json()) as ModelsResponse;
  return json.data;
}

export function useAvailableModels(): {
  models: ModelEntry[];
  defaultModelId: string | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: ["models"],
    queryFn: fetchModels,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const models = useMemo<ModelEntry[]>(() => query.data ?? [], [query.data]);
  const defaultModelId = models[0]?.id ?? null;

  return {
    models,
    defaultModelId,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
