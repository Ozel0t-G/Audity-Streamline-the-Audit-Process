import { useSearchParams } from "react-router-dom";
import { AssessmentWorkflowPage } from "../../workflow/AssessmentWorkflowPage";
import { PhaseLayout } from "./PhaseLayout";

export function RiskPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  return (
    <PhaseLayout
      active="risk"
      title="Risk Register"
      description="Identify, score (5×5 likelihood × impact) and treat risks. Link risks to findings and feed treatment actions into the roadmap."
    >
      {auditId ? (
        <AssessmentWorkflowPage assessmentId={auditId} only="risk" embedded />
      ) : (
        <p className="text-sm text-audity-muted">Select an audit to view its risk register.</p>
      )}
    </PhaseLayout>
  );
}
