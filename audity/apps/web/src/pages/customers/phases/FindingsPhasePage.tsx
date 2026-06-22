import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { Skeleton, useToast } from "../../../components/ui";
import { Field, Panel, Pill, dateValue, numberValue, text } from "../../audit/auditPrimitives";
import { PhaseLayout } from "./PhaseLayout";
import { useAuditOverview } from "./useAuditOverview";

const lifecycleStatuses = ["draft", "confirmed", "agreed", "remediation_planned", "remediated", "verified", "closed"];
const responseStatuses = ["pending", "accepted", "remediation_planned", "rejected"];
const remediationStatuses = ["not_started", "planned", "in_progress", "implemented", "blocked"];
const retestStatuses = ["not_ready", "ready", "passed", "failed"];
const criticalities = ["low", "medium", "high", "critical"];
const evidenceConfidences = ["low", "medium", "high"];

function calcSeverity(impact: number, likelihood: number): { score: number; tier: string } {
  const score = Math.max(1, Math.min(5, impact)) * Math.max(1, Math.min(5, likelihood));
  let tier = "low";
  if (score >= 20) tier = "critical";
  else if (score >= 14) tier = "high";
  else if (score >= 7) tier = "medium";
  return { score, tier };
}

export function FindingsPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  const filterParam = searchParams.get("filter") ?? "";
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = Boolean(user?.permissions.includes("finding.approve") || user?.permissions.includes("assessment.edit"));
  const { overview, loading, reload } = useAuditOverview(auditId);

  const filteredFindings = useMemo(() => {
    if (!overview.findings.length) return [];
    if (filterParam === "response_pending") {
      return overview.findings.filter(
        (f) => text(f.managementResponseStatus, "pending") === "pending"
      );
    }
    if (filterParam === "remediation_overdue") {
      return overview.findings.filter((f) => {
        const due = text(f.remediationDueDate);
        const status = text(f.remediationStatus, "not_started");
        if (!due) return false;
        return new Date(due) < new Date() && !["implemented", "closed"].includes(status);
      });
    }
    return overview.findings;
  }, [overview.findings, filterParam]);

  const [selectedFindingId, setSelectedFindingId] = useState("");
  const selectedFinding = useMemo(() => {
    if (!overview.findings.length) return null;
    return (
      overview.findings.find((f) => text(f.id) === selectedFindingId) ??
      filteredFindings[0] ??
      overview.findings[0]
    );
  }, [overview.findings, filteredFindings, selectedFindingId]);

  const [form, setForm] = useState({
    lifecycleStatus: "draft",
    severityImpact: 3,
    severityLikelihood: 3,
    controlCriticality: "medium",
    evidenceConfidence: "medium",
    managementResponseStatus: "pending",
    managementResponse: "",
    managementOwner: "",
    remediationStatus: "not_started",
    remediationOwner: "",
    remediationDueDate: "",
    retestStatus: "not_ready",
    retestNotes: "",
    retestEvidenceId: ""
  });

  useEffect(() => {
    if (!selectedFinding) return;
    setForm({
      lifecycleStatus: text(selectedFinding.lifecycleStatus, "draft"),
      severityImpact: numberValue(selectedFinding.severityImpact, 3),
      severityLikelihood: numberValue(selectedFinding.severityLikelihood, 3),
      controlCriticality: text(selectedFinding.controlCriticality, "medium"),
      evidenceConfidence: text(selectedFinding.evidenceConfidence, "medium"),
      managementResponseStatus: text(selectedFinding.managementResponseStatus, "pending"),
      managementResponse: text(selectedFinding.managementResponse),
      managementOwner: text(selectedFinding.managementOwner),
      remediationStatus: text(selectedFinding.remediationStatus, "not_started"),
      remediationOwner: text(selectedFinding.remediationOwner),
      remediationDueDate: dateValue(selectedFinding.remediationDueDate),
      retestStatus: text(selectedFinding.retestStatus, "not_ready"),
      retestNotes: text(selectedFinding.retestNotes),
      retestEvidenceId: text(selectedFinding.retestEvidenceId)
    });
  }, [selectedFinding]);

  async function saveFinding() {
    if (!selectedFinding) return;
    try {
      await api(`/api/assessments/${auditId}/audit-center/findings/${text(selectedFinding.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          severityImpact: Number(form.severityImpact),
          severityLikelihood: Number(form.severityLikelihood),
          remediationDueDate: form.remediationDueDate || null,
          retestEvidenceId: form.retestEvidenceId || null
        })
      });
      toast.success("Finding updated");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  const severity = calcSeverity(form.severityImpact, form.severityLikelihood);

  return (
    <PhaseLayout
      active="findings"
      title="Findings"
      description="Lifecycle, severity matrix, management response, remediation, re-test. Runs in parallel with Fieldwork."
      aiHint="AI suggests severity from impact × likelihood × control criticality × evidence confidence."
    >
      {!auditId ? (
        <p className="text-sm text-audity-muted">No audit selected.</p>
      ) : loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          {filterParam ? (
            <div className="rounded-audity border border-audity-warning bg-audity-warning/10 px-3 py-2 text-xs text-audity-warning">
              Active filter: <strong>{filterParam}</strong>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
            <Panel
              title={`Findings (${filteredFindings.length}/${overview.findings.length})`}
              subtitle="Click a row to edit lifecycle, response and remediation"
            >
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-audity-panel text-xs uppercase text-audity-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">Title</th>
                      <th className="px-2 py-2 text-left">Lifecycle</th>
                      <th className="px-2 py-2 text-left">Response</th>
                      <th className="px-2 py-2 text-left">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFindings.map((finding) => {
                      const s = calcSeverity(
                        numberValue(finding.severityImpact, 3),
                        numberValue(finding.severityLikelihood, 3)
                      );
                      return (
                        <tr
                          key={text(finding.id)}
                          className={`cursor-pointer border-b border-audity-border last:border-0 ${
                            text(selectedFinding?.id) === text(finding.id)
                              ? "bg-audity-primaryActive/30"
                              : ""
                          }`}
                          onClick={() => setSelectedFindingId(text(finding.id))}
                        >
                          <td className="px-2 py-2 font-semibold text-audity-text">
                            {text(finding.title, "(untitled)")}
                          </td>
                          <td className="px-2 py-2">
                            <Pill value={finding.lifecycleStatus} />
                          </td>
                          <td className="px-2 py-2">
                            <Pill value={finding.managementResponseStatus ?? "pending"} />
                          </td>
                          <td className="px-2 py-2">
                            <Pill value={s.tier} />
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredFindings.length ? (
                      <tr>
                        <td className="px-2 py-6 text-center text-audity-muted" colSpan={4}>
                          No findings match the filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Panel>

            {selectedFinding ? (
              <Panel
                title={text(selectedFinding.title, "Finding")}
                subtitle={`Severity score ${severity.score} (${severity.tier})`}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Lifecycle">
                    <select
                      className="audity-input"
                      value={form.lifecycleStatus}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, lifecycleStatus: e.target.value })}
                    >
                      {lifecycleStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Control criticality">
                    <select
                      className="audity-input"
                      value={form.controlCriticality}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, controlCriticality: e.target.value })}
                    >
                      {criticalities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Severity impact (1-5)">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="audity-input"
                      value={form.severityImpact}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setForm({ ...form, severityImpact: Number(e.target.value) || 1 })
                      }
                    />
                  </Field>
                  <Field label="Severity likelihood (1-5)">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="audity-input"
                      value={form.severityLikelihood}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setForm({ ...form, severityLikelihood: Number(e.target.value) || 1 })
                      }
                    />
                  </Field>
                  <Field label="Evidence confidence">
                    <select
                      className="audity-input"
                      value={form.evidenceConfidence}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, evidenceConfidence: e.target.value })}
                    >
                      {evidenceConfidences.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Management response status">
                    <select
                      className="audity-input"
                      value={form.managementResponseStatus}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setForm({ ...form, managementResponseStatus: e.target.value })
                      }
                    >
                      {responseStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Management owner">
                    <input
                      className="audity-input"
                      value={form.managementOwner}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, managementOwner: e.target.value })}
                    />
                  </Field>
                  <Field label="Remediation status">
                    <select
                      className="audity-input"
                      value={form.remediationStatus}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, remediationStatus: e.target.value })}
                    >
                      {remediationStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Remediation owner">
                    <input
                      className="audity-input"
                      value={form.remediationOwner}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, remediationOwner: e.target.value })}
                    />
                  </Field>
                  <Field label="Remediation due">
                    <input
                      type="date"
                      className="audity-input"
                      value={form.remediationDueDate}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, remediationDueDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Re-test status">
                    <select
                      className="audity-input"
                      value={form.retestStatus}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, retestStatus: e.target.value })}
                    >
                      {retestStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Re-test evidence">
                    <select
                      className="audity-input"
                      value={form.retestEvidenceId}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, retestEvidenceId: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {overview.evidenceItems.map((item) => (
                        <option key={text(item.id)} value={text(item.id)}>
                          {text(item.fileName, text(item.id))}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Management response" wide>
                    <textarea
                      className="audity-input min-h-[70px]"
                      value={form.managementResponse}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, managementResponse: e.target.value })}
                    />
                  </Field>
                  <Field label="Re-test notes" wide>
                    <textarea
                      className="audity-input min-h-[60px]"
                      value={form.retestNotes}
                      disabled={!canEdit}
                      onChange={(e) => setForm({ ...form, retestNotes: e.target.value })}
                    />
                  </Field>
                </div>
                {canEdit ? (
                  <div className="mt-3">
                    <button className="audity-btn-primary" onClick={() => void saveFinding()}>
                      Save finding
                    </button>
                  </div>
                ) : null}
              </Panel>
            ) : (
              <Panel title="Finding details">
                <p className="text-sm text-audity-muted">Pick a finding from the list.</p>
              </Panel>
            )}
          </div>
        </div>
      )}
    </PhaseLayout>
  );
}
