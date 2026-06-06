# Provider Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. During execution, update **Execution Progress** after every completed, blocked, or materially changed task.

**Goal:** 将模型设置从单个 active provider/model 升级为多个可管理的模型预设，并让对话页直接选择已配置好的模型服务。

**Architecture:** `sidecar/src/services/providerSettings.ts` 迁移为 `version: 2` preset store，继续通过 `current()` 暴露 active preset 的 resolved provider，保证 server runtime 和 `/models` 路径仍只消费一个 active config。前端通过 `/settings/provider` 获取 preset 列表，通过 preset routes 创建、读取、更新、激活、删除预设；对话页选择器激活全局 preset，而不再保存裸 model id。

**Tech Stack:** TypeScript、Bun test、Bun SQLite、Hono、React 19、TanStack Query、shadcn/ui、ai-elements、Tailwind v4 design tokens。

**Spec:** `docs/superpowers/specs/2026-06-06-provider-presets-design.md`

**提交策略:** 本计划默认不自动提交。执行阶段如果用户明确要求提交，按任务窄范围 stage/commit；commit message 必须使用英文 Conventional Commit。

---

## Execution Progress

| Task | Status | Last update | Notes |
|---|---|---|---|
| 1. Provider preset store migration | done | 2026-06-06 | `cd sidecar && bun test src/services/providerSettings.test.ts` PASS: 17 pass, 0 fail; spec and quality reviews approved |
| 2. Provider preset mutations | done | 2026-06-06 | `cd sidecar && bun test src/services/providerSettings.test.ts` PASS: 30 pass, 0 fail; spec and quality reviews approved |
| 3. Provider settings routes | done | 2026-06-06 | `cd sidecar && bun test src/routes/settings-provider.test.ts src/routes/settings.test.ts` PASS: 14 pass, 0 fail; spec and quality reviews approved |
| 4. Models route active preset refresh | done | 2026-06-06 | `cd sidecar && bun test src/routes/models.test.ts` PASS: 9 pass, 0 fail; spec and quality reviews approved |
| 5. Frontend settings client | done | 2026-06-06 | `bun test src/lib/models.test.tsx` PASS; `bunx tsc --noEmit -p tsconfig.app.json` PASS; spec and quality reviews approved |
| 6. Settings page preset UI | done | 2026-06-06 | `bun test src/features/settings/sections/ModelSection.test.tsx` PASS: 19 pass, 0 fail; `bunx tsc --noEmit -p tsconfig.app.json` PASS; spec and quality reviews approved |
| 7. Conversation preset picker | done | 2026-06-06 | `bun test src/features/task/ProviderPresetPicker.test.tsx` PASS: 3 pass, 0 fail; `bunx tsc --noEmit -p tsconfig.app.json` PASS |
| 8. Verification and cleanup | done | 2026-06-06 | Sidecar targeted tests PASS: 53 pass, 0 fail; frontend targeted tests PASS: 23 pass, 0 fail; sidecar and frontend typechecks PASS; old bare model picker scan reviewed |

## File Structure

- Modify `sidecar/src/services/providerSettings.ts`: introduce v2 persisted shape, preset types, migration, active preset resolve, preset CRUD helpers, active-change notification rules.
- Modify `sidecar/src/services/providerSettings.test.ts`: cover migration, current resolve, preset create/read/update/activate/delete, listener behavior, remote cache isolation.
- Modify `sidecar/src/routes/settings.ts`: return preset list, add preset CRUD routes, keep `POST /settings/provider` as active-preset compatibility route.
- Modify `sidecar/src/routes/settings-provider.test.ts`: cover new route contracts and errors.
- Modify `sidecar/src/routes/models.ts`: ensure `/models` and `/models/refresh` operate only on active preset.
- Modify `sidecar/src/routes/models.test.ts`: cover active preset refresh and cache isolation.
- Modify `src/lib/data/settings.ts`: add preset types and client methods.
- Modify `src/lib/models.ts` and `src/lib/models.test.tsx`: preserve active-preset model list behavior; add invalidation assumptions if needed.
- Modify `src/features/settings/sections/ModelSection.tsx`: split into preset list + preset detail editor.
- Modify `src/features/settings/sections/ModelSection.test.tsx`: cover preset list, detail reads, active switching, CRUD buttons, save/refresh behavior.
- Create `src/features/task/ProviderPresetPicker.tsx`: dropdown for configured model services.
- Create `src/features/task/ProviderPresetPicker.test.tsx`: cover labels, activation, disabled state, unsupported runtime display.
- Modify `src/features/task/ModelPicker.tsx`: remove after callers migrate, or keep only if scheduled/agent workspace still needs bare model picker in this release.
- Modify `src/features/task/TaskMessageInput.tsx`: use preset picker, not `useThreadModel`.
- Modify `src/features/task/TaskView.tsx`: stop resolving `effectiveModel` from per-thread model for normal chat sends; continue passing model only for legacy/scheduled conversation data if still needed by existing APIs.
- Modify `src/features/new-task/NewTaskView.tsx`: use preset picker or omit model field from pending prompt so sidecar resolves active preset.
- Modify `src/features/agent-workspaces/AgentSpaceView.tsx` and `src/features/scheduled/NewScheduledModal.tsx` only if compile/tests show existing bare model picker contracts break; scheduled-task and agent-workspace model preset semantics are explicitly outside this plan.
- Modify `src/i18n/locales/en/settings.json`, `src/i18n/locales/zh/settings.json`, and task/new-task locale files: add preset UI strings.

## Task 1: Provider Preset Store Migration

**Files:**
- Modify: `sidecar/src/services/providerSettings.ts`
- Modify: `sidecar/src/services/providerSettings.test.ts`

