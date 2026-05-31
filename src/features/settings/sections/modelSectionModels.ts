import type { ProfileModel } from "@/lib/data/settings";

export function parseCustomModels(text: string): ProfileModel[] {
  try {
    const parsed = JSON.parse(text || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const models: ProfileModel[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.displayName !== "string" ||
        typeof record.description !== "string"
      ) {
        continue;
      }
      models.push({
        id: record.id,
        displayName: record.displayName,
        description: record.description,
      });
    }
    return models;
  } catch {
    return [];
  }
}

export function prioritizeSelectedModel(
  models: ProfileModel[],
  selectedModelId: string | null,
): ProfileModel[] {
  if (!selectedModelId) return models;
  const selected = models.find((model) => model.id === selectedModelId);
  if (!selected) return models;
  return [
    selected,
    ...models.filter((model) => model.id !== selectedModelId),
  ];
}
