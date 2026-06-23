/**
 * Status-transition graphs for findings, risks, and roadmap items.
 * These are the authoritative legal moves between states.
 * Both backend (validation) and frontend (rendering available actions) read from here.
 */

export type FindingStatus =
  | "suggested"
  | "in_review"
  | "needs_changes"
  | "confirmed"
  | "approved"
  | "dismissed";

export type RiskStatus = "open" | "in_treatment" | "accepted" | "closed";

export type RoadmapStatus = "open" | "in_progress" | "blocked" | "done";

export const FINDING_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  suggested: ["in_review", "dismissed"],
  in_review: ["needs_changes", "confirmed", "dismissed"],
  needs_changes: ["in_review", "dismissed"],
  confirmed: ["approved", "needs_changes"],
  approved: ["confirmed"],
  dismissed: []
};

export const RISK_TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  open: ["in_treatment", "accepted", "closed"],
  in_treatment: ["accepted", "closed", "open"],
  accepted: ["open", "closed"],
  closed: ["open"]
};

export const ROADMAP_TRANSITIONS: Record<RoadmapStatus, RoadmapStatus[]> = {
  open: ["in_progress", "blocked", "done"],
  in_progress: ["blocked", "done", "open"],
  blocked: ["in_progress", "open"],
  done: ["open"]
};

export function isLegalFindingTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = FINDING_TRANSITIONS[from as FindingStatus];
  return allowed?.includes(to as FindingStatus) ?? false;
}

export function isLegalRiskTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = RISK_TRANSITIONS[from as RiskStatus];
  return allowed?.includes(to as RiskStatus) ?? false;
}

export function isLegalRoadmapTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = ROADMAP_TRANSITIONS[from as RoadmapStatus];
  return allowed?.includes(to as RoadmapStatus) ?? false;
}

/**
 * Roadmap phase definitions (4 fixed columns).
 * The "anchor" is either the assessment's closure_due_date or, as fallback, today.
 * Phase windows are anchored to the closure date for stable boundaries — items
 * don't migrate columns just because time passed.
 */
export type RoadmapPhaseKey = "now" | "soon" | "mid" | "long";

export const ROADMAP_PHASES: Record<
  RoadmapPhaseKey,
  { label: string; startDays: number; endDays: number }
> = {
  now: { label: "Now (0-30d)", startDays: 0, endDays: 30 },
  soon: { label: "Soon (31-90d)", startDays: 31, endDays: 90 },
  mid: { label: "Mid (3-6M)", startDays: 91, endDays: 180 },
  long: { label: "Long (6-12M)", startDays: 181, endDays: 365 }
};

export function phaseDatesFor(
  phase: RoadmapPhaseKey | string,
  anchorISO?: string | null
): { startDate: string | null; endDate: string | null } {
  const phaseDef = ROADMAP_PHASES[phase as RoadmapPhaseKey];
  if (!phaseDef) return { startDate: null, endDate: null };
  const anchor = anchorISO ? new Date(anchorISO) : new Date();
  if (Number.isNaN(anchor.getTime())) {
    return { startDate: null, endDate: null };
  }
  const start = new Date(anchor.getTime() + phaseDef.startDays * 86_400_000);
  const end = new Date(anchor.getTime() + phaseDef.endDays * 86_400_000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

/**
 * Legacy phase labels (0-30d / 31-90d / 3-6M / 6-12M) → new keys.
 * Used for migration of existing data and backward compat.
 */
export function normalisePhaseLabel(value: string | null | undefined): RoadmapPhaseKey {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("0-30") || v === "now") return "now";
  if (v.includes("31-90") || v === "soon") return "soon";
  if (v.includes("3-6") || v === "mid") return "mid";
  if (v.includes("6-12") || v === "long") return "long";
  return "now";
}
