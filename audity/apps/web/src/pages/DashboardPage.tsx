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
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { EmptyState } from "../components/ui";

type SharedUser = {
  id: string;
  name: string;
  email: string;
};

type AssessmentSummary = {
  id: string;
  type: string;
  framework?: string | null;
  status: string;
  targetDate?: string | null;
  progressPercent?: number;
  openHighRisks?: number;
  criticalRisks?: number;
  openFindings?: number;
  evidenceGaps?: number;
  overdueRoadmapItems?: number;
  reports?: number;
};

type OwnedCustomer = {
  customerId: string;
  customerName: string;
  customerStatus: string;
  sharedWith: SharedUser[];
  assessments: AssessmentSummary[];
};

type SharedCustomer = {
  id: string;
  name: string;
  status: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  sharedAt: string;
  assessments: AssessmentSummary[];
};

type DashboardPayload = {
  ownedCustomers: OwnedCustomer[];
  sharedCustomers: SharedCustomer[];
};

type WidgetCategory = "metrics" | "work" | "risk" | "delivery" | "team";

type WidgetId =
  | "summary"
  | "customers"
  | "shared"
  | "openTasks"
  | "criticalRisks"
  | "overdueItems"
  | "upcomingDeadlines"
  | "assessmentProgress"
  | "evidenceGaps"
  | "reviewQueue"
  | "recentlyChanged"
  | "riskHeatmap"
  | "topRiskOwners"
  | "frameworkCoverage"
  | "reportReadiness"
  | "latestReports"
  | "customerHealth"
  | "accountSecurityStatus"
  | "dataQualityIssues"
  | "importExportShortcuts"
  | "roadmapTimeline"
  | "executiveSummary"
  | "riskSignals"
  | "dueActions"
  | "reports"
  | "onboarding";

const storageKey = "audity_dashboard_widget_order";
const defaultWidgets: WidgetId[] = ["summary", "openTasks", "criticalRisks", "customers"];

const widgetLibrary: Record<WidgetId, { title: string; category: WidgetCategory; description: string }> = {
  summary: { title: "Audit Summary", category: "metrics", description: "Customers, assessments, critical risks and evidence gaps at a glance." },
  customers: { title: "My Customers & Assessments", category: "work", description: "Active customers and assessments with progress and risk signals." },
  shared: { title: "Shared With Me", category: "work", description: "Customers another user has shared with you." },
  openTasks: { title: "Open Tasks", category: "work", description: "Findings, evidence gaps and overdue roadmap items in one queue." },
  assessmentProgress: { title: "Assessment Progress", category: "work", description: "Compare progress across active assessments." },
  evidenceGaps: { title: "Evidence Gaps", category: "work", description: "Assessments missing evidence — drives collection." },
  reviewQueue: { title: "Review Queue", category: "work", description: "Findings and risk signals waiting for review." },
  upcomingDeadlines: { title: "Upcoming Deadlines", category: "work", description: "Target dates and assessment deadlines." },
  overdueItems: { title: "Overdue Items", category: "work", description: "Past-due roadmap actions and follow-ups." },
  dueActions: { title: "Due Actions", category: "work", description: "Roadmap items with overdue or upcoming targets." },
  criticalRisks: { title: "Critical Risks", category: "risk", description: "Assessments carrying critical risk — executive escalation." },
  riskSignals: { title: "Risk Signals", category: "risk", description: "Critical, high, findings and gap counts side-by-side." },
  riskHeatmap: { title: "Risk Heatmap", category: "risk", description: "Compact matrix view of risk pressure." },
  recentlyChanged: { title: "Recent Activity", category: "risk", description: "Recently active customer and assessment areas." },
  dataQualityIssues: { title: "Data Quality", category: "risk", description: "Missing owners, plans, due dates and evidence gaps." },
  reportReadiness: { title: "Report Readiness", category: "delivery", description: "Pre-delivery checklist based on risks, evidence and findings." },
  latestReports: { title: "Latest Reports", category: "delivery", description: "Recent report counts with shortcuts." },
  reports: { title: "Report Status", category: "delivery", description: "How many reports exist per assessment." },
  importExportShortcuts: { title: "Import/Export", category: "delivery", description: "Quick links to report builder, framework import, exports." },
  roadmapTimeline: { title: "Roadmap Timeline", category: "delivery", description: "0-30d, 31-90d, 3-6M and 6-12M phases." },
  executiveSummary: { title: "Executive Summary", category: "delivery", description: "Concise narrative from current dashboard metrics." },
  topRiskOwners: { title: "Top Risk Owners", category: "team", description: "Where risk ownership is concentrated or missing." },
  customerHealth: { title: "Customer Health", category: "team", description: "Per-customer health signal from risks and overdue items." },
  frameworkCoverage: { title: "Framework Coverage", category: "team", description: "Which frameworks are represented in active assessments." },
  accountSecurityStatus: { title: "Account Security", category: "team", description: "MFA and account security posture link." },
  onboarding: { title: "First Setup", category: "team", description: "Short checklist for new users — remove after onboarding." }
};

