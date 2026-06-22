import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { Skeleton, useToast } from "../../../components/ui";
import { Field, Panel, Pill, dateValue, numberValue, text } from "../../audit/auditPrimitives";
import { PhaseLayout } from "./PhaseLayout";
import { useAuditOverview, type AuditControl } from "./useAuditOverview";

const applicabilityOptions = ["applicable", "not_applicable", "partially_applicable"];
const reviewStatuses = ["draft", "ready_for_review", "changes_requested", "approved"];
const readinessStatuses = ["not_ready", "in_progress", "ready", "blocked"];
const criticalities = ["low", "medium", "high", "critical"];
const requestStatuses = ["open", "requested", "received", "validated", "closed", "cancelled"];

export function ControlsPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  const focus = searchParams.get("focus") ?? "controls";
  const filter = searchParams.get("filter") ?? "";
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = Boolean(user?.permissions.includes("assessment.edit"));
  const { overview, loading, error, reload } = useAuditOverview(auditId);

  const [selectedControlId, setSelectedControlId] = useState("");
  const filteredControls = useMemo(() => {
    if (!overview.controls.length) return [] as AuditControl[];
    if (filter === "contradiction") {
      return overview.controls.filter((c) => c.contradiction);
    }
    if (filter === "ready_for_review") {
      return overview.controls.filter((c) => text(c.reviewStatus) === "ready_for_review");
    }
    return overview.controls;
  }, [overview.controls, filter]);

  const selectedControl = useMemo(
    () =>
      overview.controls.find((c) => c.assessmentQuestionId === selectedControlId) ??
      filteredControls[0] ??
      overview.controls[0] ??
      null,
    [overview.controls, filteredControls, selectedControlId]
  );

  const [controlForm, setControlForm] = useState({
    applicability: "applicable",
    applicabilityReason: "",
    controlOwner: "",
    reviewer: "",
    reviewStatus: "draft",
    controlCriticality: "medium",
    maturityJustification: "",
    evidenceQualityScore: "",
    readinessStatus: "not_ready"
  });

  useEffect(() => {
    if (!selectedControl) return;
    setControlForm({
      applicability: text(selectedControl.applicability, "applicable"),
      applicabilityReason: text(selectedControl.applicabilityReason),
      controlOwner: text(selectedControl.controlOwner),
      reviewer: text(selectedControl.reviewer),
      reviewStatus: text(selectedControl.reviewStatus, "draft"),
      controlCriticality: text(selectedControl.controlCriticality, "medium"),
      maturityJustification: text(selectedControl.maturityJustification),
      evidenceQualityScore:
        selectedControl.evidenceQualityScore == null
          ? ""
          : String(selectedControl.evidenceQualityScore),
      readinessStatus: text(selectedControl.readinessStatus, "not_ready")
    });
  }, [selectedControl]);

  const [mappingForm, setMappingForm] = useState({
    evidenceId: "",
    mappingType: "supports_control",
    qualityRelevance: 3,
    qualityCompleteness: 3,
    qualityFreshness: 3,
    qualityTrust: 3,
    notes: ""
  });

  const [requestForm, setRequestForm] = useState({
    title: "",
    description: "",
    owner: "",
    dueDate: "",
    status: "requested",
    portalVisibility: "customer"
  });

  const [interviewForm, setInterviewForm] = useState({
    title: "",
    participants: "",
    interviewAt: "",
    notes: "",
    followUp: "",
    status: "planned"
  });

  const [sampleForm, setSampleForm] = useState({
    name: "",
    populationDescription: "",
    populationSize: 0,
    sampleSize: 0,
    selectionMethod: "judgmental",
    selectedItems: "",
    resultSummary: "",
    status: "planned"
  });

  async function saveControlProfile() {
    if (!selectedControl) return;
    try {
      await api(
        `/api/assessments/${auditId}/audit-center/controls/${selectedControl.assessmentQuestionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...controlForm,
            evidenceQualityScore:
              controlForm.evidenceQualityScore === ""
                ? undefined
                : Number(controlForm.evidenceQualityScore)
          })
        }
      );
      toast.success("Control profile saved");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function addEvidenceMapping() {
    if (!selectedControl) return;
    if (!mappingForm.evidenceId) {
      toast.error("Pick an evidence item first");
      return;
    }
    try {
      await api(`/api/assessments/${auditId}/audit-center/evidence-mappings`, {
        method: "POST",
        body: JSON.stringify({
          ...mappingForm,
          assessmentQuestionId: selectedControl.assessmentQuestionId,
          qualityRelevance: Number(mappingForm.qualityRelevance),
          qualityCompleteness: Number(mappingForm.qualityCompleteness),
          qualityFreshness: Number(mappingForm.qualityFreshness),
          qualityTrust: Number(mappingForm.qualityTrust)
        })
      });
      toast.success("Evidence mapped");
      setMappingForm({ ...mappingForm, evidenceId: "", notes: "" });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mapping failed");
    }
  }

  async function removeMapping(mappingId: string) {
    try {
      await api(`/api/assessments/${auditId}/audit-center/evidence-mappings/${mappingId}`, {
        method: "DELETE"
      });
      toast.success("Mapping removed");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Removal failed");
    }
  }

  async function createEvidenceRequest() {
    if (!requestForm.title.trim()) {
      toast.error("Enter a title for the request");
      return;
    }
    try {
      await api(`/api/assessments/${auditId}/audit-center/evidence-requests`, {
        method: "POST",
        body: JSON.stringify({
          ...requestForm,
          assessmentQuestionId: selectedControl?.assessmentQuestionId ?? null,
          dueDate: requestForm.dueDate || null
        })
      });
      toast.success("Evidence request created");
      setRequestForm({ ...requestForm, title: "", description: "", dueDate: "" });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request creation failed");
    }
  }

  async function updateRequest(requestId: string, status: string) {
    try {
      await api(`/api/assessments/${auditId}/audit-center/evidence-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      toast.success("Request updated");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function createInterview() {
    if (!interviewForm.title.trim()) {
      toast.error("Enter an interview title");
      return;
    }
    try {
      await api(`/api/assessments/${auditId}/audit-center/interviews`, {
        method: "POST",
        body: JSON.stringify({
          ...interviewForm,
          linkedQuestionId: selectedControl?.assessmentQuestionId ?? null,
          interviewAt: interviewForm.interviewAt || null
        })
      });
      toast.success("Interview recorded");
      setInterviewForm({ ...interviewForm, title: "", participants: "", interviewAt: "", notes: "", followUp: "" });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Interview creation failed");
    }
  }

  async function createSample() {
    if (!sampleForm.name.trim()) {
      toast.error("Enter a sample name");
      return;
    }
    try {
      await api(`/api/assessments/${auditId}/audit-center/samples`, {
        method: "POST",
        body: JSON.stringify({
          ...sampleForm,
          populationSize: Number(sampleForm.populationSize) || 0,
          sampleSize: Number(sampleForm.sampleSize) || 0
        })
      });
      toast.success("Sample recorded");
      setSampleForm({ ...sampleForm, name: "", populationDescription: "", selectedItems: "", resultSummary: "" });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sample creation failed");
    }
  }

  const evidenceForControl = useMemo(() => {
    if (!selectedControl) return [];
    return overview.evidenceMappings.filter(
      (m) => text(m.assessmentQuestionId) === selectedControl.assessmentQuestionId
    );
  }, [overview.evidenceMappings, selectedControl]);

  const requestsForControl = useMemo(() => {
    if (!selectedControl) return overview.evidenceRequests;
    return overview.evidenceRequests.filter(
      (r) => text(r.assessmentQuestionId) === selectedControl.assessmentQuestionId
    );
  }, [overview.evidenceRequests, selectedControl]);

  return (
    <PhaseLayout
      active="controls"
      title="Controls & Evidence"
      description="Score controls, map evidence, run interviews and samples, resolve contradictions. Exit: all non-N/A controls answered with mapped evidence."
      aiHint="AI suggests scores from mapped evidence and flags contradictions inline."
    >
      {!auditId ? (
        <p className="text-sm text-audity-muted">No audit selected.</p>
      ) : loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          {error ? (
            <div className="rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">
              {error}
            </div>
          ) : null}

          {filter ? (
            <div className="rounded-audity border border-audity-warning bg-audity-warning/10 px-3 py-2 text-xs text-audity-warning">
              Active filter: <strong>{filter}</strong> ·{" "}
              <Link to={`/customers/${searchParams.get("customer") ?? ""}/controls?audit=${auditId}`} className="underline">
                Clear
              </Link>
            </div>
          ) : null}

          {/* Quick links to related views */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Link className="audity-btn-secondary" to={`/assessments/${auditId}/questions`}>
              Open Guided Questions
            </Link>
            <Link
              className="audity-btn-secondary"
              to={`/customers/${selectedControl ? "" : ""}/controls?audit=${auditId}&filter=contradiction`}
            >
              Show contradictions ({overview.contradictions.length})
            </Link>
          </div>

          {/* Controls table + Profile form */}
          <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
            <Panel
              title={`Controls (${filteredControls.length}/${overview.controls.length})`}
              subtitle={filter ? `Filtered by ${filter}` : "Click a row to edit its profile"}
            >
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-audity-panel text-xs uppercase text-audity-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">Code</th>
                      <th className="px-2 py-2 text-left">Title</th>
                      <th className="px-2 py-2 text-left">Review</th>
                      <th className="px-2 py-2 text-left">Readiness</th>
                      <th className="px-2 py-2 text-left">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredControls.map((control) => (
                      <tr
                        key={control.assessmentQuestionId}
                        className={`cursor-pointer border-b border-audity-border last:border-0 ${
                          selectedControl?.assessmentQuestionId === control.assessmentQuestionId
                            ? "bg-audity-primaryActive/30"
                            : ""
                        } ${control.contradiction ? "border-l-2 border-l-audity-warning" : ""}`}
                        onClick={() => setSelectedControlId(control.assessmentQuestionId)}
                      >
                        <td className="px-2 py-2 font-semibold text-audity-primary">
                          {control.controlCode ?? control.questionId ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-audity-secondary">
                          {control.controlTitle ?? control.question ?? "—"}
                        </td>
                        <td className="px-2 py-2">
                          <Pill value={control.reviewStatus} />
                        </td>
                        <td className="px-2 py-2">
                          <Pill value={control.readinessStatus} />
                        </td>
                        <td className="px-2 py-2 text-audity-secondary">
                          {control.mappedEvidence ?? 0}
                        </td>
                      </tr>
                    ))}
                    {!filteredControls.length ? (
                      <tr>
                        <td className="px-2 py-6 text-center text-audity-muted" colSpan={5}>
                          No controls match the current filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Panel>

            {selectedControl ? (
              <Panel
                title={`Profile: ${selectedControl.controlCode ?? "control"}`}
                subtitle={selectedControl.controlTitle ?? selectedControl.question ?? ""}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Applicability">
                    <select
                      className="audity-input"
                      value={controlForm.applicability}
                      disabled={!canEdit}
                      onChange={(e) => setControlForm({ ...controlForm, applicability: e.target.value })}
                    >
                      {applicabilityOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Criticality">
                    <select
                      className="audity-input"
                      value={controlForm.controlCriticality}
                      disabled={!canEdit}
                      onChange={(e) => setControlForm({ ...controlForm, controlCriticality: e.target.value })}
                    >
                      {criticalities.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Control owner">
                    <input
                      className="audity-input"
                      value={controlForm.controlOwner}
                      disabled={!canEdit}
                      onChange={(e) => setControlForm({ ...controlForm, controlOwner: e.target.value })}
                    />
                  </Field>
                  <Field label="Reviewer">
                    <input
                      className="audity-input"
                      value={controlForm.reviewer}
                      disabled={!canEdit}
                      onChange={(e) => setControlForm({ ...controlForm, reviewer: e.target.value })}
                    />
                  </Field>
                  <Field label="Review status">
                    <select
                      className="audity-input"
                      value={controlForm.reviewStatus}
                      disabled={!canEdit}
                      onChange={(e) => setControlForm({ ...controlForm, reviewStatus: e.target.value })}
                    >
                      {reviewStatuses.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Readiness">
                    <select
                      className="audity-input"
                      value={controlForm.readinessStatus}
                      disabled={!canEdit}
                      onChange={(e) => setControlForm({ ...controlForm, readinessStatus: e.target.value })}
                    >
                      {readinessStatuses.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Evidence quality (0-5)">
                    <input
                      type="number"
                      min={0}
                      max={5}
                      className="audity-input"
                      value={controlForm.evidenceQualityScore}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setControlForm({ ...controlForm, evidenceQualityScore: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Applicability reason" wide>
                    <textarea
                      className="audity-input min-h-[60px]"
                      value={controlForm.applicabilityReason}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setControlForm({ ...controlForm, applicabilityReason: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Maturity justification" wide>
                    <textarea
                      className="audity-input min-h-[80px]"
                      value={controlForm.maturityJustification}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setControlForm({ ...controlForm, maturityJustification: e.target.value })
                      }
                    />
                  </Field>
                </div>
                {canEdit ? (
                  <div className="mt-3">
                    <button className="audity-btn-primary" onClick={() => void saveControlProfile()}>
                      Save profile
                    </button>
                  </div>
                ) : null}
              </Panel>
            ) : (
              <Panel title="Profile">
                <p className="text-sm text-audity-muted">Select a control to edit its profile.</p>
              </Panel>
            )}
          </div>

          {/* Evidence Mapping section */}
          {selectedControl ? (
            <Panel
              title="Evidence mapping"
              subtitle={`${evidenceForControl.length} item(s) mapped to this control · 4D quality score (Relevance, Completeness, Freshness, Trust).`}
            >
              <ul className="mb-3 space-y-2 text-sm">
                {evidenceForControl.length ? (
                  evidenceForControl.map((mapping) => {
                    const evidence = overview.evidenceItems.find(
                      (e) => text(e.id) === text(mapping.evidenceId)
                    );
                    return (
                      <li
                        key={text(mapping.id)}
                        className="flex items-start justify-between gap-3 rounded-audity border border-audity-border bg-audity-page p-2"
                      >
                        <div>
                          <strong className="text-audity-text">
                            {text(evidence?.fileName, "(unknown evidence)")}
                          </strong>
                          <p className="text-xs text-audity-muted">
                            {text(mapping.mappingType)} · R{text(mapping.qualityRelevance, "?")} C
                            {text(mapping.qualityCompleteness, "?")} F
                            {text(mapping.qualityFreshness, "?")} T{text(mapping.qualityTrust, "?")}
                          </p>
                          {mapping.notes ? (
                            <p className="mt-1 text-xs text-audity-secondary">{text(mapping.notes)}</p>
                          ) : null}
                        </div>
                        {canEdit ? (
                          <button
                            className="audity-btn-secondary text-xs"
                            onClick={() => void removeMapping(text(mapping.id))}
                          >
                            Remove
                          </button>
                        ) : null}
                      </li>
                    );
                  })
                ) : (
                  <li className="text-xs text-audity-muted">No evidence mapped yet.</li>
                )}
              </ul>
              {canEdit ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Evidence item">
                    <select
                      className="audity-input"
                      value={mappingForm.evidenceId}
                      onChange={(e) => setMappingForm({ ...mappingForm, evidenceId: e.target.value })}
                    >
                      <option value="">Pick evidence…</option>
                      {overview.evidenceItems.map((item) => (
                        <option key={text(item.id)} value={text(item.id)}>
                          {text(item.fileName, text(item.id))}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Mapping type">
                    <input
                      className="audity-input"
                      value={mappingForm.mappingType}
                      onChange={(e) => setMappingForm({ ...mappingForm, mappingType: e.target.value })}
                    />
                  </Field>
                  <Field label="Relevance (1-5)">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="audity-input"
                      value={mappingForm.qualityRelevance}
                      onChange={(e) =>
                        setMappingForm({ ...mappingForm, qualityRelevance: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Completeness (1-5)">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="audity-input"
                      value={mappingForm.qualityCompleteness}
                      onChange={(e) =>
                        setMappingForm({ ...mappingForm, qualityCompleteness: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Freshness (1-5)">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="audity-input"
                      value={mappingForm.qualityFreshness}
                      onChange={(e) =>
                        setMappingForm({ ...mappingForm, qualityFreshness: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Trust (1-5)">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="audity-input"
                      value={mappingForm.qualityTrust}
                      onChange={(e) =>
                        setMappingForm({ ...mappingForm, qualityTrust: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Notes" wide>
                    <textarea
                      className="audity-input min-h-[60px]"
                      value={mappingForm.notes}
                      onChange={(e) => setMappingForm({ ...mappingForm, notes: e.target.value })}
                    />
                  </Field>
                </div>
              ) : null}
              {canEdit ? (
                <div className="mt-3">
                  <button className="audity-btn-primary" onClick={() => void addEvidenceMapping()}>
                    Map evidence to control
                  </button>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {/* Evidence Requests */}
          <Panel
            title="Evidence requests"
            subtitle="Customer-facing requests. Create one and follow it through to validated."
          >
            <ul className="mb-3 space-y-2 text-sm">
              {requestsForControl.length ? (
                requestsForControl.map((request) => (
                  <li
                    key={text(request.id)}
                    className="flex items-start justify-between gap-3 rounded-audity border border-audity-border bg-audity-page p-2"
                  >
                    <div>
                      <strong className="text-audity-text">{text(request.title)}</strong>
                      <p className="text-xs text-audity-muted">
                        Status: {text(request.status)} · Owner: {text(request.owner, "—")} · Due:{" "}
                        {dateValue(request.dueDate) || "—"}
                      </p>
                      {request.description ? (
                        <p className="mt-1 text-xs text-audity-secondary">
                          {text(request.description)}
                        </p>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <select
                        className="audity-input text-xs"
                        value={text(request.status, "requested")}
                        onChange={(e) => void updateRequest(text(request.id), e.target.value)}
                      >
                        {requestStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-xs text-audity-muted">No evidence requests yet.</li>
              )}
            </ul>
            {canEdit ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title" required>
                  <input
                    className="audity-input"
                    value={requestForm.title}
                    onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })}
                  />
                </Field>
                <Field label="Owner">
                  <input
                    className="audity-input"
                    value={requestForm.owner}
                    onChange={(e) => setRequestForm({ ...requestForm, owner: e.target.value })}
                  />
                </Field>
                <Field label="Due date">
                  <input
                    type="date"
                    className="audity-input"
                    value={requestForm.dueDate}
                    onChange={(e) => setRequestForm({ ...requestForm, dueDate: e.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="audity-input"
                    value={requestForm.status}
                    onChange={(e) => setRequestForm({ ...requestForm, status: e.target.value })}
                  >
                    {requestStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Description" wide>
                  <textarea
                    className="audity-input min-h-[60px]"
                    value={requestForm.description}
                    onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                  />
                </Field>
              </div>
            ) : null}
            {canEdit ? (
              <div className="mt-3">
                <button className="audity-btn-primary" onClick={() => void createEvidenceRequest()}>
                  Create evidence request
                </button>
              </div>
            ) : null}
          </Panel>

          {/* Interviews */}
          <Panel title="Interviews" subtitle={`${overview.interviews.length} note(s) recorded`}>
            <ul className="mb-3 space-y-2 text-sm">
              {overview.interviews.length ? (
                overview.interviews.map((interview) => (
                  <li
                    key={text(interview.id)}
                    className="rounded-audity border border-audity-border bg-audity-page p-2"
                  >
                    <strong className="text-audity-text">{text(interview.title)}</strong>
                    <p className="text-xs text-audity-muted">
                      {text(interview.participants, "—")} ·{" "}
                      {dateValue(interview.interviewAt) || "no date"} · Status:{" "}
                      {text(interview.status)}
                    </p>
                    {interview.notes ? (
                      <p className="mt-1 text-xs text-audity-secondary">{text(interview.notes)}</p>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-xs text-audity-muted">No interview notes yet.</li>
              )}
            </ul>
            {canEdit ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title" required>
                  <input
                    className="audity-input"
                    value={interviewForm.title}
                    onChange={(e) => setInterviewForm({ ...interviewForm, title: e.target.value })}
                  />
                </Field>
                <Field label="Participants">
                  <input
                    className="audity-input"
                    value={interviewForm.participants}
                    onChange={(e) =>
                      setInterviewForm({ ...interviewForm, participants: e.target.value })
                    }
                  />
                </Field>
                <Field label="When">
                  <input
                    type="datetime-local"
                    className="audity-input"
                    value={interviewForm.interviewAt}
                    onChange={(e) =>
                      setInterviewForm({ ...interviewForm, interviewAt: e.target.value })
                    }
                  />
                </Field>
                <Field label="Follow-up">
                  <input
                    className="audity-input"
                    value={interviewForm.followUp}
                    onChange={(e) =>
                      setInterviewForm({ ...interviewForm, followUp: e.target.value })
                    }
                  />
                </Field>
                <Field label="Notes" wide>
                  <textarea
                    className="audity-input min-h-[80px]"
                    value={interviewForm.notes}
                    onChange={(e) => setInterviewForm({ ...interviewForm, notes: e.target.value })}
                  />
                </Field>
              </div>
            ) : null}
            {canEdit ? (
              <div className="mt-3">
                <button className="audity-btn-primary" onClick={() => void createInterview()}>
                  Record interview
                </button>
              </div>
            ) : null}
          </Panel>

          {/* Samples */}
          <Panel title="Samples" subtitle={`${overview.samples.length} sample(s) defined`}>
            <ul className="mb-3 space-y-2 text-sm">
              {overview.samples.length ? (
                overview.samples.map((sample) => (
                  <li
                    key={text(sample.id)}
                    className="rounded-audity border border-audity-border bg-audity-page p-2"
                  >
                    <strong className="text-audity-text">{text(sample.name)}</strong>
                    <p className="text-xs text-audity-muted">
                      Population {numberValue(sample.populationSize)} · Sample{" "}
                      {numberValue(sample.sampleSize)} · Method {text(sample.selectionMethod, "—")} ·
                      Status {text(sample.status)}
                    </p>
                    {sample.resultSummary ? (
                      <p className="mt-1 text-xs text-audity-secondary">{text(sample.resultSummary)}</p>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-xs text-audity-muted">No samples defined yet.</li>
              )}
            </ul>
            {canEdit ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" required>
                  <input
                    className="audity-input"
                    value={sampleForm.name}
                    onChange={(e) => setSampleForm({ ...sampleForm, name: e.target.value })}
                  />
                </Field>
                <Field label="Selection method">
                  <input
                    className="audity-input"
                    value={sampleForm.selectionMethod}
                    onChange={(e) =>
                      setSampleForm({ ...sampleForm, selectionMethod: e.target.value })
                    }
                  />
                </Field>
                <Field label="Population size">
                  <input
                    type="number"
                    min={0}
                    className="audity-input"
                    value={sampleForm.populationSize}
                    onChange={(e) =>
                      setSampleForm({ ...sampleForm, populationSize: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Sample size">
                  <input
                    type="number"
                    min={0}
                    className="audity-input"
                    value={sampleForm.sampleSize}
                    onChange={(e) =>
                      setSampleForm({ ...sampleForm, sampleSize: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Population description" wide>
                  <textarea
                    className="audity-input min-h-[50px]"
                    value={sampleForm.populationDescription}
                    onChange={(e) =>
                      setSampleForm({ ...sampleForm, populationDescription: e.target.value })
                    }
                  />
                </Field>
                <Field label="Selected items" wide>
                  <textarea
                    className="audity-input min-h-[50px]"
                    value={sampleForm.selectedItems}
                    onChange={(e) =>
                      setSampleForm({ ...sampleForm, selectedItems: e.target.value })
                    }
                  />
                </Field>
                <Field label="Result summary" wide>
                  <textarea
                    className="audity-input min-h-[60px]"
                    value={sampleForm.resultSummary}
                    onChange={(e) =>
                      setSampleForm({ ...sampleForm, resultSummary: e.target.value })
                    }
                  />
                </Field>
              </div>
            ) : null}
            {canEdit ? (
              <div className="mt-3">
                <button className="audity-btn-primary" onClick={() => void createSample()}>
                  Record sample
                </button>
              </div>
            ) : null}
          </Panel>

          {/* Contradictions */}
          <Panel
            title="Contradictions"
            subtitle="Controls marked ready but missing mapped evidence. Click any to open in the table above."
          >
            {overview.contradictions.length ? (
              <ul className="space-y-2">
                {overview.contradictions.map((control) => (
                  <li key={control.assessmentQuestionId}>
                    <button
                      className="w-full rounded-audity border border-audity-warning/60 bg-audity-page px-3 py-2 text-left text-sm hover:border-audity-warning"
                      onClick={() => setSelectedControlId(control.assessmentQuestionId)}
                    >
                      <span className="block font-semibold text-audity-warning">
                        {control.controlCode ?? control.questionId}
                      </span>
                      <span className="text-audity-secondary">
                        {control.controlTitle ?? control.question}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-audity-muted">No contradictions detected.</p>
            )}
          </Panel>
        </div>
      )}
    </PhaseLayout>
  );
}
