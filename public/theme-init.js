/* ============================================================
 * theme-init.js · 防 FOUC 主题初始化脚本
 * --------------------------------------
 * 必须在所有样式表之前同步加载 (放在 <head> 第一个 <script>):
 *
 *   <head>
 *     <script src="/theme-init.js"></script>
 *     <link rel="stylesheet" href="/globals.css" />
 *   </head>
 *
 * 否则首屏会出现 light → dark 闪屏.
 *
 * 行为:
 *   - 优先读 localStorage.preferred_theme_mode ("light"/"dark")
 *   - 没有 → 跟随系统 prefers-color-scheme
 *   - OS 切换时 → 仅当用户未显式选择时跟随
 * ============================================================ */
(() => {
  const STORAGE_KEY = "preferred_theme_mode";
  const root = document.documentElement;

  let userPref = null;
  try {
    userPref = localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage 在某些 sandbox 不可用, 忽略
  }

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const applyMode = (mode) => root.setAttribute("data-mode", mode);

  if (userPref === "light" || userPref === "dark") {
    applyMode(userPref);
  } else {
    applyMode(media.matches ? "dark" : "light");
  }

  // OS 切换跟随 (仅当用户未显式选择时)
  const handleChange = (event) => {
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
    if (stored !== "light" && stored !== "dark") {
      applyMode(event.matches ? "dark" : "light");
    }
  };

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handleChange);
  } else if (typeof media.addListener === "function") {
    // Safari < 14 兜底
    media.addListener(handleChange);
  }
})();
