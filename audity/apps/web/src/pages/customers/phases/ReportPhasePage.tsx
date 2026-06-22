import { Link, useSearchParams } from "react-router-dom";
import { PhaseLayout } from "./PhaseLayout";

export function ReportPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  return (
    <PhaseLayout
      active="report"
      title="Report & Sign-off"
      description="Report-Lifecycle (draft → internal_review → customer_review → final), Sign-off, Pack-Export, SoA, Gap-Register."
      aiHint="AI regeneriert Executive Summary aus Controls/Findings/Evidence. Tonalität anpassbar."
    >
      {!auditId ? (
        <p className="text-sm text-audity-muted">Kein Audit ausgewählt.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Link
            to={`/assessments/${auditId}/assets`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">Report-Assets</h2>
            <p className="text-sm text-audity-secondary">
              Vorlagen, Branding, generierte Reports, Versionen.
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">Öffnen →</span>
          </Link>
          <Link
            to={`/assessments/${auditId}/audit-center?tab=report-sign-off`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">Report-Review-Workflow</h2>
            <p className="text-sm text-audity-secondary">
              Internal Review → Customer Review → Final → Approved.
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">Öffnen →</span>
          </Link>
          <Link
            to={`/assessments/${auditId}/audit-center?tab=report-sign-off&focus=signoff`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">Sign-off</h2>
            <p className="text-sm text-audity-secondary">
              Owner-Signatur + Reviewer-Signatur, tamper-evident am Pack-Manifest verankert.
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">Öffnen →</span>
          </Link>
          <Link
            to={`/assessments/${auditId}/audit-center?tab=gaps-pack`}
            className="audity-card-interactive flex flex-col gap-2 p-4"
          >
            <h2 className="text-base font-semibold text-audity-text">SoA & Pack-Export</h2>
            <p className="text-sm text-audity-secondary">
              Statement of Applicability, Gap-Register, signiertes Evidence-Pack.
            </p>
            <span className="mt-auto text-xs font-semibold text-audity-primary">Öffnen →</span>
          </Link>
        </div>
      )}
    </PhaseLayout>
  );
}
