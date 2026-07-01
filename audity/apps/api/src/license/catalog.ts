import type { FeatureDef, LimitDef, LicenseTier } from "./types.js";

// ──────────────────────────────────────────────────────────────────────────
// FEATURE-KATALOG — einzige Wahrheit (Durchsetzung + Demo-Tags + Pricing).
//
// Die Feature → Tier-Zuordnung pflegt der HERSTELLER hier ein (lizenz_plan.md §6
// / §14). Start: LEER bzw. Platzhalter → es ist noch NICHTS gesperrt, die Mechanik
// liegt nur bereit. Trage Features ein, sobald die Tier-Aufteilung feststeht.
// ──────────────────────────────────────────────────────────────────────────

export const TIER_RANK: Record<LicenseTier, number> = { free: 0, pro: 1, enterprise: 2 };

export const FEATURES: FeatureDef[] = [
  // Alles rund um KI/AI ist Paid (Pro+): Provider-Konfiguration, Enrichment,
  // Test-Konsole und Usage. Im Free-Tier ist AI komplett aus (Framework-Importe
  // nutzen dann TODO-Platzhalter wie bei Provider = "off").
  { id: "ai", label: "KI / AI", category: "AI", tier: "pro" },
  { id: "connectors", label: "Connectors", category: "Integrationen", tier: "enterprise" },
  { id: "customer_ack", label: "Customer Acknowledgment", category: "Workflow", tier: "enterprise" },
  // Weitere Beispiele — auskommentiert lassen, bis die Tiers feststehen:
  // { id: "log_archive_remote", label: "Remote Log-Archiv (SFTP/FTP/S3)", category: "Backup", tier: "pro" },
  // { id: "public_api",         label: "Public API",                       category: "API",    tier: "enterprise" },
];

export const LIMITS: LimitDef[] = [
  // Aktive Nutzer pro Tier: Free 5, Pro 15, Enterprise unbegrenzt (null). Demo = unbegrenzt.
  { id: "users", label: "Users", byTier: { free: 5, pro: 15, enterprise: null } },
  { id: "customers", label: "Customers", byTier: { free: 25, pro: 50, enterprise: null } },
];

const featureMap = new Map<string, FeatureDef>(FEATURES.map((f) => [f.id, f]));
const limitMap = new Map<string, LimitDef>(LIMITS.map((l) => [l.id, l]));

export function featureById(id: string): FeatureDef | undefined {
  return featureMap.get(id);
}

/** Tier eines Features (für die Demo-Tags). Unbekannt/nicht gelistet ⇒ "free". */
export function featureTierOf(id: string): LicenseTier {
  return featureMap.get(id)?.tier ?? "free";
}

/** Vollständige id→tier-Map, die das Frontend für Tags/Gating bekommt. */
export function featureTierMap(): Record<string, LicenseTier> {
  return Object.fromEntries(FEATURES.map((f) => [f.id, f.tier]));
}

export function limitDefById(id: string): LimitDef | undefined {
  return limitMap.get(id);
}
