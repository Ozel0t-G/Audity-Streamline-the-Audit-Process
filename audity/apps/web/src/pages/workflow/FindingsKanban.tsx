import { useMemo } from "react";
import { SeverityBadge } from "../../components/ui";
import type { Finding } from "./types";
import {
  FINDING_STATUS_COLUMNS,
  FINDING_STATUS_DESCRIPTION,
  FINDING_STATUS_LABEL,
  type FindingStatus
} from "./transitions";

type Props = {
  findings: Finding[];
  selectedIds: string[];
  canBulkSelect: boolean;
  onToggleSelect: (findingId: string) => void;
  onOpen: (finding: Finding) => void;
};

export function FindingsKanban({
  findings,
  selectedIds,
  canBulkSelect,
  onToggleSelect,
  onOpen
}: Props) {
  const grouped = useMemo(() => {
    const groups = new Map<FindingStatus, Finding[]>();
    for (const status of FINDING_STATUS_COLUMNS) groups.set(status, []);
    const rejected: Finding[] = [];
    for (const finding of findings) {
      const status = finding.status as FindingStatus;
      if (status === "dismissed") {
        rejected.push(finding);
      } else if (groups.has(status)) {
        groups.get(status)!.push(finding);
      } else {
        // Unknown status — drop into Suggested for visibility
        groups.get("suggested")!.push(finding);
      }
    }
    return { groups, rejected };
  }, [findings]);

  if (!findings.length) {
    return (
      <div className="rounded-audity border border-dashed border-audity-border bg-audity-panel px-4 py-10 text-center text-sm text-audity-muted">
        No findings yet. They appear automatically as you answer guided questions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {FINDING_STATUS_COLUMNS.map((status) => {
          const items = grouped.groups.get(status) ?? [];
          return (
            <KanbanColumn
              key={status}
              status={status}
              items={items}
              selectedIds={selectedIds}
              canBulkSelect={canBulkSelect}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
            />
          );
        })}
      </div>

      {grouped.rejected.length ? (
        <details className="rounded-audity border border-audity-border bg-audity-panel p-3">
          <summary className="cursor-pointer text-xs font-semibold text-audity-muted hover:text-audity-secondary">
            Rejected ({grouped.rejected.length}) — collapsed by default
          </summary>
          <ul className="mt-3 space-y-1.5">
            {grouped.rejected.map((finding) => (
              <li key={finding.id}>
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-left text-xs hover:border-audity-borderStrong"
                  onClick={() => onOpen(finding)}
                >
                  <span className="truncate">{finding.title}</span>
                  <span className="text-audity-muted">{finding.controlCode ?? "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function KanbanColumn({
  status,
  items,
  selectedIds,
  canBulkSelect,
  onToggleSelect,
  onOpen
}: {
  status: FindingStatus;
  items: Finding[];
  selectedIds: string[];
  canBulkSelect: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (finding: Finding) => void;
}) {
  return (
    <section className="flex min-h-[200px] flex-col rounded-audity border border-audity-border bg-audity-panel">
      <header
        className="border-b border-audity-border px-3 py-2"
        title={FINDING_STATUS_DESCRIPTION[status]}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-audity-secondary">
            {FINDING_STATUS_LABEL[status]}
          </h3>
          <span className="rounded-full bg-audity-page px-2 py-0.5 text-[10px] font-bold text-audity-muted">
            {items.length}
          </span>
        </div>
      </header>
      <div className="flex-1 space-y-2 p-2">
        {items.length === 0 ? (
          <p className="px-1 py-4 text-center text-[11px] text-audity-muted">Empty</p>
        ) : (
          items.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              selected={selectedIds.includes(finding.id)}
              canBulkSelect={canBulkSelect}
              onToggleSelect={() => onToggleSelect(finding.id)}
              onOpen={() => onOpen(finding)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function FindingCard({
  finding,
  selected,
  canBulkSelect,
  onToggleSelect,
  onOpen
}: {
  finding: Finding;
  selected: boolean;
  canBulkSelect: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={`rounded-audity border bg-audity-page p-2 transition hover:border-audity-primary ${
        selected ? "border-audity-primary bg-audity-primaryActive/15" : "border-audity-border"
      }`}
    >
      <div className="flex items-start gap-2">
        {canBulkSelect ? (
          <input
            type="checkbox"
            className="mt-1"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(event) => event.stopPropagation()}
            aria-label="Select finding for bulk action"
          />
        ) : null}
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onOpen}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-audity-primary">
            {finding.controlCode ?? "Untracked"}
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-audity-text">
            {finding.title}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <SeverityBadge level={(finding.priority ?? "info") as never} />
            {finding.score !== null ? (
              <span className="text-[10px] text-audity-muted">Score {finding.score}</span>
            ) : null}
            {finding.acceptedRisk ? (
              <span className="rounded-audity border border-audity-warning px-1.5 py-0 text-[9px] font-semibold uppercase text-audity-warning">
                Risk accepted
              </span>
            ) : null}
          </div>
        </button>
      </div>
    </div>
  );
}
