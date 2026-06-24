import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { AssessmentQuestionsPayload, GuidedQuestion, QuestionDomain } from "./types";

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

function readableLabel(value: string) {
  return value.replace(/_/g, " ");
}

export function GuidedQuestionsPage({ assessmentId }: { assessmentId?: string } = {}) {
  // When embedded inside the Controls tab the assessment id is passed as a prop;
  // the standalone /assessments/:id/questions route still supplies it via the URL.
  const params = useParams();
  const id = assessmentId ?? params.id;
  const api = useApi();
  const { user } = useAuth();
  const canEditAssessment = Boolean(user?.permissions.includes("assessment.edit"));
  const [payload, setPayload] = useState<AssessmentQuestionsPayload | null>(null);
  const [activeDomainId, setActiveDomainId] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [navOpen, setNavOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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
      activeDomain.questions.find((question) => question.questionId === activeQuestionId) ??
      activeDomain.questions[0] ??
      null
    );
  }, [activeDomain, activeQuestionId]);

  const activeCategoryLabel = useMemo(() => {
    if (!activeQuestion) return "";
    return [activeQuestion.categoryId, activeQuestion.categoryTitle].filter(Boolean).join(" · ");
  }, [activeQuestion]);

  const flatQuestionList = useMemo(() => {
    if (!payload) return [] as Array<{ domain: QuestionDomain; question: GuidedQuestion }>;
    return payload.domains.flatMap((domain) =>
      domain.questions.map((question) => ({ domain, question }))
    );
  }, [payload]);

  const activeIndex = useMemo(() => {
    if (!activeQuestion) return -1;
    return flatQuestionList.findIndex((entry) => entry.question.questionId === activeQuestion.questionId);
  }, [flatQuestionList, activeQuestion]);

  const previousEntry = activeIndex > 0 ? flatQuestionList[activeIndex - 1] : null;
  const nextEntry = activeIndex >= 0 && activeIndex < flatQuestionList.length - 1 ? flatQuestionList[activeIndex + 1] : null;

  const progressSummary = useMemo(() => {
    const questions = payload?.domains.flatMap((domain) => domain.questions) ?? [];
    return {
      total: questions.length,
      answered: questions.filter((question) => question.answer?.answerState === "answered").length,
      followUp: questions.filter((question) => question.answer?.answerState === "needs_follow_up").length,
      evidenceGaps: questions.filter((question) => question.evidenceGap).length,
      lowConfidence: questions.filter((question) => question.answer?.confidenceLevel === "low").length
    };
  }, [payload]);

  const suggestions = useMemo<string[]>(
    () => activeQuestion?.suggestions ?? [],
    [activeQuestion?.questionId, activeQuestion?.suggestions]
  );

  const filteredDomains = useMemo(() => {
    if (!payload) return [] as QuestionDomain[];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return payload.domains;
    return payload.domains
      .map((domain) => ({
        ...domain,
        questions: domain.questions.filter((question) =>
          [question.code, question.question, question.categoryTitle ?? ""].some((text) =>
            text.toLowerCase().includes(query)
          )
        )
      }))
      .filter((domain) => domain.questions.length || domain.name.toLowerCase().includes(query));
  }, [payload, searchQuery]);

  async function load() {
    if (!id) return;
    const next = await api<AssessmentQuestionsPayload>(`/api/assessments/${id}/questions`);
    setPayload(next);
    const nextDomain = next.domains.find((domain) => domain.id === activeDomainId) ?? next.domains[0];
    const nextQuestion =
      nextDomain?.questions.find((question) => question.questionId === activeQuestionId) ??
      nextDomain?.questions[0];
    if (nextDomain) {
      setActiveDomainId(nextDomain.id);
      setExpandedDomains((current) => {
        if (current.has(nextDomain.id)) return current;
        const next = new Set(current);
        next.add(nextDomain.id);
        return next;
      });
    }
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

  function toggleDomainExpansion(domainId: string) {
    setExpandedDomains((current) => {
      const next = new Set(current);
      if (next.has(domainId)) next.delete(domainId);
      else next.add(domainId);
      return next;
    });
  }

  function selectQuestion(domainId: string, questionId: string) {
    setActiveDomainId(domainId);
    setActiveQuestionId(questionId);
    setExpandedDomains((current) => {
      if (current.has(domainId)) return current;
      const next = new Set(current);
      next.add(domainId);
      return next;
    });
  }

  async function persistAnswer() {
    if (!id || !activeQuestion) return false;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/questions/${activeQuestion.questionId}/answer`, {
        method: "PUT",
        body: JSON.stringify(form)
      });
      await load();
      setSaved("Saved");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save answer failed");
      return false;
    }
  }

  async function saveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistAnswer();
  }

  async function saveAndAdvance() {
    const ok = await persistAnswer();
    if (ok && nextEntry) selectQuestion(nextEntry.domain.id, nextEntry.question.questionId);
  }

  const coveragePercent = payload?.coverage.percentage ?? 0;
  const navWidthClass = navOpen ? "w-72 xl:w-80" : "w-12";

  return (
    <div className="flex min-h-[calc(100vh-44px-2rem)] min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-audity border border-audity-border bg-audity-panel px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-audity-primary">Guided Workflow</p>
          <h1 className="mt-0.5 text-lg font-semibold text-audity-text">
            {payload?.framework.name ?? "Framework"} · Questions
          </h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Stat label="Answered" value={`${progressSummary.answered}/${progressSummary.total}`} />
          <Stat label="Follow-up" value={progressSummary.followUp} tone="warning" />
          <Stat label="Gaps" value={progressSummary.evidenceGaps} tone="warning" />
          <Stat label="Low conf." value={progressSummary.lowConfidence} tone="error" />
          <div className="hidden min-w-[160px] xl:block">
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-audity-muted">
              <span>Coverage</span>
              <span>{coveragePercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-audity-page">
              <div className={`h-full ${progressColor(coveragePercent)}`} style={{ width: `${coveragePercent}%` }} />
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 gap-3">
        <aside
          className={`flex shrink-0 flex-col rounded-audity border border-audity-border bg-audity-panel transition-[width] duration-200 ${navWidthClass}`}
          aria-label="Question navigation"
        >
          <div className="flex items-center justify-between gap-2 border-b border-audity-border px-3 py-2">
            {navOpen ? (
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-audity border border-audity-border bg-audity-page px-2 text-xs text-audity-text outline-none focus:border-audity-primary"
                placeholder="Search controls"
                aria-label="Search controls"
              />
            ) : null}
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-audity border border-audity-borderStrong text-audity-secondary hover:border-audity-primary hover:text-audity-primary"
              onClick={() => setNavOpen((current) => !current)}
              aria-label={navOpen ? "Collapse navigation" : "Expand navigation"}
              aria-expanded={navOpen}
            >
              {navOpen ? "‹" : "›"}
            </button>
          </div>
          {navOpen ? (
            <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Domains and controls">
              {filteredDomains.map((domain) => {
                const expanded = expandedDomains.has(domain.id) || Boolean(searchQuery);
                const isActiveDomain = domain.id === activeDomain?.id;
                return (
                  <div key={domain.id} className="border-b border-audity-border last:border-b-0">
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-audity-panelAlt ${isActiveDomain ? "bg-audity-primaryActive/15" : ""}`}
                      onClick={() => toggleDomainExpansion(domain.id)}
                      aria-expanded={expanded}
                    >
                      <span className="text-xs text-audity-muted" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-audity-text" title={domain.name}>{domain.name}</span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="h-1 flex-1 overflow-hidden rounded-full bg-audity-page">
                            <span className={`block h-full ${progressColor(domain.coverage)}`} style={{ width: `${domain.coverage}%` }} />
                          </span>
                          <span className="text-[11px] text-audity-muted whitespace-nowrap">{domain.answeredControls}/{domain.totalControls}</span>
                        </span>
                      </span>
                    </button>
                    {expanded ? (
                      <ol className="border-t border-audity-border/70 bg-audity-page/30">
                        {domain.questions.map((question) => {
                          const isActiveQuestion = question.questionId === activeQuestion?.questionId;
                          const answered = question.answer?.answerState === "answered";
                          return (
                            <li key={question.questionId}>
                              <button
                                type="button"
                                className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-audity-panelAlt ${isActiveQuestion ? "bg-audity-primaryActive/30" : ""}`}
                                onClick={() => selectQuestion(domain.id, question.questionId)}
                                title={question.question}
                              >
                                <span
                                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${answered ? "border-audity-success bg-audity-success text-white" : question.evidenceGap ? "border-audity-warning text-audity-warning" : "border-audity-borderStrong text-audity-muted"}`}
                                  aria-hidden="true"
                                >
                                  <span className="text-[9px] font-bold">{answered ? "✓" : question.evidenceGap ? "!" : ""}</span>
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[11px] font-medium text-audity-primary">{question.code}</span>
                                  <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-audity-secondary">{question.question}</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    ) : null}
                  </div>
                );
              })}
              {!filteredDomains.length ? (
                <p className="px-4 py-6 text-center text-xs text-audity-muted">No matches</p>
              ) : null}
            </nav>
          ) : null}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {activeQuestion ? (
            <>
              <header className="rounded-audity border border-audity-border bg-audity-panel px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium tracking-wide text-audity-primary">
                    {activeDomain?.name}
                    {activeCategoryLabel ? <span className="ml-2 text-audity-muted">· {activeCategoryLabel}</span> : null}
                  </p>
                  <div className="flex shrink-0 items-center gap-1 text-xs text-audity-muted">
                    <span>{activeIndex >= 0 ? activeIndex + 1 : 0} / {flatQuestionList.length}</span>
                    <button
                      type="button"
                      className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-audity border border-audity-borderStrong text-audity-secondary disabled:opacity-40 hover:enabled:border-audity-primary hover:enabled:text-audity-primary"
                      onClick={() => previousEntry && selectQuestion(previousEntry.domain.id, previousEntry.question.questionId)}
                      disabled={!previousEntry}
                      aria-label="Previous control"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-audity border border-audity-borderStrong text-audity-secondary disabled:opacity-40 hover:enabled:border-audity-primary hover:enabled:text-audity-primary"
                      onClick={() => nextEntry && selectQuestion(nextEntry.domain.id, nextEntry.question.questionId)}
                      disabled={!nextEntry}
                      aria-label="Next control"
                    >
                      ›
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[11px] font-mono text-audity-muted">{activeQuestion.code}</p>
                <h2 className="mt-1 max-w-3xl text-xl font-medium leading-8 text-audity-text">
                  {activeQuestion.question}
                </h2>
                {activeQuestion.title && activeQuestion.title !== activeQuestion.question ? (
                  <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-audity-secondary">
                    {activeQuestion.title}
                  </p>
                ) : null}
                {activeQuestion.description && activeQuestion.description !== activeQuestion.title && activeQuestion.description !== activeQuestion.question ? (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-audity-secondary">
                    {activeQuestion.description}
                  </p>
                ) : null}
                {activeQuestion.categoryDescription ? (
                  <div className="mt-4 max-w-3xl rounded-audity border-l-2 border-audity-primary bg-audity-panelAlt/40 px-4 py-3 text-sm leading-6 text-audity-secondary">
                    <p className="mb-1 text-[11px] font-medium tracking-wide text-audity-primary">
                      Category context
                      {activeQuestion.categoryTitle ? <span className="ml-1 text-audity-muted">· {activeQuestion.categoryTitle}</span> : null}
                    </p>
                    <p>{activeQuestion.categoryDescription}</p>
                  </div>
                ) : null}
                {activeQuestion.evidenceExamples.length ? (
                  <div className="mt-4 max-w-3xl">
                    <p className="text-[11px] font-medium tracking-wide text-audity-muted">Evidence examples</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {activeQuestion.evidenceExamples.map((example) => (
                        <li key={example} className="rounded-audity border border-audity-borderStrong bg-audity-page px-2 py-0.5 text-xs text-audity-secondary">{example}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {activeQuestion.mappings.length ? (
                  <div className="mt-3 max-w-3xl">
                    <p className="text-[11px] font-medium tracking-wide text-audity-muted">Framework mappings</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {activeQuestion.mappings.map((mapping) => (
                        <li key={`${mapping.controlId}-${mapping.code}`} className="rounded-audity border border-audity-borderStrong bg-audity-page px-2 py-0.5 text-xs text-audity-secondary" title={mapping.title}>
                          <span className="font-semibold text-audity-primary">{mapping.framework}</span> {mapping.code}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {activeQuestion.source ? (
                  <p className="mt-3 text-[11px] text-audity-muted">Source: {activeQuestion.source}</p>
                ) : null}
                {activeQuestion.evidenceGap ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-audity border border-audity-warning bg-audity-warning/10 px-2.5 py-1 text-xs font-semibold text-audity-warning">
                    Evidence gap · low score without validated evidence
                  </div>
                ) : null}
              </header>

              <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <form
                  onSubmit={saveAnswer}
                  className="flex flex-col gap-4 rounded-audity border border-audity-border bg-audity-panel p-5"
                >
                  <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" disabled={!canEditAssessment}>
                    <FormField label="Score">
                      <select
                        className="audity-input"
                        value={form.score}
                        onChange={(event) => setForm({ ...form, score: Number(event.target.value) })}
                      >
                        {scoreOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Answer State">
                      <select
                        className="audity-input"
                        value={form.answerState}
                        onChange={(event) => setForm({ ...form, answerState: event.target.value })}
                      >
                        {answerStates.map((state) => <option key={state} value={state}>{readableLabel(state)}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Evidence Status">
                      <select
                        className="audity-input"
                        value={form.evidenceStatus}
                        onChange={(event) => setForm({ ...form, evidenceStatus: event.target.value })}
                      >
                        {evidenceStatuses.map((status) => <option key={status} value={status}>{readableLabel(status)}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Confidence">
                      <select
                        className="audity-input"
                        value={form.confidenceLevel}
                        onChange={(event) => setForm({ ...form, confidenceLevel: event.target.value })}
                      >
                        {confidenceLevels.map((level) => <option key={level} value={level}>{level}</option>)}
                      </select>
                    </FormField>
                  </fieldset>

                  <FormField label="Notes" hint="Explain the score, list the evidence reviewed, and link follow-up tasks.">
                    <textarea
                      className="min-h-[200px] w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm leading-6 text-audity-text outline-none focus:border-audity-primary disabled:cursor-not-allowed disabled:opacity-60"
                      value={form.notes}
                      disabled={!canEditAssessment}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    />
                  </FormField>

                  {canEditAssessment ? (
                    <div className="flex flex-wrap items-center gap-3 border-t border-audity-border pt-3">
                      <button className="audity-btn-primary" type="submit">Save answer</button>
                      <button
                        type="button"
                        className="audity-btn-secondary"
                        disabled={!nextEntry}
                        onClick={() => void saveAndAdvance()}
                      >
                        Save &amp; next →
                      </button>
                      {saved ? <span className="text-sm text-audity-success">{saved}</span> : null}
                    </div>
                  ) : null}
                </form>

                <HintBlocks question={activeQuestion} />
                <SuggestionsPanel suggestions={suggestions} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-audity border border-dashed border-audity-border bg-audity-panel py-20 text-center text-audity-muted">
              Select a control to start answering
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warning" | "error" }) {
  const toneClass = tone === "error" ? "text-audity-error" : tone === "warning" ? "text-audity-warning" : "text-audity-text";
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[11px] font-medium text-audity-muted">{label}</span>
      <span className={`text-base font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 text-xs font-medium tracking-wide text-audity-secondary">
      {label}
      <div className="mt-1.5 normal-case">{children}</div>
      {hint ? <span className="mt-1 block text-[11px] normal-case font-normal text-audity-muted">{hint}</span> : null}
    </label>
  );
}

type HintBlocksProps = { question: GuidedQuestion };

const HINT_STATE_STORAGE_KEY = "audity_question_hint_open";

function HintBlocks({ question }: HintBlocksProps) {
  const purpose = question.purpose?.trim() ?? "";
  const expected = question.expectedOutcome ?? [];
  const howTo = question.howTo ?? [];
  const crossRefs = question.crossReferences ?? [];
  const hasAny = Boolean(purpose) || expected.length > 0 || howTo.length > 0 || crossRefs.length > 0;
  const [openState, setOpenState] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return { purpose: true, expected: true, howTo: true, crossRefs: false };
    try {
      const raw = window.localStorage.getItem(HINT_STATE_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      // ignore corrupted state
    }
    return { purpose: true, expected: true, howTo: true, crossRefs: false };
  });

  function toggle(key: string) {
    setOpenState((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        window.localStorage.setItem(HINT_STATE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage may be unavailable in private mode
      }
      return next;
    });
  }

  if (!hasAny) return null;

  return (
    <aside className="flex shrink-0 flex-col gap-2">
      {purpose ? (
        <HintCard
          icon={<HintIcon name="why" />}
          title="Why this matters"
          open={openState.purpose !== false}
          onToggle={() => toggle("purpose")}
        >
          <p className="whitespace-pre-line text-sm leading-6 text-audity-secondary">{purpose}</p>
        </HintCard>
      ) : null}
      {expected.length > 0 ? (
        <HintCard
          icon={<HintIcon name="good" />}
          title="What good looks like"
          open={openState.expected !== false}
          onToggle={() => toggle("expected")}
        >
          <ul className="space-y-1.5 text-sm leading-6 text-audity-secondary">
            {expected.map((item, index) => (
              <li key={`${item.slice(0, 30)}-${index}`} className="border-l-2 border-audity-success pl-3">{item}</li>
            ))}
          </ul>
        </HintCard>
      ) : null}
      {howTo.length > 0 ? (
        <HintCard
          icon={<HintIcon name="howTo" />}
          title="How to satisfy this"
          open={openState.howTo !== false}
          onToggle={() => toggle("howTo")}
        >
          <ol className="space-y-2 text-sm leading-6 text-audity-secondary">
            {howTo.map((entry, index) => (
              <li key={`${entry.step.slice(0, 30)}-${index}`} className="flex gap-2">
                <span className="shrink-0 font-semibold text-audity-text">{index + 1}.</span>
                <div className="min-w-0">
                  <p className="text-audity-text">{entry.step}</p>
                  {entry.details ? <p className="mt-0.5 whitespace-pre-line text-xs text-audity-muted">{entry.details}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </HintCard>
      ) : null}
      {crossRefs.length > 0 ? (
        <HintCard
          icon={<HintIcon name="related" />}
          title="Related controls"
          open={openState.crossRefs === true}
          onToggle={() => toggle("crossRefs")}
        >
          <div className="flex flex-wrap gap-1.5">
            {crossRefs.map((ref) => (
              <span key={ref} className="rounded-full border border-audity-border bg-audity-page px-2 py-0.5 text-xs text-audity-secondary">
                {ref}
              </span>
            ))}
          </div>
        </HintCard>
      ) : null}
    </aside>
  );
}

function HintCard({ icon, title, open, onToggle, children }: {
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-audity border border-audity-border bg-audity-panel">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-audity-panelAlt"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-audity-muted" aria-hidden="true">{icon}</span>
          <span className="text-sm font-semibold text-audity-text">{title}</span>
        </span>
        <svg
          className={`h-4 w-4 text-audity-muted transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open ? <div className="border-t border-audity-border px-4 py-3">{children}</div> : null}
    </section>
  );
}

function HintIcon({ name }: { name: "why" | "good" | "howTo" | "related" }) {
  // Match the sidebar/menu icon style: 16px, currentColor stroke, no fill,
  // rounded line caps. Keeps the visual language consistent with the rest
  // of the app.
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "why" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
        </>
      ) : null}
      {name === "good" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.5 2.5L16 9.5" />
        </>
      ) : null}
      {name === "howTo" ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <line x1="8" y1="9" x2="16" y2="9" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </>
      ) : null}
      {name === "related" ? (
        <>
          <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
        </>
      ) : null}
    </svg>
  );
}

function SuggestionsPanel({ suggestions }: { suggestions: string[] }) {
  return (
    <aside className="flex min-h-0 flex-col rounded-audity border border-audity-border bg-audity-panel">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-audity-border px-4 py-3">
        <h3 className="text-sm font-semibold text-audity-text">Suggestions</h3>
        {suggestions.length ? (
          <span className="rounded-full bg-audity-page px-2 py-0.5 text-[10px] font-bold text-audity-secondary">{suggestions.length}</span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-6 text-audity-secondary">
        {suggestions.length ? (
          <ul className="space-y-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion} className="border-l-2 border-audity-primary pl-3">{suggestion}</li>
            ))}
          </ul>
        ) : (
          <p className="text-audity-muted">No suggestions defined for this control.</p>
        )}
      </div>
    </aside>
  );
}
