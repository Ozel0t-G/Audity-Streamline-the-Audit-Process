import { ReactNode, useEffect, useMemo, useState } from "react";

export type DataTableColumn<TRow> = {
  key: string;
  header: ReactNode;
  cell: (row: TRow) => ReactNode;
  sortValue?: (row: TRow) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  width?: string;
  className?: string;
};

export type BulkAction<TRow> = {
  label: ReactNode;
  onRun: (selected: TRow[]) => void | Promise<void>;
  destructive?: boolean;
  disabled?: (selected: TRow[]) => boolean;
};

type SortState = { key: string; direction: "asc" | "desc" } | null;

type DataTableProps<TRow> = {
  columns: DataTableColumn<TRow>[];
  rows: TRow[];
  getRowId: (row: TRow) => string;
  storageKey?: string;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  emptyState?: ReactNode;
  bulkActions?: BulkAction<TRow>[];
  selectable?: boolean;
  className?: string;
  caption?: ReactNode;
  loading?: boolean;
};

const alignClass: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right"
};

function compare(a: unknown, b: unknown) {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return -1;
  if (bEmpty) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function readPersisted<T extends object>(key: string | undefined, fallback: T): T {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`audity_dt_${key}`);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

function writePersisted<T>(key: string | undefined, value: T) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`audity_dt_${key}`, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function DataTable<TRow>({
  columns,
  rows,
  getRowId,
  storageKey,
  initialPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  emptyState,
  bulkActions,
  selectable = false,
  className = "",
  caption,
  loading
}: DataTableProps<TRow>) {
  type Persisted = { sort: SortState; pageSize: number };
  const persistedDefault: Persisted = { sort: null, pageSize: initialPageSize };
  const [persisted, setPersisted] = useState<Persisted>(() => readPersisted<Persisted>(storageKey, persistedDefault));
  const { sort, pageSize } = persisted;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    writePersisted(storageKey, persisted);
  }, [persisted, storageKey]);

  useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize, sort?.key, sort?.direction]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => factor * compare(col.sortValue!(a), col.sortValue!(b)));
  }, [rows, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const allOnPageIds = useMemo(() => pageRows.map(getRowId), [pageRows, getRowId]);
  const allOnPageSelected = allOnPageIds.length > 0 && allOnPageIds.every((id) => selected.has(id));

  function toggleSort(key: string) {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortValue) return;
    setPersisted((prev) => {
      const current = prev.sort;
      let next: SortState;
      if (current?.key !== key) next = { key, direction: "asc" };
      else if (current.direction === "asc") next = { key, direction: "desc" };
      else next = null;
      return { ...prev, sort: next };
    });
  }

  function togglePageSize(size: number) {
    setPersisted((prev) => ({ ...prev, pageSize: size }));
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageSelection() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) allOnPageIds.forEach((id) => next.delete(id));
      else allOnPageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(getRowId(r))), [rows, selected, getRowId]);

  const start = sorted.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(sorted.length, page * pageSize);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="relative overflow-auto rounded-audity border border-audity-border bg-audity-panel">
        <table className="audity-table w-full text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="sticky top-0 z-10 bg-audity-tableHeader">
            <tr>
              {selectable ? (
                <th scope="col" className="w-8 px-2 py-2 text-left">
                  <input
                    type="checkbox"
                    aria-label={allOnPageSelected ? "Deselect all rows on this page" : "Select all rows on this page"}
                    checked={allOnPageSelected}
                    onChange={togglePageSelection}
                  />
                </th>
              ) : null}
              {columns.map((col) => {
                const sortable = Boolean(col.sortValue);
                const active = sort?.key === col.key;
                const ariaSort = active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none";
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={sortable ? ariaSort : undefined}
                    className={`px-3 py-2 ${alignClass[col.align ?? "left"]} text-xs font-medium tracking-wide text-audity-muted ${col.className ?? ""}`}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-audity-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-audity-primary"
                      >
                        <span>{col.header}</span>
                        <span aria-hidden="true" className="text-[10px]">
                          {active ? (sort!.direction === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-8 text-center text-sm text-audity-muted">
                  Loading…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-8 text-center text-sm text-audity-muted">
                  {emptyState ?? "No rows to show."}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const id = getRowId(row);
                const isSelected = selected.has(id);
                return (
                  <tr key={id} className={`border-t border-audity-border ${isSelected ? "bg-audity-primaryActive/40" : ""}`}>
                    {selectable ? (
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${id}`}
                          checked={isSelected}
                          onChange={() => toggleRow(id)}
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 ${alignClass[col.align ?? "left"]} ${col.className ?? ""}`}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-audity-muted">
        <span>
          {start}–{end} of {sorted.length}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <span>Rows per page</span>
            <select
              className="rounded-audity border border-audity-border bg-audity-panel px-1 py-0.5 text-xs"
              value={pageSize}
              onChange={(event) => togglePageSize(Number(event.target.value))}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-audity border border-audity-border px-2 py-0.5 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            ‹
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-audity border border-audity-border px-2 py-0.5 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      </div>

      {selectable && bulkActions && bulkActions.length > 0 && selected.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-audity border border-audity-primary bg-audity-panel px-3 py-2 shadow-lg"
        >
          <span className="text-xs font-semibold text-audity-text">
            {selected.size} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions.map((action, index) => {
              const isDisabled = action.disabled?.(selectedRows) ?? false;
              const cls = action.destructive ? "audity-btn-secondary text-audity-error" : "audity-btn-secondary";
              return (
                <button
                  key={index}
                  type="button"
                  className={cls}
                  disabled={isDisabled}
                  onClick={() => {
                    void action.onRun(selectedRows);
                  }}
                >
                  {action.label}
                </button>
              );
            })}
            <button
              type="button"
              className="rounded-audity border border-transparent px-2 py-1 text-xs text-audity-muted hover:text-audity-text"
              onClick={clearSelection}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
