import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { AssessmentQuestionsPayload, GuidedQuestion, QuestionDomain } from "./types";

type ReviewComment = {
  id: string;
  userEmail: string | null;
  comment: string;
  createdAt: string;
};

const answerStates = ["answered", "needs_follow_up", "not_applicable", "unknown"];
const evidenceStatuses = ["not_requested", "requested", "received", "validated", "missing"];
const confidenceLevels = ["low", "medium", "high"];
const scoreOptions = [
  { value: 0, label: "0 None" },
  { value: 1, label: "1 Initial" },
  { value: 2, label: "2 Partial" },
  { value: 3, label: "3 Defined" },
  { value: 4, label: "4 Managed" },
  { value: 5, label: "5 Optimized" }
];

function progressColor(value: number) {
  if (value >= 70) return "bg-audity-success";
  if (value >= 35) return "bg-audity-warning";
  return "bg-audity-error";
}

export function GuidedQuestionsPage() {
  const { id } = useParams();
  const api = useApi();
  const { user } = useAuth();
  const canEditAssessment = Boolean(user?.permissions.includes("assessment.edit"));
  const [payload, setPayload] = useState<AssessmentQuestionsPayload | null>(null);
  const [activeDomainId, setActiveDomainId] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [form, setForm] = useState({
    score: 0,
    answerState: "answered",
    evidenceStatus: "not_requested",
    confidenceLevel: "medium",
    notes: ""
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentText, setCommentText] = useState("");

  const activeDomain = useMemo<QuestionDomain | null>(() => {
    if (!payload) return null;
    return payload.domains.find((domain) => domain.id === activeDomainId) ?? payload.domains[0] ?? null;
  }, [payload, activeDomainId]);

  const activeQuestion = useMemo<GuidedQuestion | null>(() => {
    if (!activeDomain) return null;
    return (
      activeDomain.questions.find((question) => question.questionId === activeQuestionId) ??
      activeDomain.questions[0] ??
      null
    );
  }, [activeDomain, activeQuestionId]);

  const progressSummary = useMemo(() => {
    const questions = payload?.domains.flatMap((domain) => domain.questions) ?? [];
    return {
      answered: questions.filter((question) => question.answer?.answerState === "answered").length,
      followUp: questions.filter((question) => question.answer?.answerState === "needs_follow_up").length,
      evidenceGaps: questions.filter((question) => question.evidenceGap).length,
      lowConfidence: questions.filter((question) => question.answer?.confidenceLevel === "low").length
    };
  }, [payload]);

  const smartSuggestions = useMemo(() => {
    if (!activeQuestion) return [];
    const suggestions: string[] = [];
    if ((form.score ?? 0) <= 2) suggestions.push("Create or review the related risk because this control has a low maturity score.");
    if (form.evidenceStatus === "missing" || activeQuestion.evidenceGap) suggestions.push("Request evidence and attach it before the finding is closed.");
    if (form.confidenceLevel === "low") suggestions.push("Add a review note or assign follow-up because confidence is low.");
    if (form.answerState === "needs_follow_up") suggestions.push("Keep this question in review until the missing information is clarified.");
    if (!form.notes.trim()) suggestions.push("Add concise notes explaining the score decision.");
    return suggestions.slice(0, 4);
  }, [activeQuestion, form]);

  async function load() {
    if (!id) return;
    const next = await api<AssessmentQuestionsPayload>(`/api/assessments/${id}/questions`);
    setPayload(next);
    const nextDomain = next.domains.find((domain) => domain.id === activeDomainId) ?? next.domains[0];
    const nextQuestion =
      nextDomain?.questions.find((question) => question.questionId === activeQuestionId) ??
      nextDomain?.questions[0];
    if (nextDomain) setActiveDomainId(nextDomain.id);
    if (nextQuestion) setActiveQuestionId(nextQuestion.questionId);
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
  }, [activeQuestion?.questionId]);

  useEffect(() => {
    if (!id || !activeQuestion) {
      setComments([]);
      return;
    }
    api<{ comments: ReviewComment[] }>(`/api/assessments/${id}/comments?entityType=question&entityId=${activeQuestion.questionId}`)
      .then((payload) => setComments(payload.comments))
      .catch(() => setComments([]));
  }, [api, id, activeQuestion?.questionId]);

  async function saveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !activeQuestion) return;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/questions/${activeQuestion.questionId}/answer`, {
        method: "PUT",
        body: JSON.stringify(form)
      });
      await load();
      setSaved("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save answer failed");
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !activeQuestion || !commentText.trim()) return;
    await api(`/api/assessments/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ entityType: "question", entityId: activeQuestion.questionId, comment: commentText })
    });
    setCommentText("");
    const payload = await api<{ comments: ReviewComment[] }>(`/api/assessments/${id}/comments?entityType=question&entityId=${activeQuestion.questionId}`);
    setComments(payload.comments);
  }

  return (
    <>
          <div className="audity-page-header">
            <p className="audity-page-kicker">Guided Workflow</p>
            <h1 className="audity-page-title">Questions</h1>
            <p className="audity-page-copy">
              {payload?.framework.name ?? "Framework"} · {payload?.coverage.answeredControls ?? 0}/{payload?.coverage.totalControls ?? 0} answered
            </p>
          </div>
          <div className="mb-4 rounded-audity border border-audity-border bg-audity-panel p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">Overall coverage</span>
              <span className="text-audity-secondary">{payload?.coverage.percentage ?? 0}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-audity bg-audity-page">
              <div className={`h-full ${progressColor(payload?.coverage.percentage ?? 0)}`} style={{ width: `${payload?.coverage.percentage ?? 0}%` }} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <p className="text-xs font-semibold uppercase text-audity-muted">Answered</p>
                <p className="mt-1 text-xl font-semibold">{progressSummary.answered}</p>
              </div>
              <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <p className="text-xs font-semibold uppercase text-audity-muted">Follow-up</p>
                <p className="mt-1 text-xl font-semibold">{progressSummary.followUp}</p>
              </div>
              <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <p className="text-xs font-semibold uppercase text-audity-muted">Evidence Gaps</p>
                <p className="mt-1 text-xl font-semibold">{progressSummary.evidenceGaps}</p>
              </div>
              <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <p className="text-xs font-semibold uppercase text-audity-muted">Low Confidence</p>
                <p className="mt-1 text-xl font-semibold">{progressSummary.lowConfidence}</p>
              </div>
            </div>
          </div>
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
          <div className="grid min-w-0 gap-3 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_280px]">
            <section className="rounded-audity border border-audity-border bg-audity-panel">
              <div className="border-b border-audity-border px-3 py-2.5">
                <h2 className="text-lg font-semibold">Domains</h2>
              </div>
              <div className="divide-y divide-audity-border">
                {payload?.domains.map((domain) => (
                  <button
                    key={domain.id}
                    className={`block w-full px-3 py-2.5 text-left hover:bg-audity-panelAlt ${domain.id === activeDomain?.id ? "bg-audity-primaryActive/25" : ""}`}
                    onClick={() => {
                      setActiveDomainId(domain.id);
                      setActiveQuestionId(domain.questions[0]?.questionId ?? "");
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
            <section className="grid min-w-0 gap-3 lg:grid-cols-[200px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-audity border border-audity-border bg-audity-panel">
                <div className="border-b border-audity-border px-3 py-2.5">
                  <h2 className="text-lg font-semibold">Controls</h2>
                </div>
                <div className="divide-y divide-audity-border">
                  {activeDomain?.questions.map((question) => (
                    <button
                      key={question.questionId}
                      className={`block w-full px-3 py-2.5 text-left hover:bg-audity-panelAlt ${question.questionId === activeQuestion?.questionId ? "bg-audity-primaryActive/25" : ""}`}
                      onClick={() => setActiveQuestionId(question.questionId)}
                    >
                      <p className="text-xs font-semibold text-audity-primary">{question.code}</p>
                      <p className="mt-1 text-sm font-semibold">{question.title}</p>
                      <p className="mt-1 text-xs text-audity-secondary">{question.sourceQuestionId ?? question.questionId.slice(0, 8)}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded-audity border border-audity-borderStrong px-2 py-0.5 text-[11px] text-audity-muted">Score {question.answer?.score ?? "-"}</span>
                        {question.evidenceGap ? <span className="rounded-audity border border-audity-warning px-2 py-0.5 text-[11px] text-audity-warning">Evidence gap</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <form onSubmit={saveAnswer} className="min-w-0 rounded-audity border border-audity-border bg-audity-panel p-3">
                {activeQuestion ? (
                  <>
                    <p className="text-xs font-semibold uppercase text-audity-primary">{activeQuestion.code}</p>
                    <h2 className="mt-1 text-xl font-semibold">{activeQuestion.title}</h2>
                    <p className="mt-2 text-sm text-audity-secondary">{activeQuestion.question}</p>
                    {activeQuestion.evidenceGap ? (
                      <div className="mt-4 rounded-audity border border-audity-warning bg-audity-page px-3 py-2 text-sm text-audity-warning">
                        Low score with missing or unvalidated evidence
                      </div>
                    ) : null}
                    <label className="mt-5 block text-xs font-semibold uppercase text-audity-secondary">
                      Score
                      <select className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={form.score} onChange={(event) => setForm({ ...form, score: Number(event.target.value) })}>
                        {scoreOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-4 grid gap-3 2xl:grid-cols-3">
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
                    {canEditAssessment ? (
                    <div className="mt-4 flex items-center gap-3">
                      <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">
                        Save answer
                      </button>
                      {saved ? <span className="text-sm text-audity-success">{saved}</span> : null}
                    </div>
                    ) : null}
                  </>
                ) : (
                  <div className="py-20 text-center text-audity-muted">No questions available</div>
                )}
              </form>
            </section>
            <aside className="grid min-w-0 gap-3 xl:col-span-2 xl:grid-cols-2 2xl:col-span-1 2xl:block 2xl:space-y-3">
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-3 text-lg font-semibold">Smart Suggestions</h2>
                <div className="space-y-2">
                  {smartSuggestions.map((suggestion) => (
                    <div key={suggestion} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm text-audity-secondary">
                      {suggestion}
                    </div>
                  ))}
                  {!smartSuggestions.length ? <p className="text-sm text-audity-muted">No suggestions for the current answer.</p> : null}
                </div>
              </section>
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
                {activeQuestion?.evidenceGap ? (
                  <div className="mb-3 rounded-audity border border-audity-warning bg-audity-page px-3 py-2 text-sm text-audity-warning">
                    Evidence should be requested, received, or validated before this control is considered resolved.
                  </div>
                ) : null}
                <div className="space-y-2">
                  {activeQuestion?.evidenceExamples.map((example) => (
                    <div key={example} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm text-audity-secondary">
                      {example}
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-3 text-lg font-semibold">Review Notes</h2>
                <div className="space-y-2">
                  {comments.slice(0, 5).map((comment) => (
                    <div key={comment.id} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-audity-primary">{comment.userEmail ?? "System"}</p>
                        <p className="text-[11px] text-audity-muted">{new Date(comment.createdAt).toLocaleString()}</p>
                      </div>
                      <p className="mt-1 text-sm text-audity-secondary">{comment.comment}</p>
                    </div>
                  ))}
                  {!comments.length ? <p className="text-sm text-audity-muted">No review notes yet</p> : null}
                </div>
                {canEditAssessment ? (
                <form className="mt-3 flex gap-2" onSubmit={(event) => void addComment(event)}>
                  <input className="h-9 min-w-0 flex-1 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Add note" />
                  <button className="h-9 rounded-audity border border-audity-borderStrong px-3 text-sm text-audity-primary">Add</button>
                </form>
                ) : null}
              </section>
            </aside>
          </div>
    </>
  );
}
