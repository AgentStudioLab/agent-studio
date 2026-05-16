/**
 * useThemeMode — React hook
 * --------------------------------------
 * 读取当前 mode (light / dark) + 用户偏好 pref (system / light / dark).
 * setPref('system') 会清空 localStorage 并跟随 OS.
 * setPref('light' | 'dark') 会持久化用户显式选择.
 *
 * 与 /public/theme-init.js 配合: 初始化由脚本完成 (防 FOUC),
 * hook 仅负责运行时读写.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "preferred_theme_mode";

export type ThemeMode = "light" | "dark";
export type ThemePref = "system" | "light" | "dark";

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof document === "undefined") return "light";
    return (document.documentElement.getAttribute("data-mode") as ThemeMode) || "light";
  });

  const [pref, setPrefState] = useState<ThemePref>(() => {
    if (typeof window === "undefined") return "system";
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "light" || stored === "dark" ? stored : "system";
    } catch {
      return "system";
    }
  });

  const setPref = (next: ThemePref) => {
    if (next === "system") {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      const resolved: ThemeMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      document.documentElement.setAttribute("data-mode", resolved);
      setModeState(resolved);
    } else {
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      document.documentElement.setAttribute("data-mode", next);
      setModeState(next);
    }
    setPrefState(next);
  };

  // OS 切换跟随 (仅当用户未显式选择时)
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
      if (stored !== "light" && stored !== "dark") {
        const resolved: ThemeMode = e.matches ? "dark" : "light";
        document.documentElement.setAttribute("data-mode", resolved);
        setModeState(resolved);
      }
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const toggle = () => setPref(mode === "dark" ? "light" : "dark");

  return { mode, pref, setPref, toggle };
}
