import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { DataTable, EmptyState, MultiCombobox, Slideover, type ComboOption, type DataTableColumn } from "../../components/ui";
import type { Customer } from "./types";

type FrameworkOption = { id: string; name: string; shortName: string | null };

const industries = ["Technology", "Healthcare", "Finance", "Manufacturing", "Public Sector", "Retail"];
const regulatoryContexts = ["ISO 27001", "IEC 62443", "NIS2", "DORA", "SOC 2", "GDPR", "HIPAA", "PCI DSS"];
const criticalSystems = ["Identity", "Network", "Cloud", "ERP", "OT", "Customer Data"];
const criticalities = ["Low", "Medium", "High", "Critical"];

const emptyForm = {
  name: "",
  industry: industries[0],
  regulatoryContexts: [] as string[],
  criticalSystems: [criticalSystems[0]],
  businessCriticality: "Medium",
  status: "active",
  frameworkIds: [] as string[]
};

export function CustomerListPage({ mode = "all" }: { mode?: "all" | "my" | "shared" }) {
  const api = useApi();
  const { user } = useAuth();
  const canCreateCustomer = Boolean(user?.permissions.includes("assessment.create"));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [globalError, setGlobalError] = useState("");

  async function loadCustomers() {
    const endpoint = mode === "my" ? "/api/customers/my" : mode === "shared" ? "/api/customers/shared" : "/api/customers";
    const payload = await api<{ customers: Customer[] }>(endpoint);
    setCustomers(payload.customers);
  }

  async function loadFrameworks() {
    const payload = await api<{ frameworks: FrameworkOption[] }>("/api/frameworks");
    setFrameworks(payload.frameworks);
  }

  useEffect(() => {
    void Promise.all([loadCustomers(), loadFrameworks()]).catch((err) => setGlobalError(err instanceof Error ? err.message : "Load failed"));
  }, [mode]);

  function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];
    const header = lines[0].split(",").map((cell) => cell.replace(/^"|"$/g, "").trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells: string[] = [];
      let current = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "\"") {
          inQuote = !inQuote;
        } else if (ch === "," && !inQuote) {
          cells.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
      cells.push(current);
      const row: Record<string, string> = {};
      header.forEach((key, index) => {
        row[key] = (cells[index] ?? "").trim();
      });
      return row;
    });
  }

  async function importCustomersFromCsv(file: File) {
    setGlobalError("");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const customersPayload = rows
        .filter((row) => row.name)
        .map((row) => ({
          name: row.name,
          industry: row.industry || undefined,
          regulatoryContext: row.regulatorycontext || row["regulatory_context"] || undefined,
          businessCriticality: row.businesscriticality || row["business_criticality"] || undefined,
          status: row.status || undefined,
          criticalSystems: (row.criticalsystems || row["critical_systems"] || "")
            .split(/[;|]/)
            .map((entry) => entry.trim())
            .filter(Boolean)
        }));
      if (!customersPayload.length) {
        setGlobalError("CSV must contain a 'name' column with at least one row.");
        return;
      }
      const payload = await api<{ created: unknown[]; failures: Array<{ name: string; reason: string }> }>(
        "/api/customers/bulk-import",
        { method: "POST", body: JSON.stringify({ customers: customersPayload }) }
      );
      await loadCustomers();
      if (payload.failures.length) {
        setGlobalError(`Imported ${payload.created.length}, failed ${payload.failures.length}: ${payload.failures.map((f) => f.name).join(", ")}`);
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Bulk import failed");
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { regulatoryContexts, ...rest } = form;
      const payload = {
        ...rest,
        regulatoryContext: regulatoryContexts.length ? regulatoryContexts.join(", ") : undefined
      };
      await api("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setForm(emptyForm);
      setCreateOpen(false);
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  const criticalSystemOptions: ComboOption[] = criticalSystems.map((value) => ({ value, label: value }));
  const frameworkOptions: ComboOption[] = frameworks.map((framework) => ({
    value: framework.id,
    label: framework.shortName ?? framework.name,
    hint: framework.shortName ? framework.name : undefined
  }));

  return (
    <>
      <div className="audity-page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="audity-page-kicker">Customer management</p>
          <h1 className="audity-page-title">{mode === "my" ? "My Customers" : mode === "shared" ? "Shared Customers" : "Customers"}</h1>
        </div>
        {canCreateCustomer ? (
          <div className="flex flex-wrap gap-2">
            <label className="audity-btn-secondary cursor-pointer">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCustomersFromCsv(file);
                  event.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="audity-btn-primary"
              onClick={() => {
                setError("");
                setCreateOpen(true);
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New customer
            </button>
          </div>
        ) : null}
      </div>

      {globalError ? <div className="mb-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{globalError}</div> : null}

      <DataTable<Customer>
        storageKey={`customer-list-${mode ?? "all"}`}
        rows={customers}
        getRowId={(customer) => customer.id}
        emptyState={
          <EmptyState
            icon={
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 21h18" />
                <path d="M5 21V7l8-4v18" />
                <path d="M19 21V11l-6-4" />
                <line x1="9" y1="9" x2="9" y2="9" />
                <line x1="9" y1="12" x2="9" y2="12" />
                <line x1="9" y1="15" x2="9" y2="15" />
                <line x1="9" y1="18" x2="9" y2="18" />
              </svg>
            }
            title="No customers yet"
            description={canCreateCustomer ? "Create your first customer or import a list via CSV." : "No customers have been shared with you."}
            action={canCreateCustomer ? (
              <button className="audity-btn-primary" type="button" onClick={() => setCreateOpen(true)}>
                Create customer
              </button>
            ) : undefined}
          />
        }
        columns={[
          {
            key: "name",
            header: "Name",
            sortValue: (customer) => customer.name,
            cell: (customer) => (
              <Link className="font-semibold text-audity-text hover:text-audity-primary" to={`/customers/${customer.id}`}>{customer.name}</Link>
            )
          },
          {
            key: "createdBy",
            header: "Created by",
            sortValue: (customer) => customer.createdByName ?? customer.createdByEmail ?? "",
            cell: (customer) => <span className="text-audity-secondary">{customer.createdByName ?? customer.createdByEmail ?? "—"}</span>
          },
          {
            key: "sharedWith",
            header: "Shared with",
            cell: (customer) => <span className="text-audity-secondary">{customer.sharedWith?.map((share) => share.name ?? share.email).join(", ") || "—"}</span>
          },
          {
            key: "createdAt",
            header: "Created",
            sortValue: (customer) => customer.createdAt ?? "",
            cell: (customer) => <span className="tabular-nums text-audity-secondary">{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : "—"}</span>
          },
          {
            key: "updatedAt",
            header: "Last updated",
            sortValue: (customer) => customer.updatedAt ?? "",
            cell: (customer) => <span className="tabular-nums text-audity-secondary">{customer.updatedAt ? new Date(customer.updatedAt).toLocaleDateString() : "—"}</span>
          },
          {
            key: "actions",
            header: "",
            align: "right",
            width: "100px",
            cell: (customer) => (
              <Link className="audity-btn-soft audity-btn-sm" to={`/customers/${customer.id}`}>Open</Link>
            )
          }
        ] as DataTableColumn<Customer>[]}
      />

      {canCreateCustomer ? (
        <Slideover
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Create customer"
          description="Set up a new customer workspace. You can adjust criticality and frameworks later."
          width="md"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="audity-btn-ghost" onClick={() => setCreateOpen(false)} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" form="create-customer-form" className="audity-btn-primary" disabled={submitting || !form.name.trim()}>
                {submitting ? "Creating…" : "Create customer"}
              </button>
            </div>
          }
        >
          <form id="create-customer-form" onSubmit={createCustomer} className="space-y-4">
            <div>
              <label className="audity-label audity-label-required" htmlFor="customer-name">Customer name</label>
              <input
                id="customer-name"
                className="audity-input"
                value={form.name}
                placeholder="Acme Corp."
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                autoFocus
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="audity-label" htmlFor="customer-industry">Industry</label>
                <select id="customer-industry" className="audity-input" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })}>
                  {industries.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <MultiCombobox
                  label="Regulatory context"
                  options={regulatoryContexts.map((value) => ({ value, label: value }))}
                  value={form.regulatoryContexts}
                  onChange={(next) => setForm({ ...form, regulatoryContexts: next })}
                  placeholder="Pick or type frameworks…"
                  allowCreate
                />
              </div>
            </div>
            <div>
              <MultiCombobox
                label="Critical systems"
                options={criticalSystemOptions}
                value={form.criticalSystems}
                onChange={(next) => setForm({ ...form, criticalSystems: next })}
                placeholder="Add systems…"
                allowCreate
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="audity-label" htmlFor="customer-criticality">Business criticality</label>
                <select id="customer-criticality" className="audity-input" value={form.businessCriticality} onChange={(event) => setForm({ ...form, businessCriticality: event.target.value })}>
                  {criticalities.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="audity-label" htmlFor="customer-status">Status</label>
                <select id="customer-status" className="audity-input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>
            <div>
              <MultiCombobox
                label="Frameworks"
                options={frameworkOptions}
                value={form.frameworkIds}
                onChange={(next) => setForm({ ...form, frameworkIds: next })}
                placeholder="Add frameworks…"
                emptyText="No frameworks available"
              />
              <p className="mt-1 text-xs text-audity-muted">Selected frameworks become available for assessments under this customer.</p>
            </div>
            {error ? <div className="rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
          </form>
        </Slideover>
      ) : null}
    </>
  );
}
