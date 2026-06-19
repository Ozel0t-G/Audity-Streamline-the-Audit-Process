import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { DataTable, EmptyState, type DataTableColumn } from "../../components/ui";
import type { Customer } from "./types";

type FrameworkOption = { id: string; name: string; shortName: string | null };

const industries = ["Technology", "Healthcare", "Finance", "Manufacturing", "Public Sector", "Retail"];
const regulatoryContexts = ["ISO 27001", "IEC 62443", "NIS2", "SOC 2", "GDPR", "None"];
const criticalSystems = ["Identity", "Network", "Cloud", "ERP", "OT", "Customer Data"];
const criticalities = ["Low", "Medium", "High", "Critical"];

export function CustomerListPage({ mode = "all" }: { mode?: "all" | "my" | "shared" }) {
  const api = useApi();
  const { user } = useAuth();
  const canCreateCustomer = Boolean(user?.permissions.includes("assessment.create"));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [form, setForm] = useState({
    name: "",
    industry: industries[0],
    regulatoryContext: regulatoryContexts[0],
    criticalSystems: [criticalSystems[0]],
    businessCriticality: "Medium",
    status: "active",
    frameworkIds: [] as string[]
  });
  const [error, setError] = useState("");

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
    void Promise.all([loadCustomers(), loadFrameworks()]).catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
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
    setError("");
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
        setError("CSV must contain a 'name' column with at least one row.");
        return;
      }
      const payload = await api<{ created: unknown[]; failures: Array<{ name: string; reason: string }> }>(
        "/api/customers/bulk-import",
        { method: "POST", body: JSON.stringify({ customers: customersPayload }) }
      );
      await loadCustomers();
      if (payload.failures.length) {
        setError(`Imported ${payload.created.length}, failed ${payload.failures.length}: ${payload.failures.map((f) => f.name).join(", ")}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk import failed");
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          ...form
        })
      });
      setForm({
        name: "",
        industry: industries[0],
        regulatoryContext: regulatoryContexts[0],
        criticalSystems: [criticalSystems[0]],
        businessCriticality: "Medium",
        status: "active",
        frameworkIds: []
      });
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <>
          <div className="audity-page-header flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="audity-page-kicker">Customer Management</p>
              <h1 className="audity-page-title">{mode === "my" ? "My Customers" : mode === "shared" ? "Shared Customers" : "Customers"}</h1>
            </div>
            {canCreateCustomer ? (
              <label className="audity-btn-secondary cursor-pointer">
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
            ) : null}
          </div>
          <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <DataTable<Customer>
              storageKey={`customer-list-${mode ?? "all"}`}
              rows={customers}
              getRowId={(customer) => customer.id}
              emptyState={
                <EmptyState
                  icon={<span className="text-2xl">🏢</span>}
                  title="No customers yet"
                  description={canCreateCustomer ? "Create your first customer or import a list via CSV." : "No customers have been shared with you."}
                />
              }
              columns={[
                {
                  key: "name",
                  header: "Name",
                  sortValue: (customer) => customer.name,
                  cell: (customer) => (
                    <Link className="font-semibold text-audity-primary hover:text-audity-primaryHover" to={`/customers/${customer.id}`}>{customer.name}</Link>
                  )
                },
                {
                  key: "createdBy",
                  header: "Created By",
                  sortValue: (customer) => customer.createdByName ?? customer.createdByEmail ?? "",
                  cell: (customer) => <span className="text-audity-secondary">{customer.createdByName ?? customer.createdByEmail ?? "-"}</span>
                },
                {
                  key: "sharedWith",
                  header: "Shared With",
                  cell: (customer) => <span className="text-audity-secondary">{customer.sharedWith?.map((share) => share.name ?? share.email).join(", ") || "-"}</span>
                },
                {
                  key: "createdAt",
                  header: "Created At",
                  sortValue: (customer) => customer.createdAt ?? "",
                  cell: (customer) => <span className="text-audity-secondary">{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : "-"}</span>
                },
                {
                  key: "updatedAt",
                  header: "Last Updated",
                  sortValue: (customer) => customer.updatedAt ?? "",
                  cell: (customer) => <span className="text-audity-secondary">{customer.updatedAt ? new Date(customer.updatedAt).toLocaleDateString() : "-"}</span>
                },
                {
                  key: "actions",
                  header: "",
                  align: "right",
                  width: "100px",
                  cell: (customer) => (
                    <Link className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs font-semibold text-audity-primary hover:border-audity-primary" to={`/customers/${customer.id}`}>Open</Link>
                  )
                }
              ] as DataTableColumn<Customer>[]}
            />
            {canCreateCustomer ? (
            <form onSubmit={createCustomer} className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <h2 className="mb-4 text-lg font-semibold">Create customer</h2>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Customer Name
                <input className="mt-2 audity-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Industry
                <select className="mt-2 audity-input" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })}>
                  {industries.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Regulatory context
                <select className="mt-2 audity-input" value={form.regulatoryContext} onChange={(event) => setForm({ ...form, regulatoryContext: event.target.value })}>
                  {regulatoryContexts.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Critical systems
                <select multiple className="mt-2 min-h-28 w-full rounded-audity border border-audity-border bg-audity-page px-2 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={form.criticalSystems} onChange={(event) => setForm({ ...form, criticalSystems: Array.from(event.target.selectedOptions).map((option) => option.value) })}>
                  {criticalSystems.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Business criticality
                <select className="mt-2 audity-input" value={form.businessCriticality} onChange={(event) => setForm({ ...form, businessCriticality: event.target.value })}>
                  {criticalities.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Frameworks
                <select multiple className="mt-2 min-h-32 w-full rounded-audity border border-audity-border bg-audity-page px-2 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={form.frameworkIds} onChange={(event) => setForm({ ...form, frameworkIds: Array.from(event.target.selectedOptions).map((option) => option.value) })}>
                  {frameworks.map((framework) => <option key={framework.id} value={framework.id}>{framework.shortName ?? framework.name}</option>)}
                </select>
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Status
                <select className="mt-2 audity-input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                </select>
              </label>
              {error ? <div className="mb-3 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
              <button className="audity-btn-primary">Create</button>
            </form>
            ) : null}
          </div>
    </>
  );
}
