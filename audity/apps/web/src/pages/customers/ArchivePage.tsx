import { FormEvent, useEffect, useState } from "react";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { DataTable, EmptyState, Slideover, useToast, type DataTableColumn } from "../../components/ui";

type ArchivedCustomer = {
  id: string;
  name: string;
  industry: string | null;
  archived_at: string;
  archived_by: string | null;
  archive_reason: string | null;
  archived_by_name: string | null;
  restore_request_pending: boolean;
};

export function ArchivePage() {
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<ArchivedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestTarget, setRequestTarget] = useState<ArchivedCustomer | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const payload = await api<{ customers: ArchivedCustomer[] }>("/api/customers/archived");
      setItems(payload.customers);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load archive");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitRestoreRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestTarget) return;
    setSubmitting(true);
    try {
      await api(`/api/customers/${requestTarget.id}/restore-request`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      toast.success("Restore request sent. An Instance Admin has been notified.");
      setRequestTarget(null);
      setReason("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: DataTableColumn<ArchivedCustomer>[] = [
    { key: "name", header: "Customer", cell: (row) => row.name },
    { key: "industry", header: "Industry", cell: (row) => row.industry ?? "—" },
    {
      key: "archived_at",
      header: "Archived",
      cell: (row) => new Date(row.archived_at).toLocaleDateString()
    },
    { key: "archived_by_name", header: "By", cell: (row) => row.archived_by_name ?? "—" },
    { key: "archive_reason", header: "Reason", cell: (row) => row.archive_reason ?? "—" },
    {
      key: "actions",
      header: "",
      cell: (row) =>
        row.restore_request_pending ? (
          <span className="inline-flex items-center rounded-full border border-audity-warning/30 bg-audity-warning/10 px-2 py-0.5 text-xs text-audity-warning">
            Restore pending
          </span>
        ) : (
          <button
            className="audity-btn-secondary text-xs"
            onClick={() => {
              setRequestTarget(row);
              setReason("");
            }}
          >
            Request restore
          </button>
        )
    }
  ];

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Archived customers</h1>
        <p className="text-sm text-audity-secondary">
          Archived customers are read-only. To re-open one for work, request a restore — an Instance
          Admin will be notified and can approve or deny.
        </p>
      </header>
      {error ? <p className="text-sm text-audity-error">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-audity-muted">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No archived customers"
          description={
            user
              ? "You have not archived any customers yet."
              : "Sign in to view your archived customers."
          }
        />
      ) : (
        <DataTable<ArchivedCustomer> rows={items} columns={columns} getRowId={(row) => row.id} />
      )}

      <Slideover
        title={requestTarget ? `Request restore: ${requestTarget.name}` : "Request restore"}
        open={!!requestTarget}
        onClose={() => setRequestTarget(null)}
      >
        {requestTarget ? (
          <form className="space-y-3" onSubmit={submitRestoreRequest}>
            <p className="text-sm text-audity-secondary">
              Briefly explain why this customer should be restored. The reason is shown to the
              Instance Admin who reviews your request.
            </p>
            <textarea
              className="audity-input min-h-[7rem]"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={3}
              maxLength={500}
            />
            <div className="flex gap-2">
              <button className="audity-btn-primary" disabled={submitting || !reason.trim()}>
                {submitting ? "Submitting…" : "Send restore request"}
              </button>
              <button
                type="button"
                className="audity-btn-secondary"
                onClick={() => setRequestTarget(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </Slideover>
    </section>
  );
}
