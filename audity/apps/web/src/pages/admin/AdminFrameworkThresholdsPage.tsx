import { useEffect, useState } from "react";
import { useApi } from "../../api/client";
import { PageSkeleton, useToast } from "../../components/ui";

type Thresholds = {
  fieldwork: number;
  findings_response: number;
  evidence_request: number;
  remediation: number;
};

type FrameworkRow = {
  id: string;
  name: string;
  version: string | null;
  thresholds: Thresholds;
  hasCustom: boolean;
};

const FIELD_LABEL: Record<keyof Thresholds, string> = {
  fieldwork: "Fieldwork stagnation",
  findings_response: "Management response pending",
  evidence_request: "Evidence request open",
  remediation: "Remediation stagnation"
};

const FIELD_HINT: Record<keyof Thresholds, string> = {
  fieldwork: "Days without any mutation on the audit before stuck signal triggers.",
  findings_response: "Days without a management response on a finding.",
  evidence_request: "Days an evidence request stays open before escalation.",
  remediation: "Days in `treating` state without an update."
};

export function AdminFrameworkThresholdsPage() {
  const api = useApi();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [defaults, setDefaults] = useState<Thresholds | null>(null);
  const [frameworks, setFrameworks] = useState<FrameworkRow[]>([]);
  const [editing, setEditing] = useState<FrameworkRow | null>(null);
  const [draft, setDraft] = useState<Thresholds | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const payload = await api<{ defaults: Thresholds; frameworks: FrameworkRow[] }>(
        "/api/admin/frameworks/thresholds"
      );
      setDefaults(payload.defaults);
      setFrameworks(payload.frameworks);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load thresholds");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEditor(row: FrameworkRow) {
    setEditing(row);
    setDraft({ ...row.thresholds });
  }

  async function save() {
    if (!editing || !draft) return;
    setSaving(true);
    try {
      await api(`/api/admin/frameworks/${editing.id}/stuck-thresholds`, {
        method: "PUT",
        body: JSON.stringify(draft)
      });
      toast.success(`Thresholds for ${editing.name} saved`);
      setEditing(null);
      setDraft(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!editing) return;
    setSaving(true);
    try {
      await api(`/api/admin/frameworks/${editing.id}/stuck-thresholds`, {
        method: "PUT",
        body: JSON.stringify({})
      });
      toast.success(`${editing.name}: reset to system default`);
      setEditing(null);
      setDraft(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !defaults) {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Admin · Frameworks</p>
          <h1 className="audity-page-title">Stuck-threshold defaults</h1>
        </div>
        <PageSkeleton cards={3} showTable />
      </>
    );
  }

  return (
    <>
      <div className="audity-page-header">
        <p className="audity-page-kicker">Admin · Frameworks</p>
        <h1 className="audity-page-title">Stuck-threshold defaults per framework</h1>
        <p className="audity-page-copy">
          Every audit inherits these defaults at creation. Audit owners can override them per
          audit. Resolution order: audit override &gt; framework default &gt; system default.
        </p>
      </div>

      <section className="audity-card mb-4 p-4">
        <h2 className="text-sm font-semibold text-audity-text">System defaults</h2>
        <p className="mt-1 text-xs text-audity-muted">
          Used when neither audit nor framework set their own values.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(FIELD_LABEL) as Array<keyof Thresholds>).map((key) => (
            <div
              key={key}
              className="rounded-audity border border-audity-border bg-audity-panel p-2 text-xs"
            >
              <div className="font-semibold text-audity-text">{FIELD_LABEL[key]}</div>
              <div className="mt-1 text-audity-secondary">
                <strong>{defaults[key]}</strong> days
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="audity-card p-0">
        <header className="flex items-center justify-between border-b border-audity-border p-4">
          <h2 className="text-sm font-semibold text-audity-text">
            Frameworks ({frameworks.length})
          </h2>
        </header>
        <ul>
          {frameworks.map((framework) => (
            <li
              key={framework.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-audity-border px-4 py-3 last:border-0"
            >
              <div>
                <div className="text-sm font-semibold text-audity-text">
                  {framework.name}
                  {framework.version ? (
                    <span className="ml-2 text-xs text-audity-muted">v{framework.version}</span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-audity-muted">
                  Fieldwork {framework.thresholds.fieldwork}d · Findings resp{" "}
                  {framework.thresholds.findings_response}d · Evidence req{" "}
                  {framework.thresholds.evidence_request}d · Remediation{" "}
                  {framework.thresholds.remediation}d
                  {framework.hasCustom ? (
                    <span className="ml-2 rounded-full bg-audity-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Custom
                    </span>
                  ) : (
                    <span className="ml-2 text-[10px] uppercase text-audity-muted">Default</span>
                  )}
                </div>
              </div>
              <button className="audity-btn-secondary text-xs" onClick={() => openEditor(framework)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      </section>

      {editing && draft ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="audity-card w-full max-w-md p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-audity-text">{editing.name}</h2>
            <p className="mt-1 text-xs text-audity-muted">
              Leave the modal via Reset to remove the framework override and fall back to the
              system default.
            </p>
            <div className="mt-4 space-y-3">
              {(Object.keys(FIELD_LABEL) as Array<keyof Thresholds>).map((key) => (
                <label key={key} className="block text-xs font-medium text-audity-secondary">
                  {FIELD_LABEL[key]} (days)
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    className="audity-input mt-1"
                    value={draft[key]}
                    onChange={(event) =>
                      setDraft({ ...draft, [key]: Number(event.target.value) || 1 })
                    }
                  />
                  <span className="mt-1 block text-[11px] text-audity-muted">
                    {FIELD_HINT[key]}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                className="audity-btn-secondary text-xs"
                onClick={() => void resetToDefault()}
                disabled={saving || !editing.hasCustom}
                title="Reset this framework to the system default"
              >
                Reset to system default
              </button>
              <div className="flex gap-2">
                <button
                  className="audity-btn-secondary"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button className="audity-btn-primary" onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
