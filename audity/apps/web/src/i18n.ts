export type AudityLanguage = "English" | "Deutsch";

const translations: Record<AudityLanguage, Record<string, string>> = {
  English: {},
  Deutsch: {
    "Dashboard": "Dashboard",
    "Customer": "Kunden",
    "My Customers": "Meine Kunden",
    "Shared Customers": "Geteilte Kunden",
    "User Settings": "Benutzereinstellungen",
    "Questions": "Fragen",
    "Findings & Risk": "Findings & Risiko",
    "Evidence & Reports": "Nachweise & Reports",
    "Admin Menu": "Admin-Menue",
    "Logout": "Abmelden",
    "Notifications": "Benachrichtigungen",
    "Mark all read": "Alle als gelesen markieren",
    "No notifications": "Keine Benachrichtigungen",
    "Workspace": "Arbeitsbereich",
    "Admin Panel": "Admin-Bereich",
    "Activity Log": "Aktivitaetslog",
    "Audit Log": "Audit-Log",
    "User Management": "Benutzerverwaltung",
    "Framework Library": "Framework-Bibliothek",
    "Branding": "Branding",
    "Email Settings": "E-Mail-Einstellungen",
    "Connector": "Connector",
    "System": "System",
    "Backup": "Backup",
    "Leave Admin Panel": "Admin-Bereich verlassen",
    "Account": "Konto",
    "Password": "Passwort",
    "Interface": "Oberflaeche",
    "Current Password": "Aktuelles Passwort",
    "New Password": "Neues Passwort",
    "Confirm Password": "Passwort bestaetigen",
    "Change password": "Passwort aendern",
    "Tooltips": "Tooltips",
    "Language": "Sprache",
    "Theme": "Theme",
    "Default View": "Standardansicht",
    "Table Density": "Tabellendichte",
    "Export Format": "Export-Format",
    "Backup & Restore": "Backup & Wiederherstellung",
    "Open Backup": "Backup oeffnen",
    "Show reminders and review messages.": "Erinnerungen und Review-Nachrichten anzeigen.",
    "Password changed": "Passwort geaendert",
    "New passwords do not match": "Die neuen Passwoerter stimmen nicht ueberein"
  }
};

export function currentLanguage(): AudityLanguage {
  return window.localStorage.getItem("audity_language") === "Deutsch" ? "Deutsch" : "English";
}

export function translate(label: string, language = currentLanguage()): string {
  return translations[language][label] ?? label;
}
