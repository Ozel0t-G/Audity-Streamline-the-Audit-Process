import { useEffect, useState } from "react";
import { currentLanguage, translate } from "../../i18n";

export function useUserTheme() {
  useEffect(() => {
    const apply = () => {
      const preference = window.localStorage.getItem("audity_theme") ?? "System";
      const systemLight = window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
      const light = preference === "Light" || (preference === "System" && systemLight);
      document.documentElement.classList.toggle("audity-theme-light", light);
    };
    apply();
    window.addEventListener("audity-theme-changed", apply);
    window.addEventListener("storage", apply);
    const colorScheme = window.matchMedia?.("(prefers-color-scheme: light)");
    colorScheme?.addEventListener("change", apply);
    return () => {
      window.removeEventListener("audity-theme-changed", apply);
      window.removeEventListener("storage", apply);
      colorScheme?.removeEventListener("change", apply);
    };
  }, []);
}

export function useLanguage() {
  const [language, setLanguage] = useState(currentLanguage);
  useEffect(() => {
    const sync = () => setLanguage(currentLanguage());
    window.addEventListener("audity-language-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("audity-language-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === "Deutsch" ? "de" : "en";
  }, [language]);
  return (label: string) => translate(label, language);
}
