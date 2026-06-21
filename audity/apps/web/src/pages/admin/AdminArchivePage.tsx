import { useEffect, useState } from "react";
import { useApi } from "../../api/client";
import { useAuth as useAuthHook } from "../../auth/AuthProvider";
import {
  DataTable,
  EmptyState,
  Slideover,
  useConfirm,
  useToast,
  type DataTableColumn
} from "../../components/ui";

type AdminArchiveRow = {
  customer_id: string;
  customer_name: string;
  archived_at: string;
  archived_by: string;
  archived_by_name: string | null;
  archive_month: string;
  archive_state: "spool" | "bundled" | "exported";
  bundle_filename: string | null;
  bundle_checksum: string | null;
  size_bytes: string | number;
  notes: string | null;
};

type RestoreRequest = {
  id: string;
  customer_id: string;
  customer_name: string;
  requested_by: string;
  requested_by_name: string | null;
  reason: string;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

type BundleRow = {
  filename: string;
  month: string;
  size_bytes: number;
  created_at: string;
};

type Tab = "overview" | "bundles" | "import" | "requests";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Customer overview",
  bundles: "Bundles",
  import: "Re-import",
  requests: "Restore requests"
};

function formatSize(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function AdminArchivePage() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Archive administration</h1>
        <p className="text-sm text-audity-secondary">
          Review archived customers, monthly bundles, restore requests, and re-import previously
          exported archives.
        </p>
      </header>
      <nav className="flex gap-1 border-b border-audity-border">
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            className={`px-3 py-2 text-sm font-medium ${
              tab === key
                ? "border-b-2 border-audity-primary text-audity-primary"
                : "text-audity-secondary hover:text-audity-text"
            }`}
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </nav>
      {tab === "overview" ? <ArchiveOverviewTab /> : null}
      {tab === "bundles" ? <BundlesTab /> : null}
      {tab === "import" ? <ImportTab /> : null}
      {tab === "requests" ? <RestoreRequestsTab /> : null}
    </section>
  );
}

