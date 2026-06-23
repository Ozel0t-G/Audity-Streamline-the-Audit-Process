import { useEffect, useState } from "react";
import { useApi } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { useToast } from "../../../components/ui";
import type { Finding } from "../../workflow/types";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

/**
 * Simple, always-visible findings list under the Risk Register: finding · L · I ·
 * mapped framework control · free-text note (stored in the finding's observation).
 * Exports the risk register + this list together as a single .xlsx.
 */
export function FindingsSummaryList({ assessmentId }: { assessmentId: string }) {
  const api = useApi();
  const { accessToken, user } = useAuth();
  const toast = useToast();
  const canEdit = Boolean(user?.permissions.includes("finding.approve"));
  const [findings, setFindings] = useState<Finding[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function load() {
    try {
      const res = await api<{ findings: Finding[] }>(`/api/assessments/${assessmentId}/findings`);
      setFindings(res.findings);
      setNotes(Object.fromEntries(res.findings.map((finding) => [finding.id, finding.observation ?? ""])));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load findings");
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
      toast.success("Note saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setSavingId(null);
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/assessments/${assessmentId}/risk-register.xlsx`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        credentials: "include"
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `risk-register-${assessmentId}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

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
                  <td className="py-2 pr-3 font-medium text-audity-text">{finding.title}</td>
                  <td className="px-2 text-center">{finding.severityLikelihood ?? "—"}</td>
                  <td className="px-2 text-center">{finding.severityImpact ?? "—"}</td>
                  <td className="px-2 text-audity-secondary">
                    {finding.controlCode
                      ? `${finding.controlCode}${finding.controlTitle ? ` — ${finding.controlTitle}` : ""}`
                      : "—"}
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