const categoryLabels: Record<WidgetCategory, string> = {
  metrics: "Overview",
  work: "Daily work",
  risk: "Risk & quality",
  delivery: "Reports & delivery",
  team: "Team & coverage"
};

function loadWidgetOrder(): WidgetId[] {
  const raw = window.localStorage.getItem(storageKey);
  if (raw === null) return defaultWidgets;
  try {
    const parsed = JSON.parse(raw) as WidgetId[];
    if (!Array.isArray(parsed)) return defaultWidgets;
    const valid = parsed.filter((id): id is WidgetId => id in widgetLibrary);
    return valid;
  } catch {
    return defaultWidgets;
  }
}

function ProgressBar({ value, tone = "primary" }: { value: number; tone?: "primary" | "warning" | "error" }) {
  const safe = Math.max(0, Math.min(100, value));
  const fill = tone === "error" ? "bg-audity-error" : tone === "warning" ? "bg-audity-warning" : "bg-audity-primary";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-audity-panelAlt">
      <div className={`h-full rounded-full ${fill} transition-all`} style={{ width: `${safe}%` }} />
    </div>
  );
}

function SignalPill({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" | "error" | "success" }) {
  const toneClass =
    tone === "error"
      ? "border-audity-error/40 bg-audity-error/10 text-audity-error"
      : tone === "warning"
        ? "border-audity-warning/40 bg-audity-warning/10 text-audity-warning"
        : tone === "success"
          ? "border-audity-success/40 bg-audity-success/10 text-audity-success"
          : "border-audity-border bg-audity-panelAlt text-audity-secondary";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${toneClass}`}>
      <span className="text-audity-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function DroppableArea({ id, children, className }: { id: string; children: ReactNode; className: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? "border-audity-primary bg-audity-primaryActive/20" : ""}`}>
      {children}
    </div>
  );
}

