import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { Customer } from "./types";

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function CustomerListPage() {
  const api = useApi();
  const { user } = useAuth();
  const canCreateCustomer = Boolean(user?.permissions.includes("assessment.create"));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({
    name: "",
    industry: "",
    regulatoryContext: "",
    criticalSystems: "",
    businessCriticality: "Medium",
    status: "active"
  });
  const [error, setError] = useState("");

  async function loadCustomers() {
    const payload = await api<{ customers: Customer[] }>("/api/customers");
    setCustomers(payload.customers);
  }

  useEffect(() => {
    void loadCustomers().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, []);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          criticalSystems: csv(form.criticalSystems)
        })
      });
      setForm({
        name: "",
        industry: "",
        regulatoryContext: "",
        criticalSystems: "",
        businessCriticality: "Medium",
        status: "active"
      });
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <>
          <div className="mb-5 border-b border-audity-border pb-4">
            <p className="text-xs font-semibold uppercase text-audity-primary">Customer Management</p>
            <h1 className="mt-1 text-2xl font-semibold">Customers</h1>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="overflow-hidden rounded-audity border border-audity-border bg-audity-panel">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-audity-tableHeader text-xs uppercase text-audity-muted">
                  <tr>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Name</th>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Industry</th>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Criticality</th>
                    <th className="border-b border-audity-border px-3 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-b border-audity-border last:border-0">
                      <td className="px-3 py-3">
                        <Link className="font-semibold text-audity-primary hover:text-audity-primaryHover" to={`/customers/${customer.id}`}>{customer.name}</Link>
                      </td>
                      <td className="px-3 py-3 text-audity-secondary">{customer.industry}</td>
                      <td className="px-3 py-3 text-audity-secondary">{customer.businessCriticality}</td>
                      <td className="px-3 py-3 text-audity-secondary">{customer.status}</td>
                    </tr>
                  ))}
                  {!customers.length ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-audity-muted" colSpan={4}>No customers to show</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {canCreateCustomer ? (
            <form onSubmit={createCustomer} className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <h2 className="mb-4 text-lg font-semibold">Create customer</h2>
              {[
                ["name", "Name"],
                ["industry", "Industry"],
                ["regulatoryContext", "Regulatory context"],
                ["criticalSystems", "Critical systems"],
                ["businessCriticality", "Business criticality"],
                ["status", "Status"]
              ].map(([key, label]) => (
                <label key={key} className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                  {label}
                  <input
                    className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                    value={form[key as keyof typeof form]}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  />
                </label>
              ))}
              {error ? <div className="mb-3 rounded-audity border border-[#FF4B00] bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
              <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">Create</button>
            </form>
            ) : null}
          </div>
    </>
  );
}