- [ ] **Step 1: Write failing migration tests**

Add tests to `sidecar/src/services/providerSettings.test.ts`:

```ts
it("migrates a legacy single provider row into an active preset", () => {
  const db = makeDb();
  db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
    "provider",
    JSON.stringify({
      profileId: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-key",
      remoteModels: [
        { id: "gpt-5.1", displayName: "GPT-5.1", description: "Remote model" },
      ],
      remoteModelsProviderId: "openai",
      remoteModelsBaseUrl: "https://api.openai.com/v1",
      remoteModelsFetchedAt: "2026-06-06T00:00:00.000Z",
      selectedModelId: "gpt-5.1",
    }),
  );

  const settings = createProviderSettings(db, {});
  const current = settings.current();

  expect(current).toMatchObject({
    profileId: "openai",
    presetName: "OpenAI",
    apiKey: "openai-key",
    selectedModelId: "gpt-5.1",
    remoteModelsFetchedAt: "2026-06-06T00:00:00.000Z",
  });
  expect(typeof current.presetId).toBe("string");
  expect(settings.listPresets()).toHaveLength(1);
  expect(settings.listPresets()[0]).toMatchObject({
    id: current.presetId,
    name: "OpenAI",
    selectedModelId: "gpt-5.1",
  });
});

it("creates a default Anthropic preset when the provider row is missing", () => {
  const settings = createProviderSettings(makeDb(), {
    apiKey: "env-key",
    baseUrl: "https://env.example",
  });

  expect(settings.current()).toMatchObject({
    profileId: "anthropic",
    presetName: "Anthropic",
    apiKey: "env-key",
    baseUrl: "https://env.example",
  });
  expect(settings.listPresets()).toHaveLength(1);
});
```

