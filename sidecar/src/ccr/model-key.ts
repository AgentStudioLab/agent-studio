const CCR_MODEL_KEY_PREFIX = "agentstudio";

export interface CcrModelKeyParts {
  providerId: string;
  modelId: string;
}

export function sanitizeCcrSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("ccr_model_key_empty_segment");
  return encodeURIComponent(trimmed);
}

export function buildCcrModelKey(parts: CcrModelKeyParts): string {
  return [
    CCR_MODEL_KEY_PREFIX,
    sanitizeCcrSegment(parts.providerId),
    sanitizeCcrSegment(parts.modelId),
  ].join("/");
}

export function parseCcrModelKey(value: string): CcrModelKeyParts | null {
  const segments = value.split("/");
  if (segments.length !== 3 || segments[0] !== CCR_MODEL_KEY_PREFIX) {
    return null;
  }

  try {
    const providerId = decodeURIComponent(segments[1] ?? "").trim();
    const modelId = decodeURIComponent(segments[2] ?? "").trim();
    if (!providerId || !modelId) return null;
    return { providerId, modelId };
  } catch {
    return null;
  }
}
