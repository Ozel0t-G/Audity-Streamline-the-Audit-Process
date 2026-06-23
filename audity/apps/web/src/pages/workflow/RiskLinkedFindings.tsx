import { useEffect, useState } from "react";
import { useApi } from "../../api/client";
import { useToast } from "../../components/ui";
import type { Finding } from "./types";

type LinkedFinding = {
  findingId: string;
  title: string;
  status: string;
  priority: string | null;
  controlCode: string | null;
  contributionNote: string | null;
  linkedAt: string;
};

type Props = {
  assessmentId: string;
  riskId: string;
  canEdit: boolean;
  allFindings: Finding[];
};

export function RiskLinkedFindings({ assessmentId, riskId, canEdit, allFindings }: Props) {
  const api = useApi();
  const toast = useToast();
  const [links, setLinks] = useState<LinkedFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [pickerFindingId, setPickerFindingId] = useState("");
  const [contributionNote, setContributionNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const payload = await api<{ links: LinkedFinding[] }>(
        `/api/assessments/${assessmentId}/risks/${riskId}/findings`
      );
      setLinks(payload.links);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load linked findings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskId]);

  async function addLink() {
    if (!pickerFindingId) {
      toast.error("Pick a finding");
      return;
    }
    try {
      await api(`/api/assessments/${assessmentId}/risks/${riskId}/findings`, {
        method: "POST",
        body: JSON.stringify({
          findingId: pickerFindingId,
          contributionNote: contributionNote.trim() || undefined
        })
      });
      setShowAdd(false);
      setPickerFindingId("");
      setContributionNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link failed");
    }
  }

  async function removeLink(findingId: string) {
    try {
      await api(
        `/api/assessments/${assessmentId}/risks/${riskId}/findings/${findingId}`,
        { method: "DELETE" }
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unlink failed");
    }
  }

  const unlinkedFindings = allFindings.filter(
    (f) => !links.some((l) => l.findingId === f.id) && f.status !== "dismissed"
  );

  return (
    <section className="rounded-audity border border-audity-border bg-audity-page p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="audity-page-kicker">Linked findings ({links.length})</p>
        {canEdit ? (
          <button
            className="audity-btn-secondary text-xs"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "Cancel" : "+ Link finding"}
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-xs text-audity-muted">Loading…</p>
      ) : links.length ? (
        <ul className="space-y-1.5">
          {links.map((link) => (
            <li
              key={link.findingId}
              className="flex items-start justify-between gap-2 rounded-audity border border-audity-border bg-audity-panel p-2 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-audity-text">
                  {link.controlCode ? <span className="text-audity-primary">{link.controlCode}</span> : null}{" "}
                  {link.title}
                </p>
                <p className="text-audity-muted">
                  Status: {link.status} · Priority: {link.priority ?? "—"}
                </p>
                {link.contributionNote ? (
                  <p className="mt-1 italic text-audity-secondary">{link.contributionNote}</p>
                ) : null}
              </div>
              {canEdit ? (
                <button
                  className="text-xs font-semibold text-audity-error hover:underline"
                  onClick={() => void removeLink(link.findingId)}
                >
                  Unlink
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-audity-muted">No findings linked yet.</p>
      )}

      {showAdd && canEdit ? (
        <div className="mt-3 rounded-audity border border-audity-primary bg-audity-panel p-2">
          <label className="block text-xs font-medium text-audity-secondary">
            Finding
            <select
              className="audity-input mt-1"
              value={pickerFindingId}
              onChange={(event) => setPickerFindingId(event.target.value)}
            >
              <option value="">Pick a finding…</option>
              {unlinkedFindings.map((finding) => (
                <option key={finding.id} value={finding.id}>
                  {finding.controlCode ?? "—"} · {finding.title}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-xs font-medium text-audity-secondary">
            Contribution note (optional)
            <input
              className="audity-input mt-1"
              value={contributionNote}
              placeholder="How this finding contributes to the risk"
              onChange={(event) => setContributionNote(event.target.value)}
            />
          </label>
          <button
            className="audity-btn-primary mt-2 text-xs"
            disabled={!pickerFindingId}
            onClick={() => void addLink()}
          >
            Link
          </button>
        </div>
      ) : null}
    </section>
  );
}
