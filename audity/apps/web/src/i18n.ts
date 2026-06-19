export type AudityLanguage = "English" | "Deutsch";

const LANGUAGE_STORAGE_KEY = "audity_language";
const SUPPORTED: AudityLanguage[] = ["English", "Deutsch"];

const translations: Record<AudityLanguage, Record<string, string>> = {
  English: {},
  Deutsch: {
    "Account": "Konto",
    "Admin Menu": "Admin-Menü",
    "Admin navigation": "Admin-Navigation",
    "Administration": "Administration",
    "Audit Center": "Audit-Center",
    "Audit Log": "Audit-Protokoll",
    "Activity Log": "Aktivitätsprotokoll",
    "Backup": "Backup",
    "Backup & Restore": "Backup & Wiederherstellung",
    "Branding": "Branding",
    "Connector": "Konnektor",
    "Confirm Password": "Passwort bestätigen",
    "Current Password": "Aktuelles Passwort",
    "Customers": "Kunden",
    "Dashboard": "Übersicht",
    "Email Settings": "E-Mail-Einstellungen",
    "Evidence & Reports": "Nachweise & Berichte",
    "Findings & Risk": "Findings & Risiko",
    "Framework Library": "Framework-Bibliothek",
    "Help": "Hilfe",
    "Help & Manual": "Hilfe & Handbuch",
    "Interface": "Oberfläche",
    "Language": "Sprache",
    "Leave Admin Panel": "Admin-Panel verlassen",
    "Login": "Anmelden",
    "Logout": "Abmelden",
    "Manual": "Handbuch",
    "Mark all read": "Alle als gelesen markieren",
    "Monitoring": "Überwachung",
    "New Password": "Neues Passwort",
    "No notifications": "Keine Benachrichtigungen",
    "Notifications": "Benachrichtigungen",
    "Open Backup": "Backup öffnen",
    "Open navigation": "Navigation öffnen",
    "Password": "Passwort",
    "Primary navigation": "Hauptnavigation",
    "Questions": "Fragen",
    "Settings": "Einstellungen",
    "Shared Customers": "Geteilte Kunden",
    "Show reminders review messages.": "Erinnerungen und Review-Nachrichten anzeigen.",
    "Skip to main content": "Zum Hauptinhalt springen",
    "System": "System",
    "System Monitor": "System-Monitor",
    "Tooltips": "Tooltips",
    "User Management": "Benutzerverwaltung",
    "User Settings": "Benutzereinstellungen",
    "Workbench": "Werkbank",
    "Workspace": "Arbeitsbereich"
  }
};

export function listLanguages(): AudityLanguage[] {
  return SUPPORTED;
}

export function currentLanguage(): AudityLanguage {
  if (typeof window === "undefined") return "English";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) as AudityLanguage | null;
  if (stored && SUPPORTED.includes(stored)) return stored;
  return "English";
}

export function setCurrentLanguage(language: AudityLanguage): void {
  if (!SUPPORTED.includes(language)) return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new CustomEvent("audity-language-changed"));
}

export function translate(label: string, language = currentLanguage()): string {
  return translations[language]?.[label] ?? label;
}
