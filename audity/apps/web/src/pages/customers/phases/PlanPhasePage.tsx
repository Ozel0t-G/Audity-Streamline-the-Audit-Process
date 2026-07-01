import { useEffect, useRef, useState, type FormEvent } from "react";
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

const SUGGESTED_ITEM_TYPES = [
  "system",
  "process",
  "supplier",
  "data_type",
  "location",
  "regulation",
  "other"
];

const SUGGESTED_CRITICALITIES = ["low", "medium", "high", "critical"];

const CURRENT_PHASE_OPTIONS = [
  "Preparation",
  "Kickoff",
  "Evidence Collection",
  "Interviews",
  "Review",
  "Findings",
  "Report",
  "Closure"
];

const READINESS_TARGET_OPTIONS = Array.from({ length: 20 }, (_, idx) => (idx + 1) * 5);

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
  const loadSeqRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [autoConvert, setAutoConvert] = useState(false);
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
    const requestId = ++loadSeqRef.current;
    setLoading(true);
    try {
      const payload = await api<{
        plan: Record<string, unknown> | null;
        scopeItems: ScopeItem[];
      }>(`/api/assessments/${auditId}/audit-center`);
      if (loadSeqRef.current !== requestId) return;
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
      try {
        const flag = await api<{ enabled: boolean }>(
          `/api/assessments/${auditId}/auto-convert-findings`
        );
        if (loadSeqRef.current === requestId) setAutoConvert(flag.enabled);
      } catch {
        if (loadSeqRef.current === requestId) setAutoConvert(false);
      }
    } catch (err) {
      if (loadSeqRef.current === requestId) toast.error(err instanceof Error ? err.message : "Could not load the plan");
    } finally {
      if (loadSeqRef.current === requestId) setLoading(false);
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
      toast.success("Plan saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function addScopeItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auditId) return;
    const trimmedType = scopeForm.itemType.trim() || "other";
    const trimmedCriticality = scopeForm.criticality.trim() || "medium";
    try {
      await api(`/api/assessments/${auditId}/audit-center/scope`, {
        method: "POST",
        body: JSON.stringify({
          ...scopeForm,
          itemType: trimmedType,
          criticality: trimmedCriticality
        })
      });
      setScopeForm({ ...scopeForm, name: "", description: "", rationale: "" });
      toast.success("Scope item added");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add scope item");
    }
  }

  return (
    <PhaseLayout
      active="plan"
      title="Plan & Scope"
      description="Timeline, audit owner, reviewer, scope items. Exit criterion: kickoff and owner set, at least 1 in-scope item."
      aiHint="AI can suggest scope items from the framework and propose a default timeline."
    >
      {!auditId ? (
        <p className="text-sm text-audity-muted">No audit selected.</p>
      ) : loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <form className="audity-card p-4" onSubmit={savePlan}>
            <h2 className="mb-3 text-sm font-semibold text-audity-text">Audit plan</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-audity-secondary">
                Current phase
                <select
                  className="audity-input mt-1"
                  value={plan.currentPhase}
                  onChange={(e) => setPlan({ ...plan, currentPhase: e.target.value })}
                  disabled={!canEdit}
                >
                  {CURRENT_PHASE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Readiness target %
                <select
                  className="audity-input mt-1"
                  value={plan.readinessTarget}
                  onChange={(e) => setPlan({ ...plan, readinessTarget: Number(e.target.value) })}
                  disabled={!canEdit}
                >
                  {READINESS_TARGET_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}%
                    </option>
                  ))}
                </select>
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
                Fieldwork start
                <input
                  type="date"
                  className="audity-input mt-1"
                  value={plan.fieldworkStart}
                  onChange={(e) => setPlan({ ...plan, fieldworkStart: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Fieldwork end
                <input
                  type="date"
                  className="audity-input mt-1"
                  value={plan.fieldworkEnd}
                  onChange={(e) => setPlan({ ...plan, fieldworkEnd: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Report due
                <input
                  type="date"
                  className="audity-input mt-1"
                  value={plan.reportDueDate}
                  onChange={(e) => setPlan({ ...plan, reportDueDate: e.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="text-xs font-medium text-audity-secondary">
                Audit owner
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
                Save plan
              </button>
            ) : null}

            {canEdit ? (
              <div className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3">
                <label className="flex items-start gap-2 text-xs text-audity-secondary">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={autoConvert}
                    onChange={async (event) => {
                      const next = event.target.checked;
                      setAutoConvert(next);
                      try {
                        await api(`/api/assessments/${auditId}/auto-convert-findings`, {
                          method: "PUT",
                          body: JSON.stringify({ enabled: next })
                        });
                        toast.success(`Auto-convert ${next ? "enabled" : "disabled"}`);
                      } catch (err) {
                        setAutoConvert(!next);
                        toast.error(err instanceof Error ? err.message : "Toggle failed");
                      }
                    }}
                  />
                  <span>
                    <strong className="text-audity-text">Auto-create draft risk on Finding approval</strong>
                    <p className="mt-1 text-[11px] text-audity-muted">
                      When enabled, approving a Finding automatically creates a draft Risk
                      (likelihood 3, impact 3, Medium) linked to the Finding via the n:m link
                      table. The Risk is created in state <code>open · draft</code> for the
                      auditor to review.
                    </p>
                  </span>
                </label>
              </div>
            ) : null}
          </form>

          <div className="audity-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-audity-text">
              Scope items ({scopeItems.length})
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
                        {item.itemType} · {item.criticality} ·{" "}
                        {item.inScope ? "In-scope" : "Out-of-scope"}
                      </p>
                      {item.description ? (
                        <p className="mt-1 text-xs text-audity-secondary">{item.description}</p>
                      ) : null}
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-xs text-audity-muted">No scope items yet.</li>
              )}
            </ul>

            {canEdit ? (
              <form className="space-y-2" onSubmit={addScopeItem}>
                <label className="block text-xs font-medium text-audity-secondary">
                  Item type
                  <input
                    list="scope-item-types"
                    className="audity-input mt-1"
                    placeholder="e.g. system, process, application, third-party tool…"
                    value={scopeForm.itemType}
                    onChange={(e) => setScopeForm({ ...scopeForm, itemType: e.target.value })}
                  />
                  <datalist id="scope-item-types">
                    {SUGGESTED_ITEM_TYPES.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                  <span className="mt-1 block text-[11px] text-audity-muted">
                    Free text — suggestions provided, type your own if needed.
                  </span>
                </label>
                <label className="block text-xs font-medium text-audity-secondary">
                  Name
                  <input
                    className="audity-input mt-1"
                    placeholder="Name of the in-scope item"
                    value={scopeForm.name}
                    onChange={(e) => setScopeForm({ ...scopeForm, name: e.target.value })}
                    required
                  />
                </label>
                <label className="block text-xs font-medium text-audity-secondary">
                  Description
                  <textarea
                    className="audity-input mt-1 min-h-[60px]"
                    placeholder="Optional description / context"
                    value={scopeForm.description}
                    onChange={(e) => setScopeForm({ ...scopeForm, description: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-audity-secondary">
                  Criticality
                  <input
                    list="scope-item-criticality"
                    className="audity-input mt-1"
                    value={scopeForm.criticality}
                    onChange={(e) => setScopeForm({ ...scopeForm, criticality: e.target.value })}
                  />
                  <datalist id="scope-item-criticality">
                    {SUGGESTED_CRITICALITIES.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-audity-secondary">
                  <input
                    type="checkbox"
                    checked={scopeForm.inScope}
                    onChange={(e) => setScopeForm({ ...scopeForm, inScope: e.target.checked })}
                  />
                  In scope
                </label>
                <button type="submit" className="audity-btn-primary">
                  + Add scope item
                </button>
              </form>
            ) : null}
          </div>
        </div>
      )}
    </PhaseLayout>
  );
}
