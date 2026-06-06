# Settings Usage Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Usage entry inside Settings that shows the current user's token, run, and cache usage summary from the existing `/usage` sidecar endpoint.

**Architecture:** The sidecar already records usage in `usage_ledger` and exposes aggregate data through `GET /usage`; this plan tightens the summary query so Settings only reports runs whose `runs.status` is `completed`. The frontend adds a new `/settings/usage` route, a settings nav item, and a focused `UsageSection` that computes local date ranges, calls `useUsageSummary`, and renders tokenized summary cards with loading, empty, and error states.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Bun test, Testing Library, i18next locale JSON, Tailwind v4 classes backed by Agent Studio design tokens.

**Assumption:** "用户统计" means local per-user usage visible in desktop Settings. It does not include billing invoices, cloud account quotas, charts, per-model breakdowns, or a new backend ledger schema.

---

## File Structure

- Modify `src/features/settings/SettingsLayout.tsx`: add the Usage navigation item with a semantic lucide icon.
- Modify `src/features/settings/SettingsLayout.test.tsx`: assert the Usage navigation item has an icon and can route to its panel.
- Modify `src/app/RouterView.tsx`: import and mount the new `/settings/usage` route.
- Create `src/features/settings/sections/usageSectionModels.ts`: hold range definitions, range calculation, and number formatting helpers.
- Create `src/features/settings/sections/usageSectionModels.test.ts`: cover range and formatting behavior without React.
- Create `src/features/settings/sections/UsageSection.tsx`: render the usage statistics screen using `useUsageSummary`.
- Create `src/features/settings/sections/UsageSection.test.tsx`: cover loading, success, empty, error, and range switching UI.
- Modify `src/i18n/locales/en/settings.json`: add `settings.nav.usage` and `settings.usage.*` strings.
- Modify `src/i18n/locales/zh/settings.json`: add matching Chinese strings.
- Modify `sidecar/src/services/usage.ts`: aggregate only completed runs.
- Modify `sidecar/src/services/usage.test.ts`: cover completed/error/running filtering.
- Modify `sidecar/src/routes/usage.test.ts`: seed completed runs so route tests match the stricter service contract.

## Implementation Notes

