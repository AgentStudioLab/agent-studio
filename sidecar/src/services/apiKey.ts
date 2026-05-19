export interface ApiKeyState {
  get(): string | null;
  set(value: string | null): void;
}

export function createApiKeyState(initial: string | undefined | null): ApiKeyState {
  let current: string | null = initial ?? null;
  return {
    get: () => current,
    set: (value) => {
      current = value;
    },
  };
}
