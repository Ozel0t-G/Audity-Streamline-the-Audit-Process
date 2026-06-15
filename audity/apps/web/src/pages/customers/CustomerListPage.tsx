import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
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
          <div className="audity-page-header">
            <p className="audity-page-kicker">Customer Management</p>
            <h1 className="audity-page-title">{mode === "my" ? "My Customers" : mode === "shared" ? "Shared Customers" : "Customers"}</h1>
          </div>
          <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-hidden rounded-audity border border-audity-border bg-audity-panel">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-audity-tableHeader text-xs uppercase text-audity-muted">
                  <tr>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Name</th>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Created By</th>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Shared With</th>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Created At</th>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Last Updated</th>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-b border-audity-border last:border-0">
                      <td className="px-3 py-3">
                        <Link className="font-semibold text-audity-primary hover:text-audity-primaryHover" to={`/customers/${customer.id}`}>{customer.name}</Link>
                      </td>
                      <td className="px-3 py-3 text-audity-secondary">{customer.createdByName ?? customer.createdByEmail ?? "-"}</td>
                      <td className="px-3 py-3 text-audity-secondary">{customer.sharedWith?.map((share) => share.name ?? share.email).join(", ") || "-"}</td>
                      <td className="px-3 py-3 text-audity-secondary">{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : "-"}</td>
                      <td className="px-3 py-3 text-audity-secondary">{customer.updatedAt ? new Date(customer.updatedAt).toLocaleDateString() : "-"}</td>
                      <td className="px-3 py-3">
                        <Link className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs font-semibold text-audity-primary hover:border-audity-primary" to={`/customers/${customer.id}`}>Open</Link>
                      </td>
                    </tr>
                  ))}
                  {!customers.length ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-audity-muted" colSpan={6}>No customers to show</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
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
              {error ? <div className="mb-3 rounded-audity border border-[#FF4B00] bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
              <button className="audity-btn-primary">Create</button>
            </form>
            ) : null}
          </div>
    </>
  );
}
