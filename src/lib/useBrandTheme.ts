/**
 * useBrandTheme — React hook
 * --------------------------------------
 * 读写品牌主题 (data-brand 轴). 与 useThemeMode 平行:
 * localStorage.preferred_brand ↔ <html data-brand>.
 *
 * 与 /public/theme-init.js 配合: 初始 data-brand 由脚本在 CSS 前写好 (防 FOUC),
 * 本 hook 仅负责运行时读写, 并对"存储里指向一个已被移除的主题"做兜底校验.
 * 主题清单与默认值来自 styles/themes/registry.
 */
import { useEffect, useState } from "react";
import { defaultThemeId, getTheme, listThemes } from "@/styles/themes/registry";

const STORAGE_KEY = "preferred_brand";

export function useBrandTheme() {
  const [brand, setBrandState] = useState<string>(() => {
    const fallback = defaultThemeId();
    if (typeof document === "undefined") return fallback;
    const current = document.documentElement.getAttribute("data-brand");
    // 存储/属性指向的主题若已被移除 → 回退默认, 避免品牌色失效.
    return current && getTheme(current) ? current : fallback;
  });

  // 把解析后的有效值写回 DOM, 并清理失效的存储值 —— 否则脚本每次刷新都会先
  // 写上失效 id 再被这里纠正, 出现一下闪烁.
  useEffect(() => {
    document.documentElement.setAttribute("data-brand", brand);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && !getTheme(stored)) localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage 不可用, 忽略
    }
  }, [brand]);

  const setBrand = (id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage 不可用 → 仅本次会话生效
    }
    document.documentElement.setAttribute("data-brand", id);
    setBrandState(id);
  };

  return { brand, setBrand, themes: listThemes() };
}
