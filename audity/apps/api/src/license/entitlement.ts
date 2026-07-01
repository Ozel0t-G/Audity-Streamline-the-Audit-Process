import { TIER_RANK, featureById, limitDefById } from "./catalog.js";
import type { LicenseState } from "./types.js";

/**
 * Ist ein Feature freigeschaltet? Demo ⇒ immer true. Free/unbekannt ⇒ true.
 * Sonst: Tier hoch genug ODER als à-la-carte-Addon in der Lizenz enthalten.
 */
export function isEntitled(featureId: string, s: LicenseState): boolean {
  if (s.demoMode) return true;
  const def = featureById(featureId);
  if (!def || def.tier === "free") return true;
  return TIER_RANK[s.tier] >= TIER_RANK[def.tier] || s.features.includes(featureId);
}

/** Tier eines Features (für Demo-Tags / Upsell-Anzeige). */
export { featureTierOf } from "./catalog.js";

/**
 * Prüft ein Mengen-Limit (z. B. Anzahl Kunden). Demo ⇒ unbegrenzt. Lizenz-Override
 * (limits[limitId]) hat Vorrang vor dem Tier-Default. null ⇒ unbegrenzt.
 */
export function withinLimit(limitId: string, current: number, s: LicenseState): boolean {
  if (s.demoMode) return true;
  const def = limitDefById(limitId);
  if (!def) return true;
  const override = s.limits[limitId];
  const max = override === undefined ? def.byTier[s.tier] : override;
  return max == null || current < max;
}

/** Aufgelöstes Limit für die Anzeige (z. B. "3/5"). null = unbegrenzt. */
export function effectiveLimit(limitId: string, s: LicenseState): number | null {
  if (s.demoMode) return null;
  const def = limitDefById(limitId);
  if (!def) return null;
  const override = s.limits[limitId];
  return override === undefined ? def.byTier[s.tier] : override;
}
