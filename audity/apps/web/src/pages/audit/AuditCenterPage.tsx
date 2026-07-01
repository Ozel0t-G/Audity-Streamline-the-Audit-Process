import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { PageSkeleton, SeverityBadge, WorkflowProgress, useConfirm, useToast, type WorkflowStep } from "../../components/ui";
import { disabledTitle } from "../../utils/permissionReasons";
import {
  Field,
  MiniStat,
  Panel,
  Pill,
  dateValue,
  numberValue,
  readableLabel as label,
  text,
  toneClass
} from "./auditPrimitives";

type AnyRecord = Record<string, unknown>;

type AuditControl = {
  assessmentQuestionId: string;
  questionId?: string | null;
  question?: string | null;
  domain?: string | null;
  controlCode?: string | null;
  controlTitle?: string | null;
  score?: number | null;
  answerState?: string | null;
  evidenceStatus?: string | null;
  confidenceLevel?: string | null;
  applicability?: string | null;
  applicabilityReason?: string | null;
  controlOwner?: string | null;
  reviewer?: string | null;
  reviewStatus?: string | null;
  controlCriticality?: string | null;
  maturityJustification?: string | null;
  evidenceQualityScore?: number | null;
  readinessStatus?: string | null;
  signoffStatus?: string | null;
  mappedEvidence?: number | null;
  contradiction?: boolean;
};

type AuditOverview = {
  assessment: AnyRecord;
  plan: AnyRecord;
  scopeItems: AnyRecord[];
  controls: AuditControl[];
  evidenceItems: AnyRecord[];
  evidenceMappings: AnyRecord[];
  evidenceRequests: AnyRecord[];
  findings: AnyRecord[];
  risks: AnyRecord[];
  interviews: AnyRecord[];
  samples: AnyRecord[];
  reportReviews: AnyRecord[];
  signoffs: AnyRecord[];
  history: AnyRecord[];
  statementOfApplicability: AnyRecord[];
  gaps: AnyRecord[];
  contradictions: AuditControl[];
  readinessScore: number;
  executiveSummary: string;
};

type Template = {
  id: string;
  name: string;
  description?: string;
  programType?: string;
};

const tabs = [
  "Overview",
  "Scope & Plan",
  "Controls & Evidence",
  "Findings & Remediation",
  "Audit Work",
  "Report & Sign-off",
  "Gaps & Pack"
];

function tabSlug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function tabFromSlug(slug: string | null): string {
  if (!slug) return tabs[0];
  return tabs.find((tab) => tabSlug(tab) === slug) ?? tabs[0];
}

const scopeTypes = ["system", "process", "supplier", "data_type", "location", "regulation", "other"];
const criticalities = ["low", "medium", "high", "critical"];
const reviewStatuses = ["draft", "ready_for_review", "changes_requested", "approved"];
const readinessStatuses = ["not_ready", "in_progress", "ready", "blocked"];
const lifecycleStatuses = ["draft", "confirmed", "agreed", "remediation_planned", "remediated", "verified", "closed"];
const responseStatuses = ["pending", "accepted", "remediation_planned", "rejected"];
const remediationStatuses = ["not_started", "planned", "in_progress", "implemented", "blocked"];
const retestStatuses = ["not_ready", "ready", "passed", "failed"];
const requestStatuses = ["open", "requested", "received", "validated", "closed", "cancelled"];
const reportStatuses = ["draft", "internal_review", "customer_review", "final", "approved"];

const emptyOverview: AuditOverview = {
  assessment: {},
  plan: {},
  scopeItems: [],
  controls: [],
  evidenceItems: [],
  evidenceMappings: [],
  evidenceRequests: [],
  findings: [],
  risks: [],
  interviews: [],
  samples: [],
  reportReviews: [],
  signoffs: [],
  history: [],
  statementOfApplicability: [],
  gaps: [],
  contradictions: [],
  readinessScore: 0,
  executiveSummary: ""
};


type AuditWorkflowCard = {
  title: string;
  description: string;
  tab: string;
  metric: string;
  actionLabel: string;
  onOpen?: () => void;
};

