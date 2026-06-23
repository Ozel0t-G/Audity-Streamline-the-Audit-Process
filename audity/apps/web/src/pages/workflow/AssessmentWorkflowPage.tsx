import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { PageSkeleton, SeverityBadge, useConfirm, useToast } from "../../components/ui";
import type { Finding, HistoryEvent, ReviewComment, Risk, RoadmapItem } from "./types";
import { FindingsKanban } from "./FindingsKanban";
import { FindingSlideover } from "./FindingSlideover";
import { RiskLinkedFindings } from "./RiskLinkedFindings";
import { WorkflowFilterBar, useWorkflowFilter, type WorkflowFilter } from "./WorkflowFilterBar";
import { StickyBulkBar } from "./StickyBulkBar";

type RoadmapPhaseKey = "now" | "soon" | "mid" | "long";
const phases: Array<{ key: RoadmapPhaseKey; label: string; range: string }> = [
  { key: "now", label: "Now", range: "0–30d" },
  { key: "soon", label: "Soon", range: "31–90d" },
  { key: "mid", label: "Mid", range: "3–6M" },
  { key: "long", label: "Long", range: "6–12M" }
];

function normalisePhaseKey(value: string | null | undefined): RoadmapPhaseKey {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("0-30") || v === "now") return "now";
  if (v.includes("31-90") || v === "soon") return "soon";
  if (v.includes("3-6") || v === "mid") return "mid";
  if (v.includes("6-12") || v === "long") return "long";
  return "now";
}
const ratings = ["Low", "Medium", "High", "Critical"];
const treatmentOptions = ["mitigate", "accept", "transfer", "avoid"];
const riskStatuses = ["open", "in_treatment", "accepted", "closed"];
const findingStatuses = ["suggested", "in_review", "needs_changes", "confirmed", "approved", "dismissed"];
const findingPriorities = ["low", "medium", "high", "critical"];
const scoreAxis = [5, 4, 3, 2, 1];
const statusLabels: Record<string, string> = {
  suggested: "Draft Finding",
  in_review: "In Review",
  needs_changes: "Needs Changes",
  confirmed: "Confirmed",
  approved: "Approved",
  dismissed: "Rejected",
  open: "Open",
  in_treatment: "In Treatment",
  accepted: "Accepted Risk",
  closed: "Closed",
  deleted: "Deleted"
};

function ratingClass(rating: string | null) {
  if (rating === "Critical") return "border-audity-error text-audity-error";
  if (rating === "High") return "border-audity-warning text-audity-warning";
  if (rating === "Medium") return "border-audity-primary text-audity-primary";
  return "border-audity-borderStrong text-audity-secondary";
}

function statusLabel(value: string | null | undefined) {
  return statusLabels[String(value ?? "")] ?? String(value ?? "-");
}

function dueState(value: string | null | undefined) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(value);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: "Overdue", tone: "border-audity-error text-audity-error" };
  if (days <= 14) return { label: `Due in ${days}d`, tone: "border-audity-warning text-audity-warning" };
  return null;
}

function RoadmapPhaseColumn({
  phase,
  phaseLabel,
  phaseRange,
  items,
  canDrag
}: {
  phase: string;
  phaseLabel?: string;
  phaseRange?: string;
  items: RoadmapItem[];
  canDrag: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: phase });
  const firstWithDates = items.find((item) => item.phaseStartDate && item.phaseEndDate);
  return (
    <div
      ref={setNodeRef}
      className={`min-h-48 rounded-audity border p-3 ${isOver ? "border-audity-primary bg-audity-primaryActive/20" : "border-audity-border bg-audity-page"}`}
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold">{phaseLabel ?? phase}{phaseRange ? <span className="ml-1 text-xs font-normal text-audity-muted">({phaseRange})</span> : null}</h3>
        {firstWithDates ? (
          <p className="text-[10px] text-audity-muted">
            {firstWithDates.phaseStartDate} → {firstWithDates.phaseEndDate}
          </p>
        ) : null}
      </header>
      <div className="space-y-2">
        {items.map((item) => (
          <RoadmapCard key={item.id} item={item} canDrag={canDrag} />
        ))}
      </div>
    </div>
  );
}

function RoadmapCard({ item, canDrag }: { item: RoadmapItem; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !canDrag
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const due = dueState(item.dueDate);
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`${canDrag ? "cursor-grab active:cursor-grabbing" : ""} rounded-audity border border-audity-borderStrong bg-audity-panel px-3 py-2 ${isDragging ? "opacity-70" : ""}`}
    >
      <p className="text-sm font-semibold">{item.action}</p>
      <p className="mt-1 text-xs text-audity-muted">{item.riskTitle} · {item.effortEstimate} · {statusLabel(item.status)}</p>
      {due ? <span className={`mt-2 inline-block rounded-audity border px-2 py-0.5 text-xs ${due.tone}`}>{due.label}</span> : null}
    </div>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString();
}

function summarizeHistory(event: HistoryEvent) {
  const before = event.before && typeof event.before === "object" ? event.before as Record<string, unknown> : null;
  const after = event.after && typeof event.after === "object" ? event.after as Record<string, unknown> : null;
  if (!before || !after) return "";
  const importantFields = ["title", "status", "priority", "rating", "riskScore", "likelihood", "impact", "treatmentOption", "owner", "dueDate", "draft"];
  const changes = importantFields
    .filter((field) => before[field] !== after[field])
    .slice(0, 4)
    .map((field) => `${field}: ${String(before[field] ?? "-")} -> ${String(after[field] ?? "-")}`);
  return changes.join(" · ");
}

function HistoryList({ events }: { events: HistoryEvent[] }) {
  return (
    <div className="space-y-2">
      {events.slice(0, 5).map((event) => (
        <div key={event.id} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-audity-primary">{event.action}</p>
            <p className="text-xs text-audity-muted">{formatDateTime(event.createdAt)}</p>
          </div>
          <p className="mt-1 text-xs text-audity-secondary">{event.userEmail ?? "System"}</p>
          {summarizeHistory(event) ? <p className="mt-1 text-xs text-audity-muted">{summarizeHistory(event)}</p> : null}
        </div>
      ))}
      {!events.length ? <p className="text-sm text-audity-muted">No changes recorded yet</p> : null}
    </div>
  );
}

