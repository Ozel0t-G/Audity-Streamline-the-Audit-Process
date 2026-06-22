import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { Skeleton, useToast } from "../../../components/ui";
import { Field, MiniStat, Panel, Pill, dateValue, numberValue, text } from "../../audit/auditPrimitives";
import { PhaseLayout } from "./PhaseLayout";
import { useAuditOverview } from "./useAuditOverview";

const reportStatuses = ["draft", "internal_review", "customer_review", "final", "approved"];
const signoffEntityTypes = ["assessment", "control", "finding", "report"];

export function ReportPhasePage() {
  const [searchParams] = useSearchParams();
  const auditId = searchParams.get("audit") ?? "";
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();
  const canReport = Boolean(user?.permissions.includes("report.export"));
  const canSignoff = Boolean(user?.permissions.includes("finding.approve"));
  const { overview, loading, reload } = useAuditOverview(auditId);

  const [reportForm, setReportForm] = useState({
    status: "draft",
    reviewer: "",
    customerReviewer: "",
    summary: "",
    dueDate: ""
  });

  const [signoffForm, setSignoffForm] = useState({
    entityType: "assessment",
    entityId: "",
    statement: "I reviewed this audit record and approve the sign-off.",
    signerName: user?.email ?? ""
  });

  const [exporting, setExporting] = useState(false);

  async function createReportReview() {
    try {
      await api(`/api/assessments/${auditId}/audit-center/report-reviews`, {
        method: "POST",
        body: JSON.stringify({
          ...reportForm,
          dueDate: reportForm.dueDate || null
        })
      });
      toast.success("Report review created");
      setReportForm({ ...reportForm, summary: "", dueDate: "" });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create report review");
    }
  }

  async function updateReportReview(reviewId: string, status: string) {
    try {
      await api(`/api/assessments/${auditId}/audit-center/report-reviews/${reviewId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      toast.success("Review updated");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function createSignoff() {
    try {
      const entityId =
        signoffForm.entityId ||
        (signoffForm.entityType === "assessment" ? auditId : "");
      await api(`/api/assessments/${auditId}/audit-center/signoffs`, {
        method: "POST",
        body: JSON.stringify({ ...signoffForm, entityId })
      });
      toast.success("Sign-off recorded");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-off failed");
    }
  }

  async function downloadPack() {
    setExporting(true);
    try {
      const payload = await api<{ downloadUrl?: string; status?: string }>(
        `/api/assessments/${auditId}/audit-center/evidence-pack`
      );
      if (payload.downloadUrl) {
        window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
        toast.success("Pack export ready");
      } else {
        toast.success(`Pack export ${payload.status ?? "queued"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <PhaseLayout
      active="report"
      title="Report & Sign-off"
      description="Report review lifecycle, sign-offs, Statement of Applicability, gap register, signed evidence pack."
      aiHint="AI can regenerate the executive summary from controls, findings and evidence."
    >
      {!auditId ? (
        <p className="text-sm text-audity-muted">No audit selected.</p>
      ) : loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Readiness" value={`${overview.readinessScore}%`} />
            <MiniStat label="Controls" value={overview.controls.length} />
            <MiniStat label="Findings" value={overview.findings.length} />
            <MiniStat label="Gaps" value={overview.gaps.length} />
          </div>

          {/* Executive summary */}
          <Panel
            title="Executive summary"
            subtitle="Generated from control reviews, evidence mappings, findings and report status."
          >
            <p className="text-sm leading-6 text-audity-secondary whitespace-pre-line">
              {overview.executiveSummary}
            </p>
          </Panel>

          {/* Report Reviews */}
          <Panel
            title={`Report reviews (${overview.reportReviews.length})`}
            subtitle="Draft → internal_review → customer_review → final → approved."
          >
            <ul className="mb-3 space-y-2 text-sm">
              {overview.reportReviews.length ? (
                overview.reportReviews.map((review) => (
                  <li
                    key={text(review.id)}
                    className="flex items-start justify-between gap-3 rounded-audity border border-audity-border bg-audity-page p-2"
                  >
                    <div>
                      <strong className="text-audity-text">
                        {text(review.reviewer, "Reviewer")} ·{" "}
                        <Pill value={text(review.status, "draft")} />
                      </strong>
                      {review.customerReviewer ? (
                        <p className="text-xs text-audity-muted">
                          Customer reviewer: {text(review.customerReviewer)}
                        </p>
                      ) : null}
                      {review.summary ? (
                        <p className="mt-1 text-xs text-audity-secondary">{text(review.summary)}</p>
                      ) : null}
                      {review.dueDate ? (
                        <p className="text-xs text-audity-muted">
                          Due: {dateValue(review.dueDate)}
                        </p>
                      ) : null}
                    </div>
                    {canReport ? (
                      <select
                        className="audity-input text-xs"
                        value={text(review.status, "draft")}
                        onChange={(e) =>
                          void updateReportReview(text(review.id), e.target.value)
                        }
                      >
                        {reportStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-xs text-audity-muted">No report reviews yet.</li>
              )}
            </ul>
            {canReport ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Status">
                  <select
                    className="audity-input"
                    value={reportForm.status}
                    onChange={(e) => setReportForm({ ...reportForm, status: e.target.value })}
                  >
                    {reportStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Due date">
                  <input
                    type="date"
                    className="audity-input"
                    value={reportForm.dueDate}
                    onChange={(e) => setReportForm({ ...reportForm, dueDate: e.target.value })}
                  />
                </Field>
                <Field label="Reviewer">
                  <input
                    className="audity-input"
                    value={reportForm.reviewer}
                    onChange={(e) => setReportForm({ ...reportForm, reviewer: e.target.value })}
                  />
                </Field>
                <Field label="Customer reviewer">
                  <input
                    className="audity-input"
                    value={reportForm.customerReviewer}
                    onChange={(e) =>
                      setReportForm({ ...reportForm, customerReviewer: e.target.value })
                    }
                  />
                </Field>
                <Field label="Summary" wide>
                  <textarea
                    className="audity-input min-h-[60px]"
                    value={reportForm.summary}
                    onChange={(e) => setReportForm({ ...reportForm, summary: e.target.value })}
                  />
                </Field>
              </div>
            ) : null}
            {canReport ? (
              <div className="mt-3">
                <button className="audity-btn-primary" onClick={() => void createReportReview()}>
                  Create review
                </button>
              </div>
            ) : null}
          </Panel>

          {/* Sign-offs */}
          <Panel
            title={`Sign-offs (${overview.signoffs.length})`}
            subtitle="Tamper-evident sign-off anchored to the pack manifest."
          >
            <ul className="mb-3 space-y-2 text-sm">
              {overview.signoffs.length ? (
                overview.signoffs.map((signoff) => (
                  <li
                    key={text(signoff.id)}
                    className="rounded-audity border border-audity-border bg-audity-page p-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <strong className="text-audity-text">
                          {text(signoff.signerName, "—")} · {text(signoff.entityType)}
                        </strong>
                        <p className="text-xs text-audity-muted">
                          {dateValue(signoff.createdAt)} · entity {text(signoff.entityId, "—")}
                        </p>
                      </div>
                      <Pill value="signed" />
                    </div>
                    {signoff.statement ? (
                      <p className="mt-1 text-xs text-audity-secondary">{text(signoff.statement)}</p>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-xs text-audity-muted">No sign-offs yet.</li>
              )}
            </ul>
            {canSignoff ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Entity type">
                  <select
                    className="audity-input"
                    value={signoffForm.entityType}
                    onChange={(e) =>
                      setSignoffForm({ ...signoffForm, entityType: e.target.value })
                    }
                  >
                    {signoffEntityTypes.map((entityType) => (
                      <option key={entityType} value={entityType}>
                        {entityType}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Entity ID (optional)">
                  <input
                    className="audity-input"
                    placeholder={signoffForm.entityType === "assessment" ? "Defaults to this audit" : ""}
                    value={signoffForm.entityId}
                    onChange={(e) => setSignoffForm({ ...signoffForm, entityId: e.target.value })}
                  />
                </Field>
                <Field label="Signer name">
                  <input
                    className="audity-input"
                    value={signoffForm.signerName}
                    onChange={(e) => setSignoffForm({ ...signoffForm, signerName: e.target.value })}
                  />
                </Field>
                <Field label="Statement" wide>
                  <textarea
                    className="audity-input min-h-[60px]"
                    value={signoffForm.statement}
                    onChange={(e) => setSignoffForm({ ...signoffForm, statement: e.target.value })}
                  />
                </Field>
              </div>
            ) : null}
            {canSignoff ? (
              <div className="mt-3">
                <button className="audity-btn-primary" onClick={() => void createSignoff()}>
                  Record sign-off
                </button>
              </div>
            ) : null}
          </Panel>

          {/* Statement of Applicability */}
          <Panel
            title={`Statement of Applicability (${overview.statementOfApplicability.length})`}
            subtitle="Applicability, owner, evidence count, review status, sign-off per control."
          >
            {overview.statementOfApplicability.length ? (
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-audity-panel text-audity-muted">
                    <tr>
                      <th className="px-2 py-1 text-left">Code</th>
                      <th className="px-2 py-1 text-left">Title</th>
                      <th className="px-2 py-1 text-left">Applicability</th>
                      <th className="px-2 py-1 text-left">Owner</th>
                      <th className="px-2 py-1 text-left">Evidence</th>
                      <th className="px-2 py-1 text-left">Review</th>
                      <th className="px-2 py-1 text-left">Sign-off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.statementOfApplicability.map((row) => (
                      <tr
                        key={text(row.assessmentQuestionId)}
                        className="border-b border-audity-border last:border-0"
                      >
                        <td className="px-2 py-1 font-semibold text-audity-primary">
                          {text(row.controlCode, "—")}
                        </td>
                        <td className="px-2 py-1 text-audity-secondary">
                          {text(row.controlTitle, text(row.question, "—"))}
                        </td>
                        <td className="px-2 py-1">
                          <Pill value={row.applicability} />
                        </td>
                        <td className="px-2 py-1 text-audity-secondary">
                          {text(row.controlOwner, "—")}
                        </td>
                        <td className="px-2 py-1 text-audity-secondary">
                          {numberValue(row.mappedEvidence, 0)}
                        </td>
                        <td className="px-2 py-1">
                          <Pill value={row.reviewStatus} />
                        </td>
                        <td className="px-2 py-1">
                          <Pill value={row.signoffStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-audity-muted">SoA is empty.</p>
            )}
          </Panel>

          {/* Gaps */}
          <Panel
            title={`Gap register (${overview.gaps.length})`}
            subtitle="Automatically detected control, evidence and process gaps."
          >
            {overview.gaps.length ? (
              <ul className="space-y-2 text-sm">
                {overview.gaps.map((gap, idx) => (
                  <li
                    key={idx}
                    className="rounded-audity border border-audity-border bg-audity-page p-2"
                  >
                    <strong className="text-audity-text">{text(gap.title, "Gap")}</strong>
                    <p className="text-xs text-audity-muted">{text(gap.description)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-audity-muted">No gaps detected.</p>
            )}
          </Panel>

          {/* Pack export */}
          <Panel
            title="Evidence pack"
            subtitle="Generate the export package with summary, SoA, controls, evidence mappings, findings and sign-offs."
          >
            <p className="mb-3 text-sm text-audity-secondary">
              The pack manifest is hashed and signed (Ed25519). Sign-off entries anchor to that
              manifest hash, so changes after sign-off invalidate the package signature.
            </p>
            <button
              className="audity-btn-primary"
              onClick={() => void downloadPack()}
              disabled={exporting}
            >
              {exporting ? "Generating…" : "Download evidence pack"}
            </button>
          </Panel>
        </div>
      )}
    </PhaseLayout>
  );
}