export function AuditCenterPage() {
  const { id } = useParams();
  const api = useApi();
  const { user } = useAuth();
  const canEdit = Boolean(user?.permissions.includes("assessment.edit"));
  const canApprove = Boolean(user?.permissions.includes("finding.approve"));
  const canReport = Boolean(user?.permissions.includes("report.export"));
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState(() => tabFromSlug(searchParams.get("tab")));
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(searchParams);
    next.set("tab", tabSlug(tab));
    setSearchParams(next, { replace: true });
  };
  useEffect(() => {
    const next = tabFromSlug(searchParams.get("tab"));
    if (next !== activeTab) setActiveTabState(next);
  }, [searchParams]);
  const [overview, setOverview] = useState<AuditOverview>(emptyOverview);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedControlId, setSelectedControlId] = useState("");
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  const [planForm, setPlanForm] = useState({
    programTemplateId: "",
    currentPhase: "Preparation",
    kickoffAt: "",
    fieldworkStart: "",
    fieldworkEnd: "",
    reportDueDate: "",
    closureDueDate: "",
    auditOwner: "",
    reviewer: "",
    readinessTarget: 85
  });
  const [scopeForm, setScopeForm] = useState({
    itemType: "system",
    name: "",
    description: "",
    inScope: true,
    criticality: "medium",
    rationale: ""
  });
  const [controlForm, setControlForm] = useState({
    applicability: "applicable",
    applicabilityReason: "",
    controlOwner: "",
    reviewer: "",
    reviewStatus: "draft",
    controlCriticality: "medium",
    maturityJustification: "",
    evidenceQualityScore: "" as string,
    readinessStatus: "not_ready"
  });
  const [mappingForm, setMappingForm] = useState({
    evidenceId: "",
    assessmentQuestionId: "",
    mappingType: "supports_control",
    qualityRelevance: 3,
    qualityCompleteness: 3,
    qualityFreshness: 3,
    qualityTrust: 3,
    notes: ""
  });
  const [requestForm, setRequestForm] = useState({
    assessmentQuestionId: "",
    title: "",
    description: "",
    owner: "",
    dueDate: "",
    status: "requested",
    portalVisibility: "customer"
  });
  const [findingForm, setFindingForm] = useState({
    lifecycleStatus: "draft",
    severityImpact: 3,
    severityLikelihood: 3,
    controlCriticality: "medium",
    evidenceConfidence: "medium",
    managementResponseStatus: "pending",
    managementResponse: "",
    managementOwner: "",
    remediationStatus: "not_started",
    remediationOwner: "",
    remediationDueDate: "",
    retestStatus: "not_ready",
    retestNotes: "",
    retestEvidenceId: ""
  });
  const [interviewForm, setInterviewForm] = useState({
    title: "",
    participants: "",
    interviewAt: "",
    notes: "",
    linkedQuestionId: "",
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
    statement: "I reviewed the audit record and approve this sign-off.",
    signerName: user?.email ?? ""
  });

  const selectedControl = useMemo(
    () => overview.controls.find((control) => control.assessmentQuestionId === selectedControlId) ?? overview.controls[0],
    [overview.controls, selectedControlId]
  );
  const selectedFinding = useMemo(
    () => overview.findings.find((finding) => text(finding.id) === selectedFindingId) ?? overview.findings[0],
    [overview.findings, selectedFindingId]
  );

  const mappingsForSelectedControl = useMemo(() => {
    if (!selectedControl) return [];
    return overview.evidenceMappings.filter((mapping) => text(mapping.assessmentQuestionId) === selectedControl.assessmentQuestionId);
  }, [overview.evidenceMappings, selectedControl]);

  const signoffsForSelectedControl = useMemo(() => {
    if (!selectedControl) return [];
    return overview.signoffs.filter((signoff) => text(signoff.entityType) === "control" && text(signoff.entityId) === selectedControl.assessmentQuestionId);
  }, [overview.signoffs, selectedControl]);

  // Only the latest load() may write state: changing the route `id` (or a
  // post-mutation reload racing the effect) must not let a slower earlier
  // response overwrite newer data. Mirrors the `let cancelled` guard used
  // elsewhere in the app.
  const loadSeqRef = useRef(0);
  async function load() {
    if (!id) return;
    const requestId = ++loadSeqRef.current;
    setError("");
    try {
      const [overviewPayload, templatePayload] = await Promise.all([
        api<AuditOverview>(`/api/assessments/${id}/audit-center`),
        api<{ templates: Template[] }>("/api/audit-program-templates")
      ]);
      if (loadSeqRef.current !== requestId) return;
      setOverview(overviewPayload);
      setTemplates(templatePayload.templates);
      if (!selectedControlId && overviewPayload.controls[0]) {
        setSelectedControlId(overviewPayload.controls[0].assessmentQuestionId);
      }
      if (!selectedFindingId && overviewPayload.findings[0]) {
        setSelectedFindingId(text(overviewPayload.findings[0].id));
      }
    } catch (loadError) {
      if (loadSeqRef.current !== requestId) return;
      setError(loadError instanceof Error ? loadError.message : "Audit Center could not be loaded");
    } finally {
      if (loadSeqRef.current === requestId) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    const plan = overview.plan ?? {};
    setPlanForm({
      programTemplateId: text(plan.programTemplateId),
      currentPhase: text(plan.currentPhase, "Preparation"),
      kickoffAt: dateValue(plan.kickoffAt),
      fieldworkStart: dateValue(plan.fieldworkStart),
      fieldworkEnd: dateValue(plan.fieldworkEnd),
      reportDueDate: dateValue(plan.reportDueDate),
      closureDueDate: dateValue(plan.closureDueDate),
      auditOwner: text(plan.auditOwner),
      reviewer: text(plan.reviewer),
      readinessTarget: numberValue(plan.readinessTarget, 85)
    });
  }, [overview.plan]);

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
      evidenceQualityScore: selectedControl.evidenceQualityScore === null || selectedControl.evidenceQualityScore === undefined ? "" : String(selectedControl.evidenceQualityScore),
      readinessStatus: text(selectedControl.readinessStatus, "not_ready")
    });
    setMappingForm((current) => ({
      ...current,
      assessmentQuestionId: selectedControl.assessmentQuestionId
    }));
    setRequestForm((current) => ({
      ...current,
      assessmentQuestionId: selectedControl.assessmentQuestionId,
      title: current.title || `Evidence for ${selectedControl.controlCode ?? selectedControl.questionId ?? "control"}`
    }));
  }, [selectedControl]);

  useEffect(() => {
    if (!selectedFinding) return;
    setFindingForm({
      lifecycleStatus: text(selectedFinding.lifecycleStatus, "draft"),
      severityImpact: numberValue(selectedFinding.severityImpact, 3),
      severityLikelihood: numberValue(selectedFinding.severityLikelihood, 3),
      controlCriticality: text(selectedFinding.controlCriticality, "medium"),
      evidenceConfidence: text(selectedFinding.evidenceConfidence, "medium"),
      managementResponseStatus: text(selectedFinding.managementResponseStatus, "pending"),
      managementResponse: text(selectedFinding.managementResponse),
      managementOwner: text(selectedFinding.managementOwner),
      remediationStatus: text(selectedFinding.remediationStatus, "not_started"),
      remediationOwner: text(selectedFinding.remediationOwner),
      remediationDueDate: dateValue(selectedFinding.remediationDueDate),
      retestStatus: text(selectedFinding.retestStatus, "not_ready"),
      retestNotes: text(selectedFinding.retestNotes),
      retestEvidenceId: text(selectedFinding.retestEvidenceId)
    });
  }, [selectedFinding]);

  const flashTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => {
    if (flashTimerRef.current !== undefined) {
      window.clearTimeout(flashTimerRef.current);
    }
  }, []);

  function flash(message: string) {
    setSaved(message);
    toast.success(message);
    if (flashTimerRef.current !== undefined) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      setSaved("");
      flashTimerRef.current = undefined;
    }, 3000);
  }

  async function submit(event: FormEvent, action: () => Promise<void>) {
    event.preventDefault();
    setError("");
    try {
      await action();
      await load();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Action failed";
      setError(message);
      toast.error(message);
    }
  }

  async function savePlan() {
    if (!id) return;
    await api(`/api/assessments/${id}/audit-center/plan`, {
      method: "PUT",
      body: JSON.stringify({
        ...planForm,
        programTemplateId: planForm.programTemplateId || null,
        kickoffAt: planForm.kickoffAt || null,
        fieldworkStart: planForm.fieldworkStart || null,
        fieldworkEnd: planForm.fieldworkEnd || null,
        reportDueDate: planForm.reportDueDate || null,
        closureDueDate: planForm.closureDueDate || null,
        readinessTarget: Number(planForm.readinessTarget)
      })
    });
    flash("Audit plan saved");
  }

  async function addScope() {
    if (!id) return;
    await api(`/api/assessments/${id}/audit-center/scope`, {
      method: "POST",
      body: JSON.stringify(scopeForm)
    });
    setScopeForm((current) => ({ ...current, name: "", description: "", rationale: "" }));
    flash("Scope item added");
  }

  async function toggleScope(item: AnyRecord) {
    if (!id) return;
    await api(`/api/assessments/${id}/audit-center/scope/${text(item.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ inScope: !Boolean(item.inScope) })
    });
    flash("Scope updated");
    await load();
  }

  async function deleteScope(item: AnyRecord) {
    if (!id) return;
    const ok = await confirm({
      title: "Delete scope item?",
      body: `"${text(item.name) || "This scope item"}" will be removed from the audit. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true
    });
    if (!ok) return;
    await api(`/api/assessments/${id}/audit-center/scope/${text(item.id)}`, { method: "DELETE" });
    flash("Scope item deleted");
    await load();
  }

  async function saveControl() {
    if (!id || !selectedControl) return;
    await api(`/api/assessments/${id}/audit-center/controls/${selectedControl.assessmentQuestionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...controlForm,
        evidenceQualityScore: controlForm.evidenceQualityScore === "" ? null : Math.max(0, Math.min(5, Number(controlForm.evidenceQualityScore)))
      })
    });
    flash("Control review saved");
  }

  async function createEvidenceRequest() {
    if (!id) return;
    await api(`/api/assessments/${id}/audit-center/evidence-requests`, {
      method: "POST",
      body: JSON.stringify({
        ...requestForm,
        assessmentQuestionId: requestForm.assessmentQuestionId || null,
        dueDate: requestForm.dueDate || null
      })
    });
    setRequestForm((current) => ({ ...current, title: "", description: "" }));
    flash("Evidence request created");
  }

  async function updateEvidenceRequestStatus(item: AnyRecord, status: string) {
    if (!id) return;
    await api(`/api/assessments/${id}/audit-center/evidence-requests/${text(item.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    flash("Evidence request updated");
    await load();
  }

  async function createEvidenceMapping() {
    if (!id) return;
    if (!mappingForm.evidenceId) throw new Error("Select an evidence item first");
    await api(`/api/assessments/${id}/audit-center/evidence-mappings`, {
      method: "POST",
      body: JSON.stringify({
        ...mappingForm,
        assessmentQuestionId: mappingForm.assessmentQuestionId || null,
        qualityRelevance: Number(mappingForm.qualityRelevance),
        qualityCompleteness: Number(mappingForm.qualityCompleteness),
        qualityFreshness: Number(mappingForm.qualityFreshness),
        qualityTrust: Number(mappingForm.qualityTrust)
      })
    });
    flash("Evidence mapped to control");
  }

  async function deleteEvidenceMapping(mapping: AnyRecord) {
    if (!id) return;
    const ok = await confirm({
      title: "Remove evidence mapping?",
      body: "The evidence link to this control will be removed. The evidence itself stays available.",
      confirmLabel: "Remove",
      destructive: true
    });
    if (!ok) return;
    await api(`/api/assessments/${id}/audit-center/evidence-mappings/${text(mapping.id)}`, { method: "DELETE" });
    flash("Evidence mapping removed");
    await load();
  }

  async function updateFinding() {
    if (!id || !selectedFinding) return;
    await api(`/api/assessments/${id}/audit-center/findings/${text(selectedFinding.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...findingForm,
        severityImpact: Number(findingForm.severityImpact),
        severityLikelihood: Number(findingForm.severityLikelihood),
        remediationDueDate: findingForm.remediationDueDate || null,
        retestEvidenceId: findingForm.retestEvidenceId || null
      })
    });
    flash("Finding audit workflow saved");
  }

  async function createInterview() {
    if (!id) return;
    await api(`/api/assessments/${id}/audit-center/interviews`, {
      method: "POST",
      body: JSON.stringify({
        ...interviewForm,
        interviewAt: interviewForm.interviewAt || null,
        linkedQuestionId: interviewForm.linkedQuestionId || null
      })
    });
    setInterviewForm((current) => ({ ...current, title: "", notes: "", followUp: "" }));
    flash("Interview note saved");
  }

  async function createSample() {
    if (!id) return;
    await api(`/api/assessments/${id}/audit-center/samples`, {
      method: "POST",
      body: JSON.stringify({
        ...sampleForm,
        populationSize: Number(sampleForm.populationSize),
        sampleSize: Number(sampleForm.sampleSize),
        selectedItems: sampleForm.selectedItems.split("\n").map((item) => item.trim()).filter(Boolean)
      })
    });
    setSampleForm((current) => ({ ...current, name: "", selectedItems: "", resultSummary: "" }));
    flash("Sample saved");
  }

  async function createReportReview() {
    if (!id) return;
    await api(`/api/assessments/${id}/audit-center/report-reviews`, {
      method: "POST",
      body: JSON.stringify({
        ...reportForm,
        dueDate: reportForm.dueDate || null
      })
    });
    setReportForm((current) => ({ ...current, summary: "" }));
    flash("Report review step saved");
  }

  async function createSignoff() {
    if (!id) return;
    const entityId =
      signoffForm.entityType === "control"
        ? selectedControl?.assessmentQuestionId
        : signoffForm.entityType === "finding"
          ? text(selectedFinding?.id)
          : id;
    await api(`/api/assessments/${id}/audit-center/signoffs`, {
      method: "POST",
      body: JSON.stringify({
        ...signoffForm,
        entityId: signoffForm.entityId || entityId || id
      })
    });
    flash("Sign-off recorded");
  }

  async function downloadEvidencePack() {
    if (!id) return;
    setError("");
    try {
      const payload = await api<{ pack: AnyRecord }>(`/api/assessments/${id}/audit-center/evidence-pack`);
      const blob = new Blob([JSON.stringify(payload.pack, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audity-evidence-pack-${id}.json`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      flash("Evidence pack generated");
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : "Evidence pack failed");
    }
  }

  const scoreTone = overview.readinessScore >= 75 ? "bg-audity-success" : overview.readinessScore >= 45 ? "bg-audity-warning" : "bg-audity-error";

  const workflowSteps = useMemo<WorkflowStep<string>[]>(() => {
    const planSet = Boolean(overview.plan && Object.values(overview.plan).some((value) => text(value as unknown).trim()));
    const scopeDone = overview.scopeItems.length > 0 && planSet;
    const controlsDone = overview.controls.length > 0 && overview.controls.every((control) => !["draft", ""].includes(text(control.reviewStatus, "")));
    const findingsDone = overview.findings.length > 0 && overview.findings.every((finding) => ["closed", "verified"].includes(text(finding.lifecycleStatus, "")) || text(finding.status) === "dismissed");
    const auditWorkDone = overview.interviews.length > 0 && overview.samples.length > 0;
    const reportDone = overview.signoffs.some((signoff) => text(signoff.entityType) === "assessment");
    const packDone = overview.statementOfApplicability.length > 0;
    const computed: Array<{ key: string; done: boolean }> = [
      { key: "Overview", done: scopeDone || controlsDone },
      { key: "Scope & Plan", done: scopeDone },
      { key: "Controls & Evidence", done: controlsDone },
      { key: "Findings & Remediation", done: findingsDone },
      { key: "Audit Work", done: auditWorkDone },
      { key: "Report & Sign-off", done: reportDone },
      { key: "Gaps & Pack", done: packDone }
    ];
    return computed.map(({ key, done }) => ({
      key,
      label: key,
      status: key === activeTab ? "current" : done ? "done" : "todo",
      hint: done ? "Complete" : key === activeTab ? "Currently editing" : "Not started"
    }));
  }, [overview, activeTab]);
  const selectedTemplate = templates.find((template) => template.id === planForm.programTemplateId);
  const controlCount = overview.controls.length;
  const reviewedControlCount = overview.controls.filter((control) => !["draft", ""].includes(text(control.reviewStatus, ""))).length;
  const approvedControlCount = overview.controls.filter((control) => ["approved", "signed"].includes(text(control.reviewStatus)) || text(control.signoffStatus) === "signed").length;
  const controlsWithEvidence = overview.controls.filter((control) => numberValue(control.mappedEvidence) > 0).length;
  const controlsWithJustification = overview.controls.filter((control) => text(control.maturityJustification).trim()).length;
  const evidenceQualityScores = overview.controls.map((control) => numberValue(control.evidenceQualityScore)).filter((score) => score > 0);
  const averageEvidenceQuality = evidenceQualityScores.length
    ? (evidenceQualityScores.reduce((total, score) => total + score, 0) / evidenceQualityScores.length).toFixed(1)
    : "0.0";
  const openFindingCount = overview.findings.filter((finding) => text(finding.status) !== "dismissed" && !["closed", "verified"].includes(text(finding.lifecycleStatus, "draft"))).length;
  const highSeverityFindingCount = overview.findings.filter((finding) => ["high", "critical"].includes(text(finding.calculatedSeverity ?? finding.priority))).length;
  const activeRemediationCount = overview.findings.filter((finding) => ["planned", "in_progress", "blocked"].includes(text(finding.remediationStatus))).length;
  const readyRetestCount = overview.findings.filter((finding) => ["ready", "failed"].includes(text(finding.retestStatus))).length;
  const openRequestCount = overview.evidenceRequests.filter((request) => !["closed", "cancelled"].includes(text(request.status, "open"))).length;
  const latestReportStatus = text(overview.reportReviews[0]?.status, "No review");

  function openWorkflowTab(tab: string) {
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      document.getElementById("audit-center-workspace")?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const workflowCards: AuditWorkflowCard[] = [
    {
      title: "Audit Scope Builder",
      description: "Define systems, processes, suppliers, locations, and regulations that are in or out of audit scope.",
      tab: "Scope & Plan",
      metric: `${overview.scopeItems.length} scope items`,
      actionLabel: "Open scope"
    },
    {
      title: "Audit Planning Page",
      description: "Maintain the audit owner, reviewer, calendar, target readiness, and selected audit program template.",
      tab: "Scope & Plan",
      metric: text(overview.plan.currentPhase, "Needs plan"),
      actionLabel: "Open planning"
    },
    {
      title: "Control-by-Control Audit View",
      description: "Review each control, assign owners, set applicability, and document the audit decision.",
      tab: "Controls & Evidence",
      metric: `${reviewedControlCount}/${controlCount} reviewed`,
      actionLabel: "Open controls"
    },
    {
      title: "Evidence Quality Scoring",
      description: "Score relevance, completeness, freshness, and trust so weak evidence is visible before reporting.",
      tab: "Controls & Evidence",
      metric: `${averageEvidenceQuality}/5 avg`,
      actionLabel: "Open scoring"
    },
    {
      title: "Evidence-to-Control Mapping",
      description: "Connect uploaded evidence to controls and remove mappings that no longer support the audit record.",
      tab: "Controls & Evidence",
      metric: `${controlsWithEvidence}/${controlCount} controls mapped`,
      actionLabel: "Open mapping"
    },
    {
      title: "Audit Trail per Control",
      description: "Review sign-offs and recent activity so every control decision has traceable history.",
      tab: "Controls & Evidence",
      metric: `${overview.history.length} events`,
      actionLabel: "Open trail"
    },
    {
      title: "Reviewer Workflow",
      description: "Move controls from draft to review and approval with clear ownership.",
      tab: "Controls & Evidence",
      metric: `${approvedControlCount}/${controlCount} approved`,
      actionLabel: "Open reviews"
    },
    {
      title: "Finding Lifecycle",
      description: "Select a finding and drive it from draft through remediation, verification, and closure.",
      tab: "Findings & Remediation",
      metric: `${openFindingCount} open`,
      actionLabel: "Open findings",
      onOpen: () => {
        if (overview.findings[0]) setSelectedFindingId(text(overview.findings[0].id));
        openWorkflowTab("Findings & Remediation");
      }
    },
    {
      title: "Finding Severity Matrix",
      description: "Calculate severity from impact, likelihood, criticality, and evidence confidence.",
      tab: "Findings & Remediation",
      metric: `${highSeverityFindingCount} high/critical`,
      actionLabel: "Open severity"
    },
    {
      title: "Management Response",
      description: "Capture the owner response, acceptance decision, and response notes for each finding.",
      tab: "Findings & Remediation",
      metric: `${overview.findings.filter((finding) => text(finding.managementResponseStatus) !== "pending").length} responded`,
      actionLabel: "Open response"
    },
    {
      title: "Remediation Tracking",
      description: "Track remediation owner, due date, status, and blocked work until the finding is ready to verify.",
      tab: "Findings & Remediation",
      metric: `${activeRemediationCount} active`,
      actionLabel: "Open remediation"
    },
    {
      title: "Re-Test Workflow",
      description: "Link re-test evidence and record whether the remediation passed, failed, or is not ready.",
      tab: "Findings & Remediation",
      metric: `${readyRetestCount} ready/failed`,
      actionLabel: "Open re-test"
    },
    {
      title: "Audit Sampling",
      description: "Define populations, sample sizes, selected items, selection method, and test results.",
      tab: "Audit Work",
      metric: `${overview.samples.length} samples`,
      actionLabel: "Open samples"
    },
    {
      title: "Interview Notes",
      description: "Record interview participants, notes, follow-ups, and the linked control context.",
      tab: "Audit Work",
      metric: `${overview.interviews.length} notes`,
      actionLabel: "Open interviews"
    },
    {
      title: "Audit Program Templates",
      description: "Use reusable audit program templates to start planning without rebuilding the structure every time.",
      tab: "Scope & Plan",
      metric: `${templates.length} templates`,
      actionLabel: "Open templates"
    },
    {
      title: "Control Maturity Justification",
      description: "Document why a control score or maturity decision is defensible for review and reporting.",
      tab: "Controls & Evidence",
      metric: `${controlsWithJustification}/${controlCount} justified`,
      actionLabel: "Open justification"
    },
    {
      title: "Contradiction Detection",
      description: "Jump to controls that look mature but still miss mapped or received evidence.",
      tab: "Controls & Evidence",
      metric: `${overview.contradictions.length} checks`,
      actionLabel: "Open checks",
      onOpen: () => {
        if (overview.contradictions[0]) setSelectedControlId(overview.contradictions[0].assessmentQuestionId);
        openWorkflowTab("Controls & Evidence");
      }
    },
    {
      title: "Evidence Request Portal",
      description: "Create customer-facing evidence requests and follow their status until they are closed.",
      tab: "Controls & Evidence",
      metric: `${openRequestCount} open requests`,
      actionLabel: "Open requests"
    },
    {
      title: "Audit Readiness Score",
      description: "Monitor the combined readiness score from reviews, evidence mapping, findings, and report state.",
      tab: "Overview",
      metric: `${overview.readinessScore}% ready`,
      actionLabel: "View score"
    },
    {
      title: "Report Review Workflow",
      description: "Track internal and customer report review steps before the final sign-off.",
      tab: "Report & Sign-off",
      metric: latestReportStatus,
      actionLabel: "Open report"
    },
    {
      title: "Executive Summary Generator",
      description: "Use the live audit summary generated from controls, findings, evidence, and report status.",
      tab: "Overview",
      metric: "Live summary",
      actionLabel: "View summary"
    },
    {
      title: "Statement of Applicability",
      description: "Review applicability, ownership, evidence count, review status, and sign-off per control.",
      tab: "Gaps & Pack",
      metric: `${overview.statementOfApplicability.length} rows`,
      actionLabel: "Open SoA"
    },
    {
      title: "Gap Register",
      description: "Review automatically detected control, evidence, and process gaps before closing the audit.",
      tab: "Gaps & Pack",
      metric: `${overview.gaps.length} gaps`,
      actionLabel: "Open gaps"
    },
    {
      title: "Audit Evidence Pack",
      description: "Generate the export package with summary, SoA, controls, evidence mappings, findings, and sign-offs.",
      tab: "Gaps & Pack",
      metric: `${overview.evidenceMappings.length} mappings`,
      actionLabel: "Open pack"
    },
    {
      title: "Auditor Sign-off",
      description: "Create tamper-evident sign-off records for assessments, controls, findings, or reports.",
      tab: "Report & Sign-off",
      metric: `${overview.signoffs.length} sign-offs`,
      actionLabel: "Open sign-off"
    }
  ];

  if (loading) {
    return (
      <div id="audit-center-workspace" className="min-w-0">
        <PageSkeleton cards={4} showTable />
      </div>
    );
  }

  return (
    <div id="audit-center-workspace" className="h-[calc(100vh-76px)] min-w-0 overflow-y-auto pr-1">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-audity-primary">Audit Center</p>
          <h1 className="mt-1 text-2xl font-semibold text-audity-text">{text(overview.assessment.name, "Assessment audit workspace")}</h1>
          <p className="mt-1 text-sm text-audity-muted">{text(overview.assessment.customerName)} · {text(overview.assessment.framework)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved ? <span className="rounded-audity border border-audity-success px-3 py-1.5 text-sm text-audity-success">{saved}</span> : null}
          <button className="audity-btn-secondary" type="button" onClick={() => void load()}>Refresh</button>
        </div>
      </div>

      {error ? <div className="mb-3 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}

      <div className="mb-4 rounded-audity border border-audity-border bg-audity-panel/40 p-3">
        <WorkflowProgress
          steps={workflowSteps}
          onSelect={(key) => setActiveTab(key)}
        />
      </div>

      <div className="mb-4 overflow-x-auto border-b border-audity-border">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`rounded-t-audity px-3 py-2 text-sm font-semibold ${activeTab === tab ? "bg-audity-primary text-white" : "text-audity-secondary hover:bg-audity-panel hover:text-audity-text"}`}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? "page" : undefined}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Overview" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Readiness" value={`${overview.readinessScore}%`} />
            <MiniStat label="Controls" value={overview.controls.length} />
            <MiniStat label="Open gaps" value={overview.gaps.length} />
            <MiniStat label="Open findings" value={overview.findings.filter((finding) => text(finding.status) !== "dismissed" && !["closed", "verified"].includes(text(finding.lifecycleStatus, "draft"))).length} />
          </div>
          <Panel title="Executive Summary" subtitle="Generated from control reviews, evidence mappings, findings, and report status.">
            <div className="mb-4 h-2 rounded-full bg-audity-page">
              <div className={`h-2 rounded-full ${scoreTone}`} style={{ width: `${overview.readinessScore}%` }} />
            </div>
            <p className="text-sm leading-6 text-audity-secondary">{overview.executiveSummary}</p>
          </Panel>
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Panel title="Audit Workflow Launcher" subtitle="Click a card to open the matching audit workspace. Each card shows the current audit state, not just a feature name.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {workflowCards.map((card, index) => (
                  <button
                    key={card.title}
                    className="group flex min-h-[142px] w-full flex-col rounded-audity border border-audity-border bg-audity-page px-3 py-3 text-left transition hover:border-audity-primary hover:bg-audity-primaryActive/10 focus:outline-none focus:ring-2 focus:ring-audity-primary/60"
                    type="button"
                    title={`${card.title}: ${card.description}`}
                    onClick={card.onOpen ?? (() => openWorkflowTab(card.tab))}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-audity-primary">{String(index + 1).padStart(2, "0")}</span>
                      <span className="rounded-audity border border-audity-borderStrong px-2 py-0.5 text-xs font-semibold text-audity-secondary">{card.metric}</span>
                    </span>
                    <span className="mt-2 text-sm font-semibold text-audity-text">{card.title}</span>
                    <span className="mt-1 line-clamp-3 text-xs leading-5 text-audity-muted">{card.description}</span>
                    <span className="mt-auto pt-3 text-xs font-semibold text-audity-primary group-hover:underline">{card.actionLabel}</span>
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Contradiction Detection" subtitle="Controls that look mature but still miss mapped or received evidence.">
              <div className="space-y-2">
                {overview.contradictions.slice(0, 8).map((control) => (
                  <button
                    key={control.assessmentQuestionId}
                    className="w-full rounded-audity border border-audity-warning/70 bg-audity-page px-3 py-2 text-left text-sm hover:border-audity-warning"
                    type="button"
                    onClick={() => {
                      setSelectedControlId(control.assessmentQuestionId);
                      setActiveTab("Controls & Evidence");
                    }}
                  >
                    <span className="block font-semibold text-audity-warning">{control.controlCode ?? control.questionId}</span>
                    <span className="text-audity-secondary">{control.controlTitle ?? control.question}</span>
                  </button>
                ))}
                {!overview.contradictions.length ? <p className="text-sm text-audity-muted">No contradictions detected.</p> : null}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {activeTab === "Scope & Plan" ? (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Audit Planning" subtitle="Select a program template and maintain the audit calendar.">
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event, savePlan)}>
              <Field label="Program template" wide>
                <select className="audity-input" value={planForm.programTemplateId} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, programTemplateId: event.target.value })}>
                  <option value="">No template selected</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </Field>
              {selectedTemplate ? <p className="sm:col-span-2 text-sm text-audity-muted">{selectedTemplate.description}</p> : null}
              <Field label="Current phase">
                <input className="audity-input" value={planForm.currentPhase} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, currentPhase: event.target.value })} />
              </Field>
              <Field label="Readiness target">
                <input className="audity-input" type="number" min={1} max={100} value={planForm.readinessTarget} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, readinessTarget: Number(event.target.value) })} />
              </Field>
              <Field label="Audit owner">
                <input className="audity-input" value={planForm.auditOwner} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, auditOwner: event.target.value })} />
              </Field>
              <Field label="Reviewer">
                <input className="audity-input" value={planForm.reviewer} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, reviewer: event.target.value })} />
              </Field>
              <Field label="Kickoff">
                <input className="audity-input" type="date" value={planForm.kickoffAt} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, kickoffAt: event.target.value })} />
              </Field>
              <Field label="Fieldwork start">
                <input className="audity-input" type="date" value={planForm.fieldworkStart} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, fieldworkStart: event.target.value })} />
              </Field>
              <Field label="Fieldwork end">
                <input className="audity-input" type="date" value={planForm.fieldworkEnd} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, fieldworkEnd: event.target.value })} />
              </Field>
              <Field label="Report due">
                <input className="audity-input" type="date" value={planForm.reportDueDate} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, reportDueDate: event.target.value })} />
              </Field>
              <Field label="Closure due">
                <input className="audity-input" type="date" value={planForm.closureDueDate} disabled={!canEdit} onChange={(event) => setPlanForm({ ...planForm, closureDueDate: event.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <button className="audity-btn-primary" type="submit" disabled={!canEdit} aria-disabled={!canEdit} title={disabledTitle(canEdit, "edit")}>Save plan</button>
              </div>
            </form>
          </Panel>

          <Panel title="Audit Scope Builder" subtitle="Add in-scope and out-of-scope systems, processes, suppliers, and regulations.">
            <form className="mb-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event, addScope)}>
              <Field label="Type">
                <select className="audity-input" value={scopeForm.itemType} disabled={!canEdit} onChange={(event) => setScopeForm({ ...scopeForm, itemType: event.target.value })}>
                  {scopeTypes.map((item) => <option key={item} value={item}>{label(item)}</option>)}
                </select>
              </Field>
              <Field label="Criticality">
                <select className="audity-input" value={scopeForm.criticality} disabled={!canEdit} onChange={(event) => setScopeForm({ ...scopeForm, criticality: event.target.value })}>
                  {criticalities.map((item) => <option key={item} value={item}>{label(item)}</option>)}
                </select>
              </Field>
              <Field label="Name" wide required>
                <input className="audity-input" value={scopeForm.name} disabled={!canEdit} required aria-required="true" onChange={(event) => setScopeForm({ ...scopeForm, name: event.target.value })} />
              </Field>
              <Field label="Description" wide>
                <textarea className="audity-input min-h-20" value={scopeForm.description} disabled={!canEdit} onChange={(event) => setScopeForm({ ...scopeForm, description: event.target.value })} />
              </Field>
              <Field label="Rationale" wide>
                <textarea className="audity-input min-h-20" value={scopeForm.rationale} disabled={!canEdit} onChange={(event) => setScopeForm({ ...scopeForm, rationale: event.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-audity-secondary">
                <input type="checkbox" checked={scopeForm.inScope} disabled={!canEdit} onChange={(event) => setScopeForm({ ...scopeForm, inScope: event.target.checked })} />
                In scope
              </label>
              <button className="audity-btn-primary justify-self-start" type="submit" disabled={!canEdit} aria-disabled={!canEdit} title={disabledTitle(canEdit, "edit")}>Add scope item</button>
            </form>
            <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
              {overview.scopeItems.map((item) => (
                <div key={text(item.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{text(item.name)}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-audity-muted">{label(item.itemType)}</span>
                        <SeverityBadge level={text(item.criticality, "medium")} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="audity-btn-secondary px-2 py-1 text-xs" type="button" disabled={!canEdit} onClick={() => void toggleScope(item)}>{item.inScope ? "Move out" : "Move in"}</button>
                      <button className="audity-btn-secondary px-2 py-1 text-xs" type="button" disabled={!canEdit} onClick={() => void deleteScope(item)}>Delete</button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-audity-secondary">{text(item.description, "No description")}</p>
                </div>
              ))}
              {!overview.scopeItems.length ? <p className="text-sm text-audity-muted">No scope items yet.</p> : null}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "Controls & Evidence" ? (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
          <Panel title="Controls" subtitle="Select a control and review it.">
            <div className="max-h-[calc(100vh-230px)] space-y-2 overflow-y-auto pr-1">
              {overview.controls.map((control) => (
                <button
                  key={control.assessmentQuestionId}
                  className={`w-full rounded-audity border px-3 py-2 text-left hover:border-audity-primary ${selectedControl?.assessmentQuestionId === control.assessmentQuestionId ? "border-audity-primary bg-audity-primaryActive/20" : "border-audity-border bg-audity-page"}`}
                  type="button"
                  onClick={() => setSelectedControlId(control.assessmentQuestionId)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-audity-primary">{control.controlCode ?? control.questionId}</span>
                    {control.contradiction ? <span className="text-xs font-semibold text-audity-warning">Check</span> : null}
                  </div>
                  <p className="mt-1 text-sm font-semibold">{control.controlTitle ?? control.question}</p>
                  <p className="mt-1 text-xs text-audity-muted">{label(control.reviewStatus)} · evidence {control.mappedEvidence ?? 0}</p>
                </button>
              ))}
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel title={selectedControl ? text(selectedControl.controlTitle ?? selectedControl.question, "Control review") : "Control review"} subtitle={selectedControl ? `${selectedControl.controlCode ?? selectedControl.questionId ?? "Control"} · ${text(selectedControl.domain, "No domain")}` : undefined}>
              {selectedControl ? (
                <form className="grid gap-3 lg:grid-cols-2" onSubmit={(event) => void submit(event, saveControl)}>
                  <Field label="Applicability">
                    <select className="audity-input" value={controlForm.applicability} disabled={!canEdit} onChange={(event) => setControlForm({ ...controlForm, applicability: event.target.value })}>
                      <option value="applicable">Applicable</option>
                      <option value="partially_applicable">Partially applicable</option>
                      <option value="not_applicable">Not applicable</option>
                    </select>
                  </Field>
                  <Field label="Review status">
                    <select className="audity-input" value={controlForm.reviewStatus} disabled={!canEdit} onChange={(event) => setControlForm({ ...controlForm, reviewStatus: event.target.value })}>
                      {reviewStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}
                    </select>
                  </Field>
                  <Field label="Owner">
                    <input className="audity-input" value={controlForm.controlOwner} disabled={!canEdit} onChange={(event) => setControlForm({ ...controlForm, controlOwner: event.target.value })} />
                  </Field>
                  <Field label="Reviewer">
                    <input className="audity-input" value={controlForm.reviewer} disabled={!canEdit} onChange={(event) => setControlForm({ ...controlForm, reviewer: event.target.value })} />
                  </Field>
                  <Field label="Control criticality">
                    <select className="audity-input" value={controlForm.controlCriticality} disabled={!canEdit} onChange={(event) => setControlForm({ ...controlForm, controlCriticality: event.target.value })}>
                      {criticalities.map((item) => <option key={item} value={item}>{label(item)}</option>)}
                    </select>
                  </Field>
                  <Field label="Readiness status">
                    <select className="audity-input" value={controlForm.readinessStatus} disabled={!canEdit} onChange={(event) => setControlForm({ ...controlForm, readinessStatus: event.target.value })}>
                      {readinessStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}
                    </select>
                  </Field>
                  <Field label="Evidence quality score" hint="Scale 0–5: leave empty until rated. 0 = none, 1 = anecdotal, 3 = documented, 5 = independently verified.">
                    <input
                      className="audity-input"
                      type="number"
                      min={0}
                      max={5}
                      step={1}
                      placeholder="Not yet rated"
                      value={controlForm.evidenceQualityScore}
                      disabled={!canEdit}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw === "") {
                          setControlForm({ ...controlForm, evidenceQualityScore: "" });
                          return;
                        }
                        const clamped = Math.max(0, Math.min(5, Number(raw)));
                        setControlForm({ ...controlForm, evidenceQualityScore: String(clamped) });
                      }}
                    />
                  </Field>
                  <Field label="Applicability reason" wide hint="Explain why this control applies (or doesn't) to the assessment scope. Required by most frameworks for the Statement of Applicability.">
                    <textarea className="audity-input min-h-20" value={controlForm.applicabilityReason} disabled={!canEdit} onChange={(event) => setControlForm({ ...controlForm, applicabilityReason: event.target.value })} />
                  </Field>
                  <Field label="Maturity justification" wide hint="Describe evidence and observations that justify the readiness status. Auditor leads will see this during sign-off.">
                    <textarea className="audity-input min-h-24" value={controlForm.maturityJustification} disabled={!canEdit} onChange={(event) => setControlForm({ ...controlForm, maturityJustification: event.target.value })} />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
                    <button className="audity-btn-primary" type="submit" disabled={!canEdit} aria-disabled={!canEdit} title={disabledTitle(canEdit, "edit")}>Save control review</button>
                    <Pill value={selectedControl.signoffStatus ?? "not_signed"} />
                    <span className="text-sm text-audity-muted">{mappingsForSelectedControl.length} mapped evidence item(s)</span>
                  </div>
                </form>
              ) : <p className="text-sm text-audity-muted">No control selected.</p>}
            </Panel>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Evidence Mapping" subtitle="Link uploaded evidence to the selected control and rate its quality.">
                <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event, createEvidenceMapping)}>
                  <Field label="Evidence item" wide>
                    <select className="audity-input" value={mappingForm.evidenceId} disabled={!canEdit || !overview.evidenceItems.length} onChange={(event) => setMappingForm({ ...mappingForm, evidenceId: event.target.value })}>
                      <option value="">Select evidence</option>
                      {overview.evidenceItems.map((item) => <option key={text(item.id)} value={text(item.id)}>{text(item.fileName ?? item.title ?? item.id)}</option>)}
                    </select>
                  </Field>
                  <Field label="Mapping type">
                    <input className="audity-input" value={mappingForm.mappingType} disabled={!canEdit} onChange={(event) => setMappingForm({ ...mappingForm, mappingType: event.target.value })} />
                  </Field>
                  <Field label="Relevance">
                    <input className="audity-input" type="number" min={1} max={5} value={mappingForm.qualityRelevance} disabled={!canEdit} onChange={(event) => setMappingForm({ ...mappingForm, qualityRelevance: Number(event.target.value) })} />
                  </Field>
                  <Field label="Completeness">
                    <input className="audity-input" type="number" min={1} max={5} value={mappingForm.qualityCompleteness} disabled={!canEdit} onChange={(event) => setMappingForm({ ...mappingForm, qualityCompleteness: Number(event.target.value) })} />
                  </Field>
                  <Field label="Freshness">
                    <input className="audity-input" type="number" min={1} max={5} value={mappingForm.qualityFreshness} disabled={!canEdit} onChange={(event) => setMappingForm({ ...mappingForm, qualityFreshness: Number(event.target.value) })} />
                  </Field>
                  <Field label="Trust">
                    <input className="audity-input" type="number" min={1} max={5} value={mappingForm.qualityTrust} disabled={!canEdit} onChange={(event) => setMappingForm({ ...mappingForm, qualityTrust: Number(event.target.value) })} />
                  </Field>
                  <Field label="Notes" wide>
                    <textarea className="audity-input min-h-20" value={mappingForm.notes} disabled={!canEdit} onChange={(event) => setMappingForm({ ...mappingForm, notes: event.target.value })} />
                  </Field>
                  <button
                    className="audity-btn-primary justify-self-start"
                    type="submit"
                    disabled={!canEdit || !overview.evidenceItems.length}
                    aria-disabled={!canEdit || !overview.evidenceItems.length}
                    title={
                      !canEdit
                        ? disabledTitle(canEdit, "edit")
                        : !overview.evidenceItems.length
                        ? "Upload evidence first under Evidence & Reports."
                        : undefined
                    }
                  >Map evidence</button>
                </form>
                <div className="mt-4 space-y-2">
                  {mappingsForSelectedControl.map((mapping) => (
                    <div key={text(mapping.id)} className="flex items-center justify-between gap-2 rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm">
                      <span>{text(overview.evidenceItems.find((item) => text(item.id) === text(mapping.evidenceId))?.fileName ?? mapping.evidenceId)}</span>
                      <div className="flex items-center gap-2">
                        <Pill value={mapping.qualityScore === null || mapping.qualityScore === undefined || mapping.qualityScore === "" ? "quality —" : `quality ${text(mapping.qualityScore)}`} />
                        <button className="audity-btn-secondary px-2 py-1 text-xs" type="button" disabled={!canEdit} onClick={() => void deleteEvidenceMapping(mapping)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {!mappingsForSelectedControl.length ? <p className="text-sm text-audity-muted">No evidence is mapped to this control yet.</p> : null}
                </div>
              </Panel>

              <Panel title="Evidence Request Portal" subtitle="Create customer-facing evidence requests and track request status.">
                <form className="grid gap-3" onSubmit={(event) => void submit(event, createEvidenceRequest)}>
                  <Field label="Title" required>
                    <input className="audity-input" value={requestForm.title} disabled={!canEdit} required aria-required="true" onChange={(event) => setRequestForm({ ...requestForm, title: event.target.value })} />
                  </Field>
                  <Field label="Owner">
                    <input className="audity-input" value={requestForm.owner} disabled={!canEdit} onChange={(event) => setRequestForm({ ...requestForm, owner: event.target.value })} />
                  </Field>
                  <Field label="Due date">
                    <input className="audity-input" type="date" value={requestForm.dueDate} disabled={!canEdit} onChange={(event) => setRequestForm({ ...requestForm, dueDate: event.target.value })} />
                  </Field>
                  <Field label="Description">
                    <textarea className="audity-input min-h-20" value={requestForm.description} disabled={!canEdit} onChange={(event) => setRequestForm({ ...requestForm, description: event.target.value })} />
                  </Field>
                  <button className="audity-btn-primary justify-self-start" type="submit" disabled={!canEdit} aria-disabled={!canEdit} title={disabledTitle(canEdit, "edit")}>Create request</button>
                </form>
                <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {overview.evidenceRequests.map((item) => (
                    <div key={text(item.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{text(item.title)}</p>
                          <p className="text-xs text-audity-muted">{text(item.owner, "No owner")} · due {dateValue(item.dueDate) || "-"}</p>
                        </div>
                        <select className="audity-input w-36 py-1 text-xs" value={text(item.status, "open")} disabled={!canEdit} onChange={(event) => void updateEvidenceRequestStatus(item, event.target.value)}>
                          {requestStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {!overview.evidenceRequests.length ? <p className="text-sm text-audity-muted">No evidence requests yet.</p> : null}
                </div>
              </Panel>
            </div>

            {selectedControl ? (
              <Panel title="Selected Control Audit Trail" subtitle="Recent sign-offs and assessment activity for the selected control review.">
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Control sign-offs</h3>
                    {signoffsForSelectedControl.map((item) => (
                      <div key={text(item.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm">
                        <p className="font-semibold">{text(item.signerName)}</p>
                        <p className="text-audity-secondary">{text(item.statement)}</p>
                      </div>
                    ))}
                    {!signoffsForSelectedControl.length ? <p className="text-sm text-audity-muted">No control sign-off recorded.</p> : null}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Recent audit activity</h3>
                    {overview.history.slice(0, 8).map((event) => (
                      <div key={text(event.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm">
                        <p className="font-semibold text-audity-primary">{text(event.action)}</p>
                        <p className="text-xs text-audity-muted">{text(event.createdAt)}</p>
                      </div>
                    ))}
                    {!overview.history.length ? <p className="text-sm text-audity-muted">No audit activity recorded yet.</p> : null}
                  </div>
                </div>
              </Panel>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "Findings & Remediation" ? (
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Panel title="Finding Lifecycle" subtitle="Choose a finding to manage response, remediation, and re-test.">
            <div className="max-h-[calc(100vh-230px)] space-y-2 overflow-y-auto pr-1">
              {overview.findings.map((finding) => (
                <button
                  key={text(finding.id)}
                  className={`w-full rounded-audity border px-3 py-2 text-left hover:border-audity-primary ${text(selectedFinding?.id) === text(finding.id) ? "border-audity-primary bg-audity-primaryActive/20" : "border-audity-border bg-audity-page"}`}
                  type="button"
                  onClick={() => setSelectedFindingId(text(finding.id))}
                >
                  <p className="text-sm font-semibold">{text(finding.title)}</p>
                  <p className="mt-1 text-xs text-audity-muted">{label(finding.lifecycleStatus)} · {label(finding.calculatedSeverity ?? finding.priority)}</p>
                </button>
              ))}
              {!overview.findings.length ? (
                <div className="rounded-audity border border-dashed border-audity-border bg-audity-panel/40 px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-audity-text">No findings yet</p>
                  <p className="mt-1 text-xs text-audity-secondary">Create a finding from a low score, missing evidence, or auditor observation using the form below.</p>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title={selectedFinding ? text(selectedFinding.title, "Finding workflow") : "Finding workflow"} subtitle="Severity matrix, management response, remediation tracking, and re-test workflow.">
            {selectedFinding ? (
              <form className="grid gap-3 lg:grid-cols-3" onSubmit={(event) => void submit(event, updateFinding)}>
                <Field label="Lifecycle">
                  <select className="audity-input" value={findingForm.lifecycleStatus} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, lifecycleStatus: event.target.value })}>
                    {lifecycleStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                </Field>
                <Field label="Impact">
                  <input className="audity-input" type="number" min={1} max={5} value={findingForm.severityImpact} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, severityImpact: Number(event.target.value) })} />
                </Field>
                <Field label="Likelihood">
                  <input className="audity-input" type="number" min={1} max={5} value={findingForm.severityLikelihood} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, severityLikelihood: Number(event.target.value) })} />
                </Field>
                <Field label="Control criticality">
                  <select className="audity-input" value={findingForm.controlCriticality} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, controlCriticality: event.target.value })}>
                    {criticalities.map((item) => <option key={item} value={item}>{label(item)}</option>)}
                  </select>
                </Field>
                <Field label="Evidence confidence">
                  <select className="audity-input" value={findingForm.evidenceConfidence} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, evidenceConfidence: event.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <Field label="Management response">
                  <select className="audity-input" value={findingForm.managementResponseStatus} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, managementResponseStatus: event.target.value })}>
                    {responseStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                </Field>
                <Field label="Management owner">
                  <input className="audity-input" value={findingForm.managementOwner} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, managementOwner: event.target.value })} />
                </Field>
                <Field label="Remediation status">
                  <select className="audity-input" value={findingForm.remediationStatus} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, remediationStatus: event.target.value })}>
                    {remediationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                </Field>
                <Field label="Remediation owner">
                  <input className="audity-input" value={findingForm.remediationOwner} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, remediationOwner: event.target.value })} />
                </Field>
                <Field label="Remediation due">
                  <input className="audity-input" type="date" value={findingForm.remediationDueDate} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, remediationDueDate: event.target.value })} />
                </Field>
                <Field label="Re-test status">
                  <select className="audity-input" value={findingForm.retestStatus} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, retestStatus: event.target.value })}>
                    {retestStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                </Field>
                <Field label="Re-test evidence">
                  <select className="audity-input" value={findingForm.retestEvidenceId} disabled={!canApprove || !overview.evidenceItems.length} onChange={(event) => setFindingForm({ ...findingForm, retestEvidenceId: event.target.value })}>
                    <option value="">No evidence linked</option>
                    {overview.evidenceItems.map((item) => <option key={text(item.id)} value={text(item.id)}>{text(item.fileName ?? item.title ?? item.id)}</option>)}
                  </select>
                </Field>
                <Field label="Management response text" wide>
                  <textarea className="audity-input min-h-24" value={findingForm.managementResponse} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, managementResponse: event.target.value })} />
                </Field>
                <Field label="Re-test notes">
                  <textarea className="audity-input min-h-24" value={findingForm.retestNotes} disabled={!canApprove} onChange={(event) => setFindingForm({ ...findingForm, retestNotes: event.target.value })} />
                </Field>
                <div className="flex flex-wrap items-center gap-2 lg:col-span-3">
                  <button className="audity-btn-primary" type="submit" disabled={!canApprove} aria-disabled={!canApprove} title={disabledTitle(canApprove, "approve")}>Save finding workflow</button>
                  <Pill value={selectedFinding.calculatedSeverity ?? selectedFinding.priority ?? "medium"} />
                </div>
              </form>
            ) : <p className="text-sm text-audity-muted">No finding selected.</p>}
          </Panel>
        </div>
      ) : null}

      {activeTab === "Audit Work" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Interview Notes" subtitle="Capture interview evidence, follow-ups, and linked controls.">
            <form className="grid gap-3" onSubmit={(event) => void submit(event, createInterview)}>
              <Field label="Title" required>
                <input className="audity-input" value={interviewForm.title} disabled={!canEdit} required aria-required="true" onChange={(event) => setInterviewForm({ ...interviewForm, title: event.target.value })} />
              </Field>
              <Field label="Participants">
                <input className="audity-input" value={interviewForm.participants} disabled={!canEdit} onChange={(event) => setInterviewForm({ ...interviewForm, participants: event.target.value })} />
              </Field>
              <Field label="Interview date">
                <input className="audity-input" type="datetime-local" value={interviewForm.interviewAt} disabled={!canEdit} onChange={(event) => setInterviewForm({ ...interviewForm, interviewAt: event.target.value })} />
              </Field>
              <Field label="Linked control">
                <select className="audity-input" value={interviewForm.linkedQuestionId} disabled={!canEdit} onChange={(event) => setInterviewForm({ ...interviewForm, linkedQuestionId: event.target.value })}>
                  <option value="">No linked control</option>
                  {overview.controls.map((control) => <option key={control.assessmentQuestionId} value={control.assessmentQuestionId}>{control.controlCode ?? control.questionId} · {control.controlTitle ?? control.question}</option>)}
                </select>
              </Field>
              <Field label="Notes">
                <textarea className="audity-input min-h-28" value={interviewForm.notes} disabled={!canEdit} onChange={(event) => setInterviewForm({ ...interviewForm, notes: event.target.value })} />
              </Field>
              <Field label="Follow-up">
                <textarea className="audity-input min-h-20" value={interviewForm.followUp} disabled={!canEdit} onChange={(event) => setInterviewForm({ ...interviewForm, followUp: event.target.value })} />
              </Field>
              <button className="audity-btn-primary justify-self-start" type="submit" disabled={!canEdit} aria-disabled={!canEdit} title={disabledTitle(canEdit, "edit")}>Save interview</button>
            </form>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
              {overview.interviews.map((item) => (
                <div key={text(item.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                  <p className="text-sm font-semibold">{text(item.title)}</p>
                  <p className="text-xs text-audity-muted">{text(item.participants, "No participants")} · {label(item.status)}</p>
                  <p className="mt-1 text-sm text-audity-secondary">{text(item.notes, "No notes")}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Audit Sampling" subtitle="Define test populations, selected samples, and result summaries.">
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event, createSample)}>
              <Field label="Name" wide required>
                <input className="audity-input" value={sampleForm.name} disabled={!canEdit} required aria-required="true" onChange={(event) => setSampleForm({ ...sampleForm, name: event.target.value })} />
              </Field>
              <Field label="Population size">
                <input className="audity-input" type="number" min={0} value={sampleForm.populationSize} disabled={!canEdit} onChange={(event) => setSampleForm({ ...sampleForm, populationSize: Number(event.target.value) })} />
              </Field>
              <Field label="Sample size" hint="Whole number ≥ 0; usually 5–25 of the population.">
                <input className="audity-input" type="number" min={0} step={1} value={sampleForm.sampleSize} disabled={!canEdit} onChange={(event) => setSampleForm({ ...sampleForm, sampleSize: Number(event.target.value) })} />
              </Field>
              <Field label="Selection method">
                <select className="audity-input" value={sampleForm.selectionMethod} disabled={!canEdit} onChange={(event) => setSampleForm({ ...sampleForm, selectionMethod: event.target.value })}>
                  <option value="random">Random</option>
                  <option value="judgmental">Judgmental</option>
                  <option value="risk_based">Risk based</option>
                  <option value="systematic">Systematic</option>
                </select>
              </Field>
              <Field label="Status">
                <select className="audity-input" value={sampleForm.status} disabled={!canEdit} onChange={(event) => setSampleForm({ ...sampleForm, status: event.target.value })}>
                  <option value="planned">Planned</option>
                  <option value="selected">Selected</option>
                  <option value="tested">Tested</option>
                  <option value="exception_found">Exception found</option>
                  <option value="completed">Completed</option>
                </select>
              </Field>
              <Field label="Population description" wide>
                <textarea className="audity-input min-h-20" value={sampleForm.populationDescription} disabled={!canEdit} onChange={(event) => setSampleForm({ ...sampleForm, populationDescription: event.target.value })} />
              </Field>
              <Field label="Selected items" wide>
                <textarea className="audity-input min-h-24" value={sampleForm.selectedItems} disabled={!canEdit} placeholder="One sample item per line" onChange={(event) => setSampleForm({ ...sampleForm, selectedItems: event.target.value })} />
              </Field>
              <Field label="Result summary" wide>
                <textarea className="audity-input min-h-20" value={sampleForm.resultSummary} disabled={!canEdit} onChange={(event) => setSampleForm({ ...sampleForm, resultSummary: event.target.value })} />
              </Field>
              <button className="audity-btn-primary justify-self-start" type="submit" disabled={!canEdit} aria-disabled={!canEdit} title={disabledTitle(canEdit, "edit")}>Save sample</button>
            </form>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
              {overview.samples.map((item) => (
                <div key={text(item.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{text(item.name)}</p>
                    <Pill value={item.status} />
                  </div>
                  <p className="text-xs text-audity-muted">Population {text(item.populationSize, "0")} · sample {text(item.sampleSize, "0")} · {label(item.selectionMethod)}</p>
                  <p className="mt-1 text-sm text-audity-secondary">{text(item.resultSummary, "No result summary")}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "Report & Sign-off" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <Panel title="Report Review Workflow" subtitle="Track report review status before final sign-off.">
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event, createReportReview)}>
              <Field label="Status">
                <select className="audity-input" value={reportForm.status} disabled={!canReport} onChange={(event) => setReportForm({ ...reportForm, status: event.target.value })}>
                  {reportStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                </select>
              </Field>
              <Field label="Due date">
                <input className="audity-input" type="date" value={reportForm.dueDate} disabled={!canReport} onChange={(event) => setReportForm({ ...reportForm, dueDate: event.target.value })} />
              </Field>
              <Field label="Internal reviewer">
                <input className="audity-input" value={reportForm.reviewer} disabled={!canReport} onChange={(event) => setReportForm({ ...reportForm, reviewer: event.target.value })} />
              </Field>
              <Field label="Customer reviewer">
                <input className="audity-input" value={reportForm.customerReviewer} disabled={!canReport} onChange={(event) => setReportForm({ ...reportForm, customerReviewer: event.target.value })} />
              </Field>
              <Field label="Review summary" wide>
                <textarea className="audity-input min-h-28" value={reportForm.summary} disabled={!canReport} onChange={(event) => setReportForm({ ...reportForm, summary: event.target.value })} />
              </Field>
              <button className="audity-btn-primary justify-self-start" type="submit" disabled={!canReport} aria-disabled={!canReport} title={disabledTitle(canReport, "report")}>Save review step</button>
            </form>
            <div className="mt-4 space-y-2">
              {overview.reportReviews.map((item) => (
                <div key={text(item.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{label(item.status)}</p>
                    <Pill value={item.status} />
                  </div>
                  <p className="text-xs text-audity-muted">{text(item.reviewer, "No internal reviewer")} · {text(item.customerReviewer, "No customer reviewer")}</p>
                  <p className="mt-1 text-sm text-audity-secondary">{text(item.summary, "No summary")}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Auditor Sign-off" subtitle="Create tamper-evident sign-off records for assessments, controls, findings, or reports.">
            <form className="grid gap-3" onSubmit={(event) => void submit(event, createSignoff)}>
              <Field label="Entity type">
                <select className="audity-input" value={signoffForm.entityType} disabled={!canApprove} onChange={(event) => setSignoffForm({ ...signoffForm, entityType: event.target.value })}>
                  <option value="assessment">Assessment</option>
                  <option value="control">Selected control</option>
                  <option value="finding">Selected finding</option>
                  <option value="report">Report</option>
                </select>
              </Field>
              <Field label="Signer name">
                <input className="audity-input" value={signoffForm.signerName} disabled={!canApprove} onChange={(event) => setSignoffForm({ ...signoffForm, signerName: event.target.value })} />
              </Field>
              <Field label="Statement">
                <textarea className="audity-input min-h-28" value={signoffForm.statement} disabled={!canApprove} onChange={(event) => setSignoffForm({ ...signoffForm, statement: event.target.value })} />
              </Field>
              <button className="audity-btn-primary justify-self-start" type="submit" disabled={!canApprove} aria-disabled={!canApprove} title={disabledTitle(canApprove, "approve")}>Record sign-off</button>
            </form>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {overview.signoffs.map((item) => (
                <div key={text(item.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{label(item.entityType)} sign-off</p>
                    <span className="text-xs text-audity-muted">{text(item.createdAt).slice(0, 10)}</span>
                  </div>
                  <p className="text-xs text-audity-muted">{text(item.signerName)}</p>
                  <p className="mt-1 text-sm text-audity-secondary">{text(item.statement)}</p>
                  <p className="mt-1 break-all text-xs text-audity-muted">Hash {text(item.eventHash)}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "Gaps & Pack" ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Panel title="Statement of Applicability" subtitle="Applicability, ownership, evidence, and sign-off status per control.">
              <div className="max-h-[520px] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-audity-panel text-xs uppercase text-audity-muted">
                    <tr>
                      <th className="px-2 py-2">Control</th>
                      <th className="px-2 py-2">Applicability</th>
                      <th className="px-2 py-2">Review</th>
                      <th className="px-2 py-2">Evidence</th>
                      <th className="px-2 py-2">Sign-off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.statementOfApplicability.map((item) => (
                      <tr key={text(item.assessmentQuestionId)} className="border-t border-audity-border">
                        <td className="px-2 py-2">
                          <button className="text-left font-semibold text-audity-primary hover:underline" type="button" onClick={() => {
                            setSelectedControlId(text(item.assessmentQuestionId));
                            setActiveTab("Controls & Evidence");
                          }}>{text(item.controlCode)}</button>
                          <p className="text-xs text-audity-muted">{text(item.controlTitle)}</p>
                        </td>
                        <td className="px-2 py-2"><Pill value={item.applicability} /></td>
                        <td className="px-2 py-2"><Pill value={item.reviewStatus} /></td>
                        <td className="px-2 py-2">{text(item.evidenceMapped, "0")}</td>
                        <td className="px-2 py-2"><Pill value={item.signoffStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Gap Register" subtitle="Control, evidence, and process gaps generated from audit state.">
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {overview.gaps.map((gap, index) => (
                  <div key={`${text(gap.type)}-${text(gap.title)}-${index}`} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{text(gap.title)}</p>
                        <p className="text-xs text-audity-muted">{text(gap.type)} · owner {text(gap.owner, "-")}</p>
                      </div>
                      <Pill value={gap.status} />
                    </div>
                  </div>
                ))}
                {!overview.gaps.length ? <p className="text-sm text-audity-muted">No gaps detected.</p> : null}
              </div>
            </Panel>
          </div>

          <Panel
            title="Audit Evidence Pack"
            subtitle="Generate a JSON manifest containing summary, SoA, controls, evidence mappings, findings, risks, samples, interviews, and sign-offs."
            action={<button className="audity-btn-primary" type="button" onClick={() => void downloadEvidencePack()}>Download pack</button>}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="Evidence items" value={overview.evidenceItems.length} />
              <MiniStat label="Mappings" value={overview.evidenceMappings.length} />
              <MiniStat label="Sign-offs" value={overview.signoffs.length} />
            </div>
          </Panel>
        </div>
      ) : null}

    </div>
  );
}
