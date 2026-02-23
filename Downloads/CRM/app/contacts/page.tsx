"use client";

import { FormEvent, useEffect, useState } from "react";

type CustomerRef = { id: string; name: string };

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  customer: CustomerRef;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [contactsRes, customersRes] = await Promise.all([
        fetch("/api/contacts", { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" })
      ]);

      if (!contactsRes.ok || !customersRes.ok) {
        throw new Error("Kunde inte hämta data");
      }

      const contactsData = (await contactsRes.json()) as Contact[];
      const customersData = (await customersRes.json()) as Array<{ id: string; name: string }>;
      setContacts(contactsData);
      setCustomers(customersData.map((item) => ({ id: item.id, name: item.name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          role: form.get("role"),
          email: form.get("email"),
          phone: form.get("phone"),
          customerId: form.get("customerId")
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Kunde inte skapa kontakt");
      }

      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="crm-section">
      <section className="crm-card">
        <h2>Kontakter</h2>
        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
          Koppla kontakter till kunder och bygg kommunikationen strukturerat.
        </p>
      </section>

      <section className="crm-card">
        <h3>Ny kontakt</h3>
        <form onSubmit={onSubmit} style={{ marginTop: "0.85rem" }}>
          <div className="crm-row">
            <input className="crm-input" name="firstName" placeholder="Förnamn" required />
            <input className="crm-input" name="lastName" placeholder="Efternamn" required />
            <input className="crm-input" name="role" placeholder="Roll" />
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <input className="crm-input" name="email" placeholder="E-post" type="email" />
            <input className="crm-input" name="phone" placeholder="Telefon" />
            <select className="crm-select" name="customerId" required defaultValue="">
              <option value="" disabled>
                Välj kund
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={submitting}>
            {submitting ? "Sparar..." : "Spara kontakt"}
          </button>
        </form>
      </section>

      <section className="crm-card">
        <h3>Lista</h3>
        {error ? <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.5rem" }}>{error}</p> : null}
        {loading ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>Laddar...</p> : null}
        {!loading && contacts.length === 0 ? <p className="crm-empty">Inga kontakter ännu.</p> : null}
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {contacts.map((contact) => (
            <article key={contact.id} className="crm-item">
              <div className="crm-item-head">
                <strong>{contact.firstName} {contact.lastName}</strong>
                <span className="crm-badge">{contact.customer.name}</span>
              </div>
              <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                {contact.role ?? "Ingen roll"}
              </p>
              <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                {contact.email ?? "-"} {contact.phone ? ` · ${contact.phone}` : ""}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
