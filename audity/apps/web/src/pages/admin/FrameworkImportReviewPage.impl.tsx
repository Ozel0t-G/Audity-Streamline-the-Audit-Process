import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useConfirm } from "../../components/ui";

type ImportDetail = {
  id: string;
  sourceFilename: string;
  sourceMime: string;
  status: string;
  frameworkKey: string | null;
  frameworkName: string | null;
  frameworkVersion: string | null;
  frameworkLanguage: string | null;
  draftYaml: DraftYaml | null;
  totalControls: number;
  enrichedControls: number;
  llmProvider: string | null;
  llmModel: string | null;
  llmTokensIn: number;
  llmTokensOut: number;
  llmEstimatedCostCents: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  committedAt: string | null;
  committedYamlPath: string | null;
};

type DraftYaml = {
  framework: Record<string, unknown>;
  domains: DraftDomain[];
  controlMappings?: Array<{ source: string; target: string; type?: string }>;
};

type DraftDomain = {
  id?: string;
  name: string;
  description?: string;
  controls: DraftControl[];
};

type DraftControl = {
  id: string;
  title: string;
  weight?: number;
  tags?: string[];
  question?: string;
  purpose?: string;
  expectedOutcome?: string[];
  howTo?: Array<{ step: string; details?: string }>;
  evidenceExamples?: string[];
  _approved?: boolean;
  _todo?: boolean;
};

