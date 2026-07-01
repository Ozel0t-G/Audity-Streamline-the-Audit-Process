import { useLicense } from "./LicenseProvider";

/**
 * True, wenn das Feature in der aktuellen Lizenz enthalten ist (Demo ⇒ immer).
 * Im Normal-Modus werden nicht-berechtigte Features komplett ausgeblendet
 * (kein Lock/Upsell) — siehe lizenz_plan.md §8.
 *
 * Beispiel:  const canRemoteArchive = useEntitlement("log_archive_remote");
 *            {canRemoteArchive ? <RemoteTargets/> : null}
 */
export function useEntitlement(featureId: string): boolean {
  return useLicense().isEntitled(featureId);
}
