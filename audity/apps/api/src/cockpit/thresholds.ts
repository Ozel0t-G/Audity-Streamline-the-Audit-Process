import { pool } from "../db/client.js";

export type StuckThresholds = {
  fieldwork: number;
  findings_response: number;
  evidence_request: number;
  remediation: number;
};

export const HARDCODED_DEFAULTS: StuckThresholds = {
  fieldwork: 14,
  findings_response: 21,
  evidence_request: 14,
  remediation: 21
};

function coerce(value: unknown): Partial<StuckThresholds> {
  if (!value || typeof value !== "object") return {};
  const obj = value as Record<string, unknown>;
  const out: Partial<StuckThresholds> = {};
  for (const key of Object.keys(HARDCODED_DEFAULTS) as Array<keyof StuckThresholds>) {
    const candidate = Number(obj[key]);
    if (Number.isFinite(candidate) && candidate > 0 && candidate < 3650) {
      out[key] = Math.floor(candidate);
    }
  }
  return out;
}

/**
 * Resolve effective stuck thresholds for an assessment:
 * assessment.stuck_thresholds (per-audit) > framework.default_stuck_thresholds > hardcoded.
 * Each field cascades independently.
 */
export function resolveThresholds(
  assessmentOverride: unknown,
  frameworkDefault: unknown
): StuckThresholds {
  const ass = coerce(assessmentOverride);
  const fw = coerce(frameworkDefault);
  return {
    fieldwork: ass.fieldwork ?? fw.fieldwork ?? HARDCODED_DEFAULTS.fieldwork,
    findings_response: ass.findings_response ?? fw.findings_response ?? HARDCODED_DEFAULTS.findings_response,
    evidence_request: ass.evidence_request ?? fw.evidence_request ?? HARDCODED_DEFAULTS.evidence_request,
    remediation: ass.remediation ?? fw.remediation ?? HARDCODED_DEFAULTS.remediation
  };
}

/**
 * Bulk load thresholds for a set of assessments in one query.
 */
export async function loadThresholdsForAssessments(
  assessmentIds: string[]
): Promise<Map<string, StuckThresholds>> {
  const map = new Map<string, StuckThresholds>();
  if (!assessmentIds.length) return map;
  const result = await pool.query<{
    id: string;
    stuck_thresholds: unknown;
    default_stuck_thresholds: unknown;
  }>(
    `select a.id, a.stuck_thresholds, f.default_stuck_thresholds
       from assessments a
       left join frameworks f on f.id = a.framework_id
      where a.id = any($1::uuid[])`,
    [assessmentIds]
  );
  for (const row of result.rows) {
    map.set(row.id, resolveThresholds(row.stuck_thresholds, row.default_stuck_thresholds));
  }
  return map;
}

export type StuckEvaluation = {
  stuck: boolean;
  days: number;
  threshold: number;
  reason: keyof StuckThresholds;
};

export function evaluateStuck(
  updatedAt: string | Date,
  status: string,
  thresholds: StuckThresholds,
  reason: keyof StuckThresholds = "fieldwork"
): StuckEvaluation {
  if (status !== "active") {
    return { stuck: false, days: 0, threshold: thresholds[reason], reason };
  }
  const updated = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
  const days = Math.floor((Date.now() - updated.getTime()) / 86400000);
  return {
    stuck: days > thresholds[reason],
    days,
    threshold: thresholds[reason],
    reason
  };
}
