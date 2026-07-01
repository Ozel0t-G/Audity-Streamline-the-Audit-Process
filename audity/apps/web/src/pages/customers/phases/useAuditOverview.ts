import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../../../api/client";

export type AnyRecord = Record<string, unknown>;

export type AuditControl = {
  assessmentQuestionId: string;
  questionId?: string | null;
  question?: string | null;
  domain?: string | null;
  controlCode?: string | null;
  controlTitle?: string | null;
  score?: number | null;
  answerState?: string | null;
  evidenceStatus?: string | null;
  confidenceLevel?: string | null;
  applicability?: string | null;
  applicabilityReason?: string | null;
  controlOwner?: string | null;
  reviewer?: string | null;
  reviewStatus?: string | null;
  controlCriticality?: string | null;
  maturityJustification?: string | null;
  evidenceQualityScore?: number | null;
  readinessStatus?: string | null;
  signoffStatus?: string | null;
  mappedEvidence?: number | null;
  contradiction?: boolean;
};

export type AuditOverview = {
  assessment: AnyRecord;
  plan: AnyRecord;
  scopeItems: AnyRecord[];
  controls: AuditControl[];
  evidenceItems: AnyRecord[];
  evidenceMappings: AnyRecord[];
  evidenceRequests: AnyRecord[];
  findings: AnyRecord[];
  risks: AnyRecord[];
  interviews: AnyRecord[];
  samples: AnyRecord[];
  reportReviews: AnyRecord[];
  signoffs: AnyRecord[];
  history: AnyRecord[];
  statementOfApplicability: AnyRecord[];
  gaps: AnyRecord[];
  contradictions: AuditControl[];
  readinessScore: number;
  executiveSummary: string;
};

const emptyOverview: AuditOverview = {
  assessment: {},
  plan: {},
  scopeItems: [],
  controls: [],
  evidenceItems: [],
  evidenceMappings: [],
  evidenceRequests: [],
  findings: [],
  risks: [],
  interviews: [],
  samples: [],
  reportReviews: [],
  signoffs: [],
  history: [],
  statementOfApplicability: [],
  gaps: [],
  contradictions: [],
  readinessScore: 0,
  executiveSummary: ""
};

export function useAuditOverview(assessmentId: string) {
  const api = useApi();
  const [overview, setOverview] = useState<AuditOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Guards against stale responses: when assessmentId changes (or reload() races),
  // only the most recent request may write state, so a slower earlier response can
  // never overwrite newer data. Same intent as the `let cancelled` guard used
  // across the app's other async fetches.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!assessmentId) {
      requestRef.current += 1;
      setOverview(emptyOverview);
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const payload = await api<AuditOverview>(
        `/api/assessments/${assessmentId}/audit-center`
      );
      if (requestRef.current !== requestId) return;
      setOverview(payload ?? emptyOverview);
      setError("");
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : "Could not load audit data");
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [api, assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { overview, loading, error, reload: load };
}
