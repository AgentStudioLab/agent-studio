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
  it("renders usage summary metrics with total tokens including cache", () => {
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
    expect(screen.getByText("3")).toBeDefined();
  });

  it("defaults to the 30 day range and requests a new range when the user switches filters", () => {
    queryState.data = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCostUsd: 0,
      runCount: 0,
    };

    render(<UsageSection />);

    expect(requestedRanges[0]?.from).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "All time" }));

    expect(requestedRanges.at(-1)?.from).toBe(0);
  });

  it("shows an empty state and zero-valued cards when there are no runs", () => {
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
    expect(screen.getAllByText("0")).toHaveLength(5);
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
