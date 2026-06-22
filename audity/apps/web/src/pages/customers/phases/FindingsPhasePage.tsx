import { Link, useSearchParams } from "react-router-dom";
import { PhaseLayout } from "./PhaseLayout";

export function FindingsPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  const filter = searchParams.get("filter");

  return (
    <PhaseLayout
      active="findings"
      title="Findings"
      description="Lifecycle draft → confirmed → agreed → remediated → verified → closed. Parallel zu Fieldwork."
      aiHint="AI schlägt Severity aus Impact × Likelihood × Control-Criticality × Evidence-Confidence vor."
    >
      {!auditId ? (
        <p className="text-sm text-audity-muted">Kein Audit ausgewählt.</p>
      ) : (
        <>
          {filter ? (
            <p className="mb-3 rounded-audity border border-audity-border bg-audity-panel p-2 text-xs text-audity-secondary">
              Filter aktiv: <strong>{filter}</strong>
            </p>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-2">
            <Link
              to={`/assessments/${auditId}/workflow`}
              className="audity-card-interactive flex flex-col gap-2 p-4"
            >
              <h2 className="text-base font-semibold text-audity-text">Findings-Workflow</h2>
              <p className="text-sm text-audity-secondary">
                Gesamter Lifecycle: Severity, Mgmt-Response, Remediation, Re-Test.
              </p>
              <span className="mt-auto text-xs font-semibold text-audity-primary">Öffnen →</span>
            </Link>
            <Link
              to={`/assessments/${auditId}/audit-center?tab=findings-remediation`}
              className="audity-card-interactive flex flex-col gap-2 p-4"
            >
              <h2 className="text-base font-semibold text-audity-text">Severity-Matrix</h2>
              <p className="text-sm text-audity-secondary">
                Impact × Likelihood + Control-Criticality + Evidence-Confidence.
              </p>
              <span className="mt-auto text-xs font-semibold text-audity-primary">Öffnen →</span>
            </Link>
            <Link
              to={`/assessments/${auditId}/audit-center?tab=findings-remediation&focus=response`}
              className="audity-card-interactive flex flex-col gap-2 p-4"
            >
              <h2 className="text-base font-semibold text-audity-text">Mgmt-Response</h2>
              <p className="text-sm text-audity-secondary">
                Owner-Antwort, Akzeptanz-Entscheidung, Begründung.
              </p>
              <span className="mt-auto text-xs font-semibold text-audity-primary">Öffnen →</span>
            </Link>
            <Link
              to={`/assessments/${auditId}/audit-center?tab=findings-remediation&focus=remediation`}
              className="audity-card-interactive flex flex-col gap-2 p-4"
            >
              <h2 className="text-base font-semibold text-audity-text">Remediation & Re-Test</h2>
              <p className="text-sm text-audity-secondary">
                Owner, Frist, Status, Re-Test-Evidence.
              </p>
              <span className="mt-auto text-xs font-semibold text-audity-primary">Öffnen →</span>
            </Link>
          </div>
        </>
      )}
    </PhaseLayout>
  );
}