- [ ] **Step 2: Run migration tests and verify failure**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts -t "preset"
```

Expected: FAIL because `presetId`, `presetName`, and `listPresets()` do not exist yet.

- [ ] **Step 3: Add v2 persisted types and preset summary types**

In `sidecar/src/services/providerSettings.ts`, replace the single persisted-only model with v2-capable types:

```ts
export interface ProviderPreset {
  id: string;
  name: string;
  profileId: ProviderProfileId;
  baseUrl: string;
  apiKey: string;
  remoteModels: ProfileModel[];
  remoteModelsProviderId: ProviderProfileId | "";
  remoteModelsBaseUrl: string;
  remoteModelsFetchedAt: string;
  selectedModelId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PersistedProviderSettingsV2 {
  version: 2;
  activePresetId: string;
  presets: ProviderPreset[];
}

export interface ProviderPresetSummary {
  id: string;
  name: string;
  profileId: ProviderProfileId;
  providerLabel: string;
  baseUrl: string;
  selectedModelId: string | null;
  selectedModelLabel: string | null;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  remoteModelsFetchedAt: string;
  compatibilityNote?: string;
}
```

Update `ResolvedProvider`:

```ts
export interface ResolvedProvider {
  presetId: string;
  presetName: string;
  profileId: ProviderProfileId;
  label: string;
  baseUrl: string;
  apiKey: string;
  models: ProfileModel[];
  remoteModelsFetchedAt: string;
  selectedModelId: string | null;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
}
```

- [ ] **Step 4: Add deterministic helpers for preset defaults**

Add helpers near existing sanitizers:

```ts
function nowIso(): string {
  return new Date().toISOString();
}

function newPresetId(): string {
  return crypto.randomUUID();
}

function presetNameForProfile(profileId: ProviderProfileId): string {
  if (profileId === "custom") return "Custom";
  return getBuiltInProfile(profileId)?.label ?? "Default";
}

function defaultPreset(envFallback: {
  apiKey?: string;
  baseUrl?: string;
}): ProviderPreset {
  const ts = nowIso();
  return {
    id: newPresetId(),
    name: "Anthropic",
    profileId: DEFAULT_PROFILE_ID,
    baseUrl: envFallback.baseUrl ?? "",
    apiKey: envFallback.apiKey ?? "",
    remoteModels: [],
    remoteModelsProviderId: "",
    remoteModelsBaseUrl: "",
    remoteModelsFetchedAt: "",
    selectedModelId: null,
    createdAt: ts,
    updatedAt: ts,
  };
}
```

- [ ] **Step 5: Implement v2 normalize/read/write without changing route behavior**

Replace `readRow()` so it returns `PersistedProviderSettingsV2 | null`, and preserve legacy reads:

```ts
function legacyToV2(value: PersistedProvider, envFallback: {
  apiKey?: string;
  baseUrl?: string;
}): PersistedProviderSettingsV2 {
  const ts = nowIso();
  const preset: ProviderPreset = {
    id: newPresetId(),
    name: presetNameForProfile(value.profileId),
    ...value,
    createdAt: ts,
    updatedAt: ts,
  };
  return { version: 2, activePresetId: preset.id, presets: [preset] };
}

function writeRow(db: Database, value: PersistedProviderSettingsV2): void {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(KEY, JSON.stringify(value));
}
```

Keep the existing `PersistedProvider` interface as the legacy and per-preset field set while migrating. Do not remove old tests yet; update their expectations to include `presetId`/`presetName` only where needed.

- [ ] **Step 6: Update `resolve()` to resolve a preset**

Change `resolve(persisted: PersistedProvider)` to accept `ProviderPreset`, and include `presetId`/`presetName` in every return branch:

```ts
function resolve(preset: ProviderPreset): ResolvedProvider {
  // Existing profile/custom logic stays the same, but reads from `preset`.
  // Every returned object includes:
  // presetId: preset.id,
  // presetName: preset.name,
}
```

- [ ] **Step 7: Extend `ProviderSettingsState` with read methods**

Update the interface:

```ts
export interface ProviderSettingsState {
  current(): ResolvedProvider;
  getPreset(id: string): ResolvedProvider | null;
  listPresets(): ProviderPresetSummary[];
  getApiKey(): string;
  update(patch: Partial<PersistedProvider>): ResolvedProvider;
  onChange(cb: () => void): () => void;
}
```

Implement `getPreset()` and `listPresets()` from the v2 cache. `listPresets()` should resolve each preset and derive `selectedModelLabel` from its active model list:

```ts
function toSummary(preset: ProviderPreset): ProviderPresetSummary {
  const resolved = resolve(preset);
  const selected =
    resolved.models.find((model) => model.id === resolved.selectedModelId) ??
    resolved.models[0] ??
    null;
  return {
    id: preset.id,
    name: preset.name,
    profileId: preset.profileId,
    providerLabel: resolved.label,
    baseUrl: resolved.baseUrl,
    selectedModelId: resolved.selectedModelId,
    selectedModelLabel: selected?.displayName ?? selected?.id ?? null,
    agentRuntime: resolved.agentRuntime,
    supportsRemoteModels: resolved.supportsRemoteModels,
    remoteModelsFetchedAt: resolved.remoteModelsFetchedAt,
    compatibilityNote: resolved.compatibilityNote,
  };
}
```

- [ ] **Step 8: Run provider settings tests**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts
```

Expected: PASS after updating existing assertions for the new resolved shape.

## Task 2: Provider Preset Mutations

**Files:**
- Modify: `sidecar/src/services/providerSettings.ts`
- Modify: `sidecar/src/services/providerSettings.test.ts`

- [ ] **Step 1: Write failing mutation tests**

Add tests:

```ts
it("creates a preset by copying the active preset without activating it", () => {
  const settings = createProviderSettings(makeDb(), {});
  settings.update({
    profileId: "openai",
    apiKey: "openai-key",
    selectedModelId: "gpt-5.1",
  });
  const activeBefore = settings.current().presetId;

  const created = settings.createPreset({ name: "OpenAI backup" });

  expect(created).toMatchObject({
    presetName: "OpenAI backup",
    profileId: "openai",
    apiKey: "openai-key",
    selectedModelId: "gpt-5.1",
  });
  expect(settings.current().presetId).toBe(activeBefore);
  expect(settings.listPresets()).toHaveLength(2);
});

it("activates a preset and notifies listeners once", () => {
  const settings = createProviderSettings(makeDb(), {});
  const created = settings.createPreset({ name: "Alt", activate: false });
  let calls = 0;
  settings.onChange(() => calls++);

  const current = settings.activatePreset(created.presetId);

  expect(current?.presetId).toBe(created.presetId);
  expect(settings.current().presetId).toBe(created.presetId);
  expect(calls).toBe(1);
});

it("does not notify runtime listeners when updating a non-active preset", () => {
  const settings = createProviderSettings(makeDb(), {});
  const created = settings.createPreset({ name: "Alt", activate: false });
  let calls = 0;
  settings.onChange(() => calls++);

  const updated = settings.updatePreset(created.presetId, {
    name: "Alt renamed",
    apiKey: "non-active-key",
  });

  expect(updated?.presetName).toBe("Alt renamed");
  expect(calls).toBe(0);
});

it("rejects deleting the final preset and switches when deleting the active preset", () => {
  const settings = createProviderSettings(makeDb(), {});
  expect(settings.deletePreset(settings.current().presetId)).toEqual({
    ok: false,
    error: "cannot_delete_last_preset",
  });

  const first = settings.current().presetId;
  const second = settings.createPreset({ name: "Second", activate: true }).presetId;

  expect(settings.deletePreset(second)).toEqual({ ok: true });
  expect(settings.current().presetId).toBe(first);
});
```

- [ ] **Step 2: Run mutation tests and verify failure**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts -t "preset"
```

Expected: FAIL because mutation methods do not exist.

- [ ] **Step 3: Extend `ProviderSettingsState` mutation API**

Update interface:

```ts
export type ProviderPresetPatch = Partial<
  Pick<
    ProviderPreset,
    "name" | "profileId" | "baseUrl" | "apiKey" | "selectedModelId"
  >
>;

export interface CreateProviderPresetInput {
  name?: string;
  copyFromPresetId?: string;
  activate?: boolean;
}

export interface ProviderSettingsState {
  current(): ResolvedProvider;
  getPreset(id: string): ResolvedProvider | null;
  listPresets(): ProviderPresetSummary[];
  createPreset(input?: CreateProviderPresetInput): ResolvedProvider;
  updatePreset(id: string, patch: ProviderPresetPatch): ResolvedProvider | null;
  activatePreset(id: string): ResolvedProvider | null;
  deletePreset(id: string): { ok: true } | { ok: false; error: "preset_not_found" | "cannot_delete_last_preset" };
  getApiKey(): string;
  update(patch: Partial<PersistedProvider>): ResolvedProvider;
  onChange(cb: () => void): () => void;
}
```

- [ ] **Step 4: Implement name sanitization**

Add:

```ts
function sanitizePresetName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

Use it in `createPreset()` and `updatePreset()`.

- [ ] **Step 5: Implement create/update/activate/delete**

Implementation rules:

```ts
function activePreset(cache: PersistedProviderSettingsV2): ProviderPreset {
  return (
    cache.presets.find((preset) => preset.id === cache.activePresetId) ??
    cache.presets[0]!
  );
}

function updateActivePreset(
  cache: PersistedProviderSettingsV2,
  patch: Partial<PersistedProvider>,
): PersistedProviderSettingsV2 {
  const active = activePreset(cache);
  const nextActive = buildNextProvider(active, patch);
  return {
    ...cache,
    activePresetId: active.id,
    presets: cache.presets.map((preset) =>
      preset.id === active.id
        ? { ...nextActive, id: active.id, name: active.name, createdAt: active.createdAt, updatedAt: nowIso() }
        : preset,
    ),
  };
}
```

Keep existing `update(patch)` as a compatibility method that calls `updateActivePreset()` and always notifies.

- [ ] **Step 6: Run provider settings mutation tests**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts
```

Expected: PASS.

## Task 3: Provider Settings Routes

**Files:**
- Modify: `sidecar/src/routes/settings.ts`
- Modify: `sidecar/src/routes/settings-provider.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests in `sidecar/src/routes/settings-provider.test.ts`:

```ts
it("GET /settings/provider returns presets and activePresetId", async () => {
  const res = await app.request("/settings/provider");
  expect(res.status).toBe(200);
  const body = await res.json() as {
    activePresetId: string;
    presets: Array<{ id: string; name: string; providerLabel: string }>;
    current: { presetId: string; presetName: string };
  };

  expect(body.activePresetId).toBe(body.current.presetId);
  expect(body.presets).toHaveLength(1);
  expect(body.presets[0]).toMatchObject({
    id: body.current.presetId,
    name: body.current.presetName,
  });
});

it("creates, reads, updates, activates, and deletes provider presets", async () => {
  const create = await app.request("/settings/provider/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "OpenAI preset", activate: false }),
  });
  expect(create.status).toBe(200);
  const created = await create.json() as { preset: { presetId: string } };

  const read = await app.request(`/settings/provider/presets/${created.preset.presetId}`);
  expect(read.status).toBe(200);

  const update = await app.request(`/settings/provider/presets/${created.preset.presetId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Renamed", profileId: "openai" }),
  });
  expect(update.status).toBe(200);

  const activate = await app.request(`/settings/provider/presets/${created.preset.presetId}/activate`, {
    method: "POST",
  });
  expect(activate.status).toBe(200);

  const del = await app.request(`/settings/provider/presets/${created.preset.presetId}`, {
    method: "DELETE",
  });
  expect(del.status).toBe(200);
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
cd sidecar && bun test src/routes/settings-provider.test.ts
```

Expected: FAIL because new response fields and routes do not exist.

- [ ] **Step 3: Update `GET /settings/provider`**

In `sidecar/src/routes/settings.ts`, return:

```ts
app.get("/settings/provider", (c) => {
  const current = provider.current();
  return c.json({
    current,
    activePresetId: current.presetId,
    presets: provider.listPresets(),
    builtIn: BUILT_IN_PROFILES,
  });
});
```

- [ ] **Step 4: Add preset body validators**

Add helpers:

```ts
function parseObjectBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function presetPatchFromBody(body: Record<string, unknown>) {
  const patch: Parameters<ProviderSettingsState["updatePreset"]>[1] = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return { error: "invalid_preset_name" as const };
    }
    patch.name = body.name;
  }
  if (body.profileId !== undefined) {
    if (!isValidProfileId(body.profileId)) return { error: "invalid_profile_id" as const };
    patch.profileId = body.profileId;
  }
  if (body.baseUrl !== undefined) {
    if (typeof body.baseUrl !== "string") return { error: "invalid_base_url" as const };
    patch.baseUrl = body.baseUrl;
  }
  if (body.apiKey !== undefined) {
    if (typeof body.apiKey !== "string") return { error: "invalid_api_key" as const };
    patch.apiKey = body.apiKey;
  }
  if (body.selectedModelId !== undefined) {
    if (body.selectedModelId !== null && typeof body.selectedModelId !== "string") {
      return { error: "invalid_selected_model_id" as const };
    }
    patch.selectedModelId = body.selectedModelId;
  }
  return { patch };
}
```

- [ ] **Step 5: Add preset CRUD routes**

Add routes before profile routes:

```ts
app.post("/settings/provider/presets", async (c) => {
  const body = parseObjectBody(await c.req.json().catch(() => ({}))) ?? {};
  if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim().length === 0)) {
    return c.json({ error: "invalid_preset_name" }, 400);
  }
  if (body.copyFromPresetId !== undefined && typeof body.copyFromPresetId !== "string") {
    return c.json({ error: "preset_not_found" }, 404);
  }
  const preset = provider.createPreset({
    name: typeof body.name === "string" ? body.name : undefined,
    copyFromPresetId:
      typeof body.copyFromPresetId === "string" ? body.copyFromPresetId : undefined,
    activate: body.activate === true,
  });
  return c.json({
    preset,
    current: provider.current(),
    activePresetId: provider.current().presetId,
    presets: provider.listPresets(),
  });
});

