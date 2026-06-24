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
      description="Score and treat risks in the 5×5 matrix above. The findings list (with likelihood, impact, mapped controls and notes) sits below — expand it when you need it, and export both to Excel."
    >
      {auditId ? (
        <div className="space-y-4">
          {/* Risk register itself — always visible, just a touch smaller. */}
          <div className="text-[0.95rem]">
            <AssessmentWorkflowPage assessmentId={auditId} only="risk" embedded />
          </div>

          {/* Findings list collapsed by default (everything under the register). */}
          <details>
            <summary className="audity-card cursor-pointer select-none p-3 text-sm font-semibold text-audity-text">
              Findings list — likelihood, impact, mapped control &amp; notes · Excel export
            </summary>
            <div className="mt-2">
              <FindingsSummaryList assessmentId={auditId} />
            </div>
          </details>
        </div>
      ) : (
        <p className="text-sm text-audity-muted">Select an audit to view its risk register.</p>
      )}
    </PhaseLayout>
  );
}
