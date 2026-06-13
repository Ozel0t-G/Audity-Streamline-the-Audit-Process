export type AudityLanguage = "English";

const translations: Record<AudityLanguage, Record<string, string>> = {
  English: {}
};

export function currentLanguage(): AudityLanguage {
  if (window.localStorage.getItem("audity_language") !== "English") {
    window.localStorage.setItem("audity_language", "English");
  }
  return "English";
}

export function translate(label: string, language = currentLanguage()): string {
  return translations[language][label] ?? label;
}