app.get("/settings/provider/presets/:id", (c) => {
  const preset = provider.getPreset(c.req.param("id"));
  if (!preset) return c.json({ error: "preset_not_found" }, 404);
  return c.json({ preset });
});

app.post("/settings/provider/presets/:id", async (c) => {
  const body = parseObjectBody(await c.req.json().catch(() => null));
  if (!body) return c.json({ error: "invalid_body" }, 400);
  const parsed = presetPatchFromBody(body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const preset = provider.updatePreset(c.req.param("id"), parsed.patch);
  if (!preset) return c.json({ error: "preset_not_found" }, 404);
  return c.json({
    preset,
    current: provider.current(),
    activePresetId: provider.current().presetId,
    presets: provider.listPresets(),
  });
});

app.post("/settings/provider/presets/:id/activate", (c) => {
  const current = provider.activatePreset(c.req.param("id"));
  if (!current) return c.json({ error: "preset_not_found" }, 404);
  return c.json({
    current,
    activePresetId: current.presetId,
    presets: provider.listPresets(),
  });
});

app.delete("/settings/provider/presets/:id", (c) => {
  const result = provider.deletePreset(c.req.param("id"));
  if (!result.ok) {
    return c.json(
      { error: result.error },
      result.error === "preset_not_found" ? 404 : 400,
    );
  }
  const current = provider.current();
  return c.json({
    current,
    activePresetId: current.presetId,
    presets: provider.listPresets(),
  });
});
```

- [ ] **Step 6: Keep compatibility route updating active preset**

Keep `POST /settings/provider` but have it call `provider.update(patch)`. Ensure response still includes `{ current }`; do not require callers to know preset id.

- [ ] **Step 7: Run route tests**

Run:

```bash
cd sidecar && bun test src/routes/settings-provider.test.ts src/routes/settings.test.ts
```

Expected: PASS.

## Task 4: Models Route Active Preset Refresh

**Files:**
- Modify: `sidecar/src/routes/models.ts`
- Modify: `sidecar/src/routes/models.test.ts`

- [ ] **Step 1: Write failing active preset refresh test**

Add in `sidecar/src/routes/models.test.ts`:

```ts
it("POST /models/refresh writes remote models only to the active preset", async () => {
  provider.update({ profileId: "openai", apiKey: "key-a" });
  const inactive = provider.createPreset({ name: "Inactive", activate: false });

  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ data: [{ id: "gpt-5.1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const res = await app.request("/models/refresh", { method: "POST" });
  expect(res.status).toBe(200);

  expect(provider.current().models.map((model) => model.id)).toEqual(["gpt-5.1"]);
  expect(provider.getPreset(inactive.presetId)?.models.map((model) => model.id)).not.toEqual(["gpt-5.1"]);
});
```

- [ ] **Step 2: Run models tests and verify failure or pass for wrong reason**

Run:

```bash
cd sidecar && bun test src/routes/models.test.ts
```

Expected before implementation: either FAIL because helper methods are missing in test fixture, or PASS only after Task 2 because `/models/refresh` already uses active `provider.update()`. If it passes, keep the test as regression coverage.

- [ ] **Step 3: Ensure refresh response includes active preset default**

In `sidecar/src/routes/models.ts`, keep the update shape:

```ts
const next = provider.update({
  remoteModels: result.models,
  remoteModelsProviderId: current.profileId,
  remoteModelsBaseUrl: current.baseUrl,
  remoteModelsFetchedAt: result.fetchedAt,
});
return c.json({
  data: next.models,
  defaultModelId: defaultModelId(next.models, next.selectedModelId),
  fetchedAt: next.remoteModelsFetchedAt,
});
```

Do not add `presetId` support in this task.

- [ ] **Step 4: Run models tests**

Run:

```bash
cd sidecar && bun test src/routes/models.test.ts
```

Expected: PASS.

## Task 5: Frontend Settings Client

**Files:**
- Modify: `src/lib/data/settings.ts`
- Modify: `src/lib/models.ts`
- Modify: `src/lib/models.test.tsx`

- [ ] **Step 1: Add frontend preset types**

In `src/lib/data/settings.ts`, extend `ProviderConfig` and add `ProviderPresetSummary`:

```ts
export interface ProviderConfig {
  presetId: string;
  presetName: string;
  profileId: ProfileId;
  label: string;
  baseUrl: string;
  apiKey: string;
  models: ProfileModel[];
  remoteModelsFetchedAt: string;
  selectedModelId: string | null;
  supportsRemoteModels: boolean;
  agentRuntime: AgentRuntime;
  compatibilityNote?: string;
}

export interface ProviderPresetSummary {
  id: string;
  name: string;
  profileId: ProfileId;
  providerLabel: string;
  baseUrl: string;
  selectedModelId: string | null;
  selectedModelLabel: string | null;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  remoteModelsFetchedAt: string;
  compatibilityNote?: string;
}

export interface ProviderState {
  current: ProviderConfig;
  activePresetId: string;
  presets: ProviderPresetSummary[];
  builtIn: BuiltInProfile[];
}
```

- [ ] **Step 2: Add preset client methods**

Add:

```ts
export async function getProviderPreset(id: string): Promise<ProviderConfig> {
  const res = await fetchSidecar(`/settings/provider/presets/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`provider_preset_get_${res.status}`);
  const json = (await res.json()) as { preset: ProviderConfig };
  return json.preset;
}

export async function createProviderPreset(input: {
  name?: string;
  copyFromPresetId?: string;
  activate?: boolean;
} = {}): Promise<ProviderState> {
  const res = await fetchSidecar("/settings/provider/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`provider_preset_create_${res.status}`);
  return (await res.json()) as ProviderState;
}

export async function updateProviderPreset(
  id: string,
  patch: {
    name?: string;
    profileId?: ProfileId;
    baseUrl?: string;
    apiKey?: string;
    selectedModelId?: string | null;
  },
): Promise<ProviderState> {
  const res = await fetchSidecar(`/settings/provider/presets/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`provider_preset_update_${res.status}`);
  return (await res.json()) as ProviderState;
}

export async function activateProviderPreset(id: string): Promise<ProviderState> {
  const res = await fetchSidecar(`/settings/provider/presets/${encodeURIComponent(id)}/activate`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`provider_preset_activate_${res.status}`);
  return (await res.json()) as ProviderState;
}

export async function deleteProviderPreset(id: string): Promise<ProviderState> {
  const res = await fetchSidecar(`/settings/provider/presets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    let error = `provider_preset_delete_${res.status}`;
    try {
      const json = (await res.json()) as { error?: unknown };
      if (typeof json.error === "string") error = json.error;
    } catch {}
    throw new Error(error);
  }
  return (await res.json()) as ProviderState;
}
```

- [ ] **Step 3: Keep `setProvider()` compatibility**

No route change needed; keep `setProvider()` for active preset save. Later UI may use `updateProviderPreset()` for non-active preset edits.

- [ ] **Step 4: Run frontend model tests**

Run:

```bash
bun test src/lib/models.test.tsx
```

Expected: PASS.

## Task 6: Settings Page Preset UI

**Files:**
- Modify: `src/features/settings/sections/ModelSection.tsx`
- Modify: `src/features/settings/sections/ModelSection.test.tsx`
- Modify: `src/i18n/locales/en/settings.json`
- Modify: `src/i18n/locales/zh/settings.json`

- [ ] **Step 1: Update test fixture for presets**

In `ModelSection.test.tsx`, extend `providerFixture()` with:

```ts
activePresetId: "preset-openrouter",
presets: [
  {
    id: "preset-openrouter",
    name: "OpenRouter Auto",
    profileId: "openrouter",
    providerLabel: "OpenRouter Catalog",
    baseUrl: "https://openrouter.ai/api/v1",
    selectedModelId: "openrouter/auto",
    selectedModelLabel: "OpenRouter Auto",
    supportsRemoteModels: true,
    remoteModelsFetchedAt: "2026-05-29T08:00:00.000Z",
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
  },
],
current: {
  presetId: "preset-openrouter",
  presetName: "OpenRouter Auto",
  // existing fields
}
```

- [ ] **Step 2: Mock new client methods**

Add mocks:

```ts
const getProviderPresetMock = mock(async () => providerState.current);
const createProviderPresetMock = mock(async () => providerState);
const updateProviderPresetMock = mock(async () => providerState);
const activateProviderPresetMock = mock(async () => providerState);
const deleteProviderPresetMock = mock(async () => providerState);

mock.module("@/lib/data/settings", () => ({
  getProvider: getProviderMock,
  setProvider: setProviderMock,
  getProviderPreset: getProviderPresetMock,
  createProviderPreset: createProviderPresetMock,
  updateProviderPreset: updateProviderPresetMock,
  activateProviderPreset: activateProviderPresetMock,
  deleteProviderPreset: deleteProviderPresetMock,
}));
```

- [ ] **Step 3: Write failing UI tests**

Add tests:

```ts
it("renders configured model presets and marks the active preset", async () => {
  renderModelSection(providerFixture());
  await screen.findByText("OpenRouter Auto");
  expect(screen.getByText("OpenRouter Catalog")).toBeDefined();
  expect(screen.getByText("Active")).toBeDefined();
});

it("loads preset detail when selecting a non-active preset", async () => {
  renderModelSection(providerFixture({
    // keep current active; fixture should include a second preset summary
  }));

  fireEvent.click(screen.getByRole("button", { name: "Secondary preset" }));

  await waitFor(() =>
    expect(getProviderPresetMock).toHaveBeenCalledWith("preset-secondary"),
  );
});

it("activates a preset from the settings page", async () => {
  const { invalidateQueries } = renderModelSection(providerFixture());
  fireEvent.click(screen.getByRole("button", { name: "Set as active" }));

  await waitFor(() =>
    expect(activateProviderPresetMock).toHaveBeenCalledWith("preset-openrouter"),
  );
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["provider"] });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["models"] });
});
```

- [ ] **Step 4: Run tests and verify failure**

Run:

```bash
bun test src/features/settings/sections/ModelSection.test.tsx
```

Expected: FAIL because UI does not render preset list or call preset APIs.

- [ ] **Step 5: Add locale strings**

In both `src/i18n/locales/en/settings.json` and `src/i18n/locales/zh/settings.json`, add under `settings.provider`:

```json
{
  "presetsTitle": "Model presets",
  "presetActive": "Active",
  "presetNew": "New preset",
  "presetCopy": "Copy",
  "presetDelete": "Delete",
  "presetActivate": "Set as active",
  "presetNameLabel": "Preset name",
  "presetLoadError": "Preset could not be loaded",
  "presetDeleteLastError": "Keep at least one preset"
}
```

Use Chinese equivalents in `zh/settings.json`.

- [ ] **Step 6: Refactor local state around selected preset**

In `ModelSection.tsx`, add:

```ts
const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
const [presetName, setPresetName] = useState("");

useEffect(() => {
  if (!data) return;
  setEditingPresetId(data.activePresetId);
  setPresetName(data.current.presetName);
  setProfileIdLocal(data.current.profileId);
  setBaseUrl(data.current.baseUrl);
  setApiKey(data.current.apiKey);
  setSelectedModelId(data.current.selectedModelId);
}, [data]);
```

Add a helper:

```ts
const hydrateForm = (preset: ProviderConfig) => {
  setEditingPresetId(preset.presetId);
  setPresetName(preset.presetName);
  setProfileIdLocal(preset.profileId);
  setBaseUrl(preset.baseUrl);
  setApiKey(preset.apiKey);
  setSelectedModelId(preset.selectedModelId);
};
```

- [ ] **Step 7: Render preset list before the existing fields**

Use existing token-backed classes only (`bg-card`, `border-border`, `text-muted-foreground`, `hover:bg-state-hover`, `rounded-md`). Do not add raw colors.

```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-medium text-foreground">
      {t("settings.provider.presetsTitle")}
    </h3>
    <Button type="button" variant="outline" size="sm" onClick={() => void handleCreatePreset()}>
      {t("settings.provider.presetNew")}
    </Button>
  </div>
  <div className="space-y-2">
    {data.presets.map((preset) => (
      <button
        key={preset.id}
        type="button"
        onClick={() => void handleSelectPreset(preset.id)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-state-hover"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{preset.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {preset.providerLabel} · {preset.selectedModelLabel ?? preset.selectedModelId ?? "Model"}
          </span>
        </span>
        {preset.id === data.activePresetId && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("settings.provider.presetActive")}
          </span>
        )}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 8: Add handlers for preset CRUD**

Add handlers:

```ts
const refreshProviderQueries = () => {
  void qc.invalidateQueries({ queryKey: ["provider"] });
  void qc.invalidateQueries({ queryKey: ["models"] });
};

const handleSelectPreset = async (id: string) => {
  setSaveMsg(null);
  const preset = id === data.activePresetId ? data.current : await getProviderPreset(id);
  hydrateForm(preset);
};

const handleCreatePreset = async () => {
  await createProviderPreset({ copyFromPresetId: editingPresetId ?? data.activePresetId });
  refreshProviderQueries();
};

const handleActivatePreset = async () => {
  if (!editingPresetId) return;
  await activateProviderPreset(editingPresetId);
  refreshProviderQueries();
};

const handleDeletePreset = async () => {
  if (!editingPresetId) return;
  await deleteProviderPreset(editingPresetId);
  refreshProviderQueries();
};
```

- [ ] **Step 9: Save active vs non-active preset correctly**

Replace `handleSave()` internals:

```ts
const patch = {
  name: presetName,
  ...providerPatchForSave(),
};
if (editingPresetId === data.activePresetId) {
  await setProvider(providerPatchForSave());
} else if (editingPresetId) {
  await updateProviderPreset(editingPresetId, patch);
}
```

Keep query invalidation after save.

- [ ] **Step 10: Run settings UI tests**

Run:

```bash
bun test src/features/settings/sections/ModelSection.test.tsx
```

Expected: PASS.

## Task 7: Conversation Preset Picker

**Files:**
- Create: `src/features/task/ProviderPresetPicker.tsx`
- Create: `src/features/task/ProviderPresetPicker.test.tsx`
- Modify: `src/features/task/TaskMessageInput.tsx`
- Modify: `src/features/task/TaskView.tsx`
- Modify: `src/features/new-task/NewTaskView.tsx`
- Modify: `src/i18n/locales/en/settings.json`
- Modify: `src/i18n/locales/zh/settings.json`

- [ ] **Step 1: Write picker tests**

Create `src/features/task/ProviderPresetPicker.test.tsx`:

```ts
import { describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProviderPresetPicker } from "./ProviderPresetPicker";

const activateProviderPresetMock = mock(async () => providerState);
let providerState = {
  activePresetId: "preset-openai",
  current: { presetId: "preset-openai", presetName: "OpenAI GPT-5.1" },
  builtIn: [],
  presets: [
    {
      id: "preset-openai",
      name: "OpenAI GPT-5.1",
      profileId: "openai",
      providerLabel: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      selectedModelId: "gpt-5.1",
      selectedModelLabel: "GPT-5.1",
      supportsRemoteModels: true,
      remoteModelsFetchedAt: "",
      agentRuntime: {
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
    },
  ],
};

mock.module("@/lib/data/settings", () => ({
  getProvider: mock(async () => providerState),
  activateProviderPreset: activateProviderPresetMock,
}));

mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}));

function renderPicker(disabled = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProviderPresetPicker disabled={disabled} />
    </QueryClientProvider>,
  );
}

describe("ProviderPresetPicker", () => {
  it("renders the active provider preset label", async () => {
    renderPicker();
    expect(await screen.findByText("OpenAI GPT-5.1")).toBeDefined();
  });

  it("activates a configured provider preset", async () => {
    providerState = {
      ...providerState,
      presets: [
        ...providerState.presets,
        {
          ...providerState.presets[0],
          id: "preset-sf",
          name: "SiliconFlow DeepSeek",
          providerLabel: "SiliconFlow",
          selectedModelLabel: "DeepSeek-V3.2",
        },
      ],
    };
    renderPicker();
    fireEvent.click(await screen.findByText("SiliconFlow DeepSeek"));
    await waitFor(() =>
      expect(activateProviderPresetMock).toHaveBeenCalledWith("preset-sf"),
    );
  });

  it("disables activation while a run is active", async () => {
    renderPicker(true);
    const button = await screen.findByRole("button", { name: /OpenAI GPT-5.1/ });
    expect(button).toHaveAttribute("aria-disabled", "true");
  });
});
```

- [ ] **Step 2: Run picker tests and verify failure**

Run:

```bash
bun test src/features/task/ProviderPresetPicker.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement `ProviderPresetPicker`**

Create `src/features/task/ProviderPresetPicker.tsx`:

```tsx
import { ChevronDown } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  activateProviderPreset,
  getProvider,
  type ProviderPresetSummary,
} from "@/lib/data/settings";

interface ProviderPresetPickerProps {
  disabled?: boolean;
  disabledReason?: string;
}

function presetLabel(preset: ProviderPresetSummary): string {
  return `${preset.name}`;
}

function presetDescription(preset: ProviderPresetSummary): string {
  return `${preset.providerLabel} · ${preset.selectedModelLabel ?? preset.selectedModelId ?? "Model"}`;
}

export function ProviderPresetPicker({
  disabled = false,
  disabledReason,
}: ProviderPresetPickerProps) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["provider"],
    queryFn: getProvider,
    staleTime: 60 * 1000,
  });

  const active =
    data?.presets.find((preset) => preset.id === data.activePresetId) ??
    data?.presets[0] ??
    null;
  const label = active ? presetLabel(active) : "Model";

  const activate = async (id: string) => {
    if (disabled || id === data?.activePresetId) return;
    await activateProviderPreset(id);
    void qc.invalidateQueries({ queryKey: ["provider"] });
    void qc.invalidateQueries({ queryKey: ["models"] });
  };

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground opacity-60"
          >
            {label}
            <ChevronDown className="size-3" />
          </button>
        </TooltipTrigger>
        {disabledReason && (
          <TooltipContent side="top" className="max-w-[260px]">
            {disabledReason}
          </TooltipContent>
        )}
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton>
          <span>{label}</span>
          <ChevronDown className="size-3" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px]">
        {(data?.presets ?? []).map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            onSelect={() => void activate(preset.id)}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <span className="text-[13px] font-medium">{presetLabel(preset)}</span>
            <span className="text-[12px] text-muted-foreground">
              {presetDescription(preset)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Replace task composer `ModelPicker` usage**

In `TaskMessageInput.tsx`, remove `useThreadModel` and `ModelPicker` imports. Add:

```ts
import { ProviderPresetPicker } from "@/features/task/ProviderPresetPicker";
```

Replace:

```tsx
<ModelPicker
  value={model ?? fallbackModel}
  onChange={setModel}
  disabled={modelLocked}
  disabledReason={t("task.input.modelLocked")}
/>
```

with:

```tsx
<ProviderPresetPicker
  disabled={modelLocked}
  disabledReason={t("task.input.modelLocked")}
/>
```

Remove `fallbackModel` prop if no longer used.

- [ ] **Step 5: Stop sending per-thread model from `TaskView`**

In `TaskView.tsx`, remove `useThreadModel` and `useAvailableModels` imports and the `effectiveModel` derivation. For send calls, omit `model`:

```ts
void send(text, { permissionMode }).catch((e) => {
  if (e instanceof RunInProgressError && activeTaskId) {
    queue.add(activeTaskId, { text, permissionMode });
    return;
  }
  throw e;
});
```

For first prompt:

```ts
const firstMode = pendingFirstPrompt.permissionMode ?? permissionMode;
setPendingFirstPrompt(null);
if (pendingFirstPrompt.permissionMode) {
  setPermissionMode(pendingFirstPrompt.permissionMode);
}
void send(text, { permissionMode: firstMode });
```

Do not persist `pendingFirstPrompt.model` into thread model store.

- [ ] **Step 6: Replace new task model picker**

In `NewTaskView.tsx`, remove `useAvailableModels`, `ModelPicker`, and local `model` state. Add `ProviderPresetPicker`:

```tsx
<ProviderPresetPicker />
```

When setting pending first prompt, omit model:

```ts
setPendingFirstPrompt({
  conversationId: conv.id,
  text,
  permissionMode,
});
```

- [ ] **Step 7: Run picker and affected component tests**

Run:

```bash
bun test src/features/task/ProviderPresetPicker.test.tsx
```

Expected: PASS.

Then run:

```bash
bunx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS or expose remaining `ModelPicker` contract sites to update. If scheduled/agent workspace still use `ModelPicker`, either keep the component for those flows or migrate them in a follow-up task after confirming scheduled task model semantics.

## Task 8: Verification and Cleanup

**Files:**
- Modify: `docs/superpowers/plans/2026-06-06-provider-presets.md`
- Inspect: files changed in Tasks 1-7

- [ ] **Step 1: Run sidecar targeted tests**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts src/routes/settings-provider.test.ts src/routes/settings.test.ts src/routes/models.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend targeted tests**

Run:

```bash
bun test src/lib/models.test.tsx src/features/settings/sections/ModelSection.test.tsx src/features/task/ProviderPresetPicker.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typechecks**

Run:

```bash
cd sidecar && bunx tsc --noEmit
```

Expected: PASS.

Run:

```bash
bunx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS.

- [ ] **Step 4: Search for old bare model picker assumptions**

Run:

```bash
rg -n "useThreadModel|ModelPicker|selectedModelId|defaultModelId|pendingFirstPrompt\\.model" src sidecar
```

Expected:

- `selectedModelId` remains in provider preset settings and models route.
- `ModelPicker` may remain only in scheduled/agent workspace flows if intentionally deferred.
- `useThreadModel` should not be used by normal `TaskMessageInput` or `TaskView`.
- `pendingFirstPrompt.model` should be removed from normal new-task handoff, or explicitly left only for legacy type compatibility with a comment.

- [ ] **Step 5: Update execution progress**

Edit this plan's **Execution Progress** table so every completed task is marked `done` with the actual verification command result and date.

- [ ] **Step 6: Final git status inspection**

Run:

```bash
git status --short
```

Expected: changed files match this plan. Do not stage or commit unless the user explicitly asks.

## Self-Review

Spec coverage:

- Multiple presets and one active preset: Tasks 1-3.
- Legacy migration: Task 1.
- Settings page management: Task 6.
- Conversation page preset selection: Task 7.
- Active preset runtime flow and `/models` behavior: Tasks 3-4.
- Error handling and structured route errors: Tasks 2-3.
- Verification: Task 8.

Placeholder scan:

- The plan contains no unresolved placeholder sections.
- Implementation snippets use concrete file paths, method names, request paths, and commands.

Type consistency:

- Backend uses `ProviderPreset`, `ProviderPresetSummary`, `ResolvedProvider`, and `ProviderSettingsState` consistently.
- Frontend uses `ProviderConfig`, `ProviderPresetSummary`, and `ProviderState` consistently.
- Route names match the design spec: `/settings/provider/presets`, `/settings/provider/presets/:id`, `/settings/provider/presets/:id/activate`.