function CommentList({ comments }: { comments: ReviewComment[] }) {
  return (
    <div className="space-y-2">
      {comments.slice(0, 5).map((comment) => (
        <div key={comment.id} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-audity-primary">{comment.userEmail ?? "System"}</p>
            <p className="text-xs text-audity-muted">{formatDateTime(comment.createdAt)}</p>
          </div>
          <p className="mt-1 text-sm text-audity-secondary">{comment.comment}</p>
        </div>
      ))}
      {!comments.length ? <p className="text-sm text-audity-muted">No comments yet</p> : null}
    </div>
  );
}

export function AssessmentWorkflowPage() {
  const { id } = useParams();
  const api = useApi();
  const { accessToken, user } = useAuth();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission));
  const canApproveFindings = can("finding.approve");
  const canAcceptRisk = can("risk.accept");
  const canEditRisk = can("risk.edit");
  const canEditRoadmap = can("roadmap.edit");
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );
  const [workflowFilter, setWorkflowFilter] = useWorkflowFilter();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [findingHistory, setFindingHistory] = useState<HistoryEvent[]>([]);
  const [riskHistory, setRiskHistory] = useState<HistoryEvent[]>([]);
  const [findingComments, setFindingComments] = useState<ReviewComment[]>([]);
  const [riskComments, setRiskComments] = useState<ReviewComment[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [findingSlideoverOpen, setFindingSlideoverOpen] = useState(false);
  const [selectedRiskId, setSelectedRiskId] = useState("");
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);
  const [selectedRiskIds, setSelectedRiskIds] = useState<string[]>([]);
  const [matrixFilter, setMatrixFilter] = useState<{ likelihood: number; impact: number } | null>(null);
  const [findingBulkForm, setFindingBulkForm] = useState({ status: "", priority: "" });
  const [riskBulkForm, setRiskBulkForm] = useState({ status: "", owner: "", dueDate: "", treatmentOption: "", draft: "" });
  const [findingComment, setFindingComment] = useState("");
  const [riskComment, setRiskComment] = useState("");
  const [findingEditForm, setFindingEditForm] = useState({
    title: "",
    priority: "medium",
    status: "suggested",
    observation: "",
    recommendation: ""
  });
  const [riskForm, setRiskForm] = useState({
    title: "",
    likelihood: 3,
    impact: 3,
    treatmentOption: "mitigate",
    owner: "",
    treatmentPlan: "",
    dueDate: "",
    status: "open",
    draft: false,
    acceptanceReason: "",
    acceptanceExpiresAt: ""
  });
  const [riskEditForm, setRiskEditForm] = useState({
    title: "",
    likelihood: 3,
    impact: 3,
    treatmentOption: "mitigate",
    owner: "",
    treatmentPlan: "",
    dueDate: "",
    status: "open",
    draft: false,
    acceptanceReason: "",
    acceptanceExpiresAt: ""
  });
  const [roadmapForm, setRoadmapForm] = useState({
    phase: "31-90d",
    action: "",
    owner: "",
    dueDate: "",
    effortEstimate: "Medium",
    status: "open"
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  const selectedFinding = useMemo(
    () => findings.find((finding) => finding.id === selectedFindingId) ?? findings[0],
    [findings, selectedFindingId]
  );
  const selectedRisk = useMemo(
    () => risks.find((risk) => risk.id === selectedRiskId) ?? risks[0],
    [risks, selectedRiskId]
  );
  const filteredRisks = useMemo(
    () => matrixFilter
      ? risks.filter((risk) => risk.likelihood === matrixFilter.likelihood && risk.impact === matrixFilter.impact)
      : risks,
    [risks, matrixFilter]
  );
  const dueRiskCount = useMemo(() => risks.filter((risk) => Boolean(dueState(risk.dueDate)) && risk.status !== "closed").length, [risks]);
  const dueRoadmapCount = useMemo(() => roadmapItems.filter((item) => Boolean(dueState(item.dueDate)) && item.status !== "closed").length, [roadmapItems]);
  const reviewSummary = useMemo(() => ({
    draft: findings.filter((finding) => finding.status === "suggested").length,
    inReview: findings.filter((finding) => finding.status === "in_review").length,
    needsChanges: findings.filter((finding) => finding.status === "needs_changes").length,
    approved: findings.filter((finding) => finding.status === "approved" || finding.status === "confirmed").length
  }), [findings]);

  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (!id) return;
    const [findingPayload, riskPayload, roadmapPayload] = await Promise.all([
      api<{ findings: Finding[] }>(`/api/assessments/${id}/findings`),
      api<{ risks: Risk[] }>(`/api/assessments/${id}/risks`),
      api<{ roadmapItems: RoadmapItem[] }>(`/api/assessments/${id}/roadmap`)
    ]);
    setFindings(findingPayload.findings);
    setRisks(riskPayload.risks);
    setRoadmapItems(roadmapPayload.roadmapItems);
    if (!selectedFindingId && findingPayload.findings[0]) setSelectedFindingId(findingPayload.findings[0].id);
    if (!selectedRiskId && riskPayload.risks[0]) setSelectedRiskId(riskPayload.risks[0].id);
  }

  useEffect(() => {
    setLoaded(false);
    void load()
      .catch((err) => setError(err instanceof Error ? err.message : "Workflow load failed"))
      .finally(() => setLoaded(true));
  }, [id]);

  useEffect(() => {
    if (!selectedFinding) return;
    setFindingEditForm({
      title: selectedFinding.title,
      priority: selectedFinding.priority ?? "medium",
      status: selectedFinding.status,
      observation: selectedFinding.observation ?? "",
      recommendation: selectedFinding.recommendation ?? ""
    });
  }, [selectedFinding]);

  useEffect(() => {
    if (!selectedRisk) return;
    setRiskEditForm({
      title: selectedRisk.title,
      likelihood: selectedRisk.likelihood,
      impact: selectedRisk.impact,
      treatmentOption: selectedRisk.treatmentOption ?? "mitigate",
      owner: selectedRisk.owner ?? "",
      treatmentPlan: selectedRisk.treatmentPlan ?? "",
      dueDate: selectedRisk.dueDate ?? "",
      status: selectedRisk.status,
      draft: Boolean(selectedRisk.draft),
      acceptanceReason: selectedRisk.acceptanceReason ?? "",
      acceptanceExpiresAt: selectedRisk.acceptanceExpiresAt ?? selectedRisk.dueDate ?? ""
    });
  }, [selectedRisk]);

  useEffect(() => {
    if (!id || !selectedFinding) {
      setFindingHistory([]);
      setFindingComments([]);
      return;
    }
    api<{ history: HistoryEvent[] }>(`/api/assessments/${id}/history?entityType=finding&entityId=${selectedFinding.id}`)
      .then((payload) => setFindingHistory(payload.history))
      .catch(() => setFindingHistory([]));
    api<{ comments: ReviewComment[] }>(`/api/assessments/${id}/comments?entityType=finding&entityId=${selectedFinding.id}`)
      .then((payload) => setFindingComments(payload.comments))
      .catch(() => setFindingComments([]));
  }, [api, id, selectedFinding?.id]);

  useEffect(() => {
    if (!id || !selectedRisk) {
      setRiskHistory([]);
      setRiskComments([]);
      return;
    }
    api<{ history: HistoryEvent[] }>(`/api/assessments/${id}/history?entityType=risk&entityId=${selectedRisk.id}`)
      .then((payload) => setRiskHistory(payload.history))
      .catch(() => setRiskHistory([]));
    api<{ comments: ReviewComment[] }>(`/api/assessments/${id}/comments?entityType=risk&entityId=${selectedRisk.id}`)
      .then((payload) => setRiskComments(payload.comments))
      .catch(() => setRiskComments([]));
  }, [api, id, selectedRisk?.id]);

  async function updateFinding(action: "accept" | "dismiss" | "mark-as-accepted-risk" | "edit", fields = {}) {
    if (!id || !selectedFinding) return;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/findings/${selectedFinding.id}`, {
        method: "PUT",
        body: JSON.stringify({ action, ...fields })
      });
      await load();
      setSaved("Finding updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finding update failed");
    }
  }

  async function updateFindingDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateFinding("edit", findingEditForm);
  }

  async function addComment(entityType: "finding" | "risk", entityId: string, comment: string) {
    if (!id || !comment.trim()) return;
    await api(`/api/assessments/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ entityType, entityId, comment })
    });
    if (entityType === "finding") {
      setFindingComment("");
      const payload = await api<{ comments: ReviewComment[] }>(`/api/assessments/${id}/comments?entityType=finding&entityId=${entityId}`);
      setFindingComments(payload.comments);
    } else {
      setRiskComment("");
      const payload = await api<{ comments: ReviewComment[] }>(`/api/assessments/${id}/comments?entityType=risk&entityId=${entityId}`);
      setRiskComments(payload.comments);
    }
  }

  function toggleFindingSelection(findingId: string) {
    setSelectedFindingIds((current) =>
      current.includes(findingId) ? current.filter((id) => id !== findingId) : [...current, findingId]
    );
  }

  function toggleRiskSelection(riskId: string) {
    setSelectedRiskIds((current) =>
      current.includes(riskId) ? current.filter((id) => id !== riskId) : [...current, riskId]
    );
  }

  async function bulkUpdateFindings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !selectedFindingIds.length) return;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/findings/bulk`, {
        method: "PATCH",
        body: JSON.stringify({
          findingIds: selectedFindingIds,
          status: findingBulkForm.status || undefined,
          priority: findingBulkForm.priority || undefined
        })
      });
      setSelectedFindingIds([]);
      await load();
      setSaved("Findings updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk finding update failed");
    }
  }

  async function createRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    setError("");
    setSaved("");
    try {
      const payload = await api<{ risk: Risk }>(`/api/assessments/${id}/risks`, {
        method: "POST",
        body: JSON.stringify({
          findingId: selectedFinding?.id,
          ...riskForm,
          title: riskForm.title || selectedFinding?.title
        })
      });
      await load();
      setSelectedRiskId(payload.risk.id);
      setSaved("Risk created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Risk create failed");
    }
  }

  async function updateRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !selectedRisk) return;
    setError("");
    setSaved("");
    if (
      (riskEditForm.treatmentOption === "accept" || riskEditForm.status === "accepted") &&
      (!riskEditForm.owner.trim() || !riskEditForm.acceptanceReason.trim() || !riskEditForm.acceptanceExpiresAt)
    ) {
      setError("Accepted risks require owner, acceptance reason, and expiration date.");
      return;
    }
    try {
      const payload = await api<{ risk: Risk }>(`/api/assessments/${id}/risks/${selectedRisk.id}`, {
        method: "PUT",
        body: JSON.stringify(riskEditForm)
      });
      await load();
      setSelectedRiskId(payload.risk.id);
      setSaved("Risk updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Risk update failed");
    }
  }

  async function deleteRisk() {
    if (!id || !selectedRisk) return;
    const ok = await confirm({
      title: "Delete risk?",
      body: `"${selectedRisk.title || "This risk"}" will be permanently removed including all linked treatment notes. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true
    });
    if (!ok) return;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/risks/${selectedRisk.id}`, {
        method: "DELETE"
      });
      setSelectedRiskId("");
      await load();
      setSaved("Risk deleted");
      toast.success("Risk deleted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Risk delete failed";
      setError(msg);
      toast.error(msg);
    }
  }

  async function bulkUpdateRisks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !selectedRiskIds.length) return;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/risks/bulk`, {
        method: "PATCH",
        body: JSON.stringify({
          riskIds: selectedRiskIds,
          status: riskBulkForm.status || undefined,
          owner: riskBulkForm.owner || undefined,
          dueDate: riskBulkForm.dueDate || undefined,
          treatmentOption: riskBulkForm.treatmentOption || undefined,
          draft: riskBulkForm.draft === "" ? undefined : riskBulkForm.draft === "true"
        })
      });
      setSelectedRiskIds([]);
      await load();
      setSaved("Risks updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk risk update failed");
    }
  }

  async function bulkDeleteRisks() {
    if (!id || !selectedRiskIds.length) return;
    const count = selectedRiskIds.length;
    const ok = await confirm({
      title: `Delete ${count} risk${count === 1 ? "" : "s"}?`,
      body: "Selected risks will be permanently removed. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true
    });
    if (!ok) return;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/risks/bulk`, {
        method: "PATCH",
        body: JSON.stringify({ riskIds: selectedRiskIds, delete: true })
      });
      setSelectedRiskIds([]);
      await load();
      setSaved("Risks deleted");
      toast.success(`Deleted ${count} risk${count === 1 ? "" : "s"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk risk delete failed";
      setError(msg);
      toast.error(msg);
    }
  }

  async function generateRoadmapFromRisks() {
    if (!id) return;
    setError("");
    setSaved("");
    try {
      const payload = await api<{ created: number }>(`/api/assessments/${id}/roadmap/generate`, {
        method: "POST"
      });
      await load();
      setSaved(`${payload.created} roadmap items generated`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Roadmap generation failed");
    }
  }

  async function exportRiskRegister() {
    if (!id) return;
    const response = await fetch(`/api/assessments/${id}/risks/export`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
    });
    if (!response.ok) {
      setError(`Risk export failed: ${response.status}`);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audity-risk-register-${id}.csv`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function importRiskRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    const input = event.currentTarget.elements.namedItem("riskCsv") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setError("");
    setSaved("");
    try {
      const csv = await file.text();
      const payload = await api<{ imported: number }>(`/api/assessments/${id}/risks/import`, {
        method: "POST",
        body: JSON.stringify({ csv })
      });
      event.currentTarget.reset();
      await load();
      setSaved(`${payload.imported} risks imported`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Risk import failed");
    }
  }

  function downloadRiskCsvTemplate() {
    const csv = [
      '"title","likelihood","impact","treatment_option","owner","treatment_plan","due_date","status","draft","acceptance_reason","acceptance_expires_at"',
      '"Example access risk","3","4","mitigate","Security Owner","Define MFA rollout and review privileged access","","open","true","",""'
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "audity-risk-register-template.csv";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function createRoadmapItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !selectedRisk) return;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/roadmap`, {
        method: "POST",
        body: JSON.stringify({
          riskId: selectedRisk.id,
          ...roadmapForm,
          action: roadmapForm.action || `Treat risk: ${selectedRisk.title}`
        })
      });
      await load();
      setSaved("Roadmap item created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Roadmap create failed");
    }
  }

  async function moveRoadmapItem(event: DragEndEvent) {
    if (!canEditRoadmap) return;
    if (!id || !event.over || String(event.active.id) === String(event.over.id)) return;
    const item = roadmapItems.find((roadmapItem) => roadmapItem.id === String(event.active.id));
    const phase = String(event.over.id);
    if (!item || !phases.some((p) => p.key === phase)) return;
    await api(`/api/assessments/${id}/roadmap/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ phase })
    });
    await load();
  }

  if (!loaded) {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Guided Workflow</p>
          <h1 className="audity-page-title">Findings, Risks & Roadmap</h1>
        </div>
        <PageSkeleton cards={3} showTable />
      </>
    );
  }

  return (
    <>
          <WorkflowFilterBar
            filter={workflowFilter}
            onChange={setWorkflowFilter}
            owners={Array.from(new Set([
              ...risks.map((r) => r.owner ?? "").filter(Boolean),
              ...roadmapItems.map((r) => r.owner ?? "").filter(Boolean)
            ]))}
            counts={{ findings: findings.length, risks: risks.length, roadmap: roadmapItems.length }}
          />
          <div className="audity-page-header">
            <p className="audity-page-kicker">Guided Workflow</p>
            <h1 className="audity-page-title">Findings, Risks & Roadmap</h1>
            <p className="audity-page-copy">
              Stage 1 → Stage 2 → Stage 3 · {findings.length} findings · {risks.length} risks · {roadmapItems.length} roadmap items
            </p>
          </div>
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
          {saved ? <div className="mb-4 rounded-audity border border-audity-success bg-audity-success/10 px-3 py-2 text-sm text-audity-success">{saved}</div> : null}
          <section className="mb-4 rounded-audity border border-audity-border bg-audity-panel p-4">
            <div className="grid gap-2 md:grid-cols-4">
              <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <p className="text-xs font-medium text-audity-muted">Draft</p>
                <p className="mt-1 text-xl font-semibold">{reviewSummary.draft}</p>
              </div>
              <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <p className="text-xs font-medium text-audity-muted">In Review</p>
                <p className="mt-1 text-xl font-semibold">{reviewSummary.inReview}</p>
              </div>
              <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <p className="text-xs font-medium text-audity-muted">Needs Changes</p>
                <p className="mt-1 text-xl font-semibold">{reviewSummary.needsChanges}</p>
              </div>
              <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <p className="text-xs font-medium text-audity-muted">Approved</p>
                <p className="mt-1 text-xl font-semibold">{reviewSummary.approved}</p>
              </div>
            </div>
          </section>
          {(dueRiskCount || dueRoadmapCount) ? (
          <section className="mb-4 rounded-audity border border-audity-warning bg-audity-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-audity-warning">Due Reminders</h2>
                <p className="mt-1 text-sm text-audity-secondary">{dueRiskCount} risks and {dueRoadmapCount} roadmap items are overdue or due within 14 days.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-audity border border-audity-warning px-2 py-1 text-xs text-audity-warning">Risks {dueRiskCount}</span>
                <span className="rounded-audity border border-audity-warning px-2 py-1 text-xs text-audity-warning">Roadmap {dueRoadmapCount}</span>
              </div>
            </div>
          </section>
          ) : null}
          <div className="space-y-4 min-w-0">
            <section className="rounded-audity border border-audity-border bg-audity-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-audity-border px-3 py-2.5">
                <div>
                  <h2 className="text-lg font-semibold">Stage 1 · Finding Triage</h2>
                  <p className="mt-0.5 text-xs text-audity-muted">
                    Cards move left → right through the lifecycle. Click a card to review details. Bulk-select with checkboxes.
                  </p>
                </div>
                {canApproveFindings && selectedFindingIds.length ? (
                  <form className="flex flex-wrap items-end gap-2" onSubmit={bulkUpdateFindings}>
                    <label className="block text-xs font-medium text-audity-secondary">Status
                      <select className="audity-input ml-2" value={findingBulkForm.status} onChange={(event) => setFindingBulkForm({ ...findingBulkForm, status: event.target.value })}>
                        <option value="">No change</option>
                        {findingStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-audity-secondary">Priority
                      <select className="audity-input ml-2" value={findingBulkForm.priority} onChange={(event) => setFindingBulkForm({ ...findingBulkForm, priority: event.target.value })}>
                        <option value="">No change</option>
                        {findingPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                      </select>
                    </label>
                    <button className="audity-btn-primary">Update {selectedFindingIds.length}</button>
                  </form>
                ) : null}
              </div>

              <div className="p-3">
                <FindingsKanban
                  findings={findings.filter((f) => {
                    if (workflowFilter.scope === "open" && ["approved", "dismissed"].includes(f.status)) return false;
                    if (workflowFilter.scope === "closed" && !["approved", "dismissed"].includes(f.status)) return false;
                    if (workflowFilter.search) {
                      const q = workflowFilter.search.toLowerCase();
                      const hay = `${f.title} ${f.observation ?? ""} ${f.recommendation ?? ""} ${f.controlCode ?? ""}`.toLowerCase();
                      if (!hay.includes(q)) return false;
                    }
                    return true;
                  })}
                  selectedIds={selectedFindingIds}
                  canBulkSelect={canApproveFindings}
                  onToggleSelect={toggleFindingSelection}
                  onOpen={(finding) => {
                    setSelectedFindingId(finding.id);
                    setFindingSlideoverOpen(true);
                  }}
                />
              </div>
            </section>

            <FindingSlideover
              assessmentId={id ?? ""}
              open={findingSlideoverOpen}
              finding={selectedFinding ?? null}
              canEdit={canApproveFindings}
              onClose={() => setFindingSlideoverOpen(false)}
              onChanged={() => void load()}
            />

            <section className="hidden">
              {/* Legacy Finding Review block kept hidden during PR-1 migration.
                  Will be deleted in PR-2. The slideover above replaces it. */}
              <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="divide-y divide-audity-border border-r border-audity-border">
                  {findings.map((finding) => (
                    <div key={finding.id} className={`flex gap-2 px-3 py-2.5 hover:bg-audity-panelAlt ${finding.id === selectedFinding?.id ? "bg-audity-primaryActive/25" : ""}`}>
                      {canApproveFindings ? (
                      <input className="mt-1" type="checkbox" checked={selectedFindingIds.includes(finding.id)} onChange={() => toggleFindingSelection(finding.id)} />
                      ) : null}
                      <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedFindingId(finding.id)}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-audity-primary">{finding.controlCode}</p>
                          <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs text-audity-secondary">{statusLabel(finding.status)}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold">{finding.title}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <SeverityBadge level={finding.priority ?? "info"} />
                          <span className="text-xs text-audity-muted">Score {finding.score}</span>
                        </div>
                      </button>
                    </div>
                  ))}
                  {!findings.length ? <div className="px-4 py-10 text-center text-sm text-audity-muted">No suggested findings yet</div> : null}
                </div>
                <div className="p-4">
                  {selectedFinding ? (
                    <>
                      <p className="text-xs font-medium text-audity-primary">{selectedFinding.controlCode}</p>
                      <h3 className="mt-1 text-xl font-semibold">{selectedFinding.title}</h3>
                      <p className="mt-3 text-sm text-audity-secondary">{selectedFinding.sourceExplanation}</p>
                      {canApproveFindings ? (
                      <form className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3" onSubmit={updateFindingDetails}>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block text-xs font-medium text-audity-secondary">Title
                            <input className="mt-2 audity-input bg-audity-panel" value={findingEditForm.title} onChange={(event) => setFindingEditForm({ ...findingEditForm, title: event.target.value })} />
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs font-medium text-audity-secondary">Priority
                              <select className="mt-2 audity-input bg-audity-panel" value={findingEditForm.priority} onChange={(event) => setFindingEditForm({ ...findingEditForm, priority: event.target.value })}>
                                {findingPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                              </select>
                            </label>
                            <label className="block text-xs font-medium text-audity-secondary">Status
                              <select className="mt-2 audity-input bg-audity-panel" value={findingEditForm.status} onChange={(event) => setFindingEditForm({ ...findingEditForm, status: event.target.value })}>
                                {findingStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                              </select>
                            </label>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="block text-xs font-medium text-audity-secondary">Observation
                            <textarea className="mt-2 min-h-24 w-full rounded-audity border border-audity-border bg-audity-panel px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={findingEditForm.observation} onChange={(event) => setFindingEditForm({ ...findingEditForm, observation: event.target.value })} />
                          </label>
                          <label className="block text-xs font-medium text-audity-secondary">Recommendation
                            <textarea className="mt-2 min-h-24 w-full rounded-audity border border-audity-border bg-audity-panel px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={findingEditForm.recommendation} onChange={(event) => setFindingEditForm({ ...findingEditForm, recommendation: event.target.value })} />
                          </label>
                        </div>
                        <button className="mt-3 audity-btn-primary">Save finding</button>
                      </form>
                      ) : (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                          <p className="text-xs font-medium text-audity-muted">Observation</p>
                          <p className="mt-2 text-sm text-audity-secondary">{selectedFinding.observation}</p>
                        </div>
                        <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                          <p className="text-xs font-medium text-audity-muted">Recommendation</p>
                          <p className="mt-2 text-sm text-audity-secondary">{selectedFinding.recommendation}</p>
                        </div>
                      </div>
                      )}
                      {(canApproveFindings || canAcceptRisk) ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canApproveFindings ? (
                        <button className="audity-btn-primary" onClick={() => void updateFinding("accept")}>Confirm finding</button>
                        ) : null}
                        {canApproveFindings ? (
                        <button className="audity-btn-secondary" onClick={() => void updateFinding("edit", { status: "in_review" })}>Send to review</button>
                        ) : null}
                        {canApproveFindings ? (
                        <button className="audity-btn-secondary border-audity-warning text-audity-warning hover:border-audity-warning" onClick={() => void updateFinding("edit", { status: "needs_changes" })}>Needs changes</button>
                        ) : null}
                        {canApproveFindings ? (
                        <button className="audity-btn-secondary border-audity-success text-audity-success hover:border-audity-success" onClick={() => void updateFinding("edit", { status: "approved" })}>Approve</button>
                        ) : null}
                        {canAcceptRisk ? (
                        <button className="audity-btn-secondary" onClick={() => void updateFinding("mark-as-accepted-risk")}>Mark residual risk accepted</button>
                        ) : null}
                        {canApproveFindings ? (
                        <button className="audity-btn-secondary border-audity-error text-audity-error hover:bg-audity-error/10" onClick={() => void updateFinding("dismiss")}>Reject finding</button>
                        ) : null}
                      </div>
                      ) : null}
                      <div className="mt-5">
                        <p className="mb-2 text-xs font-medium text-audity-muted">Framework Mapping</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          {selectedFinding.mappings.map((mapping) => (
                            <div key={`${mapping.controlId}-${mapping.code}`} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                              <p className="text-xs font-semibold text-audity-primary">{mapping.code}</p>
                              <p className="mt-1 text-sm text-audity-secondary">{mapping.title}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-5">
                        <p className="mb-2 text-xs font-medium text-audity-muted">Change History</p>
                        <HistoryList events={findingHistory} />
                      </div>
                      <div className="mt-5">
                        <p className="mb-2 text-xs font-medium text-audity-muted">Review Comments</p>
                        <CommentList comments={findingComments} />
                        {canApproveFindings ? (
                        <form className="mt-3 flex gap-2" onSubmit={(event) => {
                          event.preventDefault();
                          void addComment("finding", selectedFinding.id, findingComment);
                        }}>
                          <input className="h-9 min-w-0 flex-1 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" value={findingComment} onChange={(event) => setFindingComment(event.target.value)} placeholder="Add review note" />
                          <button className="audity-btn-secondary">Add</button>
                        </form>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </section>
            <aside className="space-y-4">
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">Stage 2 · Risk Register</h2>
                  <p className="mt-1 text-xs text-audity-muted">Risks are drafted automatically from guided answers with score 0-2. Click the matrix to filter, click a row to edit details in the slideover.</p>
                </div>
                {/* CSV Import/Export removed by product decision (PR-1).
                    Use bulk PATCH on /api/assessments/:id/risks/bulk for mass updates. */}
                {false && canEditRisk ? (
                <div className="mb-4 rounded-audity border border-audity-border bg-audity-page p-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="audity-btn-secondary" type="button" onClick={() => void exportRiskRegister()}>Export CSV</button>
                    <button className="audity-btn-secondary" type="button" onClick={downloadRiskCsvTemplate}>CSV Template</button>
                    <form className="flex flex-wrap gap-2" onSubmit={(event) => void importRiskRegister(event)}>
                      <input name="riskCsv" type="file" accept=".csv,text/csv" className="text-sm text-audity-secondary" />
                      <button className="audity-btn-primary">Import CSV</button>
                    </form>
                  </div>
                </div>
                ) : null}
                <div className="mb-4 rounded-audity border border-audity-border bg-audity-page p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-audity-muted">5x5 Matrix</p>
                    {matrixFilter ? <button className="text-xs text-audity-primary hover:text-audity-primaryHover" onClick={() => setMatrixFilter(null)}>Clear filter</button> : null}
                  </div>
                  <div className="grid grid-cols-[44px_repeat(5,minmax(0,1fr))] gap-1.5 text-center text-xs">
                    <div />
                    {[1, 2, 3, 4, 5].map((impact) => <div key={impact} className="py-1 font-semibold text-audity-secondary">I{impact}</div>)}
                    {scoreAxis.map((likelihood) => (
                      <Fragment key={`row-${likelihood}`}>
                        <div className="flex items-center justify-center py-2 font-semibold text-audity-secondary">L{likelihood}</div>
                        {[1, 2, 3, 4, 5].map((impact) => {
                          const cellRisks = risks.filter((risk) => risk.likelihood === likelihood && risk.impact === impact);
                          const count = cellRisks.length;
                          const { rating } = { rating: likelihood * impact >= 20 ? "Critical" : likelihood * impact >= 12 ? "High" : likelihood * impact >= 5 ? "Medium" : "Low" };
                          const active = matrixFilter?.likelihood === likelihood && matrixFilter?.impact === impact;
                          const tooltip = count
                            ? `${count} risk${count === 1 ? "" : "s"} · ${rating}\n${cellRisks.slice(0, 5).map((r) => `• ${r.title}`).join("\n")}${count > 5 ? `\n... +${count - 5} more` : ""}`
                            : `${rating} · empty`;
                          return (
                            <button
                              key={`${likelihood}-${impact}`}
                              className={`h-16 rounded-audity border-2 text-lg font-bold transition ${active ? "border-audity-primary bg-audity-primaryActive text-white" : `${ratingClass(rating)} hover:scale-105`}`}
                              onClick={() => setMatrixFilter(active ? null : { likelihood, impact })}
                              aria-pressed={active}
                              type="button"
                              title={tooltip}
                            >
                              {count || ""}
                            </button>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {ratings.map((rating) => (
                    <div key={rating} className={`rounded-audity border p-2 ${ratingClass(rating)}`}>
                      <p className="text-[11px] font-semibold uppercase">{rating}</p>
                      <p className="mt-0.5 text-xl font-semibold">{risks.filter((risk) => risk.rating === rating).length}</p>
                    </div>
                  ))}
                </div>
                {canEditRisk ? (
                <form className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3" onSubmit={bulkUpdateRisks}>
                  <p className="mb-2 text-xs font-medium text-audity-muted">Bulk Actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="audity-input bg-audity-panel" value={riskBulkForm.status} onChange={(event) => setRiskBulkForm({ ...riskBulkForm, status: event.target.value })}>
                      <option value="">Status</option>
                      {riskStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    <select className="audity-input bg-audity-panel" value={riskBulkForm.treatmentOption} onChange={(event) => setRiskBulkForm({ ...riskBulkForm, treatmentOption: event.target.value })}>
                      <option value="">Treatment</option>
                      {treatmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <input className="audity-input bg-audity-panel" placeholder="Owner" value={riskBulkForm.owner} onChange={(event) => setRiskBulkForm({ ...riskBulkForm, owner: event.target.value })} />
                    <input className="audity-input bg-audity-panel" type="date" value={riskBulkForm.dueDate} onChange={(event) => setRiskBulkForm({ ...riskBulkForm, dueDate: event.target.value })} />
                    <select className="audity-input bg-audity-panel" value={riskBulkForm.draft} onChange={(event) => setRiskBulkForm({ ...riskBulkForm, draft: event.target.value })}>
                      <option value="">Draft</option>
                      <option value="true">Set draft</option>
                      <option value="false">Clear draft</option>
                    </select>
                    <div className="flex gap-2">
                      <button className="flex-1 audity-btn-primary" disabled={!selectedRiskIds.length}>Update</button>
                      <button type="button" className="audity-btn-secondary border-audity-error text-audity-error hover:bg-audity-error/10" disabled={!selectedRiskIds.length} onClick={() => void bulkDeleteRisks()}>Delete</button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-audity-muted">{selectedRiskIds.length} selected</p>
                </form>
                ) : null}
                <div className="mt-4 space-y-2">
                  {filteredRisks.map((risk) => (
                    <div key={risk.id} className={`flex gap-2 rounded-audity border px-3 py-2 ${risk.id === selectedRisk?.id ? "border-audity-primary bg-audity-primaryActive/25" : "border-audity-border bg-audity-page"}`}>
                      {canEditRisk ? <input className="mt-1" type="checkbox" checked={selectedRiskIds.includes(risk.id)} onChange={() => toggleRiskSelection(risk.id)} /> : null}
                      <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedRiskId(risk.id)}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{risk.title}</p>
                          <span className={`rounded-audity border px-2 py-1 text-xs ${ratingClass(risk.rating)}`}>{risk.rating}</span>
                        </div>
                        <p className="mt-1 text-xs text-audity-muted">L{risk.likelihood} x I{risk.impact} = {risk.riskScore} · {statusLabel(risk.status)}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {risk.draft ? <span className="rounded-audity border border-audity-primary px-2 py-0.5 text-xs text-audity-primary">Draft</span> : null}
                          <span className="rounded-audity border border-audity-borderStrong px-2 py-0.5 text-xs text-audity-secondary">{risk.sourceType === "guided_question" ? "Guided answer" : "Manual"}</span>
                          {risk.sourceScore !== null ? <span className="rounded-audity border border-audity-borderStrong px-2 py-0.5 text-xs text-audity-secondary">Score {risk.sourceScore}</span> : null}
                          {dueState(risk.dueDate) ? <span className={`rounded-audity border px-2 py-0.5 text-xs ${dueState(risk.dueDate)?.tone}`}>{dueState(risk.dueDate)?.label}</span> : null}
                        </div>
                      </button>
                    </div>
                  ))}
                  {!risks.length ? <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-8 text-center text-sm text-audity-muted">No risks yet</div> : null}
                </div>
              </section>
              {canEditRisk ? (
              <form onSubmit={updateRisk} className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-4 text-lg font-semibold">Edit Selected Risk</h2>
                {selectedRisk ? (
                  <div className="mb-4">
                    <RiskLinkedFindings
                      assessmentId={id ?? ""}
                      riskId={selectedRisk.id}
                      canEdit={canEditRisk}
                      allFindings={findings}
                    />
                  </div>
                ) : null}
                {selectedRisk ? (
                <div className="mb-4 rounded-audity border border-audity-border bg-audity-page p-3">
                  <div className="flex flex-wrap gap-2">
                    {riskEditForm.draft ? <span className="rounded-audity border border-audity-primary px-2 py-1 text-xs text-audity-primary">Draft</span> : null}
                    <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs text-audity-secondary">{selectedRisk.sourceType === "guided_question" ? "Created from guided answer" : "Manual risk"}</span>
                    {selectedRisk.sourceScore !== null ? <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs text-audity-secondary">Question score {selectedRisk.sourceScore}</span> : null}
                  </div>
                  {selectedRisk.sourceExplanation ? <p className="mt-2 text-xs text-audity-muted">{selectedRisk.sourceExplanation}</p> : null}
                  {selectedRisk.sourceGeneratedAt ? <p className="mt-1 text-xs text-audity-muted">Generated {formatDateTime(selectedRisk.sourceGeneratedAt)}</p> : null}
                </div>
                ) : null}
                <label className="block text-xs font-medium text-audity-secondary">Title
                  <input className="mt-2 audity-input" value={riskEditForm.title} onChange={(event) => setRiskEditForm({ ...riskEditForm, title: event.target.value })} disabled={!selectedRisk} />
                </label>
                <label className="mt-3 flex items-center gap-2 text-xs font-medium text-audity-secondary">
                  <input type="checkbox" checked={riskEditForm.draft} onChange={(event) => setRiskEditForm({ ...riskEditForm, draft: event.target.checked })} disabled={!selectedRisk} />
                  Draft
                </label>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-audity-secondary">Likelihood
                    <input className="mt-2 audity-input" type="number" min="1" max="5" value={riskEditForm.likelihood} onChange={(event) => setRiskEditForm({ ...riskEditForm, likelihood: Number(event.target.value) })} disabled={!selectedRisk} />
                  </label>
                  <label className="block text-xs font-medium text-audity-secondary">Impact
                    <input className="mt-2 audity-input" type="number" min="1" max="5" value={riskEditForm.impact} onChange={(event) => setRiskEditForm({ ...riskEditForm, impact: Number(event.target.value) })} disabled={!selectedRisk} />
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-audity-secondary">Treatment
                    <select className="mt-2 audity-input" value={riskEditForm.treatmentOption} onChange={(event) => setRiskEditForm({ ...riskEditForm, treatmentOption: event.target.value })} disabled={!selectedRisk}>
                      {treatmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-audity-secondary">Status
                    <select className="mt-2 audity-input" value={riskEditForm.status} onChange={(event) => setRiskEditForm({ ...riskEditForm, status: event.target.value })} disabled={!selectedRisk}>
                      {riskStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
                <label className="mt-3 block text-xs font-medium text-audity-secondary">Owner
                  <input className="mt-2 audity-input" value={riskEditForm.owner} onChange={(event) => setRiskEditForm({ ...riskEditForm, owner: event.target.value })} disabled={!selectedRisk} />
                </label>
                <label className="mt-3 block text-xs font-medium text-audity-secondary">Due Date
                  <input className="mt-2 audity-input" type="date" value={riskEditForm.dueDate} onChange={(event) => setRiskEditForm({ ...riskEditForm, dueDate: event.target.value })} disabled={!selectedRisk} />
                </label>
                <label className="mt-3 block text-xs font-medium text-audity-secondary">Treatment Plan
                  <textarea className="mt-2 min-h-24 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={riskEditForm.treatmentPlan} onChange={(event) => setRiskEditForm({ ...riskEditForm, treatmentPlan: event.target.value })} disabled={!selectedRisk} />
                </label>
                {(riskEditForm.treatmentOption === "accept" || riskEditForm.status === "accepted") ? (
                <div className="mt-3 rounded-audity border border-audity-border bg-audity-page p-3">
                  <label className="block text-xs font-medium text-audity-secondary">Acceptance Reason
                    <textarea className="mt-2 min-h-20 w-full rounded-audity border border-audity-border bg-audity-panel px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={riskEditForm.acceptanceReason} onChange={(event) => setRiskEditForm({ ...riskEditForm, acceptanceReason: event.target.value })} disabled={!selectedRisk} />
                  </label>
                  <label className="mt-3 block text-xs font-medium text-audity-secondary">Acceptance Expires
                    <input className="mt-2 audity-input bg-audity-panel" type="date" value={riskEditForm.acceptanceExpiresAt} onChange={(event) => setRiskEditForm({ ...riskEditForm, acceptanceExpiresAt: event.target.value })} disabled={!selectedRisk} />
                  </label>
                </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="audity-btn-primary" disabled={!selectedRisk}>Save risk</button>
                  <button type="button" className="audity-btn-secondary border-audity-error text-audity-error hover:bg-audity-error/10" onClick={() => void deleteRisk()} disabled={!selectedRisk}>Delete</button>
                </div>
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium text-audity-muted">Change History</p>
                  <HistoryList events={riskHistory} />
                </div>
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium text-audity-muted">Review Comments</p>
                  <CommentList comments={riskComments} />
                  <form className="mt-3 flex gap-2" onSubmit={(event) => {
                    event.preventDefault();
                    if (selectedRisk) void addComment("risk", selectedRisk.id, riskComment);
                  }}>
                    <input className="h-9 min-w-0 flex-1 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" value={riskComment} onChange={(event) => setRiskComment(event.target.value)} placeholder="Add review note" disabled={!selectedRisk} />
                    <button className="audity-btn-secondary disabled:cursor-not-allowed disabled:opacity-60" disabled={!selectedRisk}>Add</button>
                  </form>
                </div>
              </form>
              ) : null}
              {canEditRisk ? (
              <form onSubmit={createRisk} className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-4 text-lg font-semibold">Add Manual Risk</h2>
                <label className="block text-xs font-medium text-audity-secondary">Title
                  <input className="mt-2 audity-input" value={riskForm.title} onChange={(event) => setRiskForm({ ...riskForm, title: event.target.value })} placeholder={selectedFinding?.title ?? "Risk title"} />
                </label>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-audity-secondary">Likelihood
                    <input className="mt-2 audity-input" type="number" min="1" max="5" value={riskForm.likelihood} onChange={(event) => setRiskForm({ ...riskForm, likelihood: Number(event.target.value) })} />
                  </label>
                  <label className="block text-xs font-medium text-audity-secondary">Impact
                    <input className="mt-2 audity-input" type="number" min="1" max="5" value={riskForm.impact} onChange={(event) => setRiskForm({ ...riskForm, impact: Number(event.target.value) })} />
                  </label>
                </div>
                <label className="mt-3 block text-xs font-medium text-audity-secondary">Owner
                  <input className="mt-2 audity-input" value={riskForm.owner} onChange={(event) => setRiskForm({ ...riskForm, owner: event.target.value })} />
                </label>
                <label className="mt-3 block text-xs font-medium text-audity-secondary">Treatment Plan
                  <textarea className="mt-2 min-h-24 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={riskForm.treatmentPlan} onChange={(event) => setRiskForm({ ...riskForm, treatmentPlan: event.target.value })} />
                </label>
                <button className="mt-3 audity-btn-primary">Add risk</button>
              </form>
              ) : null}
            </aside>
          </div>
          <section className="mt-4 rounded-audity border border-audity-border bg-audity-panel p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Roadmap Builder</h2>
                <p className="mt-1 text-xs text-audity-muted">Drag cards between columns to change timeframe.</p>
              </div>
              {canEditRoadmap ? (
              <form className="flex min-w-0 flex-wrap items-center gap-2" onSubmit={createRoadmapItem}>
                <button className="audity-btn-secondary" type="button" onClick={() => void generateRoadmapFromRisks()}>
                  Auto-generate High/Critical
                </button>
                <select className="w-32 audity-input" value={roadmapForm.phase} onChange={(event) => setRoadmapForm({ ...roadmapForm, phase: event.target.value })}>
                  {phases.map((phase) => <option key={phase.key} value={phase.key}>{phase.label} ({phase.range})</option>)}
                </select>
                <input className="min-w-[180px] max-w-full flex-1 audity-input" placeholder="Roadmap action" value={roadmapForm.action} onChange={(event) => setRoadmapForm({ ...roadmapForm, action: event.target.value })} />
                <button className="audity-btn-primary" disabled={!selectedRisk}>Generate from risk</button>
              </form>
              ) : null}
            </div>
            <DndContext sensors={dndSensors} onDragEnd={(event) => void moveRoadmapItem(event)}>
              <div className="grid gap-3 xl:grid-cols-4">
                {phases.map((phase) => {
                  const items = roadmapItems.filter((item) => normalisePhaseKey(item.phase) === phase.key);
                  return (
                    <RoadmapPhaseColumn
                      key={phase.key}
                      phase={phase.key}
                      phaseLabel={`${phase.label}`}
                      phaseRange={phase.range}
                      items={items}
                      canDrag={canEditRoadmap}
                    />
                  );
                })}
              </div>
            </DndContext>
          </section>

          <StickyBulkBar
            count={selectedFindingIds.length}
            entityLabel={selectedFindingIds.length === 1 ? "finding" : "findings"}
            statusOptions={findingStatuses}
            priorityOptions={findingPriorities}
            statusValue={findingBulkForm.status}
            priorityValue={findingBulkForm.priority}
            onStatus={(value) => setFindingBulkForm({ ...findingBulkForm, status: value })}
            onPriority={(value) => setFindingBulkForm({ ...findingBulkForm, priority: value })}
            onApply={() => void bulkUpdateFindings({ preventDefault: () => undefined } as never)}
            onClear={() => setSelectedFindingIds([])}
            applyDisabled={!findingBulkForm.status && !findingBulkForm.priority}
          />
    </>
  );
}
