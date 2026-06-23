import { useSearchParams } from "react-router-dom";
import { AssessmentAssetsPage } from "../../reports/AssessmentAssetsPage";
import { PhaseLayout } from "./PhaseLayout";

export function EvidencePhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  return (
    <PhaseLayout
      active="evidence"
      title="Evidence & Reports"
      description="Upload and manage evidence files and build, export and send assessment reports."
    >
      {auditId ? (
        <AssessmentAssetsPage assessmentId={auditId} embedded />
      ) : (
        <p className="text-sm text-audity-muted">Select an audit to view its evidence and reports.</p>
      )}
    </PhaseLayout>
  );
}
