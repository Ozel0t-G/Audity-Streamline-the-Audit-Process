import { useLicense, type LicenseTier } from "../license/LicenseProvider";

const TAGS: Record<LicenseTier, { label: string; cls: string }> = {
  free: { label: "Free", cls: "bg-audity-success/15 text-audity-success" },
  pro: { label: "Pro", cls: "bg-audity-primary/15 text-audity-primary" },
  enterprise: { label: "Enterprise", cls: "bg-purple-500/20 text-purple-300" }
};

/**
 * Farbiges Tier-Chip — wird NUR im Demo-Modus gerendert. Zeigt, zu welchem Tier
 * ein Feature gehört (Free=grün, Pro=blau, Enterprise=lila). Siehe §9.5.
 *
 * Beispiel:  <NavLink ...>Remote-Archiv <FeatureTag featureId="log_archive_remote" /></NavLink>
 */
export function FeatureTag({ featureId }: { featureId: string }) {
  const { demoMode, featureTier } = useLicense();
  if (!demoMode) return null;
  const tag = TAGS[featureTier(featureId)];
  return (
    <span className={`ml-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold align-middle ${tag.cls}`}>
      {tag.label}
    </span>
  );
}
