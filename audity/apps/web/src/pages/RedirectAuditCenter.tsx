import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useApi } from "../api/client";
import { PageSkeleton } from "../components/ui";

export function RedirectAuditCenter() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void api<{ assessment: { customerId: string } }>(`/api/assessments/${id}`)
      .then((res) => setTarget(`/customers/${res.assessment.customerId}?audit=${id}`))
      .catch(() => setTarget("/dashboard"));
  }, [id, api]);

  if (!target) return <PageSkeleton cards={2} />;
  return <Navigate to={target} replace />;
}
