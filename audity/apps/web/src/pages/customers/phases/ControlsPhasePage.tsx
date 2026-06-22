import { Link, useSearchParams } from "react-router-dom";
import { PhaseLayout } from "./PhaseLayout";

export function ControlsPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  return (
    <PhaseLayout
      active="controls"
      title="Controls & Evidence"
      description="Control-Scoring, Evidence-Mapping, Quality-Score, Interviews/Samples inline. Exit: alle non-N/A Controls beantwortet, Mappings vorhanden."
      aiHint="AI schlägt Scores aus gemappter Evidence vor und markiert Widersprüche."
    >
      {!auditId ? (
        <p className="text-sm text-audity-muted">Kein Audit ausgewählt.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Link
            to={`/assessments/${auditId}/questions`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">Guided Questions</h2>
            <p className="text-sm text-audity-secondary">
              Controls per Frage beantworten, Evidence-Status setzen, Confidence wählen.
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">
              Öffnen →
            </span>
          </Link>
          <Link
            to={`/assessments/${auditId}/audit-center?tab=controls-evidence`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">Control-Workspace</h2>
            <p className="text-sm text-audity-secondary">
              Applicability, Owner, Reviewer, Readiness, Maturity-Justification, Quality-Score.
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">
              Öffnen →
            </span>
          </Link>
          <Link
            to={`/assessments/${auditId}/audit-center?tab=controls-evidence&focus=mapping`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">Evidence-Mapping</h2>
            <p className="text-sm text-audity-secondary">
              Evidence ↔ Control verknüpfen, 4D-Quality-Score (Relevance, Completeness, Freshness, Trust).
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">
              Öffnen →
            </span>
          </Link>
          <Link
            to={`/assessments/${auditId}/audit-center?tab=audit-work`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">Interviews & Samples</h2>
            <p className="text-sm text-audity-secondary">
              Interview-Notizen, Sample-Definition, Selektions-Methodik.
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">
              Öffnen →
            </span>
          </Link>
          <Link
            to={`/assessments/${auditId}/audit-center?tab=controls-evidence&focus=requests`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">Evidence-Requests</h2>
            <p className="text-sm text-audity-secondary">
              Customer-facing Requests anlegen, Status verfolgen, Eskalation.
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">
              Öffnen →
            </span>
          </Link>
          <Link
            to={`/assessments/${auditId}/audit-center?tab=controls-evidence&filter=contradiction`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">Widersprüche</h2>
            <p className="text-sm text-audity-secondary">
              Controls die als ready markiert sind, aber keine Evidence haben.
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">
              Öffnen →
            </span>
          </Link>
        </div>
      )}
    </PhaseLayout>
  );
}
