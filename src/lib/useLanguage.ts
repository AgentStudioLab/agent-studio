import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type Language,
} from "@/i18n";

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.includes(stored as Language)) {
      return stored as Language;
    }
  } catch {
    /* localStorage blocked */
  }
  return DEFAULT_LANGUAGE;
}

export function useLanguage() {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<Language>(() =>
    readStoredLanguage(),
  );

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [i18n, language]);

  const setLanguage = (next: Language) => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* localStorage blocked */
    }
    setLanguageState(next);
  };

  return { language, setLanguage };
}