function WidgetShell({
  id,
  editMode,
  onRemove,
  children
}: {
  id: WidgetId;
  editMode: boolean;
  onRemove: (id: WidgetId) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `dashboard:${id}`,
    disabled: !editMode
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot:${id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <section
      ref={(node) => {
        setNodeRef(node);
        setDropRef(node);
      }}
      style={style}
      className={`audity-card transition ${isOver ? "border-audity-primary" : ""} ${isDragging ? "opacity-70" : ""}`}
    >
      {editMode ? (
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-audity-border pb-3">
          <div
            className="min-w-0 flex-1 cursor-grab active:cursor-grabbing"
            {...listeners}
            {...attributes}
          >
            <p className="text-[11px] font-medium text-audity-muted">{categoryLabels[widgetLibrary[id].category]}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-audity-text">{widgetLibrary[id].title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="audity-chip cursor-grab" {...listeners} {...attributes}>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
              </svg>
              Drag
            </span>
            <button
              type="button"
              className="audity-btn-ghost audity-btn-sm text-audity-error hover:bg-audity-error/10 hover:text-audity-error"
              onClick={() => onRemove(id)}
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

function LibraryCard({ id, onAdd }: { id: WidgetId; onAdd: (id: WidgetId) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `library:${id}` });
  const meta = widgetLibrary[id];
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-audity-md border border-audity-border bg-audity-page p-3 transition active:cursor-grabbing hover:border-audity-borderStrong ${isDragging ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-audity-text">{meta.title}</h3>
          <p className="mt-1 text-[12px] leading-5 text-audity-secondary">{meta.description}</p>
        </div>
        <button
          type="button"
          className="audity-btn-soft audity-btn-sm shrink-0"
          onClick={() => onAdd(id)}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div className="audity-card">
      <div className="audity-skeleton mb-3 h-3 w-20" />
      <div className="audity-skeleton mb-4 h-5 w-48" />
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-audity-md border border-audity-border bg-audity-page p-3">
            <div className="audity-skeleton h-3 w-16" />
            <div className="audity-skeleton mt-3 h-7 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const api = useApi();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(loadWidgetOrder);
  const [editMode, setEditMode] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<WidgetCategory | "all">("all");
  const [error, setError] = useState("");
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    let cancelled = false;
    void api<DashboardPayload>("/api/dashboard")
      .then((payload) => { if (!cancelled) setDashboard(payload); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Dashboard load failed"); });
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(widgetOrder));
  }, [widgetOrder]);

  const assessments = useMemo(() => dashboard?.ownedCustomers.flatMap((customer) => customer.assessments.map((assessment) => ({
    ...assessment,
    customerId: customer.customerId,
    customerName: customer.customerName
  }))) ?? [], [dashboard]);

  const totals = useMemo(() => ({
    assessments: assessments.length,
    customers: dashboard?.ownedCustomers.length ?? 0,
    critical: assessments.reduce((sum, assessment) => sum + (assessment.criticalRisks ?? 0), 0),
    high: assessments.reduce((sum, assessment) => sum + (assessment.openHighRisks ?? 0), 0),
    findings: assessments.reduce((sum, assessment) => sum + (assessment.openFindings ?? 0), 0),
    gaps: assessments.reduce((sum, assessment) => sum + (assessment.evidenceGaps ?? 0), 0),
    overdue: assessments.reduce((sum, assessment) => sum + (assessment.overdueRoadmapItems ?? 0), 0),
    reports: assessments.reduce((sum, assessment) => sum + (assessment.reports ?? 0), 0)
  }), [assessments, dashboard]);

  const unusedWidgets = (Object.keys(widgetLibrary) as WidgetId[]).filter((id) => !widgetOrder.includes(id));
  const filteredUnused = libraryFilter === "all" ? unusedWidgets : unusedWidgets.filter((id) => widgetLibrary[id].category === libraryFilter);

  function moveWidget(activeId: WidgetId, overId: WidgetId) {
    setWidgetOrder((current) => {
      const without = current.filter((id) => id !== activeId);
      const index = without.indexOf(overId);
      if (index < 0) return [...without, activeId];
      return [...without.slice(0, index), activeId, ...without.slice(index)];
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const active = String(event.active.id);
    const over = event.over ? String(event.over.id) : "";
    const activeId = active.replace(/^dashboard:|^library:/, "") as WidgetId;
    if (!(activeId in widgetLibrary)) return;
    if (over === "library" || over === "remove-zone" || over.startsWith("library:")) {
      setWidgetOrder((current) => current.filter((id) => id !== activeId));
      return;
    }
    if (over === "dashboard") {
      setWidgetOrder((current) => current.includes(activeId) ? current : [...current, activeId]);
      return;
    }
    if (over.startsWith("slot:")) {
      const overId = over.replace("slot:", "") as WidgetId;
      if (overId in widgetLibrary) moveWidget(activeId, overId);
    }
  }

  function addWidget(id: WidgetId) {
    setWidgetOrder((current) => current.includes(id) ? current : [...current, id]);
  }

  function removeWidget(id: WidgetId) {
    setWidgetOrder((current) => current.filter((item) => item !== id));
  }

  function widgetHeader(title: string, action?: ReactNode) {
    return (
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="audity-section-title">{title}</h2>
        {action}
      </div>
    );
  }

  function emptyState(text: string) {
    return <p className="rounded-audity-md border border-dashed border-audity-border px-3 py-8 text-center text-sm text-audity-muted">{text}</p>;
  }

  function assessmentLink(assessment: (typeof assessments)[number], to: string, right?: ReactNode) {
    return (
      <Link key={`${to}-${assessment.id}`} className="group flex items-start justify-between gap-3 rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5 transition hover:border-audity-primary hover:bg-audity-panelAlt" to={to}>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-audity-text">{assessment.customerName}</p>
          <p className="mt-0.5 text-xs text-audity-muted">{assessment.type} · {assessment.framework ?? "No framework"}</p>
        </div>
        {right}
      </Link>
    );
  }

  function compactList(title: string, items: ReactNode[], emptyText: string) {
    return (
      <>
        {widgetHeader(title)}
        <div className="space-y-2">
          {items.length ? items.slice(0, 8) : emptyState(emptyText)}
        </div>
      </>
    );
  }

  function renderWidget(id: WidgetId) {
    if (id === "openTasks") {
      const items = assessments
        .filter((assessment) => (assessment.openFindings ?? 0) || (assessment.evidenceGaps ?? 0) || (assessment.overdueRoadmapItems ?? 0))
        .map((assessment) => assessmentLink(
          assessment,
          `/assessments/${assessment.id}/workflow`,
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <SignalPill label="Findings" value={assessment.openFindings ?? 0} />
            <SignalPill label="Gaps" value={assessment.evidenceGaps ?? 0} tone={(assessment.evidenceGaps ?? 0) ? "warning" : "neutral"} />
          </div>
        ));
      return compactList("Open Tasks", items, "No open tasks");
    }
    if (id === "criticalRisks") {
      const items = assessments
        .filter((assessment) => (assessment.criticalRisks ?? 0) > 0)
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/workflow`, <SignalPill label="Critical" value={assessment.criticalRisks ?? 0} tone="error" />));
      return compactList("Critical Risks", items, "No critical risks");
    }
    if (id === "overdueItems") {
      const items = assessments
        .filter((assessment) => (assessment.overdueRoadmapItems ?? 0) > 0)
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/workflow`, <SignalPill label="Overdue" value={assessment.overdueRoadmapItems ?? 0} tone="error" />));
      return compactList("Overdue Items", items, "No overdue items");
    }
    if (id === "upcomingDeadlines") {
      const items = assessments
        .filter((assessment) => assessment.targetDate)
        .sort((a, b) => String(a.targetDate).localeCompare(String(b.targetDate)))
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/questions`, <span className="shrink-0 text-xs font-medium tabular-nums text-audity-secondary">{assessment.targetDate}</span>));
      return compactList("Upcoming Deadlines", items, "No upcoming deadlines");
    }
    if (id === "assessmentProgress") {
      return (
        <>
          {widgetHeader("Assessment Progress")}
          <div className="space-y-3">
            {assessments.slice(0, 8).map((assessment) => (
              <Link key={assessment.id} to={`/assessments/${assessment.id}/questions`} className="block rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5 transition hover:border-audity-primary">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="truncate text-[13px] font-semibold">{assessment.customerName} · {assessment.type}</p>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-audity-secondary">{assessment.progressPercent ?? 0}%</span>
                </div>
                <ProgressBar value={assessment.progressPercent ?? 0} />
              </Link>
            ))}
            {!assessments.length ? emptyState("No assessments available") : null}
          </div>
        </>
      );
    }
    if (id === "evidenceGaps") {
      const items = assessments
        .filter((assessment) => (assessment.evidenceGaps ?? 0) > 0)
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/questions`, <SignalPill label="Gaps" value={assessment.evidenceGaps ?? 0} tone="warning" />));
      return compactList("Evidence Gaps", items, "No evidence gaps");
    }
    if (id === "reviewQueue") {
      const items = assessments
        .filter((assessment) => (assessment.openFindings ?? 0) > 0 || (assessment.openHighRisks ?? 0) > 0)
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/workflow`, <SignalPill label="Review" value={(assessment.openFindings ?? 0) + (assessment.openHighRisks ?? 0)} tone="warning" />));
      return compactList("Review Queue", items, "Nothing waiting for review");
    }
    if (id === "recentlyChanged") {
      const items = assessments.slice(0, 8).map((assessment) => assessmentLink(
        assessment,
        `/assessments/${assessment.id}/workflow`,
        <span className="audity-chip shrink-0">{assessment.status}</span>
      ));
      return compactList("Recent Activity", items, "No recent activity");
    }
    if (id === "riskHeatmap") {
      const cells = [
        ["Critical", totals.critical, "bg-audity-error/80"],
        ["High", Math.max(0, totals.high - totals.critical), "bg-audity-warning/80"],
        ["Findings", totals.findings, "bg-audity-primary/80"],
        ["Gaps", totals.gaps, "bg-audity-panelAlt"]
      ] as Array<[string, number, string]>;
      return (
        <>
          {widgetHeader("Risk Heatmap")}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {cells.map(([label, value, color]) => (
              <div key={label} className="rounded-audity-md border border-audity-border bg-audity-page p-3">
                <div className={`mb-3 h-12 rounded-audity ${color}`} />
                <p className="text-xs font-medium text-audity-muted">{label}</p>
                <p className="audity-metric-value mt-0.5 text-audity-text" style={{ fontSize: "1.5rem", lineHeight: "1.75rem" }}>{value}</p>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (id === "topRiskOwners") {
      const items = dashboard?.ownedCustomers.slice(0, 8).map((customer) => {
        const count = customer.assessments.reduce((sum, assessment) => sum + (assessment.openHighRisks ?? 0) + (assessment.openFindings ?? 0), 0);
        return (
          <Link key={customer.customerId} to={`/customers/${customer.customerId}`} className="flex items-center justify-between gap-3 rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5 transition hover:border-audity-primary">
            <p className="truncate text-[13px] font-semibold">{customer.customerName}</p>
            <SignalPill label="Risk load" value={count} tone={count ? "warning" : "neutral"} />
          </Link>
        );
      }) ?? [];
      return compactList("Top Risk Owners", items, "No workload signals");
    }
    if (id === "frameworkCoverage") {
      const byFramework = new Map<string, { count: number; progress: number }>();
      assessments.forEach((assessment) => {
        const key = assessment.framework ?? "No framework";
        const current = byFramework.get(key) ?? { count: 0, progress: 0 };
        byFramework.set(key, { count: current.count + 1, progress: current.progress + (assessment.progressPercent ?? 0) });
      });
      const items = Array.from(byFramework.entries()).map(([name, value]) => (
        <div key={name} className="rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="truncate text-[13px] font-semibold">{name}</p>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-audity-secondary">{Math.round(value.progress / Math.max(1, value.count))}%</span>
          </div>
          <ProgressBar value={value.progress / Math.max(1, value.count)} />
        </div>
      ));
      return compactList("Framework Coverage", items, "No framework coverage yet");
    }
    if (id === "reportReadiness") {
      const checks = [
        ["No critical risks", totals.critical === 0],
        ["No evidence gaps", totals.gaps === 0],
        ["No overdue actions", totals.overdue === 0],
        ["Reports created", totals.reports > 0]
      ] as Array<[string, boolean]>;
      return (
        <>
          {widgetHeader("Report Readiness")}
          <div className="space-y-2">
            {checks.map(([label, ok]) => (
              <div key={label} className="flex items-center justify-between rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5">
                <span className="text-[13px] text-audity-secondary">{label}</span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${ok ? "text-audity-success" : "text-audity-warning"}`}>
                  <span className={`h-2 w-2 rounded-full ${ok ? "bg-audity-success" : "bg-audity-warning"}`} />
                  {ok ? "Ready" : "Review"}
                </span>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (id === "latestReports") {
      const items = assessments
        .filter((assessment) => (assessment.reports ?? 0) > 0)
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/assets`, <SignalPill label="Reports" value={assessment.reports ?? 0} />));
      return compactList("Latest Reports", items, "No reports created yet");
    }
    if (id === "customerHealth") {
      const items = dashboard?.ownedCustomers.slice(0, 8).map((customer) => {
        const score = customer.assessments.reduce((sum, assessment) => sum + (assessment.criticalRisks ?? 0) * 3 + (assessment.openHighRisks ?? 0) + (assessment.overdueRoadmapItems ?? 0), 0);
        const tone = score > 5 ? "error" : score > 0 ? "warning" : "success";
        return (
          <Link key={customer.customerId} to={`/customers/${customer.customerId}`} className="flex items-center justify-between gap-3 rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5 transition hover:border-audity-primary">
            <p className="truncate text-[13px] font-semibold">{customer.customerName}</p>
            <SignalPill label="Health" value={score} tone={tone} />
          </Link>
        );
      }) ?? [];
      return compactList("Customer Health", items, "No customer health signals");
    }
    if (id === "accountSecurityStatus") {
      return (
        <>
          {widgetHeader("Account Security")}
          <div className="rounded-audity-md border border-audity-border bg-audity-page p-3">
            <p className="text-[13px] font-semibold">{user?.email}</p>
            <p className="mt-1 text-xs text-audity-muted">{user?.role} · MFA is managed in User Settings.</p>
            <Link className="audity-btn-soft audity-btn-sm mt-3" to="/user-settings">Open User Settings</Link>
          </div>
        </>
      );
    }
    if (id === "dataQualityIssues") {
      const issues = [
        ["Evidence gaps", totals.gaps],
        ["Open findings", totals.findings],
        ["Overdue actions", totals.overdue],
        ["Assessments without reports", Math.max(0, totals.assessments - totals.reports)]
      ] as Array<[string, number]>;
      return (
        <>
          {widgetHeader("Data Quality")}
          <div className="grid gap-2 md:grid-cols-2">
            {issues.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5">
                <span className="text-xs text-audity-secondary">{label}</span>
                <SignalPill label="" value={value} tone={value ? "warning" : "success"} />
              </div>
            ))}
          </div>
        </>
      );
    }
    if (id === "importExportShortcuts") {
      const firstAssessment = assessments[0];
      return (
        <>
          {widgetHeader("Import / Export")}
          <div className="flex flex-wrap gap-2">
            <Link className="audity-btn-secondary audity-btn-sm" to={firstAssessment ? `/assessments/${firstAssessment.id}/assets` : "/customers"}>Report Builder</Link>
            <Link className="audity-btn-secondary audity-btn-sm" to="/admin/frameworks">Framework Import</Link>
            <Link className="audity-btn-secondary audity-btn-sm" to={firstAssessment ? `/assessments/${firstAssessment.id}/workflow` : "/customers"}>Risk CSV</Link>
          </div>
        </>
      );
    }
    if (id === "roadmapTimeline") {
      const phases = [
        ["0–30 d", totals.overdue],
        ["31–90 d", totals.high],
        ["3–6 M", totals.findings],
        ["6–12 M", totals.gaps]
      ] as Array<[string, number]>;
      return (
        <>
          {widgetHeader("Roadmap Timeline")}
          <div className="grid gap-2 md:grid-cols-4">
            {phases.map(([phase, value]) => (
              <div key={phase} className="rounded-audity-md border border-audity-border bg-audity-page p-3">
                <p className="text-xs font-medium text-audity-muted">{phase}</p>
                <p className="audity-metric-value mt-1 text-audity-text" style={{ fontSize: "1.5rem", lineHeight: "1.75rem" }}>{value}</p>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (id === "executiveSummary") {
      return (
        <>
          {widgetHeader("Executive Summary")}
          <p className="rounded-audity-md border border-audity-border bg-audity-page p-4 text-[13px] leading-6 text-audity-secondary">
            Your workspace contains <strong className="text-audity-text tabular-nums">{totals.customers}</strong> customers
            and <strong className="text-audity-text tabular-nums">{totals.assessments}</strong> assessments. There are
            currently <strong className="text-audity-error tabular-nums">{totals.critical}</strong> critical risks,
            <strong className="text-audity-warning tabular-nums"> {totals.high}</strong> high or critical signals,
            <strong className="text-audity-warning tabular-nums"> {totals.gaps}</strong> evidence gaps
            and <strong className="text-audity-error tabular-nums">{totals.overdue}</strong> overdue roadmap items.
          </p>
        </>
      );
    }
    if (id === "summary") {
      const tiles: Array<[string, number, "neutral" | "error" | "warning"]> = [
        ["Customers", totals.customers, "neutral"],
        ["Assessments", totals.assessments, "neutral"],
        ["Critical risks", totals.critical, totals.critical ? "error" : "neutral"],
        ["Evidence gaps", totals.gaps, totals.gaps ? "warning" : "neutral"]
      ];
      return (
        <>
          {widgetHeader("Audit Summary")}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {tiles.map(([label, value, tone]) => (
              <div key={label} className="rounded-audity-md border border-audity-border bg-audity-page px-3 py-3.5">
                <p className="audity-metric-label">{label}</p>
                <p className={`audity-metric-value mt-1 ${tone === "error" ? "text-audity-error" : tone === "warning" ? "text-audity-warning" : "text-audity-text"}`}>{value}</p>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (id === "customers") {
      return (
        <>
          {widgetHeader("My Customers & Assessments", <Link to="/customers/my" className="text-xs font-medium text-audity-primary hover:underline">View all →</Link>)}
          <div className="space-y-3">
            {dashboard?.ownedCustomers.map((customer) => (
              <div key={customer.customerId} className="rounded-audity-md border border-audity-border bg-audity-page p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link className="truncate text-[13px] font-semibold text-audity-text hover:text-audity-primary" to={`/customers/${customer.customerId}`}>
                      {customer.customerName}
                    </Link>
                    <p className="mt-0.5 text-xs text-audity-muted">{customer.customerStatus}</p>
                  </div>
                  <div className="text-right text-xs text-audity-muted">
                    {customer.sharedWith.length ? (
                      <span>Shared · {customer.sharedWith.length}</span>
                    ) : (
                      <span>Not shared</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {customer.assessments.map((assessment) => (
                    <Link
                      key={assessment.id}
                      className="block rounded-audity-md border border-audity-border bg-audity-panelAlt/50 px-3 py-2.5 transition hover:border-audity-primary hover:bg-audity-panelAlt"
                      to={`/assessments/${assessment.id}/questions`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="truncate text-[13px] font-semibold">{assessment.type}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-audity-secondary">{assessment.progressPercent ?? 0}%</span>
                      </div>
                      <ProgressBar value={assessment.progressPercent ?? 0} />
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {(assessment.criticalRisks ?? 0) > 0 ? <SignalPill label="Critical" value={assessment.criticalRisks ?? 0} tone="error" /> : null}
                        {(assessment.openHighRisks ?? 0) > 0 ? <SignalPill label="High" value={assessment.openHighRisks ?? 0} tone="warning" /> : null}
                        {(assessment.openFindings ?? 0) > 0 ? <SignalPill label="Findings" value={assessment.openFindings ?? 0} /> : null}
                        {(assessment.evidenceGaps ?? 0) > 0 ? <SignalPill label="Gaps" value={assessment.evidenceGaps ?? 0} tone="warning" /> : null}
                        {(assessment.overdueRoadmapItems ?? 0) > 0 ? <SignalPill label="Overdue" value={assessment.overdueRoadmapItems ?? 0} tone="error" /> : null}
                        {!(assessment.criticalRisks ?? 0) && !(assessment.openHighRisks ?? 0) && !(assessment.openFindings ?? 0) && !(assessment.evidenceGaps ?? 0) && !(assessment.overdueRoadmapItems ?? 0) ? (
                          <span className="text-[11px] text-audity-muted">No open signals</span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[11px] text-audity-muted">
                        {assessment.framework ?? "No framework"} · {assessment.status}
                        {assessment.targetDate ? ` · Target ${assessment.targetDate}` : ""}
                      </p>
                    </Link>
                  ))}
                  {!customer.assessments.length ? (
                    <p className="rounded-audity-md border border-dashed border-audity-border px-3 py-4 text-xs text-audity-muted">No assessment running</p>
                  ) : null}
                </div>
              </div>
            ))}
            {!dashboard?.ownedCustomers.length ? <p className="py-10 text-center text-sm text-audity-muted">No customers in progress</p> : null}
          </div>
        </>
      );
    }
    if (id === "shared") {
      return (
        <>
          {widgetHeader("Shared With Me")}
          <div className="space-y-2">
            {dashboard?.sharedCustomers.map((customer) => (
              <Link key={customer.id} className="block rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5 transition hover:border-audity-primary" to={`/customers/${customer.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-audity-text">{customer.name}</p>
                    <p className="mt-0.5 text-xs text-audity-muted">Owner: {customer.ownerName ?? customer.ownerEmail ?? "Unknown"}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-audity-secondary">{customer.assessments.length}</span>
                </div>
              </Link>
            ))}
            {!dashboard?.sharedCustomers.length ? <p className="py-8 text-center text-sm text-audity-muted">No shared customers</p> : null}
          </div>
        </>
      );
    }
    if (id === "riskSignals") {
      const tiles: Array<[string, number, "neutral" | "error" | "warning"]> = [
        ["Critical risks", totals.critical, totals.critical ? "error" : "neutral"],
        ["High risks", totals.high, totals.high ? "warning" : "neutral"],
        ["Open findings", totals.findings, totals.findings ? "warning" : "neutral"],
        ["Evidence gaps", totals.gaps, totals.gaps ? "warning" : "neutral"]
      ];
      return (
        <>
          {widgetHeader("Risk Signals")}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {tiles.map(([label, value, tone]) => (
              <div key={label} className="rounded-audity-md border border-audity-border bg-audity-page p-3">
                <p className="audity-metric-label">{label}</p>
                <p className={`audity-metric-value mt-1 ${tone === "error" ? "text-audity-error" : tone === "warning" ? "text-audity-warning" : "text-audity-text"}`}>{value}</p>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (id === "dueActions") {
      const due = assessments.filter((assessment) => (assessment.overdueRoadmapItems ?? 0) > 0 || assessment.targetDate);
      return (
        <>
          {widgetHeader("Due Actions")}
          <div className="space-y-2">
            {due.slice(0, 8).map((assessment) => (
              <Link key={assessment.id} className="block rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5 transition hover:border-audity-primary" to={`/assessments/${assessment.id}/workflow`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-audity-text">{assessment.customerName}</p>
                    <p className="mt-0.5 text-xs text-audity-muted">{assessment.type}{assessment.targetDate ? ` · Target ${assessment.targetDate}` : ""}</p>
                  </div>
                  <SignalPill label="Overdue" value={assessment.overdueRoadmapItems ?? 0} tone={(assessment.overdueRoadmapItems ?? 0) > 0 ? "error" : "neutral"} />
                </div>
              </Link>
            ))}
            {!due.length ? <p className="py-8 text-center text-sm text-audity-muted">No due actions</p> : null}
          </div>
        </>
      );
    }
    if (id === "reports") {
      return (
        <>
          {widgetHeader("Report Status")}
          <div className="space-y-2">
            {assessments.slice(0, 8).map((assessment) => (
              <Link key={assessment.id} className="block rounded-audity-md border border-audity-border bg-audity-page px-3 py-2.5 transition hover:border-audity-primary" to={`/assessments/${assessment.id}/assets`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-audity-text">{assessment.customerName}</p>
                    <p className="mt-0.5 text-xs text-audity-muted">{assessment.type}</p>
                  </div>
                  <SignalPill label="Reports" value={assessment.reports ?? 0} />
                </div>
              </Link>
            ))}
            {!assessments.length ? <p className="py-8 text-center text-sm text-audity-muted">No assessments available</p> : null}
          </div>
        </>
      );
    }
    if (id === "onboarding") {
      return (
        <>
          {widgetHeader("First Setup")}
          <ol className="grid gap-2 md:grid-cols-4">
            {["Review User Settings", "Create or open Customer", "Start Assessment", "Answer Questions"].map((step, index) => (
              <li key={step} className="rounded-audity-md border border-audity-border bg-audity-page px-3 py-3">
                <p className="text-[11px] font-medium tracking-wide text-audity-primary">Step {index + 1}</p>
                <p className="mt-1.5 text-[13px] text-audity-text">{step}</p>
              </li>
            ))}
          </ol>
        </>
      );
    }
    const meta = (widgetLibrary as Record<string, { title: string; category: WidgetCategory; description: string } | undefined>)[id];
    return (
      <>
        {widgetHeader(meta?.title ?? id)}
        <div className="rounded-audity-md border border-dashed border-audity-border bg-audity-panelAlt/40 px-4 py-6 text-center">
          <p className="text-xs font-semibold text-audity-muted">Coming soon</p>
          <p className="mt-1 text-sm text-audity-secondary">{meta?.description ?? "This widget is not implemented yet."}</p>
        </div>
      </>
    );
  }

  const loading = !dashboard && !error;

  return (
    <>
      <div className="audity-page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="audity-page-kicker">Workspace overview</p>
          <h1 className="audity-page-title">Dashboard</h1>
          <p className="audity-page-copy">{user?.email} · {user?.role}</p>
        </div>
        <div className="flex gap-2">
          {editMode ? (
            <button className="audity-btn-secondary" onClick={() => setWidgetOrder(defaultWidgets)}>
              Reset to default
            </button>
          ) : null}
          <button className={editMode ? "audity-btn-primary" : "audity-btn-secondary"} onClick={() => setEditMode(!editMode)}>
            {editMode ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}

      {dashboard && !dashboard.ownedCustomers.length && !dashboard.sharedCustomers.length ? (
        <div className="mb-4">
          <EmptyState
            title="Welcome to Audity — let's set up your first audit"
            description="Start by creating a customer workspace. From there you can launch an assessment, work through the audit center, and track findings & evidence."
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-7l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/customers/my" className="audity-btn-primary">Create your first customer</Link>
                <Link to="/manual" className="audity-btn-secondary">Read the manual</Link>
              </div>
            }
          />
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3">
          <WidgetSkeleton />
          <WidgetSkeleton />
        </div>
      ) : (
        <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
          <div className={editMode ? "grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_320px]" : "grid gap-3"}>
            <DroppableArea id="dashboard" className={editMode ? "min-h-72 rounded-audity-md border border-dashed border-audity-border bg-audity-panelAlt/30 p-3" : ""}>
              <div className="grid gap-3">
                {widgetOrder.map((id) => (
                  <WidgetShell key={id} id={id} editMode={editMode} onRemove={removeWidget}>
                    {renderWidget(id)}
                  </WidgetShell>
                ))}
                {!widgetOrder.length ? (
                  <div className="rounded-audity-md border border-dashed border-audity-border bg-audity-panelAlt/40 px-3 py-12 text-center text-sm text-audity-muted">
                    Drag elements from the library into your dashboard, or click <strong>Add</strong> on a library card.
                  </div>
                ) : null}
              </div>
            </DroppableArea>

            {editMode ? (
              <DroppableArea id="library" className="rounded-audity-md border border-audity-border bg-audity-panel p-3 shadow-audity-soft">
                <div className="mb-3">
                  <h2 className="audity-section-title">Element library</h2>
                  <p className="mt-1 text-xs text-audity-muted">Drag a card into the dashboard, or drop a dashboard element here to remove it.</p>
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {(["all", "metrics", "work", "risk", "delivery", "team"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setLibraryFilter(cat)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${libraryFilter === cat ? "border-audity-primary bg-audity-primaryActive text-audity-primary" : "border-audity-border bg-audity-page text-audity-secondary hover:border-audity-borderStrong"}`}
                    >
                      {cat === "all" ? "All" : categoryLabels[cat]}
                    </button>
                  ))}
                </div>
                <DroppableArea id="remove-zone" className="mb-3 rounded-audity-md border border-dashed border-audity-error/60 bg-audity-error/10 px-3 py-3 text-xs text-audity-error">
                  Drop here to remove an element from the dashboard.
                </DroppableArea>
                <div className="space-y-2">
                  {filteredUnused.map((id) => <LibraryCard key={id} id={id} onAdd={addWidget} />)}
                  {!filteredUnused.length ? (
                    <div className="rounded-audity-md border border-dashed border-audity-border bg-audity-page px-3 py-8 text-center text-xs text-audity-muted">
                      {libraryFilter === "all" ? "All available elements are already on the dashboard." : "No elements in this category — try another filter."}
                    </div>
                  ) : null}
                </div>
              </DroppableArea>
            ) : null}
          </div>
        </DndContext>
      )}
    </>
  );
}
