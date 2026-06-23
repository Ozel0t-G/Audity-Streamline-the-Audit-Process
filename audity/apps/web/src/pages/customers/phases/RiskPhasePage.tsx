import { useSearchParams } from "react-router-dom";
import { AssessmentWorkflowPage } from "../../workflow/AssessmentWorkflowPage";
import { FindingsSummaryList } from "./FindingsSummaryList";
import { PhaseLayout } from "./PhaseLayout";

export function RiskPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  return (
    <PhaseLayout
      active="risk"
      title="Risk Register"
      description="Findings overview with likelihood, impact and mapped controls. Open the full risk register for the 5×5 matrix, scoring and treatment. Export both to Excel."
    >
      {auditId ? (
        <div className="space-y-4">
          {/* Full risk register collapsed by default — expand when you need the
              matrix, scoring and treatment editor. */}
          <details className="audity-card p-4">
            <summary className="cursor-pointer select-none text-base font-semibold text-audity-text">
              Full risk register — matrix, scoring &amp; treatment
            </summary>
            <div className="mt-4 border-t border-audity-border pt-4">
              <AssessmentWorkflowPage assessmentId={auditId} only="risk" embedded />
            </div>
          </details>

          <FindingsSummaryList assessmentId={auditId} />
        </div>
      ) : (
        <p className="text-sm text-audity-muted">Select an audit to view its risk register.</p>
      )}
    </PhaseLayout>
  );
}
