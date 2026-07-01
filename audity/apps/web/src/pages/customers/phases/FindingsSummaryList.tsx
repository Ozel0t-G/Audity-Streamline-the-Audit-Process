import { useEffect, useRef, useState } from "react";
import { useApi } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { useToast } from "../../../components/ui";
import type { Finding } from "../../workflow/types";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

/**
 * Simple, collapsible findings list under the Risk Register: finding · L · I ·
 * mapped framework control (with its description) · free-text note. L/I and the
 * note are editable inline. Exports the risk register + this list as one .xlsx.
 */
export function FindingsSummaryList({ assessmentId }: { assessmentId: string }) {
  const api = useApi();
  const { accessToken, user, refreshSession } = useAuth();
  const toast = useToast();
  const canEdit = Boolean(user?.permissions.includes("finding.approve"));
  const loadSeqRef = useRef(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sev, setSev] = useState<Record<string, { l: string; i: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function load() {
    const requestId = ++loadSeqRef.current;
    try {
      const res = await api<{ findings: Finding[] }>(`/api/assessments/${assessmentId}/findings`);
      if (loadSeqRef.current !== requestId) return;
      setFindings(res.findings);
      setNotes(Object.fromEntries(res.findings.map((finding) => [finding.id, finding.observation ?? ""])));
      setSev(
        Object.fromEntries(
          res.findings.map((finding) => [
            finding.id,
            {
              l: finding.severityLikelihood != null ? String(finding.severityLikelihood) : "",
              i: finding.severityImpact != null ? String(finding.severityImpact) : ""
            }
          ])
        )
      );
    } catch (err) {
      if (loadSeqRef.current === requestId) toast.error(err instanceof Error ? err.message : "Could not load findings");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  async function saveNote(finding: Finding) {
    if ((notes[finding.id] ?? "") === (finding.observation ?? "")) return;
    setSavingId(finding.id);
    try {
      await api(`/api/assessments/${assessmentId}/findings/${finding.id}`, {
        method: "PUT",
        body: JSON.stringify({ observation: notes[finding.id] ?? "" })
      });
      setFindings((prev) =>
        prev.map((f) => (f.id === finding.id ? { ...f, observation: notes[finding.id] ?? "" } : f))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setSavingId(null);
    }
  }

  // L/I edit severity_impact/severity_likelihood; the audit-center endpoint
  // recomputes the finding's calculated severity, keeping the matrix consistent.
  async function saveSeverity(finding: Finding) {
    const entry = sev[finding.id] ?? { l: "", i: "" };
    const l = entry.l === "" ? null : Math.max(1, Math.min(5, Number(entry.l) || 0)) || null;
    const i = entry.i === "" ? null : Math.max(1, Math.min(5, Number(entry.i) || 0)) || null;
    if (l === (finding.severityLikelihood ?? null) && i === (finding.severityImpact ?? null)) return;
    // The audit-center schema accepts severity 1–5 but not null, so only send the
    // fields that actually have a value (each can be set independently).
    const payload: { severityLikelihood?: number; severityImpact?: number } = {};
    if (l !== null) payload.severityLikelihood = l;
    if (i !== null) payload.severityImpact = i;
    if (Object.keys(payload).length === 0) return;
    setSavingId(finding.id);
    try {
      await api(`/api/assessments/${assessmentId}/audit-center/findings/${finding.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setFindings((prev) =>
        prev.map((f) =>
          f.id === finding.id
            ? { ...f, severityLikelihood: l ?? f.severityLikelihood, severityImpact: i ?? f.severityImpact }
            : f
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save L/I");
    } finally {
      setSavingId(null);
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const url = `${apiBaseUrl}/api/assessments/${assessmentId}/risk-register.xlsx`;
      const send = (token: string | null) =>
        fetch(url, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      // Mirror the api client: on a 401 (e.g. an expired access token) refresh
      // once and retry, so the download doesn't fail mid-session.
      let res = await send(accessToken);
      if (res.status === 401) {
        const refreshed = await refreshSession();
        if (refreshed) res = await send(refreshed.accessToken);
      }
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `risk-register-${assessmentId}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const sevInput = (findingId: string, key: "l" | "i", finding: Finding) => (
    <input
      type="number"
      min={1}
      max={5}
      className="audity-input w-12 px-1 py-0.5 text-center text-xs"
      value={sev[findingId]?.[key] ?? ""}
      disabled={!canEdit || savingId === findingId}
      onChange={(event) =>
        setSev({ ...sev, [findingId]: { ...(sev[findingId] ?? { l: "", i: "" }), [key]: event.target.value } })
      }
      onBlur={() => {
        if (canEdit) void saveSeverity(finding);
      }}
    />
  );

  return (
    <section className="audity-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-audity-text">Findings list</h2>
          <p className="text-xs text-audity-muted">Finding, likelihood (L), impact (I), mapped control and your note.</p>
        </div>
        <button className="audity-btn-secondary audity-btn-sm" type="button" onClick={() => void exportExcel()} disabled={exporting}>
          {exporting ? "Exporting…" : "Export to Excel"}
        </button>
      </div>
      {findings.length === 0 ? (
        <p className="text-sm text-audity-muted">No findings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-audity-muted">
                <th className="py-2 pr-3">Finding</th>
                <th className="px-2 text-center">L</th>
                <th className="px-2 text-center">I</th>
                <th className="px-2">Framework control</th>
                <th className="px-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.id} className="border-t border-audity-border align-top">
                  <td className="py-2 pr-3 font-medium text-audity-text">
                    {finding.title}
                    {finding.sourceExplanation ? (
                      <p className="mt-0.5 text-xs font-normal text-audity-muted">{finding.sourceExplanation}</p>
                    ) : null}
                  </td>
                  <td className="px-2 text-center">{sevInput(finding.id, "l", finding)}</td>
                  <td className="px-2 text-center">{sevInput(finding.id, "i", finding)}</td>
                  <td className="px-2 text-audity-secondary">
                    {finding.controlCode || finding.controlTitle ? (
                      <div className="max-w-[260px]">
                        <p className="font-medium text-audity-text">
                          {finding.controlCode}
                          {finding.controlTitle ? ` — ${finding.controlTitle}` : ""}
                        </p>
                        {finding.controlDescription ? (
                          <p className="mt-0.5 text-xs text-audity-muted">{finding.controlDescription}</p>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2">
                    <textarea
                      className="audity-input min-h-[44px] w-full min-w-[220px] text-xs"
                      value={notes[finding.id] ?? ""}
                      disabled={!canEdit || savingId === finding.id}
                      placeholder="e.g. Management published policies but did not communicate them"
                      onChange={(event) => setNotes({ ...notes, [finding.id]: event.target.value })}
                      onBlur={() => {
                        if (canEdit) void saveNote(finding);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
