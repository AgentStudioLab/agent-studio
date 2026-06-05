// Frontend model catalog — pulled from sidecar.
//
// The sidecar owns the model list per provider profile (Anthropic / DeepSeek /
// Custom). We just fetch and render. No client-side allowlist filtering, no
// i18n description keys — descriptions ship from the server alongside ids.
//
// If you used to import CURRENT_MODELS / DEFAULT_MODEL_ID directly:
//   - DEFAULT_MODEL_ID is no longer a compile-time constant. Use the hook's
//     `defaultModelId` and treat `null` as "no default yet — wait for /models".

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSidecar } from "@/lib/sidecar-client";

export interface ModelEntry {
  id: string;
  displayName: string;
  description: string;
}

export interface ModelsResponse {
  data: ModelEntry[];
  defaultModelId?: string | null;
}

async function fetchModels(): Promise<ModelsResponse> {
  const res = await fetchSidecar("/models");
  if (!res.ok) throw new Error(`/models ${res.status}`);
  return (await res.json()) as ModelsResponse;
}

export async function refreshModels(): Promise<ModelsResponse> {
  const res = await fetchSidecar("/models/refresh", { method: "POST" });
  if (!res.ok) {
    let error: string | undefined;
    try {
      const json = (await res.json()) as { error?: unknown };
      if (typeof json.error === "string") error = json.error;
    } catch {
      // Fall through to the status-based error below.
    }
    throw new Error(error ?? `models_refresh_${res.status}`);
  }
  return (await res.json()) as ModelsResponse;
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

  const models = useMemo<ModelEntry[]>(
    () => query.data?.data ?? [],
    [query.data],
  );
  const defaultModelId = query.data?.defaultModelId ?? models[0]?.id ?? null;

  return {
    models,
    defaultModelId,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