function ArchiveOverviewTab() {
  const api = useApi();
  const [rows, setRows] = useState<AdminArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const path = monthFilter ? `/api/admin/archive?month=${monthFilter}` : "/api/admin/archive";
      const payload = await api<{ archive: AdminArchiveRow[] }>(path);
      setRows(payload.archive);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load archive");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [monthFilter]);

  const months = Array.from(new Set(rows.map((row) => row.archive_month))).sort().reverse();
  const totalBytes = rows.reduce((acc, row) => acc + Number(row.size_bytes ?? 0), 0);

  const columns: DataTableColumn<AdminArchiveRow>[] = [
    { key: "customer_name", header: "Customer", cell: (row) => row.customer_name },
    { key: "archived_at", header: "Archived", cell: (row) => new Date(row.archived_at).toLocaleString() },
    { key: "archived_by_name", header: "By", cell: (row) => row.archived_by_name ?? "—" },
    { key: "archive_month", header: "Month", cell: (row) => row.archive_month },
    {
      key: "archive_state",
      header: "State",
      cell: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
            row.archive_state === "spool"
              ? "border border-audity-warning/30 bg-audity-warning/10 text-audity-warning"
              : row.archive_state === "bundled"
              ? "border border-audity-primary/30 bg-audity-primary/10 text-audity-primary"
              : "border border-audity-success/30 bg-audity-success/10 text-audity-success"
          }`}
        >
          {row.archive_state}
        </span>
      )
    },
    {
      key: "size_bytes",
      header: "Size",
      cell: (row) => formatSize(Number(row.size_bytes ?? 0))
    },
    {
      key: "bundle_filename",
      header: "Bundle",
      cell: (row) => row.bundle_filename ?? "—"
    }
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-audity border border-audity-border bg-audity-panel p-3">
        <div>
          <p className="audity-label">Month filter</p>
          <select
            className="audity-input mt-1"
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
          >
            <option value="">All months</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </div>
        <div className="text-right text-xs text-audity-secondary">
          <div>
            <strong>{rows.length}</strong> customer{rows.length === 1 ? "" : "s"}
          </div>
          <div>
            Total size: <strong>{formatSize(totalBytes)}</strong>
          </div>
        </div>
      </div>
      {error ? <p className="text-sm text-audity-error">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-audity-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No archived customers"
          description="When users archive customers, they appear here for review and bundling."
        />
      ) : (
        <DataTable<AdminArchiveRow>
          rows={rows}
          columns={columns}
          getRowId={(row) => row.customer_id}
        />
      )}
    </div>
  );
}

function RestoreRequestsTab() {
  const api = useApi();
  const toast = useToast();
  const confirm = useConfirm();
  const [requests, setRequests] = useState<RestoreRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "denied" | "all">(
    "pending"
  );
  const [denyTarget, setDenyTarget] = useState<RestoreRequest | null>(null);
  const [denyNote, setDenyNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const path =
        statusFilter === "all"
          ? "/api/admin/archive/restore-requests"
          : `/api/admin/archive/restore-requests?status=${statusFilter}`;
      const payload = await api<{ requests: RestoreRequest[] }>(path);
      setRequests(payload.requests);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load restore requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter]);

  async function approve(request: RestoreRequest) {
    const ok = await confirm({
      title: `Approve restore for ${request.customer_name}?`,
      body:
        "This will re-upload all archived evidence + reports to MinIO, clear the archive flag, and notify the requester.",
      confirmLabel: "Approve",
      cancelLabel: "Cancel"
    });
    if (!ok) return;
    try {
      await api(`/api/admin/archive/restore-requests/${request.id}/approve`, {
        method: "POST",
        body: JSON.stringify({})
      });
      toast.success("Customer restored.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    }
  }

  async function submitDeny() {
    if (!denyTarget) return;
    try {
      await api(`/api/admin/archive/restore-requests/${denyTarget.id}/deny`, {
        method: "POST",
        body: JSON.stringify({ note: denyNote })
      });
      toast.success("Restore request denied.");
      setDenyTarget(null);
      setDenyNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deny failed");
    }
  }

  const columns: DataTableColumn<RestoreRequest>[] = [
    { key: "customer_name", header: "Customer", cell: (row) => row.customer_name },
    { key: "requested_by_name", header: "Requested by", cell: (row) => row.requested_by_name ?? "—" },
    { key: "requested_at", header: "When", cell: (row) => new Date(row.requested_at).toLocaleString() },
    { key: "reason", header: "Reason", cell: (row) => row.reason },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
            row.status === "pending"
              ? "border border-audity-warning/30 bg-audity-warning/10 text-audity-warning"
              : row.status === "approved"
              ? "border border-audity-success/30 bg-audity-success/10 text-audity-success"
              : "border border-audity-error/30 bg-audity-error/10 text-audity-error"
          }`}
        >
          {row.status}
        </span>
      )
    },
    {
      key: "actions",
      header: "",
      cell: (row) =>
        row.status === "pending" ? (
          <div className="flex gap-1">
            <button className="audity-btn-primary text-xs" onClick={() => void approve(row)}>
              Approve
            </button>
            <button
              className="audity-btn-secondary text-xs"
              onClick={() => {
                setDenyTarget(row);
                setDenyNote("");
              }}
            >
              Deny
            </button>
          </div>
        ) : (
          <span className="text-xs text-audity-muted">{row.resolution_note ?? "—"}</span>
        )
    }
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["pending", "approved", "denied", "all"] as const).map((key) => (
          <button
            key={key}
            className={`audity-btn-secondary text-xs ${
              statusFilter === key ? "ring-2 ring-audity-primary" : ""
            }`}
            onClick={() => setStatusFilter(key)}
          >
            {key}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-audity-error">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-audity-muted">Loading…</p>
      ) : requests.length === 0 ? (
        <EmptyState title="No restore requests" description="Requests will appear here when users ask to restore archived customers." />
      ) : (
        <DataTable<RestoreRequest> rows={requests} columns={columns} getRowId={(row) => row.id} />
      )}

      <Slideover
        title={denyTarget ? `Deny restore: ${denyTarget.customer_name}` : "Deny restore"}
        open={!!denyTarget}
        onClose={() => setDenyTarget(null)}
      >
        {denyTarget ? (
          <div className="space-y-3">
            <p className="text-sm text-audity-secondary">
              Provide a reason. This is shown to the requester in the activity log.
            </p>
            <textarea
              className="audity-input min-h-[7rem]"
              value={denyNote}
              onChange={(event) => setDenyNote(event.target.value)}
              minLength={3}
              maxLength={500}
            />
            <div className="flex gap-2">
              <button
                className="audity-btn-primary"
                disabled={denyNote.trim().length < 3}
                onClick={() => void submitDeny()}
              >
                Deny request
              </button>
              <button
                type="button"
                className="audity-btn-secondary"
                onClick={() => setDenyTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Slideover>
    </div>
  );
}

function BundlesTab() {
  const api = useApi();
  const toast = useToast();
  const confirm = useConfirm();
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyMonth, setBusyMonth] = useState<string | null>(null);
  const [manualMonth, setManualMonth] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const payload = await api<{ bundles: BundleRow[] }>("/api/admin/archive/bundles");
      setBundles(payload.bundles);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bundles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function bundleNow() {
    const month = manualMonth || new Date().toISOString().slice(0, 7);
    const ok = await confirm({
      title: `Bundle archives for ${month}?`,
      body: "All spooled customers for this month will be packaged into an encrypted .audity-archive file.",
      confirmLabel: "Bundle now"
    });
    if (!ok) return;
    setBusyMonth(month);
    try {
      await api(`/api/admin/archive/bundles`, {
        method: "POST",
        body: JSON.stringify({ month })
      });
      toast.success(`Bundle ${month} written.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bundle failed");
    } finally {
      setBusyMonth(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-audity border border-audity-border bg-audity-panel p-3">
        <div>
          <p className="audity-label">Month (YYYY-MM)</p>
          <input
            className="audity-input mt-1"
            placeholder={new Date().toISOString().slice(0, 7)}
            value={manualMonth}
            onChange={(event) => setManualMonth(event.target.value)}
          />
        </div>
        <button
          className="audity-btn-primary"
          disabled={busyMonth !== null}
          onClick={() => void bundleNow()}
        >
          {busyMonth ? `Bundling ${busyMonth}…` : "Bundle now"}
        </button>
      </div>
      {error ? <p className="text-sm text-audity-error">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-audity-muted">Loading…</p>
      ) : bundles.length === 0 ? (
        <EmptyState title="No bundles" description="Bundles appear here after the monthly cron runs or a manual bundle." />
      ) : (
        <ul className="space-y-1">
          {bundles.map((b) => (
            <li
              key={b.filename}
              className="flex items-center justify-between rounded-audity border border-audity-border bg-audity-panel px-3 py-2 text-sm"
            >
              <div>
                <div className="font-mono text-xs text-audity-text">{b.filename}</div>
                <div className="text-xs text-audity-muted">
                  {b.month} · {formatSize(b.size_bytes)} · {new Date(b.created_at).toLocaleString()}
                </div>
              </div>
              <a
                className="audity-btn-secondary text-xs"
                href={`/api/admin/archive/bundles/${encodeURIComponent(b.filename)}/download`}
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImportTab() {
  const toast = useToast();
  const { csrfToken } = useImportTabAuth();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    filename?: string;
    month?: string;
    restored?: number;
    message?: string;
    code?: string;
    hint?: string;
  } | null>(null);

  async function upload() {
    if (!file) return;
    setSubmitting(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const headers: Record<string, string> = {};
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const response = await fetch(
        `${import.meta.env.VITE_AUDITY_API_URL ?? ""}/api/admin/archive/bundles/import`,
        {
          method: "POST",
          credentials: "include",
          headers,
          body: formData
        }
      );
      const payload = await response.json();
      setResult(payload);
      if (response.ok) {
        toast.success(`Re-imported ${payload.restored ?? 0} customer entries.`);
      } else {
        toast.error(payload.message ?? "Re-import failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-audity border border-audity-border bg-audity-panel p-4">
        <h2 className="mb-1 text-base font-semibold">Re-import an archive bundle</h2>
        <p className="mb-3 text-sm text-audity-secondary">
          Upload a <code className="font-mono">.audity-archive</code> file that was previously
          exported from this or another Audity instance. The bundle is decrypted with the current
          encryption key. After re-import, evidence is restored to the spool and customers reappear
          in the Customer overview tab in <em>spool</em> state; approve a restore request to re-upload
          them to object storage.
        </p>
        <input
          type="file"
          accept=".audity-archive"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        <div className="mt-3 flex gap-2">
          <button className="audity-btn-primary" disabled={!file || submitting} onClick={() => void upload()}>
            {submitting ? "Importing…" : "Re-import"}
          </button>
          {file ? (
            <button
              className="audity-btn-secondary"
              onClick={() => {
                setFile(null);
                setResult(null);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {result ? (
          <div
            className={`mt-3 rounded-audity border px-3 py-2 text-sm ${
              result.ok
                ? "border-audity-success bg-audity-success/10 text-audity-success"
                : "border-audity-error bg-audity-error/10 text-audity-error"
            }`}
          >
            <div>{result.message}</div>
            {result.hint ? <div className="mt-1 italic">{result.hint}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useImportTabAuth() {
  const { csrfToken } = useAuthHook();
  return { csrfToken };
}
