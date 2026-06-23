// Frontend mirror of backend transitions (apps/api/src/workflow/transitions.ts).
// Keep these in sync.

export type FindingStatus =
  | "suggested"
  | "in_review"
  | "needs_changes"
  | "confirmed"
  | "approved"
  | "dismissed";

export const FINDING_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  suggested: ["in_review", "dismissed"],
  in_review: ["needs_changes", "confirmed", "dismissed"],
  needs_changes: ["in_review", "dismissed"],
  confirmed: ["approved", "needs_changes"],
  approved: ["confirmed"],
  dismissed: []
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  suggested: "Suggested",
  in_review: "In Review",
  needs_changes: "Needs Changes",
  confirmed: "Confirmed",
  approved: "Approved",
  dismissed: "Rejected"
};

export const FINDING_STATUS_DESCRIPTION: Record<FindingStatus, string> = {
  suggested: "AI or auditor proposed this finding. No human has reviewed it yet.",
  in_review: "An auditor is actively reviewing this finding.",
  needs_changes: "The reviewer sent this finding back for revision.",
  confirmed: "Reviewed and accepted as a real finding.",
  approved: "Final approval — finding will appear in the audit report.",
  dismissed: "Rejected. Will not appear in the report."
};

export const FINDING_STATUS_COLUMNS: FindingStatus[] = [
  "suggested",
  "in_review",
  "needs_changes",
  "confirmed",
  "approved"
];

export type RiskStatus = "open" | "in_treatment" | "accepted" | "closed";

export const RISK_TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  open: ["in_treatment", "accepted", "closed"],
  in_treatment: ["accepted", "closed", "open"],
  accepted: ["open", "closed"],
  closed: ["open"]
};

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  open: "Open",
  in_treatment: "In Treatment",
  accepted: "Accepted",
  closed: "Closed"
};

export type RoadmapPhaseKey = "now" | "soon" | "mid" | "long";

export const ROADMAP_PHASES: Array<{ key: RoadmapPhaseKey; label: string; range: string }> = [
  { key: "now", label: "Now", range: "0-30d" },
  { key: "soon", label: "Soon", range: "31-90d" },
  { key: "mid", label: "Mid", range: "3-6M" },
  { key: "long", label: "Long", range: "6-12M" }
];

export function legalNextFindingStatuses(current: string): FindingStatus[] {
  return FINDING_TRANSITIONS[current as FindingStatus] ?? [];
}
