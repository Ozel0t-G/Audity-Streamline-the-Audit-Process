import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { Finding, Risk, RoadmapItem } from "./types";

const phases = ["0-30d", "31-90d", "3-6M", "6-12M"];
const ratings = ["Low", "Medium", "High", "Critical"];

function ratingClass(rating: string | null) {
  if (rating === "Critical") return "border-audity-error text-audity-error";
  if (rating === "High") return "border-audity-warning text-audity-warning";
  if (rating === "Medium") return "border-audity-primary text-audity-primary";
  return "border-audity-borderStrong text-audity-secondary";
}

function RoadmapPhaseColumn({
  phase,
  items,
  canDrag
}: {
  phase: string;
  items: RoadmapItem[];
  canDrag: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: phase });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-48 rounded-audity border p-3 ${isOver ? "border-audity-primary bg-audity-primaryActive/20" : "border-audity-border bg-audity-page"}`}
    >
      <h3 className="mb-3 text-sm font-semibold">{phase}</h3>
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
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`${canDrag ? "cursor-grab active:cursor-grabbing" : ""} rounded-audity border border-audity-borderStrong bg-audity-panel px-3 py-2 ${isDragging ? "opacity-70" : ""}`}
    >
      <p className="text-sm font-semibold">{item.action}</p>
      <p className="mt-1 text-xs text-audity-muted">{item.riskTitle} · {item.effortEstimate}</p>
    </div>
  );
}

export function AssessmentWorkflowPage() {
  const { id } = useParams();
  const api = useApi();
  const { user } = useAuth();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission));
  const canApproveFindings = can("finding.approve");
  const canAcceptRisk = can("risk.accept");
  const canEditRisk = can("risk.edit");
  const canEditRoadmap = can("roadmap.edit");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [selectedRiskId, setSelectedRiskId] = useState("");
  const [riskForm, setRiskForm] = useState({
    likelihood: 3,
    impact: 3,
    treatmentOption: "mitigate",
    owner: "",
    treatmentPlan: "",
    dueDate: "",
    status: "open"
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

  const selectedFinding = useMemo(
    () => findings.find((finding) => finding.id === selectedFindingId) ?? findings[0],
    [findings, selectedFindingId]
  );
  const selectedRisk = useMemo(
    () => risks.find((risk) => risk.id === selectedRiskId) ?? risks[0],
    [risks, selectedRiskId]
  );

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
    void load().catch((err) => setError(err instanceof Error ? err.message : "Workflow load failed"));
  }, [id]);

  async function updateFinding(action: "accept" | "dismiss" | "mark-as-accepted-risk") {
    if (!id || !selectedFinding) return;
    setError("");
    setSaved("");
    try {
      await api(`/api/assessments/${id}/findings/${selectedFinding.id}`, {
        method: "PUT",
        body: JSON.stringify({ action })
      });
      await load();
      setSaved("Finding updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finding update failed");
    }
  }

  async function createRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !selectedFinding) return;
    setError("");
    setSaved("");
    try {
      const payload = await api<{ risk: Risk }>(`/api/assessments/${id}/risks`, {
        method: "POST",
        body: JSON.stringify({
          findingId: selectedFinding.id,
          title: selectedFinding.title,
          ...riskForm
        })
      });
      await load();
      setSelectedRiskId(payload.risk.id);
      setSaved("Risk created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Risk create failed");
    }
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
    if (!item || !phases.includes(phase)) return;
    await api(`/api/assessments/${id}/roadmap/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ phase })
    });
    await load();
  }

  return (
    <>
          <div className="mb-5 border-b border-audity-border pb-4">
            <p className="text-xs font-semibold uppercase text-audity-primary">Guided Workflow</p>
            <h1 className="mt-1 text-2xl font-semibold">Findings, Risks & Roadmap</h1>
            <p className="mt-2 text-sm text-audity-secondary">
              {findings.length} findings · {risks.length} risks · {roadmapItems.length} roadmap items
            </p>
          </div>
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
          {saved ? <div className="mb-4 rounded-audity border border-audity-success bg-[#17251D] px-3 py-2 text-sm text-audity-success">{saved}</div> : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="rounded-audity border border-audity-border bg-audity-panel">
              <div className="border-b border-audity-border px-4 py-3">
                <h2 className="text-lg font-semibold">Finding Review</h2>
              </div>
              <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="divide-y divide-audity-border border-r border-audity-border">
                  {findings.map((finding) => (
                    <button
                      key={finding.id}
                      className={`block w-full px-4 py-3 text-left hover:bg-audity-panelAlt ${finding.id === selectedFinding?.id ? "bg-audity-primaryActive/25" : ""}`}
                      onClick={() => setSelectedFindingId(finding.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-audity-primary">{finding.controlCode}</p>
                        <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-[11px] text-audity-secondary">{finding.status}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold">{finding.title}</p>
                      <p className="mt-1 text-xs text-audity-muted">Score {finding.score} · {finding.priority}</p>
                    </button>
                  ))}
                  {!findings.length ? <div className="px-4 py-10 text-center text-sm text-audity-muted">No suggested findings yet</div> : null}
                </div>
                <div className="p-4">
                  {selectedFinding ? (
                    <>
                      <p className="text-xs font-semibold uppercase text-audity-primary">{selectedFinding.controlCode}</p>
                      <h3 className="mt-1 text-xl font-semibold">{selectedFinding.title}</h3>
                      <p className="mt-3 text-sm text-audity-secondary">{selectedFinding.sourceExplanation}</p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                          <p className="text-xs font-semibold uppercase text-audity-muted">Observation</p>
                          <p className="mt-2 text-sm text-audity-secondary">{selectedFinding.observation}</p>
                        </div>
                        <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                          <p className="text-xs font-semibold uppercase text-audity-muted">Recommendation</p>
                          <p className="mt-2 text-sm text-audity-secondary">{selectedFinding.recommendation}</p>
                        </div>
                      </div>
                      {(canApproveFindings || canAcceptRisk) ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canApproveFindings ? (
                        <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover" onClick={() => void updateFinding("accept")}>Accept</button>
                        ) : null}
                        {canAcceptRisk ? (
                        <button className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary" onClick={() => void updateFinding("mark-as-accepted-risk")}>Accepted risk</button>
                        ) : null}
                        {canApproveFindings ? (
                        <button className="h-9 rounded-audity border border-audity-error bg-audity-panelAlt px-3 text-sm text-audity-error hover:bg-[#2A1C17]" onClick={() => void updateFinding("dismiss")}>Dismiss</button>
                        ) : null}
                      </div>
                      ) : null}
                      <div className="mt-5">
                        <p className="mb-2 text-xs font-semibold uppercase text-audity-muted">Framework Mapping</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          {selectedFinding.mappings.map((mapping) => (
                            <div key={`${mapping.controlId}-${mapping.code}`} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                              <p className="text-xs font-semibold text-audity-primary">{mapping.code}</p>
                              <p className="mt-1 text-sm text-audity-secondary">{mapping.title}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </section>
            <aside className="space-y-4">
              {canEditRisk ? (
              <form onSubmit={createRisk} className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-4 text-lg font-semibold">Create Risk</h2>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold uppercase text-audity-secondary">Likelihood
                    <input className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" type="number" min="1" max="5" value={riskForm.likelihood} onChange={(event) => setRiskForm({ ...riskForm, likelihood: Number(event.target.value) })} />
                  </label>
                  <label className="block text-xs font-semibold uppercase text-audity-secondary">Impact
                    <input className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" type="number" min="1" max="5" value={riskForm.impact} onChange={(event) => setRiskForm({ ...riskForm, impact: Number(event.target.value) })} />
                  </label>
                </div>
                <label className="mt-3 block text-xs font-semibold uppercase text-audity-secondary">Owner
                  <input className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={riskForm.owner} onChange={(event) => setRiskForm({ ...riskForm, owner: event.target.value })} />
                </label>
                <label className="mt-3 block text-xs font-semibold uppercase text-audity-secondary">Treatment Plan
                  <textarea className="mt-2 min-h-24 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={riskForm.treatmentPlan} onChange={(event) => setRiskForm({ ...riskForm, treatmentPlan: event.target.value })} />
                </label>
                <button className="mt-3 h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover" disabled={!selectedFinding}>Create risk from finding</button>
              </form>
              ) : null}
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-4 text-lg font-semibold">Risk Matrix</h2>
                <div className="grid grid-cols-2 gap-2">
                  {ratings.map((rating) => (
                    <div key={rating} className={`rounded-audity border p-3 ${ratingClass(rating)}`}>
                      <p className="text-sm font-semibold">{rating}</p>
                      <p className="mt-1 text-2xl font-semibold">{risks.filter((risk) => risk.rating === rating).length}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {risks.map((risk) => (
                    <button key={risk.id} className={`block w-full rounded-audity border px-3 py-2 text-left ${risk.id === selectedRisk?.id ? "border-audity-primary bg-audity-primaryActive/25" : "border-audity-border bg-audity-page"}`} onClick={() => setSelectedRiskId(risk.id)}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{risk.title}</p>
                        <span className={`rounded-audity border px-2 py-1 text-[11px] ${ratingClass(risk.rating)}`}>{risk.rating}</span>
                      </div>
                      <p className="mt-1 text-xs text-audity-muted">L{risk.likelihood} x I{risk.impact} = {risk.riskScore}</p>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </div>
          <section className="mt-4 rounded-audity border border-audity-border bg-audity-panel p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Roadmap Builder</h2>
                <p className="mt-1 text-xs text-audity-muted">Drag cards between columns to change timeframe.</p>
              </div>
              {canEditRoadmap ? (
              <form className="flex flex-wrap gap-2" onSubmit={createRoadmapItem}>
                <select className="h-9 rounded-audity border border-audity-border bg-audity-page px-2 text-sm text-audity-text" value={roadmapForm.phase} onChange={(event) => setRoadmapForm({ ...roadmapForm, phase: event.target.value })}>
                  {phases.map((phase) => <option key={phase}>{phase}</option>)}
                </select>
                <input className="h-9 w-64 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="Roadmap action" value={roadmapForm.action} onChange={(event) => setRoadmapForm({ ...roadmapForm, action: event.target.value })} />
                <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover" disabled={!selectedRisk}>Generate from risk</button>
              </form>
              ) : null}
            </div>
            <DndContext onDragEnd={(event) => void moveRoadmapItem(event)}>
              <div className="grid gap-3 xl:grid-cols-4">
                {phases.map((phase) => (
                  <RoadmapPhaseColumn
                    key={phase}
                    phase={phase}
                    items={roadmapItems.filter((item) => item.phase === phase)}
                    canDrag={canEditRoadmap}
                  />
                ))}
              </div>
            </DndContext>
          </section>
    </>
  );
}
