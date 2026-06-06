import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { useTypewriterText } from "./useTypewriterText";

type MatchMediaListener = (event: MediaQueryListEvent) => void;

const originalMatchMedia = window.matchMedia;

function stubReducedMotion(matches: boolean) {
  window.matchMedia = (() => {
    const listeners = new Set<MatchMediaListener>();
    return {
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: (_type: "change", listener: MatchMediaListener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: "change", listener: MatchMediaListener) => {
        listeners.delete(listener);
      },
      addListener: (listener: MatchMediaListener) => listeners.add(listener),
      removeListener: (listener: MatchMediaListener) => listeners.delete(listener),
      dispatchEvent: (event: Event) => {
        for (const listener of listeners) {
          listener(event as MediaQueryListEvent);
        }
        return true;
      },
    } satisfies MediaQueryList;
  }) as typeof window.matchMedia;
}

beforeEach(() => {
  stubReducedMotion(false);
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("useTypewriterText", () => {
  it("reveals text one character at a time after the initial delay", async () => {
    const { result } = renderHook(
      ({ text }) => useTypewriterText(text, { initialDelayMs: 100, stepMs: 50 }),
      { initialProps: { text: "清单" } },
    );

    expect(result.current).toBe("");

    await act(async () => {
      await Bun.sleep(110);
    });

    expect(result.current).toBe("清");

    await act(async () => {
      await Bun.sleep(60);
    });

    expect(result.current).toBe("清单");
  });

  it("shows the full text immediately when reduced motion is enabled", () => {
    stubReducedMotion(true);

    const { result } = renderHook(() =>
      useTypewriterText("清单", { initialDelayMs: 100, stepMs: 50 }),
    );

    expect(result.current).toBe("清单");
  });

  it("catches up when browser timer callbacks are delayed", async () => {
    const { result } = renderHook(() =>
      useTypewriterText("进度追上", { initialDelayMs: 10, stepMs: 80 }),
    );

    Bun.sleepSync(400);
    await act(async () => {
      await Bun.sleep(20);
    });

    expect(result.current).toBe("进度追上");
  });
});
