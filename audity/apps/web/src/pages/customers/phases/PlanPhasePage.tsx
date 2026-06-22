import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { Skeleton, useToast } from "../../../components/ui";
import { PhaseLayout } from "./PhaseLayout";

type PlanForm = {
  currentPhase: string;
  kickoffAt: string;
  fieldworkStart: string;
  fieldworkEnd: string;
  reportDueDate: string;
  closureDueDate: string;
  auditOwner: string;
  reviewer: string;
  readinessTarget: number;
};

type ScopeItem = {
  id: string;
  itemType: string;
  name: string;
  description: string;
  inScope: boolean;
  criticality: string;
  rationale?: string | null;
};

function dateValue(value: unknown): string {
  if (!value) return "";
  if (typeof value !== "string") return "";
  return value.slice(0, 10);
}

export function PlanPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = Boolean(user?.permissions.includes("assessment.edit"));

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanForm>({
    currentPhase: "Preparation",
    kickoffAt: "",
    fieldworkStart: "",
    fieldworkEnd: "",
    reportDueDate: "",
    closureDueDate: "",
    auditOwner: "",
    reviewer: "",
    readinessTarget: 85
  });
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [scopeForm, setScopeForm] = useState({
    itemType: "system",
    name: "",
    description: "",
    inScope: true,
    criticality: "medium",
    rationale: ""
  });

  async function load() {
    if (!auditId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await api<{
        plan: Record<string, unknown> | null;
        scopeItems: ScopeItem[];
      }>(`/api/assessments/${auditId}/audit-center`);
      const p = payload.plan ?? {};
      setPlan({
        currentPhase: String(p.currentPhase ?? "Preparation"),
        kickoffAt: dateValue(p.kickoffAt),
        fieldworkStart: dateValue(p.fieldworkStart),
        fieldworkEnd: dateValue(p.fieldworkEnd),
        reportDueDate: dateValue(p.reportDueDate),
        closureDueDate: dateValue(p.closureDueDate),
        auditOwner: String(p.auditOwner ?? ""),
        reviewer: String(p.reviewer ?? ""),
        readinessTarget: Number(p.readinessTarget ?? 85)
      });
      setScopeItems(payload.scopeItems ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Plan konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId]);

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auditId) return;
    try {
      await api(`/api/assessments/${auditId}/audit-center/plan`, {
        method: "PUT",
        body: JSON.stringify({
          ...plan,
          kickoffAt: plan.kickoffAt || null,
          fieldworkStart: plan.fieldworkStart || null,
          fieldworkEnd: plan.fieldworkEnd || null,
          reportDueDate: plan.reportDueDate || null,
          closureDueDate: plan.closureDueDate || null,
          readinessTarget: Number(plan.readinessTarget)
        })
      });
      toast.success("Plan gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function addScopeItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auditId) return;
    try {
      await api(`/api/assessments/${auditId}/audit-center/scope`, {
        method: "POST",
        body: JSON.stringify(scopeForm)
      });
      setScopeForm({ ...scopeForm, name: "", description: "", rationale: "" });
      toast.success("Scope-Item hinzugefügt");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Konnte Scope-Item nicht anlegen");
    }
  }

  return (
    <PhaseLayout
      active="plan"
      title="Plan & Scope"
      description="Timeline, Audit-Owner, Reviewer, Scope-Items. Exit-Kriterium: Kickoff + Owner gesetzt, mind. 1 In-Scope-Item."
      aiHint="AI kann Scope-Items aus dem Framework herleiten und Default-Timeline vorschlagen."
    >
      {!auditId ? (
        <p className="text-sm text-audity-muted">Kein Audit ausgewählt.</p>
      ) : loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <form className="audity-card p-4" onSubmit={savePlan}>
            <h2 className="mb-3 text-sm font-semibold text-audity-text">Audit-Plan</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-audity-secondary">
                Aktuelle Phase
                <input
                  className="audity-input mt-1"
                  value={plan.currentPhase}
                  onChange={(e) => setPlan({ ...plan, currentPhase: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Readiness-Ziel %
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="audity-input mt-1"
                  value={plan.readinessTarget}
                  onChange={(e) => setPlan({ ...plan, readinessTarget: Number(e.target.value) })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Kickoff
                <input
                  type="date"
                  className="audity-input mt-1"
                  value={plan.kickoffAt}
                  onChange={(e) => setPlan({ ...plan, kickoffAt: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Closure
                <input
                  type="date"
                  className="audity-input mt-1"
                  value={plan.closureDueDate}
                  onChange={(e) => setPlan({ ...plan, closureDueDate: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Fieldwork Start
                <input
                  type="date"
                  className="audity-input mt-1"
                  value={plan.fieldworkStart}
                  onChange={(e) => setPlan({ ...plan, fieldworkStart: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Fieldwork Ende
                <input
                  type="date"
                  className="audity-input mt-1"
                  value={plan.fieldworkEnd}
                  onChange={(e) => setPlan({ ...plan, fieldworkEnd: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Report-Frist
                <input
                  type="date"
                  className="audity-input mt-1"
                  value={plan.reportDueDate}
                  onChange={(e) => setPlan({ ...plan, reportDueDate: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Audit-Owner
                <input
                  className="audity-input mt-1"
                  value={plan.auditOwner}
                  onChange={(e) => setPlan({ ...plan, auditOwner: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Reviewer
                <input
                  className="audity-input mt-1"
                  value={plan.reviewer}
                  onChange={(e) => setPlan({ ...plan, reviewer: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
            </div>
            {canEdit ? (
              <button type="submit" className="audity-btn-primary mt-4">
                Plan speichern
              </button>
            ) : null}
          </form>

          <div className="audity-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-audity-text">
              Scope-Items ({scopeItems.length})
            </h2>
            <ul className="mb-4 space-y-2 text-sm">
              {scopeItems.length ? (
                scopeItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 rounded-audity border border-audity-border p-2"
                  >
                    <div>
                      <strong className="text-audity-text">{item.name}</strong>
                      <p className="text-xs text-audity-muted">
                        {item.itemType} · {item.criticality} · {item.inScope ? "In-Scope" : "Out-of-Scope"}
                      </p>
                      {item.description ? (
                        <p className="mt-1 text-xs text-audity-secondary">{item.description}</p>
                      ) : null}
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-xs text-audity-muted">Noch keine Scope-Items.</li>
              )}
            </ul>

            {canEdit ? (
              <form className="space-y-2" onSubmit={addScopeItem}>
                <select
                  className="audity-input"
                  value={scopeForm.itemType}
                  onChange={(e) => setScopeForm({ ...scopeForm, itemType: e.target.value })}
                >
                  <option value="system">System</option>
                  <option value="process">Process</option>
                  <option value="supplier">Supplier</option>
                  <option value="data_type">Data Type</option>
                  <option value="location">Location</option>
                  <option value="regulation">Regulation</option>
                  <option value="other">Other</option>
                </select>
                <input
                  className="audity-input"
                  placeholder="Name"
                  value={scopeForm.name}
                  onChange={(e) => setScopeForm({ ...scopeForm, name: e.target.value })}
                  required
                />
                <textarea
                  className="audity-input min-h-[60px]"
                  placeholder="Beschreibung"
                  value={scopeForm.description}
                  onChange={(e) => setScopeForm({ ...scopeForm, description: e.target.value })}
                />
                <button type="submit" className="audity-btn-primary">
                  + Scope-Item
                </button>
              </form>
            ) : null}
          </div>
        </div>
      )}
    </PhaseLayout>
  );
}