- Do not change `src/lib/data/usage.ts` or `src/lib/data/usage-queries.ts` unless tests reveal a real mismatch.
- Do change `sidecar/src/services/usage.ts` so `/usage` summaries only include completed runs; the Settings description promises that scope.
- Keep styling on token-backed Tailwind utilities already used in this app: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-state-hover`, `bg-state-selected`, `rounded-md`, `text-primary`.
- Do not introduce a charting dependency. The first settings entry should be a clear summary surface, not an analytics dashboard.
- Do not display cost in the first version. The existing backend records `totalCostUsd`, but provider coverage is uneven; the Settings screen should only show token, cache, and run counts.
- Do not add barrel files.

## Task 1: Completed-Run Usage Summary Contract

**Files:**
- Modify: `sidecar/src/services/usage.ts`
- Modify: `sidecar/src/services/usage.test.ts`
- Modify: `sidecar/src/routes/usage.test.ts`

- [ ] **Step 1: Write the failing service test**

In `sidecar/src/services/usage.test.ts`, update `makeDb()` so it can create runs with explicit status:

```ts
function insertRun(db: Database, id: string, status: "running" | "completed" | "error" | "cancelled" = "running") {
  db.prepare("INSERT INTO runs (id, thread_id, status, started_at) VALUES (?, 't1', ?, 1)").run(id, status);
}
```

Replace the direct `INSERT INTO runs` calls with `insertRun(db, "r1")` where existing tests need a writable run row.

Add this test:

```ts
it("summary only aggregates completed runs", () => {
  const db = makeDb();
  const svc = new UsageService(db);

  svc.recordRun({
    runId: "r1",
    threadId: "t1",
    inputTokens: 10,
    outputTokens: 20,
    cacheCreationTokens: 1,
    cacheReadTokens: 2,
    totalCostUsd: 0,
    permissionDenials: [],
    model: "m",
  });
  db.exec("UPDATE runs SET status = 'completed' WHERE id = 'r1'");
  db.exec("UPDATE usage_ledger SET ts = 100 WHERE run_id = 'r1'");

  insertRun(db, "r2", "error");
  svc.recordRun({
    runId: "r2",
    threadId: "t1",
    inputTokens: 100,
    outputTokens: 200,
    cacheCreationTokens: 10,
    cacheReadTokens: 20,
    totalCostUsd: 0,
    permissionDenials: [],
    model: "m",
  });
  db.exec("UPDATE usage_ledger SET ts = 110 WHERE run_id = 'r2'");

  insertRun(db, "r3", "running");
  svc.recordRun({
    runId: "r3",
    threadId: "t1",
    inputTokens: 1000,
    outputTokens: 2000,
    cacheCreationTokens: 100,
    cacheReadTokens: 200,
    totalCostUsd: 0,
    permissionDenials: [],
    model: "m",
  });
  db.exec("UPDATE usage_ledger SET ts = 120 WHERE run_id = 'r3'");

  const sum = svc.summary({ from: 0, to: 150 });
  expect(sum.inputTokens).toBe(10);
  expect(sum.outputTokens).toBe(20);
  expect(sum.cacheCreationTokens).toBe(1);
  expect(sum.cacheReadTokens).toBe(2);
  expect(sum.runCount).toBe(1);
});
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
cd sidecar && bun test src/services/usage.test.ts
```

Expected: FAIL because `summary()` still includes error and running rows.

- [ ] **Step 3: Update UsageService aggregate SQL**

In `sidecar/src/services/usage.ts`, replace the aggregate statements with joins against completed runs:

```ts
this.aggregate = db.prepare(`
  SELECT
    COALESCE(SUM(l.input_tokens), 0)  AS inputTokens,
    COALESCE(SUM(l.output_tokens), 0) AS outputTokens,
    COALESCE(SUM(l.cache_creation_tokens), 0) AS cacheCreationTokens,
    COALESCE(SUM(l.cache_read_tokens), 0)     AS cacheReadTokens,
    COALESCE(SUM(l.cost_usd), 0)              AS totalCostUsd,
    COUNT(DISTINCT l.run_id)                  AS runCount
  FROM usage_ledger l
  JOIN runs r ON r.id = l.run_id AND r.status = 'completed'
  WHERE l.ts >= ? AND l.ts < ?
`);
this.aggregateByThread = db.prepare(`
  SELECT
    COALESCE(SUM(l.input_tokens), 0)  AS inputTokens,
    COALESCE(SUM(l.output_tokens), 0) AS outputTokens,
    COALESCE(SUM(l.cache_creation_tokens), 0) AS cacheCreationTokens,
    COALESCE(SUM(l.cache_read_tokens), 0)     AS cacheReadTokens,
    COALESCE(SUM(l.cost_usd), 0)              AS totalCostUsd,
    COUNT(DISTINCT l.run_id)                  AS runCount
  FROM usage_ledger l
  JOIN runs r ON r.id = l.run_id AND r.status = 'completed'
  WHERE l.ts >= ? AND l.ts < ? AND l.thread_id = ?
`);
```

- [ ] **Step 4: Update existing route test seed data**

In `sidecar/src/routes/usage.test.ts`, change the run seed from `running` to `completed`:

```ts
db.exec(`INSERT INTO runs (id, thread_id, status, started_at) VALUES ('r1', 't1', 'completed', 1)`);
```

- [ ] **Step 5: Run usage tests**

Run:

```bash
cd sidecar && bun test src/services/usage.test.ts src/routes/usage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/services/usage.ts sidecar/src/services/usage.test.ts sidecar/src/routes/usage.test.ts
git commit -m "fix(usage): summarize completed runs only"
```

## Task 2: Settings Navigation Entry

**Files:**
- Modify: `src/features/settings/SettingsLayout.tsx`
- Modify: `src/features/settings/SettingsLayout.test.tsx`

- [ ] **Step 1: Write the failing navigation test**

Replace the translation map and test body in `src/features/settings/SettingsLayout.test.tsx` so Usage is part of the route fixture:

```tsx
const translations: Record<string, string> = {
  "settings.back": "Back",
  "settings.title": "Settings",
  "settings.nav.account": "Account",
  "settings.nav.model": "Model",
  "settings.nav.permissions": "Permissions",
  "settings.nav.usage": "Usage",
  "settings.nav.appearance": "Appearance",
  "settings.nav.remoteConnections": "Remote Connections",
};
```

Add the usage child route in `renderSettingsLayout`:

```tsx
<Route path="usage" element={<div>Usage panel</div>} />
```

Update the assertion test:

```tsx
it("shows a semantic icon before each settings navigation option", () => {
  renderSettingsLayout();

  expect(screen.getByRole("link", { name: "Account" }).querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Model" }).querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Permissions" }).querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Usage" }).querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Appearance" }).querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Remote Connections" }).querySelector("svg")).not.toBeNull();
});
```

Add a routing assertion:

```tsx
it("renders the usage panel from the usage navigation route", () => {
  renderSettingsLayout("/settings/usage");

  expect(screen.getByText("Usage panel")).toBeDefined();
  expect(screen.getByRole("link", { name: "Usage" }).getAttribute("aria-current")).toBe("page");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun test src/features/settings/SettingsLayout.test.tsx
```

Expected: FAIL because the Usage nav item does not exist.

- [ ] **Step 3: Add Usage to settings navigation**

Modify the import in `src/features/settings/SettingsLayout.tsx`:

```tsx
import { BarChart3, Brain, Cable, ChevronLeft, Palette, ShieldCheck, User } from "lucide-react";
```

Add the nav item last:

```tsx
const NAV_ITEMS = [
  { to: "account", labelKey: "settings.nav.account", icon: User },
  { to: "model", labelKey: "settings.nav.model", icon: Brain },
  { to: "permissions", labelKey: "settings.nav.permissions", icon: ShieldCheck },
  { to: "remote-connections", labelKey: "settings.nav.remoteConnections", icon: Cable },
  { to: "appearance", labelKey: "settings.nav.appearance", icon: Palette },
  { to: "usage", labelKey: "settings.nav.usage", icon: BarChart3 },
] as const;
```

- [ ] **Step 4: Run the targeted test**

Run:

```bash
bun test src/features/settings/SettingsLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/SettingsLayout.tsx src/features/settings/SettingsLayout.test.tsx
git commit -m "feat(settings): add usage statistics nav"
```

## Task 3: Usage Range And Formatting Helpers

**Files:**
- Create: `src/features/settings/sections/usageSectionModels.ts`
- Create: `src/features/settings/sections/usageSectionModels.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/features/settings/sections/usageSectionModels.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  formatCompactInteger,
  formatTokenCount,
  getUsageRange,
  usageRangeOptions,
} from "./usageSectionModels";

describe("usageSectionModels", () => {
  it("defines the supported usage ranges in display order", () => {
    expect(usageRangeOptions.map((item) => item.value)).toEqual(["7d", "30d", "all"]);
  });

  it("computes last 7 days as an inclusive-looking exclusive-end range", () => {
    const now = Date.UTC(2026, 5, 6, 12, 0, 0);
    expect(getUsageRange("7d", now)).toEqual({
      from: now - 7 * 24 * 60 * 60 * 1000,
      to: now + 1,
    });
  });

  it("computes all time from epoch zero to the exclusive current instant", () => {
    const now = Date.UTC(2026, 5, 6, 12, 0, 0);
    expect(getUsageRange("all", now)).toEqual({ from: 0, to: now + 1 });
  });

  it("formats token counts and integers for settings cards", () => {
    expect(formatTokenCount(1200)).toBe("1,200");
    expect(formatCompactInteger(42)).toBe("42");
  });
});
```

- [ ] **Step 2: Run the helper tests and verify failure**

Run:

```bash
bun test src/features/settings/sections/usageSectionModels.test.ts
```

Expected: FAIL because `usageSectionModels.ts` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `src/features/settings/sections/usageSectionModels.ts`:

```ts
export type UsageRangeValue = "7d" | "30d" | "all";

export const usageRangeOptions = [
  { value: "7d", labelKey: "settings.usage.range7d" },
  { value: "30d", labelKey: "settings.usage.range30d" },
  { value: "all", labelKey: "settings.usage.rangeAll" },
] as const satisfies ReadonlyArray<{
  value: UsageRangeValue;
  labelKey: string;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

export function getUsageRange(value: UsageRangeValue, now = Date.now()): {
  from: number;
  to: number;
} {
  const to = now + 1;
  if (value === "all") return { from: 0, to };
  const days = value === "7d" ? 7 : 30;
  return { from: now - days * DAY_MS, to };
}

export function formatTokenCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactInteger(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
bun test src/features/settings/sections/usageSectionModels.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/sections/usageSectionModels.ts src/features/settings/sections/usageSectionModels.test.ts
git commit -m "feat(settings): add usage summary helpers"
```

## Task 4: Usage Settings Section

**Files:**
- Modify: `src/app/RouterView.tsx`
- Create: `src/features/settings/sections/UsageSection.tsx`
- Create: `src/features/settings/sections/UsageSection.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `src/features/settings/sections/UsageSection.test.tsx`:

```tsx
import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { UsageSummary } from "@/lib/data/types";

type QueryState = {
  data?: UsageSummary;
  isLoading?: boolean;
  isError?: boolean;
  refetch?: () => void;
};

let queryState: QueryState = {};
let requestedRanges: Array<{ from: number; to: number }> = [];

mock.module("react-i18next", () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings.usage.title": "Usage",
        "settings.usage.description": "Track completed model runs recorded on this device.",
        "settings.usage.range7d": "7 days",
        "settings.usage.range30d": "30 days",
        "settings.usage.rangeAll": "All time",
        "settings.usage.totalTokens": "Total tokens",
        "settings.usage.inputTokens": "Input",
        "settings.usage.outputTokens": "Output",
        "settings.usage.cacheTokens": "Cache",
        "settings.usage.runs": "Runs",
        "settings.usage.empty": "No usage recorded for this range.",
        "settings.usage.loading": "Loading usage…",
        "settings.usage.error": "Usage failed to load.",
        "settings.usage.refresh": "Refresh",
        "settings.usage.retry": "Retry",
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("@/lib/data/usage-queries", () => ({
  useUsageSummary: (range: { from: number; to: number }) => {
    requestedRanges.push(range);
    return {
      data: queryState.data,
      isLoading: queryState.isLoading ?? false,
      isError: queryState.isError ?? false,
      refetch: queryState.refetch ?? (() => {}),
    };
  },
}));

const { UsageSection } = require("./UsageSection") as typeof import("./UsageSection");

afterEach(() => {
  cleanup();
  queryState = {};
  requestedRanges = [];
});

describe("UsageSection", () => {
  it("renders usage summary metrics", () => {
    queryState.data = {
      inputTokens: 1000,
      outputTokens: 250,
      cacheCreationTokens: 50,
      cacheReadTokens: 25,
      totalCostUsd: 0.0123,
      runCount: 3,
    };

    render(<UsageSection />);

    expect(screen.getByRole("heading", { name: "Usage" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDefined();
    expect(screen.getByText("1,325")).toBeDefined();
    expect(screen.getByText("1,000")).toBeDefined();
    expect(screen.getByText("250")).toBeDefined();
    expect(screen.getByText("75")).toBeDefined();
  });

  it("requests a new range when the user switches filters", () => {
    queryState.data = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCostUsd: 0,
      runCount: 0,
    };

    render(<UsageSection />);
    fireEvent.click(screen.getByRole("button", { name: "All time" }));

    expect(requestedRanges.at(-1)?.from).toBe(0);
  });

  it("shows an empty state when there are no runs", () => {
    queryState.data = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCostUsd: 0,
      runCount: 0,
    };

    render(<UsageSection />);

    expect(screen.getByText("No usage recorded for this range.")).toBeDefined();
  });

  it("shows loading and error states", () => {
    queryState.isLoading = true;
    const { rerender } = render(<UsageSection />);
    expect(screen.getByText("Loading usage…")).toBeDefined();

    queryState = { isError: true };
    rerender(<UsageSection />);
    expect(screen.getByText("Usage failed to load.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it("lets the user refresh the current range", () => {
    const refetch = mock(() => {});
    queryState = {
      data: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalCostUsd: 0,
        runCount: 0,
      },
      refetch,
    };

    render(<UsageSection />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the component tests and verify failure**

Run:

```bash
bun test src/features/settings/sections/UsageSection.test.tsx
```

Expected: FAIL because `UsageSection.tsx` does not exist.

- [ ] **Step 3: Implement `UsageSection.tsx`**

Create `src/features/settings/sections/UsageSection.tsx`:

```tsx
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsageSummary } from "@/lib/data/usage-queries";
import type { UsageSummary } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import {
  formatCompactInteger,
  formatTokenCount,
  getUsageRange,
  type UsageRangeValue,
  usageRangeOptions,
} from "./usageSectionModels";

function metricItems(summary: UsageSummary) {
  const cacheTokens = summary.cacheCreationTokens + summary.cacheReadTokens;
  const totalTokens = summary.inputTokens + summary.outputTokens + cacheTokens;

  return [
    {
      labelKey: "settings.usage.totalTokens",
      value: formatTokenCount(totalTokens),
    },
    {
      labelKey: "settings.usage.runs",
      value: formatCompactInteger(summary.runCount),
    },
    {
      labelKey: "settings.usage.inputTokens",
      value: formatTokenCount(summary.inputTokens),
    },
    {
      labelKey: "settings.usage.outputTokens",
      value: formatTokenCount(summary.outputTokens),
    },
    {
      labelKey: "settings.usage.cacheTokens",
      value: formatTokenCount(cacheTokens),
    },
  ] as const;
}

export function UsageSection() {
  const { t } = useTranslation();
  const [rangeValue, setRangeValue] = useState<UsageRangeValue>("30d");
  const range = useMemo(() => getUsageRange(rangeValue), [rangeValue]);
  const usageQuery = useUsageSummary(range);
  const summary = usageQuery.data;
  const isEmpty = Boolean(summary && summary.runCount === 0);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-[32px] font-normal leading-none text-foreground">
            {t("settings.usage.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("settings.usage.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => usageQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-state-hover"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          <span>{t("settings.usage.refresh")}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {usageRangeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRangeValue(option.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              rangeValue === option.value
                ? "bg-state-selected text-foreground"
                : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
            )}
          >
            {t(option.labelKey as never)}
          </button>
        ))}
      </div>

      {usageQuery.isLoading && (
        <p className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("settings.usage.loading")}
        </p>
      )}

      {usageQuery.isError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("settings.usage.error")}
          </p>
          <button
            type="button"
            onClick={() => usageQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-state-hover"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            <span>{t("settings.usage.retry")}</span>
          </button>
        </div>
      )}

      {summary && !usageQuery.isError && (
        <>
          {isEmpty && (
            <p className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {t("settings.usage.empty")}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {metricItems(summary).map((item) => (
              <div
                key={item.labelKey}
                className="rounded-md border border-border bg-card p-4"
              >
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {t(item.labelKey as never)}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Mount the usage route**

Modify imports in `src/app/RouterView.tsx`:

```tsx
import { UsageSection } from "@/features/settings/sections/UsageSection";
```

Add the settings child route after Permissions:

```tsx
<Route path="usage" element={<UsageSection />} />
```

- [ ] **Step 5: Run component tests**

Run:

```bash
bun test src/features/settings/sections/UsageSection.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run route and helper tests together**

Run:

```bash
bun test src/features/settings/SettingsLayout.test.tsx src/features/settings/sections/usageSectionModels.test.ts src/features/settings/sections/UsageSection.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/RouterView.tsx src/features/settings/sections/UsageSection.tsx src/features/settings/sections/UsageSection.test.tsx
git commit -m "feat(settings): show usage statistics"
```

## Task 5: Localized Settings Copy

**Files:**
- Modify: `src/i18n/locales/en/settings.json`
- Modify: `src/i18n/locales/zh/settings.json`

- [ ] **Step 1: Write the failing locale verification**

Run this Node script before editing locales:

```bash
node - <<'NODE'
const fs = require("fs");
const en = JSON.parse(fs.readFileSync("src/i18n/locales/en/settings.json", "utf8"));
const zh = JSON.parse(fs.readFileSync("src/i18n/locales/zh/settings.json", "utf8"));
const keys = [
  ["nav", "usage"],
  ["usage", "title"],
  ["usage", "description"],
  ["usage", "range7d"],
  ["usage", "range30d"],
  ["usage", "rangeAll"],
  ["usage", "totalTokens"],
  ["usage", "inputTokens"],
  ["usage", "outputTokens"],
  ["usage", "cacheTokens"],
  ["usage", "runs"],
  ["usage", "empty"],
  ["usage", "loading"],
  ["usage", "error"],
  ["usage", "refresh"],
  ["usage", "retry"],
];
function get(obj, path) {
  return path.reduce((value, key) => value && value[key], obj);
}
for (const path of keys) {
  if (typeof get(en, path) !== "string") throw new Error(`missing en.${path.join(".")}`);
  if (typeof get(zh, path) !== "string") throw new Error(`missing zh.${path.join(".")}`);
}
NODE
```

Expected: FAIL with `missing en.nav.usage`.

- [ ] **Step 2: Add English strings**

In `src/i18n/locales/en/settings.json`, add `"usage": "Usage"` to `nav`:

```json
"nav": {
  "general": "General",
  "account": "Account",
  "model": "Model",
  "permissions": "Permissions",
  "usage": "Usage",
  "remoteConnections": "Remote Connections",
  "appearance": "Appearance"
}
```

Add the top-level `usage` object after `permissions`:

```json
"usage": {
  "title": "Usage",
  "description": "Track completed model runs recorded on this device.",
  "range7d": "7 days",
  "range30d": "30 days",
  "rangeAll": "All time",
  "totalTokens": "Total tokens",
  "inputTokens": "Input",
  "outputTokens": "Output",
  "cacheTokens": "Cache",
  "runs": "Runs",
  "empty": "No usage recorded for this range.",
  "loading": "Loading usage…",
  "error": "Usage failed to load.",
  "refresh": "Refresh",
  "retry": "Retry"
}
```

- [ ] **Step 3: Add Chinese strings**

In `src/i18n/locales/zh/settings.json`, add `"usage": "用量统计"` to `nav`:

```json
"nav": {
  "general": "通用",
  "account": "账号",
  "model": "模型",
  "permissions": "权限",
  "usage": "用量统计",
  "remoteConnections": "远程连接",
  "appearance": "外观"
}
```

Add the top-level `usage` object after `permissions`:

```json
"usage": {
  "title": "用量统计",
  "description": "查看本机已完成模型运行的 token 和缓存用量汇总。",
  "range7d": "近 7 天",
  "range30d": "近 30 天",
  "rangeAll": "全部时间",
  "totalTokens": "总 token",
  "inputTokens": "输入",
  "outputTokens": "输出",
  "cacheTokens": "缓存",
  "runs": "运行次数",
  "empty": "当前范围内暂无用量记录。",
  "loading": "正在加载用量…",
  "error": "用量加载失败。",
  "refresh": "刷新",
  "retry": "重试"
}
```

- [ ] **Step 4: Run locale verification**

Run:

```bash
node - <<'NODE'
const fs = require("fs");
const en = JSON.parse(fs.readFileSync("src/i18n/locales/en/settings.json", "utf8"));
const zh = JSON.parse(fs.readFileSync("src/i18n/locales/zh/settings.json", "utf8"));
const keys = [
  ["nav", "usage"],
  ["usage", "title"],
  ["usage", "description"],
  ["usage", "range7d"],
  ["usage", "range30d"],
  ["usage", "rangeAll"],
  ["usage", "totalTokens"],
  ["usage", "inputTokens"],
  ["usage", "outputTokens"],
  ["usage", "cacheTokens"],
  ["usage", "runs"],
  ["usage", "empty"],
  ["usage", "loading"],
  ["usage", "error"],
  ["usage", "refresh"],
  ["usage", "retry"],
];
function get(obj, path) {
  return path.reduce((value, key) => value && value[key], obj);
}
for (const path of keys) {
  if (typeof get(en, path) !== "string") throw new Error(`missing en.${path.join(".")}`);
  if (typeof get(zh, path) !== "string") throw new Error(`missing zh.${path.join(".")}`);
}
console.log("usage locale keys ok");
NODE
```

Expected: PASS with `usage locale keys ok`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en/settings.json src/i18n/locales/zh/settings.json
git commit -m "feat(settings): localize usage statistics"
```

## Task 6: Verification And Manual Check

**Files:**
- Verify: `src/features/settings/SettingsLayout.test.tsx`
- Verify: `src/features/settings/sections/usageSectionModels.test.ts`
- Verify: `src/features/settings/sections/UsageSection.test.tsx`
- Verify: `src/lib/data/usage-queries.test.tsx`
- Verify: `sidecar/src/routes/usage.test.ts`
- Verify: `sidecar/src/services/usage.test.ts`

- [ ] **Step 1: Run frontend targeted tests**

Run:

```bash
bun test src/features/settings/SettingsLayout.test.tsx src/features/settings/sections/usageSectionModels.test.ts src/features/settings/sections/UsageSection.test.tsx src/lib/data/usage-queries.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run sidecar usage tests**

Run:

```bash
cd sidecar && bun test src/routes/usage.test.ts src/services/usage.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
bunx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 5: Manual browser smoke**

Start the frontend and sidecar:

```bash
bun run dev:server
```

In a second terminal:

```bash
bun run dev
```

Open `http://localhost:1420/settings/usage` and verify:

- The Settings sidebar shows `Usage` / `用量统计` with a chart icon.
- The page heading, description, refresh button, range controls, and metric cards render without overlap at desktop width.
- Switching `7 days`, `30 days`, and `All time` updates the selected control and does not blank the layout.
- Empty data shows the empty message and zero-valued cards.
- The browser console has no React key, hook, or routing errors.

- [ ] **Step 6: Final commit**

If Task 6 required any fixes, commit them:

```bash
git add src/features/settings src/app/RouterView.tsx src/i18n/locales/en/settings.json src/i18n/locales/zh/settings.json
git commit -m "fix(settings): polish usage statistics"
```

If no files changed during verification, skip this commit.

---

## Plan Self-Review

- Spec coverage: The plan covers the Settings entry point, the `/settings/usage` route, the summary UI, range controls, i18n, tests, and verification. It intentionally leaves backend schema and detailed analytics out of scope because the existing `/usage` summary endpoint already satisfies the first entry screen.
- Placeholder scan: No placeholder markers or unspecified implementation steps remain.
- Type consistency: The plan uses the existing `UsageSummary` shape from `src/lib/data/types.ts`, the existing `useUsageSummary(range)` hook, and a local `UsageRangeValue` union shared by helper tests and the component.
