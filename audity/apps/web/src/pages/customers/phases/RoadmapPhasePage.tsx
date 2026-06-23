import { useSearchParams } from "react-router-dom";
import { AssessmentWorkflowPage } from "../../workflow/AssessmentWorkflowPage";
import { PhaseLayout } from "./PhaseLayout";

export function RoadmapPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  return (
    <PhaseLayout
      active="roadmap"
      title="Roadmap"
      description="Sequenced remediation actions (Now · Soon · Mid · Long) to close findings and treat risks."
    >
      {auditId ? (
        <AssessmentWorkflowPage assessmentId={auditId} only="roadmap" embedded />
      ) : (
        <p className="text-sm text-audity-muted">Select an audit to view its roadmap.</p>
      )}
    </PhaseLayout>
  );
}
