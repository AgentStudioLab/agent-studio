import { useEffect, useState } from "react";

type TypewriterOptions = {
  initialDelayMs?: number;
  stepMs?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useTypewriterText(
  text: string,
  { initialDelayMs = 180, stepMs = 48 }: TypewriterOptions = {},
) {
  const [visibleText, setVisibleText] = useState(() =>
    prefersReducedMotion() ? text : "",
  );

  useEffect(() => {
    if (prefersReducedMotion()) {
      setVisibleText(text);
      return;
    }

    const startedAt = Date.now();
    let stepTimer: number | null = null;
    setVisibleText("");

    const updateVisibleText = () => {
      const elapsedMs = Math.max(0, Date.now() - startedAt - initialDelayMs);
      const visibleLength = Math.min(
        text.length,
        Math.floor(elapsedMs / stepMs) + 1,
      );
      setVisibleText(text.slice(0, visibleLength));
      if (visibleLength < text.length) {
        stepTimer = window.setTimeout(updateVisibleText, stepMs);
      }
    };

    const initialTimer = window.setTimeout(updateVisibleText, initialDelayMs);

    return () => {
      window.clearTimeout(initialTimer);
      if (stepTimer) window.clearTimeout(stepTimer);
    };
  }, [initialDelayMs, stepMs, text]);

  return visibleText;
}
