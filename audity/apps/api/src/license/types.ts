// Lizenz-Typen. Siehe lizenz_plan.md (§3/§4).

export type LicenseTier = "free" | "pro" | "enterprise";
export type ClaimTier = LicenseTier | "demo";

/** Claims im signierten Token (Ed25519). */
export type LicenseClaims = {
  v: number;
  licenseId: string;
  customer: string;
  tier: ClaimTier;
  features?: string[];
  limits?: Record<string, number | null>;
  issuedAt?: string;
  notBefore?: string;
  expiresAt?: string | null; // null = kein Ablauf (z. B. Demo)
  instanceBinding?: string | null; // encryption-key fingerprint oder null = ungebunden
  demo?: { seedData?: boolean; watermark?: boolean };
};

/** Öffentlich auswertbarer Zustand (nie Geheimnisse). */
export type LicenseState = {
  valid: boolean;
  tier: LicenseTier; // demo wird auf "enterprise"-Baseline + demoMode abgebildet
  demoMode: boolean;
  features: string[];
  limits: Record<string, number | null>;
  customer: string | null;
  licenseId: string | null;
  expiresAt: string | null;
  inGrace: boolean;
  watermark: boolean;
  reason?: string; // bei !valid: warum (für Banner/Logs)
};

export type FeatureDef = {
  id: string;
  label: string;
  category?: string;
  tier: LicenseTier; // Mindest-Tier; vom Hersteller im Katalog gepflegt
};

export type LimitDef = {
  id: string;
  label: string;
  byTier: Record<LicenseTier, number | null>; // null = unbegrenzt
};