function qualityScore(draft: DraftYaml | null): number {
  if (!draft) return 0;
  let total = 0;
  let filled = 0;
  for (const domain of draft.domains) {
    for (const control of domain.controls) {
      total += 5;
      if (control.question && !control.question.startsWith("TODO")) filled += 1;
      if (control.purpose && !control.purpose.startsWith("TODO")) filled += 1;
      if (control.expectedOutcome?.length && !control.expectedOutcome[0].startsWith("TODO")) filled += 1;
      if (control.howTo?.length && !control.howTo[0].step.startsWith("TODO")) filled += 1;
      if (control.evidenceExamples?.length && !control.evidenceExamples[0].startsWith("TODO")) filled += 1;
    }
  }
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

export function FrameworkImportReviewPage() {
  const { importId } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [draft, setDraft] = useState<DraftYaml | null>(null);
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({});
  const [openControls, setOpenControls] = useState<Record<string, boolean>>({});
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pendingPersist, setPendingPersist] = useState<Set<string>>(() => new Set());
  const confirm = useConfirm();

  async function load() {
    if (!importId) return;
    try {
      const result = await api<{ import: ImportDetail }>(`/api/admin/frameworks/imports/${importId}`);
      setDetail(result.import);
      setDraft(result.import.draftYaml);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (detail?.status === "extracting" || detail?.status === "enriching") {
        void load();
      }
    }, 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId, detail?.status]);

  function updateControl(domainIndex: number, controlIndex: number, patch: Partial<DraftControl>) {
    const key = `${domainIndex}-${controlIndex}`;
    setDraft((current) => {
      if (!current) return current;
      const next: DraftYaml = JSON.parse(JSON.stringify(current));
      const control = next.domains[domainIndex].controls[controlIndex];
      next.domains[domainIndex].controls[controlIndex] = { ...control, ...patch };
      return next;
    });
    setPendingPersist((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  async function persistControl(domainIndex: number, controlIndex: number) {
    if (!draft || !importId) return;
    const key = `${domainIndex}-${controlIndex}`;
    try {
      const control = draft.domains[domainIndex].controls[controlIndex];
      await api(`/api/admin/frameworks/imports/${importId}`, {
        method: "PATCH",
        body: JSON.stringify({
          domainIndex,
          controlIndex,
          control
        })
      });
      setPendingPersist((current) => {
        if (!current.has(key)) return current;
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function regenerateControl(domainIndex: number, controlIndex: number) {
    if (!importId) return;
    const key = `${domainIndex}-${controlIndex}`;
    setRegenerating(key);
    setError("");
    try {
      const result = await api<{ control: DraftControl }>(`/api/admin/frameworks/imports/${importId}/regenerate-control`, {
        method: "POST",
        body: JSON.stringify({ domainIndex, controlIndex })
      });
      updateControl(domainIndex, controlIndex, result.control);
      setInfo("Kontrolle neu generiert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(null);
    }
  }

  async function commit() {
    if (!importId) return;
    setCommitting(true);
    setError("");
    try {
      await api(`/api/admin/frameworks/imports/${importId}/commit`, {
        method: "POST",
        body: JSON.stringify({ draft })
      });
      navigate("/admin/frameworks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
      setCommitting(false);
    }
  }

  async function discard() {
    if (!importId) return;
    const ok = await confirm({
      title: "Draft verwerfen?",
      body: "Der Draft wird gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
      confirmLabel: "Verwerfen",
      destructive: true
    });
    if (!ok) return;
    setError("");
    try {
      await api(`/api/admin/frameworks/imports/${importId}`, { method: "DELETE" });
      navigate("/admin/frameworks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discard failed");
    }
  }

  const score = useMemo(() => qualityScore(draft), [draft]);

  if (!detail) return <div className="text-sm text-audity-muted">Lädt…</div>;

  if (detail.status === "extracting" || detail.status === "enriching") {
    const pct = detail.totalControls === 0 ? 0 : Math.round((detail.enrichedControls / detail.totalControls) * 100);
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Framework Import</p>
          <h1 className="audity-page-title">{detail.frameworkName ?? detail.sourceFilename}</h1>
        </div>
        <div className="audity-card max-w-xl">
          <p className="text-sm font-semibold">Status: {detail.status}</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-audity-panelAlt">
            <div className="h-full bg-audity-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-audity-muted">{detail.enrichedControls} / {detail.totalControls} Controls verarbeitet</p>
        </div>
      </>
    );
  }

  if (detail.status === "failed") {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Framework Import</p>
          <h1 className="audity-page-title">Import fehlgeschlagen</h1>
        </div>
        <div className="audity-card max-w-xl border-audity-error">
          <p className="text-sm text-audity-error">{detail.errorMessage}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="audity-btn-primary"
            onClick={async () => {
              if (!importId) return;
              setError("");
              try {
                await api(`/api/admin/frameworks/imports/${importId}/retry`, {
                  method: "POST",
                  body: JSON.stringify({})
                });
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Retry failed");
              }
            }}
          >
            ↻ Retry
          </button>
          <Link className="audity-btn-secondary" to="/admin/frameworks">Zurück</Link>
        </div>
      </>
    );
  }

  if (detail.status === "committed") {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Framework Import</p>
          <h1 className="audity-page-title">Bereits commited</h1>
        </div>
        <p className="text-sm text-audity-secondary">Datei: {detail.committedYamlPath}</p>
        <Link className="audity-btn-secondary mt-3" to="/admin/frameworks">Zur Library</Link>
      </>
    );
  }

  return (
    <>
      <div className="audity-page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="audity-page-kicker">Framework Import — Review</p>
          <h1 className="audity-page-title">{detail.frameworkName ?? detail.sourceFilename}</h1>
          <p className="audity-page-copy">
            Provider: {detail.llmProvider ?? "—"} · Quality-Score: <strong>{score}/100</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="audity-btn-ghost text-audity-error" onClick={() => void discard()}>Discard</button>
          <button type="button" className="audity-btn-primary" disabled={committing} onClick={commit}>
            {committing ? "Commiting…" : "Commit Framework"}
          </button>
        </div>
      </div>

      {error ? <div className="mb-3 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
      {info ? <div className="mb-3 rounded-audity border border-audity-success bg-audity-success/10 px-3 py-2 text-sm text-audity-success">{info}</div> : null}

      <div className="space-y-3">
        {draft?.domains.map((domain, domainIndex) => (
          <section key={`${domain.id ?? domain.name}-${domainIndex}`} className="audity-card">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setOpenDomains((current) => ({ ...current, [domainIndex]: !current[domainIndex] }))}
            >
              <span className="text-sm font-semibold">{domain.name}</span>
              <span className="text-xs text-audity-muted">{domain.controls.length} controls</span>
            </button>
            {openDomains[domainIndex] !== false ? (
              <div className="mt-3 space-y-3">
                {domain.controls.map((control, controlIndex) => {
                  const ckey = `${domainIndex}-${controlIndex}`;
                  const isOpen = openControls[ckey] !== false;
                  return (
                    <div key={control.id} className="rounded-audity-md border border-audity-border bg-audity-page p-3">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between text-left"
                        onClick={() => setOpenControls((current) => ({ ...current, [ckey]: !isOpen }))}
                      >
                        <span className="font-semibold text-sm">{control.id} — {control.title}</span>
                        <span className="text-xs text-audity-muted">{control._approved ? "✓" : control._todo ? "⚠" : ""}</span>
                      </button>
                      {isOpen ? (
                        <div className="mt-3 grid gap-3" onBlur={() => { void persistControl(domainIndex, controlIndex); }}>
                          <Field
                            label="Question"
                            value={control.question ?? ""}
                            onChange={(value) => updateControl(domainIndex, controlIndex, { question: value })}
                            multiline
                          />
                          <Field
                            label="Purpose"
                            value={control.purpose ?? ""}
                            onChange={(value) => updateControl(domainIndex, controlIndex, { purpose: value })}
                            multiline
                          />
                          <ArrayField
                            label="Expected Outcome"
                            values={control.expectedOutcome ?? []}
                            onChange={(values) => updateControl(domainIndex, controlIndex, { expectedOutcome: values })}
                          />
                          <HowToField
                            values={control.howTo ?? []}
                            onChange={(values) => updateControl(domainIndex, controlIndex, { howTo: values })}
                          />
                          <ArrayField
                            label="Evidence Examples"
                            values={control.evidenceExamples ?? []}
                            onChange={(values) => updateControl(domainIndex, controlIndex, { evidenceExamples: values })}
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-audity-border pt-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className={`audity-btn-ghost audity-btn-sm ${control._approved ? "bg-audity-success/10 text-audity-success" : ""}`}
                                onClick={() => updateControl(domainIndex, controlIndex, { _approved: !control._approved, _todo: false })}
                              >
                                ✓ Approved
                              </button>
                              <button
                                type="button"
                                className={`audity-btn-ghost audity-btn-sm ${control._todo ? "bg-audity-warning/10 text-audity-warning" : ""}`}
                                onClick={() => updateControl(domainIndex, controlIndex, { _todo: !control._todo, _approved: false })}
                              >
                                ⚠ TODO
                              </button>
                              {detail.llmProvider && detail.llmProvider !== "none" ? (
                                <button type="button" className="audity-btn-ghost audity-btn-sm" disabled={regenerating === ckey} onClick={() => regenerateControl(domainIndex, controlIndex)}>
                                  {regenerating === ckey ? "Generiert…" : "♻ Re-generate"}
                                </button>
                              ) : null}
                            </div>
                            <span className="text-xs text-audity-muted">
                              {pendingPersist.has(ckey) ? "Auto-Save ausstehend…" : "✓ Synchronisiert"}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        ))}
      </div>

    </>
  );
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return (
    <div>
      <label className="audity-label">{label}</label>
      {multiline ? (
        <textarea className="audity-input" rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className="audity-input" value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}

function ArrayField({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  return (
    <div>
      <label className="audity-label">{label}</label>
      <div className="space-y-1">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              className="audity-input"
              value={value}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
            <button type="button" className="audity-btn-ghost audity-btn-sm" onClick={() => onChange(values.filter((_, i) => i !== index))}>×</button>
          </div>
        ))}
        <button type="button" className="audity-btn-ghost audity-btn-sm" onClick={() => onChange([...values, ""])}>+ Add</button>
      </div>
    </div>
  );
}

function HowToField({ values, onChange }: { values: Array<{ step: string; details?: string }>; onChange: (values: Array<{ step: string; details?: string }>) => void }) {
  return (
    <div>
      <label className="audity-label">How To</label>
      <div className="space-y-2">
        {values.map((entry, index) => (
          <div key={index} className="rounded-audity border border-audity-border bg-audity-panelAlt/50 p-2">
            <input
              className="audity-input"
              placeholder="Schritt"
              value={entry.step}
              onChange={(event) => {
                const next = [...values];
                next[index] = { ...entry, step: event.target.value };
                onChange(next);
              }}
            />
            <textarea
              className="audity-input mt-1"
              rows={2}
              placeholder="Details (optional)"
              value={entry.details ?? ""}
              onChange={(event) => {
                const next = [...values];
                next[index] = { ...entry, details: event.target.value };
                onChange(next);
              }}
            />
            <button type="button" className="audity-btn-ghost audity-btn-sm mt-1" onClick={() => onChange(values.filter((_, i) => i !== index))}>Entfernen</button>
          </div>
        ))}
        <button type="button" className="audity-btn-ghost audity-btn-sm" onClick={() => onChange([...values, { step: "" }])}>+ Schritt</button>
      </div>
    </div>
  );
}
