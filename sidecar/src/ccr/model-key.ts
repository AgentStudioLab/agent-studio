const CCR_MODEL_KEY_PREFIX = "agentstudio";
const EMPTY_SEGMENT = "_";

export interface CcrModelKeyParts {
  providerId: string;
  modelId: string;
}

export function sanitizeCcrSegment(value: string): string {
  const trimmed = value.trim();
  return encodeURIComponent(trimmed.length > 0 ? trimmed : EMPTY_SEGMENT);
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
    return {
      providerId: decodeURIComponent(segments[1] ?? ""),
      modelId: decodeURIComponent(segments[2] ?? ""),
    };
  } catch {
    return null;
  }
}
