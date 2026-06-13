import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";

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

type WidgetId =
  | "openTasks"
  | "myAssignedItems"
  | "criticalRisks"
  | "overdueItems"
  | "upcomingDeadlines"
  | "assessmentProgress"
  | "evidenceGaps"
  | "reviewQueue"
  | "recentlyChanged"
  | "auditActivityFeed"
  | "riskHeatmap"
  | "topRiskOwners"
  | "controlDomains"
  | "frameworkCoverage"
  | "reportReadiness"
  | "latestReports"
  | "customerHealth"
  | "acceptedRisksExpiring"
  | "accountSecurityStatus"
  | "dataQualityIssues"
  | "importExportShortcuts"
  | "notificationsSummary"
  | "teamWorkload"
  | "roadmapTimeline"
  | "executiveSummary"
  | "summary"
  | "customers"
  | "shared"
  | "riskSignals"
  | "dueActions"
  | "reports"
  | "onboarding";

const storageKey = "audity_dashboard_widget_order";
const defaultWidgets: WidgetId[] = ["summary", "openTasks", "customers", "criticalRisks", "evidenceGaps"];

const widgetLibrary: Record<WidgetId, { title: string; eyebrow: string; description: string; preview: string }> = {
  openTasks: {
    title: "Open Tasks",
    eyebrow: "Tasks",
    description: "Shows open work from findings, risks, evidence gaps and roadmap follow-ups. Best for users who want one operational queue.",
    preview: "Task queue"
  },
  myAssignedItems: {
    title: "My Assigned Items",
    eyebrow: "Personal",
    description: "Focuses on items assigned to the current user or likely owned by them. It helps each user start with their own work.",
    preview: "My work"
  },
  criticalRisks: {
    title: "Critical Risks",
    eyebrow: "Risk",
    description: "Shows assessments that currently carry critical risk. Use it as an executive escalation view.",
    preview: "Critical list"
  },
  overdueItems: {
    title: "Overdue Items",
    eyebrow: "Due",
    description: "Shows overdue roadmap actions and follow-ups. It is intended for daily cleanup and escalation.",
    preview: "Overdue"
  },
  upcomingDeadlines: {
    title: "Upcoming Deadlines",
    eyebrow: "Due",
    description: "Shows target dates and upcoming assessment deadlines. Useful for planning the next review cycle.",
    preview: "Timeline"
  },
  assessmentProgress: {
    title: "Assessment Progress",
    eyebrow: "Progress",
    description: "Compares progress across active assessments. It helps identify where answering or evidence work is stuck.",
    preview: "Progress bars"
  },
  evidenceGaps: {
    title: "Evidence Gaps",
    eyebrow: "Evidence",
    description: "Highlights assessments with missing or unvalidated evidence. Use it to drive evidence collection before reporting.",
    preview: "Gap list"
  },
  reviewQueue: {
    title: "Review Queue",
    eyebrow: "Review",
    description: "Shows findings and risk signals that still need review. It gives reviewers a compact approval queue.",
    preview: "Review list"
  },
  recentlyChanged: {
    title: "Recently Changed",
    eyebrow: "Activity",
    description: "Summarizes recently active customer and assessment areas. It is a lightweight shortcut back to recent work.",
    preview: "Recent feed"
  },
  auditActivityFeed: {
    title: "Audit Activity Feed",
    eyebrow: "Activity",
    description: "Shows a compact workflow event view for audit-relevant changes. It keeps audit movement visible without opening Admin.",
    preview: "Feed"
  },
  riskHeatmap: {
    title: "Risk Heatmap",
    eyebrow: "Risk",
    description: "Visualizes the risk distribution in a compact matrix-style view. It gives a quick sense of risk pressure.",
    preview: "5x5"
  },
  topRiskOwners: {
    title: "Top Risk Owners",
    eyebrow: "Ownership",
    description: "Shows where risk ownership is concentrated or missing. It helps identify workload and accountability problems.",
    preview: "Owners"
  },
  controlDomains: {
    title: "Control Domains",
    eyebrow: "Controls",
    description: "Shows maturity and coverage grouped by broad control domains. It is useful for domain-level steering.",
    preview: "Domains"
  },
  frameworkCoverage: {
    title: "Framework Coverage",
    eyebrow: "Framework",
    description: "Shows which frameworks are represented in active assessments. It helps teams understand coverage breadth.",
    preview: "Coverage"
  },
  reportReadiness: {
    title: "Report Readiness",
    eyebrow: "Reports",
    description: "Checks whether reports are likely ready based on risks, evidence gaps and findings. Use it before generating deliverables.",
    preview: "Checklist"
  },
  latestReports: {
    title: "Latest Reports",
    eyebrow: "Reports",
    description: "Shows recent report counts and shortcuts to report pages. It is useful for delivery-focused users.",
    preview: "Reports"
  },
  customerHealth: {
    title: "Customer Health",
    eyebrow: "Customers",
    description: "Gives each customer a simple health signal based on risks, findings and overdue items. It helps prioritize attention.",
    preview: "Health"
  },
  acceptedRisksExpiring: {
    title: "Accepted Risks Expiring",
    eyebrow: "Risk",
    description: "Shows accepted-risk expiry pressure once acceptance dates are available. For now it highlights assessments likely to need review.",
    preview: "Expiry"
  },
  accountSecurityStatus: {
    title: "MFA / Account Security Status",
    eyebrow: "Security",
    description: "Shows account security posture and a link to User Settings. The setup flow itself stays outside the dashboard.",
    preview: "Security"
  },
  dataQualityIssues: {
    title: "Data Quality Issues",
    eyebrow: "Quality",
    description: "Highlights missing owners, plans, due dates and evidence signals. It helps clean up audit data before reporting.",
    preview: "Quality"
  },
  importExportShortcuts: {
    title: "Import/Export Shortcuts",
    eyebrow: "Tools",
    description: "Provides quick links to report builder, assessment export and framework import areas. Useful for power users.",
    preview: "Shortcuts"
  },
  notificationsSummary: {
    title: "Notifications Summary",
    eyebrow: "Notifications",
    description: "Shows a compact reminder that notifications live in the top bar. It avoids duplicating the full notification feed.",
    preview: "Badge"
  },
  teamWorkload: {
    title: "Team Workload",
    eyebrow: "Team",
    description: "Summarizes workload by ownership signals and shared customers. It helps managers see collaboration load.",
    preview: "Workload"
  },
  roadmapTimeline: {
    title: "Roadmap Timeline",
    eyebrow: "Roadmap",
    description: "Shows work across 0-30d, 31-90d, 3-6M and 6-12M phases. It gives roadmap structure without opening the workflow page.",
    preview: "Timeline"
  },
  executiveSummary: {
    title: "Executive Summary",
    eyebrow: "Executive",
    description: "Creates a concise status narrative from the current dashboard metrics. It is suitable for leadership check-ins.",
    preview: "Summary"
  },
  summary: {
    title: "Audit Summary",
    eyebrow: "Metrics",
    description: "Shows the most important audit totals in one compact row. Good as the first widget for daily work.",
    preview: "4 KPI tiles"
  },
  customers: {
    title: "My Customers & Assessments",
    eyebrow: "Workspace",
    description: "Lists your active customers and assessments with progress and risk signals. Use it when you mostly jump into current work.",
    preview: "Customer cards"
  },
  shared: {
    title: "Customers Shared With Me",
    eyebrow: "Collaboration",
    description: "Shows customers another user has shared with you. Useful for reviewers and contributors who do not own the customer.",
    preview: "Shared list"
  },
  riskSignals: {
    title: "Risk Signals",
    eyebrow: "Risk",
    description: "Highlights critical risks, high risks, findings and evidence gaps. This helps you spot audit pressure points quickly.",
    preview: "Risk bars"
  },
  dueActions: {
    title: "Due Actions",
    eyebrow: "Roadmap",
    description: "Shows assessments with overdue roadmap work and upcoming target dates. Use it to drive follow-up meetings.",
    preview: "Due list"
  },
  reports: {
    title: "Report Status",
    eyebrow: "Reports",
    description: "Summarizes how many reports exist per assessment. Useful when you are preparing customer deliverables.",
    preview: "Report counts"
  },
  onboarding: {
    title: "First Setup",
    eyebrow: "Setup",
    description: "Shows a short setup checklist for new users. Keep it while onboarding, then remove it from the dashboard.",
    preview: "4 setup steps"
  }
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

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-audity-page">
      <div className="h-full bg-audity-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function SignalPill({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" | "error" }) {
  const toneClass =
    tone === "error"
      ? "border-audity-error text-audity-error"
      : tone === "warning"
        ? "border-audity-warning text-audity-warning"
        : "border-audity-borderStrong text-audity-secondary";
  return (
    <span className={`rounded-audity border px-2 py-1 text-[11px] ${toneClass}`}>
      {label}: {value}
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
      className={`rounded-audity border bg-audity-panel p-4 ${isOver ? "border-audity-primary" : "border-audity-border"} ${isDragging ? "opacity-70" : ""}`}
    >
      {editMode ? (
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-audity-border pb-3">
          <div
            className="min-w-0 flex-1 cursor-grab active:cursor-grabbing"
            {...listeners}
            {...attributes}
          >
            <p className="text-xs font-semibold uppercase text-audity-primary">{widgetLibrary[id].eyebrow}</p>
            <p className="mt-1 truncate text-sm font-semibold text-audity-text">{widgetLibrary[id].title}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs text-audity-secondary">Drag</span>
            <button
              type="button"
              className="rounded-audity border border-audity-error px-2 py-1 text-xs text-audity-error hover:bg-[#2A1C17]"
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
      className={`cursor-grab rounded-audity border border-audity-border bg-audity-page p-3 active:cursor-grabbing ${isDragging ? "opacity-70" : ""}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-audity-primary">{meta.eyebrow}</p>
          <h3 className="mt-1 text-sm font-semibold text-audity-text">{meta.title}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-[11px] text-audity-secondary">{meta.preview}</span>
          <button
            type="button"
            className="rounded-audity border border-audity-primary px-2 py-1 text-[11px] text-audity-primary hover:border-audity-primaryHover"
            onClick={() => onAdd(id)}
          >
            Add
          </button>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-1">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className={`h-4 rounded-sm ${index % 3 === 0 ? "bg-audity-primary" : "bg-audity-panel"}`} />
        ))}
      </div>
      <p className="text-xs leading-5 text-audity-secondary">{meta.description}</p>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const api = useApi();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(loadWidgetOrder);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<DashboardPayload>("/api/dashboard")
      .then(setDashboard)
      .catch((err) => setError(err instanceof Error ? err.message : "Dashboard load failed"));
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

  function widgetHeader(eyebrow: string, title: string) {
    return (
      <div className="mb-4 border-b border-audity-border pb-3">
        <p className="text-xs font-semibold uppercase text-audity-muted">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      </div>
    );
  }

  function emptyState(text: string) {
    return <p className="rounded-audity border border-audity-border bg-audity-page px-3 py-8 text-center text-sm text-audity-muted">{text}</p>;
  }

  function assessmentLink(assessment: (typeof assessments)[number], to: string, right?: ReactNode) {
    return (
      <Link key={`${to}-${assessment.id}`} className="block rounded-audity border border-audity-border bg-audity-page px-3 py-2 hover:border-audity-primary" to={to}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-audity-text">{assessment.customerName}</p>
            <p className="mt-1 text-xs text-audity-muted">{assessment.type} · {assessment.framework ?? "No framework"}</p>
          </div>
          {right}
        </div>
      </Link>
    );
  }

  function compactList(title: string, eyebrow: string, items: ReactNode[], emptyText: string) {
    return (
      <>
        {widgetHeader(eyebrow, title)}
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
      return compactList("Open Tasks", "Tasks", items, "No open tasks found");
    }
    if (id === "myAssignedItems") {
      const items = assessments
        .filter((assessment) => (assessment.openHighRisks ?? 0) || (assessment.overdueRoadmapItems ?? 0))
        .map((assessment) => assessmentLink(
          assessment,
          `/assessments/${assessment.id}/workflow`,
          <SignalPill label="Assigned signals" value={(assessment.openHighRisks ?? 0) + (assessment.overdueRoadmapItems ?? 0)} tone="warning" />
        ));
      return compactList("My Assigned Items", "Personal", items, "No assigned items detected");
    }
    if (id === "criticalRisks") {
      const items = assessments
        .filter((assessment) => (assessment.criticalRisks ?? 0) > 0)
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/workflow`, <SignalPill label="Critical" value={assessment.criticalRisks ?? 0} tone="error" />));
      return compactList("Critical Risks", "Risk", items, "No critical risks");
    }
    if (id === "overdueItems") {
      const items = assessments
        .filter((assessment) => (assessment.overdueRoadmapItems ?? 0) > 0)
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/workflow`, <SignalPill label="Overdue" value={assessment.overdueRoadmapItems ?? 0} tone="error" />));
      return compactList("Overdue Items", "Due", items, "No overdue items");
    }
    if (id === "upcomingDeadlines") {
      const items = assessments
        .filter((assessment) => assessment.targetDate)
        .sort((a, b) => String(a.targetDate).localeCompare(String(b.targetDate)))
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/questions`, <span className="shrink-0 text-xs text-audity-secondary">{assessment.targetDate}</span>));
      return compactList("Upcoming Deadlines", "Due", items, "No upcoming deadlines");
    }
    if (id === "assessmentProgress") {
      return (
        <>
          {widgetHeader("Progress", "Assessment Progress")}
          <div className="space-y-3">
            {assessments.slice(0, 8).map((assessment) => (
              <Link key={assessment.id} to={`/assessments/${assessment.id}/questions`} className="block rounded-audity border border-audity-border bg-audity-page px-3 py-2 hover:border-audity-primary">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold">{assessment.customerName} · {assessment.type}</p>
                  <span className="text-xs text-audity-secondary">{assessment.progressPercent ?? 0}%</span>
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
      return compactList("Evidence Gaps", "Evidence", items, "No evidence gaps");
    }
    if (id === "reviewQueue") {
      const items = assessments
        .filter((assessment) => (assessment.openFindings ?? 0) > 0 || (assessment.openHighRisks ?? 0) > 0)
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/workflow`, <SignalPill label="Review" value={(assessment.openFindings ?? 0) + (assessment.openHighRisks ?? 0)} tone="warning" />));
      return compactList("Review Queue", "Review", items, "No items waiting for review");
    }
    if (id === "recentlyChanged" || id === "auditActivityFeed") {
      const title = id === "recentlyChanged" ? "Recently Changed" : "Audit Activity Feed";
      const items = assessments.slice(0, 8).map((assessment) => assessmentLink(
        assessment,
        `/assessments/${assessment.id}/workflow`,
        <span className="shrink-0 rounded-audity border border-audity-borderStrong px-2 py-1 text-xs text-audity-secondary">{assessment.status}</span>
      ));
      return compactList(title, "Activity", items, "No recent activity");
    }
    if (id === "riskHeatmap") {
      const cells = [
        ["Critical", totals.critical, "bg-audity-error"],
        ["High", Math.max(0, totals.high - totals.critical), "bg-audity-warning"],
        ["Findings", totals.findings, "bg-audity-primary"],
        ["Gaps", totals.gaps, "bg-audity-panelAlt"]
      ] as Array<[string, number, string]>;
      return (
        <>
          {widgetHeader("Risk", "Risk Heatmap")}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {cells.map(([label, value, color]) => (
              <div key={label} className="rounded-audity border border-audity-border bg-audity-page p-3">
                <div className={`mb-2 h-16 rounded-audity ${color}`} />
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (id === "topRiskOwners" || id === "teamWorkload") {
      const items = dashboard?.ownedCustomers.slice(0, 8).map((customer) => {
        const count = customer.assessments.reduce((sum, assessment) => sum + (assessment.openHighRisks ?? 0) + (assessment.openFindings ?? 0), 0);
        return (
          <Link key={customer.customerId} to={`/customers/${customer.customerId}`} className="block rounded-audity border border-audity-border bg-audity-page px-3 py-2 hover:border-audity-primary">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold">{customer.customerName}</p>
              <SignalPill label={id === "teamWorkload" ? "Items" : "Risk load"} value={count} tone={count ? "warning" : "neutral"} />
            </div>
          </Link>
        );
      }) ?? [];
      return compactList(id === "teamWorkload" ? "Team Workload" : "Top Risk Owners", id === "teamWorkload" ? "Team" : "Ownership", items, "No workload signals");
    }
    if (id === "controlDomains" || id === "frameworkCoverage") {
      const byFramework = new Map<string, { count: number; progress: number }>();
      assessments.forEach((assessment) => {
        const key = assessment.framework ?? "No framework";
        const current = byFramework.get(key) ?? { count: 0, progress: 0 };
        byFramework.set(key, { count: current.count + 1, progress: current.progress + (assessment.progressPercent ?? 0) });
      });
      const items = Array.from(byFramework.entries()).map(([name, value]) => (
        <div key={name} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold">{id === "controlDomains" ? `Domain view: ${name}` : name}</p>
            <span className="text-xs text-audity-secondary">{Math.round(value.progress / Math.max(1, value.count))}%</span>
          </div>
          <ProgressBar value={value.progress / Math.max(1, value.count)} />
        </div>
      ));
      return compactList(id === "controlDomains" ? "Control Domains" : "Framework Coverage", id === "controlDomains" ? "Controls" : "Framework", items, "No framework coverage yet");
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
          {widgetHeader("Reports", "Report Readiness")}
          <div className="space-y-2">
            {checks.map(([label, ok]) => (
              <div key={label} className="flex items-center justify-between rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <span className="text-sm text-audity-secondary">{label}</span>
                <span className={ok ? "text-audity-success" : "text-audity-warning"}>{ok ? "OK" : "Review"}</span>
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
      return compactList("Latest Reports", "Reports", items, "No reports created yet");
    }
    if (id === "customerHealth") {
      const items = dashboard?.ownedCustomers.slice(0, 8).map((customer) => {
        const score = customer.assessments.reduce((sum, assessment) => sum + (assessment.criticalRisks ?? 0) * 3 + (assessment.openHighRisks ?? 0) + (assessment.overdueRoadmapItems ?? 0), 0);
        const tone = score > 5 ? "error" : score > 0 ? "warning" : "neutral";
        return (
          <Link key={customer.customerId} to={`/customers/${customer.customerId}`} className="block rounded-audity border border-audity-border bg-audity-page px-3 py-2 hover:border-audity-primary">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold">{customer.customerName}</p>
              <SignalPill label="Health load" value={score} tone={tone} />
            </div>
          </Link>
        );
      }) ?? [];
      return compactList("Customer Health", "Customers", items, "No customer health signals");
    }
    if (id === "acceptedRisksExpiring") {
      const items = assessments
        .filter((assessment) => (assessment.openHighRisks ?? 0) > 0)
        .map((assessment) => assessmentLink(assessment, `/assessments/${assessment.id}/workflow`, <span className="text-xs text-audity-warning">Review acceptance</span>));
      return compactList("Accepted Risks Expiring", "Risk", items, "No accepted-risk expiry signals");
    }
    if (id === "accountSecurityStatus") {
      return (
        <>
          {widgetHeader("Security", "MFA / Account Security Status")}
          <div className="rounded-audity border border-audity-border bg-audity-page p-3">
            <p className="text-sm font-semibold">{user?.email}</p>
            <p className="mt-1 text-xs text-audity-muted">{user?.role} · MFA setup is managed in User Settings.</p>
            <Link className="mt-3 inline-block rounded-audity border border-audity-borderStrong px-3 py-2 text-sm text-audity-primary" to="/user-settings">Open User Settings</Link>
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
          {widgetHeader("Quality", "Data Quality Issues")}
          <div className="grid gap-2 md:grid-cols-2">
            {issues.map(([label, value]) => <SignalPill key={label} label={label} value={value} tone={value ? "warning" : "neutral"} />)}
          </div>
        </>
      );
    }
    if (id === "importExportShortcuts") {
      const firstAssessment = assessments[0];
      return (
        <>
          {widgetHeader("Tools", "Import/Export Shortcuts")}
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-audity border border-audity-borderStrong px-3 py-2 text-sm text-audity-primary" to={firstAssessment ? `/assessments/${firstAssessment.id}/assets` : "/customers"}>Report Builder</Link>
            <Link className="rounded-audity border border-audity-borderStrong px-3 py-2 text-sm text-audity-primary" to="/admin/frameworks">Framework Import</Link>
            <Link className="rounded-audity border border-audity-borderStrong px-3 py-2 text-sm text-audity-primary" to={firstAssessment ? `/assessments/${firstAssessment.id}/workflow` : "/customers"}>Risk CSV</Link>
          </div>
        </>
      );
    }
    if (id === "notificationsSummary") {
      return (
        <>
          {widgetHeader("Notifications", "Notifications Summary")}
          <div className="rounded-audity border border-audity-border bg-audity-page p-3 text-sm text-audity-secondary">
            Notifications are shown in the top bar bell. Keep this widget as a reminder or remove it if the top bar is enough.
          </div>
        </>
      );
    }
    if (id === "roadmapTimeline") {
      const phases = [
        ["0-30d", totals.overdue],
        ["31-90d", totals.high],
        ["3-6M", totals.findings],
        ["6-12M", totals.gaps]
      ] as Array<[string, number]>;
      return (
        <>
          {widgetHeader("Roadmap", "Roadmap Timeline")}
          <div className="grid gap-2 md:grid-cols-4">
            {phases.map(([phase, value]) => (
              <div key={phase} className="rounded-audity border border-audity-border bg-audity-page p-3">
                <p className="text-sm font-semibold">{phase}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (id === "executiveSummary") {
      return (
        <>
          {widgetHeader("Executive", "Executive Summary")}
          <p className="rounded-audity border border-audity-border bg-audity-page p-3 text-sm leading-6 text-audity-secondary">
            Current workspace contains {totals.customers} customers and {totals.assessments} assessments. There are {totals.critical} critical risks, {totals.high} high or critical risk signals, {totals.gaps} evidence gaps and {totals.overdue} overdue roadmap items.
          </p>
        </>
      );
    }
    if (id === "summary") {
      return (
        <>
          <div className="mb-4 border-b border-audity-border pb-3">
            <p className="text-xs font-semibold uppercase text-audity-muted">Metrics</p>
            <h2 className="mt-1 text-lg font-semibold">Audit Summary</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {([
              ["Customers", totals.customers],
              ["Assessments", totals.assessments],
              ["Critical Risks", totals.critical],
              ["Evidence Gaps", totals.gaps]
            ] as Array<[string, number]>).map(([label, value]) => (
              <div key={label} className="rounded-audity border border-audity-border bg-audity-page px-3 py-3">
                <p className="text-xs font-semibold uppercase text-audity-muted">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (id === "customers") {
      return (
        <>
          <div className="mb-4 border-b border-audity-border pb-3">
            <p className="text-xs font-semibold uppercase text-audity-muted">In Progress</p>
            <h2 className="mt-1 text-lg font-semibold">My Customers & Assessments</h2>
          </div>
          <div className="space-y-3">
            {dashboard?.ownedCustomers.map((customer) => (
              <div key={customer.customerId} className="rounded-audity border border-audity-border bg-audity-page p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link className="text-sm font-semibold text-audity-text hover:text-audity-primary" to={`/customers/${customer.customerId}`}>
                      {customer.customerName}
                    </Link>
                    <p className="mt-1 text-xs text-audity-muted">Customer status: {customer.customerStatus}</p>
                  </div>
                  <div className="max-w-md text-right text-xs text-audity-secondary">
                    {customer.sharedWith.length ? (
                      <span>Shared with {customer.sharedWith.map((shared) => shared.name || shared.email).join(", ")}</span>
                    ) : (
                      <span>Not shared</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {customer.assessments.map((assessment) => (
                    <Link
                      key={assessment.id}
                      className="block rounded-audity border border-audity-border bg-audity-panel px-3 py-2 hover:border-audity-primary"
                      to={`/assessments/${assessment.id}/questions`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold">{assessment.type}</span>
                        <span className="shrink-0 text-xs text-audity-secondary">{assessment.progressPercent ?? 0}%</span>
                      </div>
                      <ProgressBar value={assessment.progressPercent ?? 0} />
                      <div className="mt-2 flex flex-wrap gap-1">
                        <SignalPill label="Critical" value={assessment.criticalRisks ?? 0} tone={(assessment.criticalRisks ?? 0) > 0 ? "error" : "neutral"} />
                        <SignalPill label="High/Critical" value={assessment.openHighRisks ?? 0} tone={(assessment.openHighRisks ?? 0) > 0 ? "warning" : "neutral"} />
                        <SignalPill label="Findings" value={assessment.openFindings ?? 0} />
                        <SignalPill label="Evidence gaps" value={assessment.evidenceGaps ?? 0} tone={(assessment.evidenceGaps ?? 0) > 0 ? "warning" : "neutral"} />
                        <SignalPill label="Overdue" value={assessment.overdueRoadmapItems ?? 0} tone={(assessment.overdueRoadmapItems ?? 0) > 0 ? "error" : "neutral"} />
                      </div>
                      <p className="mt-2 text-xs text-audity-muted">
                        {assessment.framework ?? "No framework"} · {assessment.status}
                        {assessment.targetDate ? ` · Target ${assessment.targetDate}` : ""}
                        {assessment.reports ? ` · ${assessment.reports} reports` : ""}
                      </p>
                    </Link>
                  ))}
                  {!customer.assessments.length ? (
                    <p className="rounded-audity border border-audity-border bg-audity-panel px-3 py-4 text-sm text-audity-muted">No assessment running</p>
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
          <div className="mb-4 border-b border-audity-border pb-3">
            <p className="text-xs font-semibold uppercase text-audity-muted">Shared</p>
            <h2 className="mt-1 text-lg font-semibold">Customers Shared With Me</h2>
          </div>
          <div className="space-y-2">
            {dashboard?.sharedCustomers.map((customer) => (
              <Link key={customer.id} className="block rounded-audity border border-audity-border bg-audity-page px-3 py-3 hover:border-audity-primary" to={`/customers/${customer.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-audity-text">{customer.name}</p>
                    <p className="mt-1 text-xs text-audity-muted">Owner: {customer.ownerName ?? customer.ownerEmail ?? "Unknown"}</p>
                  </div>
                  <span className="text-xs text-audity-secondary">{customer.assessments.length} assessments</span>
                </div>
              </Link>
            ))}
            {!dashboard?.sharedCustomers.length ? <p className="py-8 text-center text-sm text-audity-muted">No shared customers</p> : null}
          </div>
        </>
      );
    }
    if (id === "riskSignals") {
      return (
        <>
          <div className="mb-4 border-b border-audity-border pb-3">
            <p className="text-xs font-semibold uppercase text-audity-muted">Risk</p>
            <h2 className="mt-1 text-lg font-semibold">Risk Signals</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {([
              ["Critical risks", totals.critical, "border-audity-error text-audity-error"],
              ["High/Critical risks", totals.high, "border-audity-warning text-audity-warning"],
              ["Open findings", totals.findings, "border-audity-primary text-audity-primary"],
              ["Evidence gaps", totals.gaps, "border-audity-warning text-audity-warning"]
            ] as Array<[string, number, string]>).map(([label, value, tone]) => (
              <div key={label} className={`rounded-audity border bg-audity-page p-3 ${tone}`}>
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
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
          <div className="mb-4 border-b border-audity-border pb-3">
            <p className="text-xs font-semibold uppercase text-audity-muted">Roadmap</p>
            <h2 className="mt-1 text-lg font-semibold">Due Actions</h2>
          </div>
          <div className="space-y-2">
            {due.slice(0, 8).map((assessment) => (
              <Link key={assessment.id} className="block rounded-audity border border-audity-border bg-audity-page px-3 py-2 hover:border-audity-primary" to={`/assessments/${assessment.id}/workflow`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-audity-text">{assessment.customerName}</p>
                    <p className="mt-1 text-xs text-audity-muted">{assessment.type}{assessment.targetDate ? ` · Target ${assessment.targetDate}` : ""}</p>
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
          <div className="mb-4 border-b border-audity-border pb-3">
            <p className="text-xs font-semibold uppercase text-audity-muted">Reports</p>
            <h2 className="mt-1 text-lg font-semibold">Report Status</h2>
          </div>
          <div className="space-y-2">
            {assessments.slice(0, 8).map((assessment) => (
              <Link key={assessment.id} className="block rounded-audity border border-audity-border bg-audity-page px-3 py-2 hover:border-audity-primary" to={`/assessments/${assessment.id}/assets`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-audity-text">{assessment.customerName}</p>
                    <p className="mt-1 text-xs text-audity-muted">{assessment.type}</p>
                  </div>
                  <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs text-audity-secondary">{assessment.reports ?? 0} reports</span>
                </div>
              </Link>
            ))}
            {!assessments.length ? <p className="py-8 text-center text-sm text-audity-muted">No assessments available</p> : null}
          </div>
        </>
      );
    }
    return (
      <>
        <div className="mb-4 border-b border-audity-border pb-3">
          <p className="text-xs font-semibold uppercase text-audity-muted">Setup</p>
          <h2 className="mt-1 text-lg font-semibold">Start a clean audit workspace</h2>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          {["Review User Settings", "Create or open Customer", "Start Assessment", "Answer Questions"].map((step, index) => (
            <div key={step} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
              <p className="text-xs font-semibold text-audity-muted">Step {index + 1}</p>
              <p className="mt-1 text-sm text-audity-secondary">{step}</p>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="audity-page-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="audity-page-kicker">Workspace Overview</p>
            <h1 className="audity-page-title">Dashboard</h1>
            <p className="audity-page-copy">{user?.email} · {user?.role}</p>
          </div>
          <div className="flex gap-2">
            {editMode ? (
              <button className="audity-btn-secondary" onClick={() => setWidgetOrder(defaultWidgets)}>
                Reset
              </button>
            ) : null}
            <button className="audity-btn-primary" onClick={() => setEditMode(!editMode)}>
              {editMode ? "Done" : "Edit Dashboard"}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}

      <DndContext onDragEnd={handleDragEnd}>
        <div className={editMode ? "grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_300px]" : "grid gap-3"}>
          <DroppableArea id="dashboard" className="min-h-72 rounded-audity border border-dashed border-audity-border bg-audity-page p-3">
            <div className="grid gap-3">
              {widgetOrder.map((id) => (
                <WidgetShell key={id} id={id} editMode={editMode} onRemove={removeWidget}>
                  {renderWidget(id)}
                </WidgetShell>
              ))}
              {!widgetOrder.length ? (
                <div className="rounded-audity border border-audity-border bg-audity-panel px-3 py-12 text-center text-sm text-audity-muted">
                  Drag elements from the library into your dashboard.
                </div>
              ) : null}
            </div>
          </DroppableArea>

          {editMode ? (
            <DroppableArea id="library" className="rounded-audity border border-dashed border-audity-border bg-audity-panel p-3">
              <div className="mb-4 border-b border-audity-border pb-3">
                <p className="text-xs font-semibold uppercase text-audity-primary">Element Library</p>
                <h2 className="mt-1 text-lg font-semibold">Unused & New Elements</h2>
                <p className="mt-1 text-xs text-audity-muted">Drag cards into the dashboard. Drop dashboard elements anywhere in this sidebar to remove them.</p>
              </div>
              <DroppableArea id="remove-zone" className="mb-3 rounded-audity border border-dashed border-audity-error bg-[#2A1C17] px-3 py-3 text-sm text-[#FFB199]">
                Drop here to remove an element from the dashboard.
              </DroppableArea>
              <div className="space-y-3">
                {unusedWidgets.map((id) => <LibraryCard key={id} id={id} onAdd={addWidget} />)}
                {!unusedWidgets.length ? (
                  <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-8 text-center text-sm text-audity-muted">
                    All available elements are already on the dashboard.
                  </div>
                ) : null}
              </div>
            </DroppableArea>
          ) : null}
        </div>
      </DndContext>
    </>
  );
}
