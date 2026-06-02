import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { AssessmentQuestionsPayload, GuidedQuestion, QuestionDomain } from "./types";

const answerStates = ["answered", "needs_follow_up", "not_applicable", "unknown"];
const evidenceStatuses = ["not_requested", "requested", "received", "validated", "missing"];
const confidenceLevels = ["low", "medium", "high"];

function progressColor(value: number) {
  if (value >= 70) return "bg-audity-success";
  if (value >= 35) return "bg-audity-warning";
  return "bg-audity-error";
}

export function GuidedQuestionsPage() {
  const { id } = useParams();
  const api = useApi();
  const { logout } = useAuth();
  const [payload, setPayload] = useState<AssessmentQuestionsPayload | null>(null);
  const [activeDomainId, setActiveDomainId] = useState("");
  const [activeControlId, setActiveControlId] = useState("");
  const [form, setForm] = useState({
    score: 0,
    answerState: "answered",
    evidenceStatus: "not_requested",
    confidenceLevel: "medium",
    notes: ""
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const activeDomain = useMemo<QuestionDomain | null>(() => {
    if (!payload) return null;
    return payload.domains.find((domain) => domain.id === activeDomainId) ?? payload.domains[0] ?? null;
  }, [payload, activeDomainId]);

  const activeQuestion = useMemo<GuidedQuestion | null>(() => {
    if (!activeDomain) return null;
    return (
      activeDomain.questions.find((question) => question.controlId === activeControlId) ??
      activeDomain.questions[0] ??
      null
    );
  }, [activeDomain, activeControlId]);

  async function load() {
    if (!id) return;
    const next = await api<AssessmentQuestionsPayload>(`/api/assessments/${id}/questions`);
    setPayload(next);
    const nextDomain = next.domains.find((domain) => domain.id === activeDomainId) ?? next.domains[0];
    const nextQuestion =
      nextDomain?.questions.find((question) => question.controlId === activeControlId) ??
      nextDomain?.questions[0];
    if (nextDomain) setActiveDomainId(nextDomain.id);
    if (nextQuestion) setActiveControlId(nextQuestion.controlId);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Load questions failed"));
  }, [id]);

  useEffect(() => {
    if (!activeQuestion) return;
    setForm({
      score: activeQuestion.answer?.score ?? 0,
      answerState: activeQuestion.answer?.answerState ?? "answered",
      evidenceStatus: activeQuestion.answer?.evidenceStatus ?? "not_requested",
      confidenceLevel: activeQuestion.answer?.confidenceLevel ?? "medium",
      notes: activeQuestion.answer?.notes ?? ""
    });
    setSaved("");
  }, [activeQuestion?.controlId]);

  async function saveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !activeQuestion) return;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/questions/${activeQuestion.controlId}/answer`, {
        method: "PUT",
        body: JSON.stringify(form)
      });
      await load();
      setSaved("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save answer failed");
    }
  }

  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <header className="flex h-12 items-center justify-between border-b border-audity-border bg-audity-topnav px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-7 w-7 place-items-center rounded-audity border border-audity-borderStrong bg-audity-panel text-sm font-bold text-audity-primary">A</div>
          <span className="text-sm font-semibold">Audity</span>
        </div>
        <button className="h-8 rounded-audity border border-audity-borderStrong bg-audity-panel px-3 text-sm text-audity-secondary hover:border-audity-primary hover:text-audity-text" onClick={() => void logout()}>
          Logout
        </button>
      </header>
      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-audity-border bg-audity-sidebar p-5">
          <p className="mb-3 text-xs font-semibold uppercase text-audity-muted">Workspace</p>
          <Link className="block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/dashboard">Dashboard</Link>
          <Link className="mt-1 block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/customers">Customers</Link>
          <Link className="mt-1 block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/frameworks">Framework Library</Link>
        </aside>
        <section className="bg-audity-page p-5">
          <div className="mb-5 border-b border-audity-border pb-4">
            <p className="text-xs font-semibold uppercase text-audity-primary">Guided Workflow</p>
            <h1 className="mt-1 text-2xl font-semibold">Questions</h1>
            <p className="mt-2 text-sm text-audity-secondary">
              {payload?.framework.name ?? "Framework"} · {payload?.coverage.answeredControls ?? 0}/{payload?.coverage.totalControls ?? 0} answered
            </p>
          </div>
          <div className="mb-5 rounded-audity border border-audity-border bg-audity-panel p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">Overall coverage</span>
              <span className="text-audity-secondary">{payload?.coverage.percentage ?? 0}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-audity bg-audity-page">
              <div className={`h-full ${progressColor(payload?.coverage.percentage ?? 0)}`} style={{ width: `${payload?.coverage.percentage ?? 0}%` }} />
            </div>
          </div>
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
            <section className="rounded-audity border border-audity-border bg-audity-panel">
              <div className="border-b border-audity-border px-4 py-3">
                <h2 className="text-lg font-semibold">Domains</h2>
              </div>
              <div className="divide-y divide-audity-border">
                {payload?.domains.map((domain) => (
                  <button
                    key={domain.id}
                    className={`block w-full px-4 py-3 text-left hover:bg-audity-panelAlt ${domain.id === activeDomain?.id ? "bg-audity-primaryActive/25" : ""}`}
                    onClick={() => {
                      setActiveDomainId(domain.id);
                      setActiveControlId(domain.questions[0]?.controlId ?? "");
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{domain.name}</p>
                      <span className="text-xs text-audity-secondary">{domain.coverage}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-audity bg-audity-page">
                      <div className={`h-full ${progressColor(domain.coverage)}`} style={{ width: `${domain.coverage}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-audity-muted">{domain.answeredControls}/{domain.totalControls} answered</p>
                  </button>
                ))}
              </div>
            </section>
            <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="rounded-audity border border-audity-border bg-audity-panel">
                <div className="border-b border-audity-border px-4 py-3">
                  <h2 className="text-lg font-semibold">Controls</h2>
                </div>
                <div className="divide-y divide-audity-border">
                  {activeDomain?.questions.map((question) => (
                    <button
                      key={question.controlId}
                      className={`block w-full px-4 py-3 text-left hover:bg-audity-panelAlt ${question.controlId === activeQuestion?.controlId ? "bg-audity-primaryActive/25" : ""}`}
                      onClick={() => setActiveControlId(question.controlId)}
                    >
                      <p className="text-xs font-semibold text-audity-primary">{question.code}</p>
                      <p className="mt-1 text-sm font-semibold">{question.title}</p>
                      <p className="mt-1 text-xs text-audity-muted">Score {question.answer?.score ?? "-"}</p>
                    </button>
                  ))}
                </div>
              </div>
              <form onSubmit={saveAnswer} className="rounded-audity border border-audity-border bg-audity-panel p-4">
                {activeQuestion ? (
                  <>
                    <p className="text-xs font-semibold uppercase text-audity-primary">{activeQuestion.code}</p>
                    <h2 className="mt-1 text-xl font-semibold">{activeQuestion.title}</h2>
                    <p className="mt-2 text-sm text-audity-secondary">{activeQuestion.question}</p>
                    <label className="mt-5 block text-xs font-semibold uppercase text-audity-secondary">
                      Score: {form.score}
                      <input className="mt-3 w-full accent-[#008cff]" type="range" min="0" max="5" step="1" value={form.score} onChange={(event) => setForm({ ...form, score: Number(event.target.value) })} />
                    </label>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <label className="block text-xs font-semibold uppercase text-audity-secondary">
                        Answer State
                        <select className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={form.answerState} onChange={(event) => setForm({ ...form, answerState: event.target.value })}>
                          {answerStates.map((state) => <option key={state} value={state}>{state}</option>)}
                        </select>
                      </label>
                      <label className="block text-xs font-semibold uppercase text-audity-secondary">
                        Evidence Status
                        <select className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={form.evidenceStatus} onChange={(event) => setForm({ ...form, evidenceStatus: event.target.value })}>
                          {evidenceStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </label>
                      <label className="block text-xs font-semibold uppercase text-audity-secondary">
                        Confidence
                        <select className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={form.confidenceLevel} onChange={(event) => setForm({ ...form, confidenceLevel: event.target.value })}>
                          {confidenceLevels.map((level) => <option key={level} value={level}>{level}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="mt-4 block text-xs font-semibold uppercase text-audity-secondary">
                      Notes
                      <textarea className="mt-2 min-h-40 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                    </label>
                    <div className="mt-4 flex items-center gap-3">
                      <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">
                        Save answer
                      </button>
                      {saved ? <span className="text-sm text-audity-success">{saved}</span> : null}
                    </div>
                  </>
                ) : (
                  <div className="py-20 text-center text-audity-muted">No questions available</div>
                )}
              </form>
            </section>
            <aside className="space-y-4">
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-3 text-lg font-semibold">Framework Mapping</h2>
                {activeQuestion?.mappings.length ? (
                  <div className="space-y-2">
                    {activeQuestion.mappings.map((mapping) => (
                      <div key={`${mapping.controlId}-${mapping.code}`} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                        <p className="text-xs font-semibold text-audity-primary">{mapping.framework} · {mapping.code}</p>
                        <p className="mt-1 text-sm">{mapping.title}</p>
                        <p className="mt-1 text-xs text-audity-muted">{mapping.mappingType}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-audity-muted">No mappings for this control.</p>
                )}
              </section>
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-3 text-lg font-semibold">Evidence Signals</h2>
                <div className="space-y-2">
                  {activeQuestion?.evidenceExamples.map((example) => (
                    <div key={example} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm text-audity-secondary">
                      {example}
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
