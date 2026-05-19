import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { zh } from "./locales/zh/index";
import { en } from "./locales/en/index";

export type Language = "zh" | "en";

export const SUPPORTED_LANGUAGES: Language[] = ["zh", "en"];
export const DEFAULT_LANGUAGE: Language = "zh";
export const LANGUAGE_STORAGE_KEY = "preferred_language";

function readInitialLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
  } catch {
    /* localStorage blocked — fall through */
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: readInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
