import { FormEvent, useEffect, useState } from "react";
import { useApi } from "../../api/client";
import { useToast } from "../../components/ui";

type CustomerDetails = {
  id: string;
  name: string;
  industry: string | null;
  regulatoryContext: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
};

type Contact = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
};

export function CustomerDetailsPanel({ customerId, canEdit }: { customerId: string; canEdit: boolean }) {
  const api = useApi();
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ industry: "", regulatoryContext: "", address: "", website: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", role: "", email: "", phone: "" });
  const [addingContact, setAddingContact] = useState(false);

  async function load() {
    try {
      const [c, k] = await Promise.all([
        api<{ customer: CustomerDetails }>(`/api/customers/${customerId}`),
        api<{ contacts: Contact[] }>(`/api/customers/${customerId}/contacts`)
      ]);
      setForm({
        industry: c.customer.industry ?? "",
        regulatoryContext: c.customer.regulatoryContext ?? "",
        address: c.customer.address ?? "",
        website: c.customer.website ?? "",
        notes: c.customer.notes ?? ""
      });
      setContacts(k.contacts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load customer details");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/api/customers/${customerId}`, { method: "PATCH", body: JSON.stringify(form) });
      toast.success("Customer details saved");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addContact(event: FormEvent) {
    event.preventDefault();
    if (!newContact.name.trim()) return;
    setAddingContact(true);
    try {
      await api(`/api/customers/${customerId}/contacts`, { method: "POST", body: JSON.stringify(newContact) });
      setNewContact({ name: "", role: "", email: "", phone: "" });
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add contact");
    } finally {
      setAddingContact(false);
    }
  }

  async function deleteContact(contactId: string) {
    try {
      await api(`/api/customers/${customerId}/contacts/${contactId}`, { method: "DELETE" });
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete contact");
    }
  }

  return (
    <section className="audity-card mb-4 grid gap-6 p-4 lg:grid-cols-2">
      {/* ── Master data ─────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-audity-text">Customer details</h2>
        <form onSubmit={saveDetails} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-audity-muted">
              Industry
              <input className="audity-input mt-1" value={form.industry} disabled={!canEdit}
                onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </label>
            <label className="text-xs text-audity-muted">
              Regulatory context
              <input className="audity-input mt-1" value={form.regulatoryContext} disabled={!canEdit}
                onChange={(e) => setForm({ ...form, regulatoryContext: e.target.value })} />
            </label>
            <label className="text-xs text-audity-muted">
              Website
              <input className="audity-input mt-1" placeholder="https://…" value={form.website} disabled={!canEdit}
                onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </label>
            <label className="text-xs text-audity-muted">
              Address
              <input className="audity-input mt-1" value={form.address} disabled={!canEdit}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
          </div>
          <label className="block text-xs text-audity-muted">
            Notes
            <textarea className="audity-input mt-1 min-h-[72px]" value={form.notes} disabled={!canEdit}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          {canEdit ? (
            <button className="audity-btn-primary audity-btn-sm" disabled={saving}>
              {saving ? "Saving…" : "Save details"}
            </button>
          ) : null}
        </form>
      </div>

      {/* ── Contacts ────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-audity-text">Contacts</h2>
        {contacts.length === 0 ? (
          <p className="mb-3 text-xs text-audity-muted">No contacts yet.</p>
        ) : (
          <ul className="mb-3 space-y-2">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-start justify-between gap-2 rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-audity-text">
                    {contact.name}
                    {contact.role ? <span className="text-audity-muted"> · {contact.role}</span> : null}
                  </p>
                  <p className="truncate text-xs text-audity-muted">
                    {[contact.email, contact.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {canEdit ? (
                  <button type="button" className="text-xs text-audity-error hover:underline"
                    onClick={() => void deleteContact(contact.id)}>
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form onSubmit={addContact} className="space-y-2 rounded-audity border border-dashed border-audity-border p-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="audity-input" placeholder="Name *" value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
              <input className="audity-input" placeholder="Role" value={newContact.role}
                onChange={(e) => setNewContact({ ...newContact, role: e.target.value })} />
              <input className="audity-input" placeholder="Email" value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
              <input className="audity-input" placeholder="Phone" value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
            </div>
            <button className="audity-btn-secondary audity-btn-sm" disabled={addingContact || !newContact.name.trim()}>
              {addingContact ? "Adding…" : "Add contact"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
