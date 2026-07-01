import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";

export type LicenseTier = "free" | "pro" | "enterprise";

export type LicenseState = {
  valid: boolean;
  tier: LicenseTier;
  demoMode: boolean;
  features: string[];
  limits: Record<string, number | null>;
  customer: string | null;
  licenseId: string | null;
  expiresAt: string | null;
  inGrace: boolean;
  watermark: boolean;
  reason?: string;
};

type LicenseContextValue = {
  state: LicenseState;
  featureTiers: Record<string, LicenseTier>;
  demoMode: boolean;
  isEntitled: (featureId: string) => boolean;
  featureTier: (featureId: string) => LicenseTier;
  reload: () => void;
};

const FREE_STATE: LicenseState = {
  valid: false,
  tier: "free",
  demoMode: false,
  features: [],
  limits: {},
  customer: null,
  licenseId: null,
  expiresAt: null,
  inGrace: false,
  watermark: false,
  reason: "no_license"
};

const RANK: Record<LicenseTier, number> = { free: 0, pro: 1, enterprise: 2 };

const LicenseContext = createContext<LicenseContextValue>({
  state: FREE_STATE,
  featureTiers: {},
  demoMode: false,
  isEntitled: () => true,
  featureTier: () => "free",
  reload: () => undefined
});

export function LicenseProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { accessToken } = useAuth();
  const [state, setState] = useState<LicenseState>(FREE_STATE);
  const [featureTiers, setFeatureTiers] = useState<Record<string, LicenseTier>>({});
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!accessToken) {
      // Invalidate any in-flight load so a response that started before logout
      // can't resolve later and restore the previous user's licensed state over
      // FREE_STATE. Same intent as the empty-guard branch in useAuditOverview.
      reqRef.current += 1;
      setState(FREE_STATE);
      setFeatureTiers({});
      return;
    }
    const requestId = ++reqRef.current;
    try {
      const payload = await api<{ state: LicenseState; featureTiers: Record<string, LicenseTier> }>(
        "/api/license/state"
      );
      if (reqRef.current !== requestId) return;
      setState(payload.state ?? FREE_STATE);
      setFeatureTiers(payload.featureTiers ?? {});
    } catch {
      if (reqRef.current !== requestId) return;
      setState(FREE_STATE);
      setFeatureTiers({});
    }
  }, [api, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<LicenseContextValue>(() => {
    const featureTier = (id: string): LicenseTier => featureTiers[id] ?? "free";
    const isEntitled = (id: string): boolean => {
      if (state.demoMode) return true;
      const tier = featureTiers[id];
      if (!tier || tier === "free") return true;
      return RANK[state.tier] >= RANK[tier] || state.features.includes(id);
    };
    return {
      state,
      featureTiers,
      demoMode: state.demoMode,
      isEntitled,
      featureTier,
      reload: () => void load()
    };
  }, [state, featureTiers, load]);

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
  return useContext(LicenseContext);
}
