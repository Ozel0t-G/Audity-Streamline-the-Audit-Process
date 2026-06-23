import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useApi } from "../api/client";
import { PageSkeleton } from "../components/ui";

/**
 * Funnels legacy assessment-scoped routes (e.g. /assessments/:id/workflow) into
 * the unified customer audit tab view (/customers/:customerId/<tab>?audit=:id),
 * so there is a single place to navigate an audit.
 */
export function RedirectToCustomerTab({ tab }: { tab: string }) {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void api<{ assessment: { customerId: string } }>(`/api/assessments/${id}`)
      .then((res) => setTarget(`/customers/${res.assessment.customerId}/${tab}?audit=${id}`))
      .catch(() => setTarget("/dashboard"));
  }, [id, api, tab]);

  if (!target) return <PageSkeleton cards={2} />;
  return <Navigate to={target} replace />;
}
