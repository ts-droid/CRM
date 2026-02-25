"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n";

type Customer = {
  id: string;
  name: string;
  organization: string | null;
  industry: string | null;
  country: string | null;
  region: string | null;
  seller: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  potentialScore: number;
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    department: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  }>;
  plans: Array<{
    id: string;
    title: string;
    status: "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
    priority?: "LOW" | "MEDIUM" | "HIGH";
    endDate?: string | null;
    owner: string | null;
  }>;
  webshopSignals?: {
    title?: string;
    description?: string;
    syncedAt?: string;
  } | null;
};

type Activity = {
  id: string;
  type: "NOTE" | "CUSTOMER_UPDATED" | "PLAN_CREATED" | "PLAN_UPDATED" | "CONTACT_CREATED";
  message: string;
  actorName: string | null;
  createdAt: string;
};

type SalesResponse = {
  customerId: string;
  count: number;
  totals: {
    netSales: number;
    unitsSold: number;
    ordersCount: number;
    averageGrossMargin: number | null;
  };
  rows: Array<{
    id: string;
    source: string;
    periodStart: string;
    periodEnd: string;
    currency: string;
    netSales: number | null;
    grossMargin: number | null;
    unitsSold: number | null;
    ordersCount: number | null;
  }>;
};

type ContactDraft = {
  key: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  title: string;
  notes: string;
};

function emptyContactDraft(): ContactDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    email: "",
    phone: "",
    department: "",
    title: "",
    notes: ""
  };
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const salesSectionEnabled = process.env.NEXT_PUBLIC_FEATURE_SALES_SECTION === "true";
  const { lang } = useI18n();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "contacts" | "plans" | "activity">("overview");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [noteText, setNoteText] = useState("");
  const [status, setStatus] = useState<string>("");
  const [contactStatus, setContactStatus] = useState<string>("");
  const [contactsSaving, setContactsSaving] = useState(false);
  const [newContacts, setNewContacts] = useState<ContactDraft[]>([emptyContactDraft()]);
  const [salesData, setSalesData] = useState<SalesResponse | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadCustomer() {
    setLoading(true);
    setStatus("");

    const res = await fetch(`/api/customers/${params.id}`, { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      setStatus(lang === "sv" ? "Kunde inte läsa kund" : "Could not load customer");
      return;
    }

    setCustomer((await res.json()) as Customer);
    setLoading(false);
  }

  async function loadActivities() {
    const res = await fetch(`/api/customers/${params.id}/activities`, { cache: "no-store" });
    if (!res.ok) return;
    setActivities((await res.json()) as Activity[]);
  }

  async function loadSales() {
    if (!salesSectionEnabled) return;
    setSalesLoading(true);
    setSalesError("");
    try {
      const res = await fetch(`/api/customers/${params.id}/sales?limit=12`, { cache: "no-store" });
      if (!res.ok) {
        setSalesError(lang === "sv" ? "Kunde inte läsa försäljning." : "Could not load sales.");
        setSalesLoading(false);
        return;
      }
      setSalesData((await res.json()) as SalesResponse);
    } catch {
      setSalesError(lang === "sv" ? "Kunde inte läsa försäljning." : "Could not load sales.");
    } finally {
      setSalesLoading(false);
    }
  }

  useEffect(() => {
    loadCustomer();
    loadActivities();
    loadSales();
  }, [params.id, lang]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const res = await fetch(`/api/customers/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        organization: form.get("organization"),
        industry: form.get("industry"),
        country: form.get("country"),
        region: form.get("region"),
        seller: form.get("seller"),
        website: form.get("website"),
        notes: form.get("notes"),
        potentialScore: Number(form.get("potentialScore") || 50)
      })
    });

    if (!res.ok) {
      setStatus(lang === "sv" ? "Kunde inte spara" : "Could not save");
      return;
    }

    setStatus(lang === "sv" ? "Sparat" : "Saved");
    await loadCustomer();
  }

  async function runSimilarSearch() {
    setStatus(lang === "sv" ? "Söker liknande kunder..." : "Searching similar customers...");
    const nextScope = customer?.region ? "region" : "country";
    const res = await fetch(`/api/customers/${params.id}/similar?scope=${nextScope}`, { cache: "no-store" });
    if (!res.ok) {
      setStatus(lang === "sv" ? "Kunde inte hämta liknande kunder." : "Could not fetch similar customers.");
      return;
    }
    const data = (await res.json()) as { results: Array<{ name: string }> };
    const topMatches = data.results.slice(0, 3).map((item) => item.name).join(", ");
    setStatus(
      lang === "sv"
        ? `Hittade ${data.results.length} liknande kunder (${nextScope}). ${topMatches || ""}`.trim()
        : `Found ${data.results.length} similar customers (${nextScope}). ${topMatches || ""}`.trim()
    );
  }

  function updateNewContact(index: number, field: keyof Omit<ContactDraft, "key">, value: string) {
    setNewContacts((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return { ...item, [field]: value };
      })
    );
  }

  function addContactDraft() {
    setNewContacts((prev) => [...prev, emptyContactDraft()]);
  }

  async function saveContacts() {
    setContactsSaving(true);
    setContactStatus("");

    const contactsToCreate = newContacts.filter(
      (item) =>
        item.name.trim() ||
        item.email.trim() ||
        item.phone.trim() ||
        item.department.trim() ||
        item.title.trim() ||
        item.notes.trim()
    );

    if (contactsToCreate.length === 0) {
      setContactStatus(lang === "sv" ? "Fyll i minst en kontakt." : "Enter at least one contact.");
      setContactsSaving(false);
      return;
    }

    try {
      for (const item of contactsToCreate) {
        const response = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: params.id,
            name: item.name,
            email: item.email || undefined,
            phone: item.phone || undefined,
            department: item.department || undefined,
            title: item.title || undefined,
            notes: item.notes || undefined
          })
        });

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error ?? (lang === "sv" ? "Kunde inte spara kontakt" : "Could not save contact"));
        }
      }

      setContactStatus(lang === "sv" ? "Kontakter sparade." : "Contacts saved.");
      setNewContacts([emptyContactDraft()]);
      await loadCustomer();
      await loadActivities();
    } catch (error) {
      setContactStatus(error instanceof Error ? error.message : lang === "sv" ? "Något gick fel." : "Something went wrong.");
    } finally {
      setContactsSaving(false);
    }
  }

  async function addActivityNote() {
    if (!noteText.trim()) return;
    const res = await fetch(`/api/customers/${params.id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: noteText.trim(), actorName: "CRM user" })
    });
    if (!res.ok) {
      setStatus(lang === "sv" ? "Kunde inte spara notering." : "Could not save note.");
      return;
    }
    setNoteText("");
    await loadActivities();
  }

  if (loading) {
    return <section className="crm-card">{lang === "sv" ? "Laddar kundkort..." : "Loading customer profile..."}</section>;
  }

  if (!customer) {
    return <section className="crm-card">{lang === "sv" ? "Kund saknas" : "Customer not found"}</section>;
  }

  return (
    <div className="crm-section">
      <section className="crm-card">
        <h2>{lang === "sv" ? "Kundkort" : "Customer profile"}: {customer.name}</h2>
        <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>
          {lang === "sv"
            ? "Hantera kunddata, potential och uppdatera signaler från webbsida."
            : "Manage customer data, potential and refresh website signals."}
        </p>
      </section>

      <section className="crm-card">
        <div className="crm-row">
          <button className={`crm-tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")} type="button">
            {lang === "sv" ? "Översikt" : "Overview"}
          </button>
          <button className={`crm-tab ${activeTab === "contacts" ? "active" : ""}`} onClick={() => setActiveTab("contacts")} type="button">
            {lang === "sv" ? "Kontakter" : "Contacts"}
          </button>
          <button className={`crm-tab ${activeTab === "plans" ? "active" : ""}`} onClick={() => setActiveTab("plans")} type="button">
            {lang === "sv" ? "Planer" : "Plans"}
          </button>
          <button className={`crm-tab ${activeTab === "activity" ? "active" : ""}`} onClick={() => setActiveTab("activity")} type="button">
            {lang === "sv" ? "Historik" : "Activity"}
          </button>
        </div>
      </section>

      {activeTab === "overview" ? (
        <>
          <section className="crm-card">
            <h3>{lang === "sv" ? "Översikt" : "Overview"}</h3>
            <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>
              {lang === "sv" ? "Land" : "Country"}: {customer.country ?? "-"} · {lang === "sv" ? "Region" : "Region"}: {customer.region ?? "-"} · {lang === "sv" ? "Säljare" : "Seller"}: {customer.seller ?? "-"}
            </p>
            <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
              {lang === "sv" ? "Bransch" : "Industry"}: {customer.industry ?? "-"} · {lang === "sv" ? "Potential" : "Potential"}: {customer.potentialScore}
            </p>
            <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
              {lang === "sv" ? "Kontakter" : "Contacts"}: {customer.contacts.length} · {lang === "sv" ? "Planer" : "Plans"}: {customer.plans.length}
            </p>
          </section>

          <section className="crm-card">
            <h3>{lang === "sv" ? "Kundinformation" : "Customer information"}</h3>
            <form onSubmit={onSave} style={{ marginTop: "0.8rem" }}>
              <div className="crm-row">
                <input className="crm-input" name="name" defaultValue={customer.name} placeholder={lang === "sv" ? "Namn" : "Name"} />
                <input className="crm-input" name="organization" defaultValue={customer.organization ?? ""} placeholder={lang === "sv" ? "Organisation" : "Organization"} />
                <input className="crm-input" name="industry" defaultValue={customer.industry ?? ""} placeholder={lang === "sv" ? "Bransch" : "Industry"} />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input className="crm-input" name="country" defaultValue={customer.country ?? ""} placeholder={lang === "sv" ? "Land" : "Country"} />
                <input className="crm-input" name="region" defaultValue={customer.region ?? ""} placeholder={lang === "sv" ? "Region" : "Region"} />
                <input className="crm-input" name="seller" defaultValue={customer.seller ?? ""} placeholder={lang === "sv" ? "Säljare" : "Seller"} />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input className="crm-input" name="website" defaultValue={customer.website ?? ""} placeholder={lang === "sv" ? "Webbsida" : "Website"} />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  name="potentialScore"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={customer.potentialScore}
                  placeholder={lang === "sv" ? "Potential (0-100)" : "Potential (0-100)"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea className="crm-textarea" name="notes" defaultValue={customer.notes ?? ""} placeholder={lang === "sv" ? "Noteringar" : "Notes"} />
              </div>
              <div className="crm-row" style={{ marginTop: "0.7rem" }}>
                <button className="crm-button" type="submit">{lang === "sv" ? "Spara" : "Save"}</button>
                <button className="crm-button crm-button-secondary" type="button" onClick={runSimilarSearch}>
                  {lang === "sv" ? "Sök liknande kunder (AI)" : "Find similar customers (AI)"}
                </button>
                <Link
                  href={`/admin/research?tab=research&customerId=${encodeURIComponent(customer.id)}&companyName=${encodeURIComponent(customer.name)}`}
                  className="crm-button crm-button-secondary"
                >
                  {lang === "sv" ? "Öppna research för kund" : "Open research for customer"}
                </Link>
              </div>
              {status ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{status}</p> : null}
            </form>
          </section>

          {salesSectionEnabled ? (
            <section className="crm-card">
              <h3>{lang === "sv" ? "Försäljning (beta)" : "Sales (beta)"}</h3>
              <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>
                {lang === "sv"
                  ? "Periodiserade försäljningssiffror för kunden. Sektionen är förberedd för ERP/API-integration."
                  : "Period-based sales figures for this customer. Section is prepared for ERP/API integration."}
              </p>

              {salesLoading ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{lang === "sv" ? "Laddar..." : "Loading..."}</p> : null}
              {salesError ? <p className="crm-subtle" style={{ marginTop: "0.6rem", color: "#b42318" }}>{salesError}</p> : null}

              {salesData ? (
                <>
                  <div className="crm-grid" style={{ marginTop: "0.7rem" }}>
                    <article className="crm-item">
                      <p className="crm-subtle">{lang === "sv" ? "Nettoförsäljning" : "Net sales"}</p>
                      <strong>
                        {salesData.totals.netSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                        {salesData.rows[0]?.currency ?? "SEK"}
                      </strong>
                    </article>
                    <article className="crm-item">
                      <p className="crm-subtle">{lang === "sv" ? "Order" : "Orders"}</p>
                      <strong>{salesData.totals.ordersCount}</strong>
                    </article>
                    <article className="crm-item">
                      <p className="crm-subtle">{lang === "sv" ? "Sålda enheter" : "Units sold"}</p>
                      <strong>{salesData.totals.unitsSold}</strong>
                    </article>
                    <article className="crm-item">
                      <p className="crm-subtle">{lang === "sv" ? "Snittmarginal" : "Avg margin"}</p>
                      <strong>
                        {typeof salesData.totals.averageGrossMargin === "number"
                          ? `${salesData.totals.averageGrossMargin.toFixed(2)}%`
                          : "-"}
                      </strong>
                    </article>
                  </div>

                  <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                    {salesData.rows.length === 0 ? (
                      <p className="crm-empty">{lang === "sv" ? "Inga försäljningsrader ännu." : "No sales rows yet."}</p>
                    ) : (
                      salesData.rows.map((row) => (
                        <article key={row.id} className="crm-item">
                          <div className="crm-item-head">
                            <strong>
                              {new Date(row.periodStart).toLocaleDateString()} - {new Date(row.periodEnd).toLocaleDateString()}
                            </strong>
                            <span className="crm-badge">{row.source}</span>
                          </div>
                          <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                            {(lang === "sv" ? "Netto" : "Net")}: {row.netSales ?? "-"} {row.currency} ·{" "}
                            {(lang === "sv" ? "Order" : "Orders")}: {row.ordersCount ?? "-"} ·{" "}
                            {(lang === "sv" ? "Enheter" : "Units")}: {row.unitsSold ?? "-"} ·{" "}
                            {(lang === "sv" ? "Marginal" : "Margin")}:{" "}
                            {typeof row.grossMargin === "number" ? `${row.grossMargin}%` : "-"}
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {activeTab === "contacts" ? (
      <section className="crm-card">
        <div className="crm-item-head">
          <h3>{lang === "sv" ? "Kontakter" : "Contacts"}</h3>
          <button className="crm-button crm-button-secondary" type="button" onClick={addContactDraft}>
            + {lang === "sv" ? "Lägg till kontakt" : "Add contact"}
          </button>
        </div>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          {lang === "sv"
            ? "Kontaktkort: Namn, E-post, Telefon, Avdelning, Befattning och Noteringar."
            : "Contact card: Name, Email, Phone, Department, Title and Notes."}
        </p>
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {customer.contacts.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Inga kontakter registrerade." : "No contacts registered."}</p>
          ) : (
            customer.contacts.map((contact) => (
              <article key={contact.id} className="crm-item">
                <div className="crm-item-head">
                  <strong>{contact.firstName} {contact.lastName}</strong>
                  <span className="crm-badge">{contact.title ?? "-"}</span>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
                  {contact.email ?? "-"} {contact.phone ? ` · ${contact.phone}` : ""}
                </p>
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {(lang === "sv" ? "Avdelning" : "Department") + ": " + (contact.department ?? "-")}
                </p>
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {(lang === "sv" ? "Noteringar" : "Notes") + ": " + (contact.notes ?? "-")}
                </p>
              </article>
            ))
          )}
        </div>
        <div className="crm-list" style={{ marginTop: "0.9rem" }}>
          {newContacts.map((draft, index) => (
            <article key={draft.key} className="crm-item">
              <div className="crm-item-head">
                <strong>{lang === "sv" ? "Ny kontakt" : "New contact"} #{index + 1}</strong>
              </div>
              <div className="crm-row" style={{ marginTop: "0.5rem" }}>
                <input
                  className="crm-input"
                  value={draft.name}
                  onChange={(event) => updateNewContact(index, "name", event.target.value)}
                  placeholder={lang === "sv" ? "Namn" : "Name"}
                />
                <input
                  className="crm-input"
                  value={draft.email}
                  onChange={(event) => updateNewContact(index, "email", event.target.value)}
                  placeholder={lang === "sv" ? "E-post" : "Email"}
                />
                <input
                  className="crm-input"
                  value={draft.phone}
                  onChange={(event) => updateNewContact(index, "phone", event.target.value)}
                  placeholder={lang === "sv" ? "Telefon" : "Phone"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  value={draft.department}
                  onChange={(event) => updateNewContact(index, "department", event.target.value)}
                  placeholder={lang === "sv" ? "Avdelning" : "Department"}
                />
                <input
                  className="crm-input"
                  value={draft.title}
                  onChange={(event) => updateNewContact(index, "title", event.target.value)}
                  placeholder={lang === "sv" ? "Befattning" : "Title"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  value={draft.notes}
                  onChange={(event) => updateNewContact(index, "notes", event.target.value)}
                  placeholder={lang === "sv" ? "Noteringar" : "Notes"}
                />
              </div>
            </article>
          ))}
        </div>
        <div className="crm-row" style={{ marginTop: "0.7rem" }}>
          <button className="crm-button" type="button" disabled={contactsSaving} onClick={saveContacts}>
            {contactsSaving ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara kontakter" : "Save contacts")}
          </button>
        </div>
        {contactStatus ? <p className="crm-subtle" style={{ marginTop: "0.55rem" }}>{contactStatus}</p> : null}
      </section>
      ) : null}

      {activeTab === "plans" ? (
      <section className="crm-card">
        <h3>{lang === "sv" ? "Planer" : "Plans"}</h3>
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {customer.plans.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Inga planer registrerade." : "No plans registered."}</p>
          ) : (
            customer.plans.map((plan) => (
              <article key={plan.id} className="crm-item">
                <div className="crm-item-head">
                  <strong>{plan.title}</strong>
                  <span className="crm-badge">{plan.status}</span>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
                  {lang === "sv" ? "Ansvarig" : "Owner"}: {plan.owner ?? "-"}
                </p>
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {lang === "sv" ? "Prioritet" : "Priority"}: {plan.priority ?? "-"}
                  {plan.endDate ? ` · ${lang === "sv" ? "Deadline" : "Deadline"}: ${new Date(plan.endDate).toLocaleDateString()}` : ""}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
      ) : null}

      {activeTab === "activity" ? (
      <section className="crm-card">
        <h3>{lang === "sv" ? "Aktivitetshistorik" : "Activity history"}</h3>
        <div className="crm-row" style={{ marginTop: "0.7rem" }}>
          <textarea
            className="crm-textarea"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder={lang === "sv" ? "Lägg till notering..." : "Add note..."}
          />
        </div>
        <div className="crm-row" style={{ marginTop: "0.6rem" }}>
          <button className="crm-button" type="button" onClick={addActivityNote}>
            {lang === "sv" ? "Spara notering" : "Save note"}
          </button>
        </div>
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {activities.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Ingen aktivitet ännu." : "No activity yet."}</p>
          ) : (
            activities.map((item) => (
              <article key={item.id} className="crm-item">
                <div className="crm-item-head">
                  <strong>{item.type}</strong>
                  <span className="crm-badge">{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>{item.message}</p>
                {item.actorName ? <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>{item.actorName}</p> : null}
              </article>
            ))
          )}
        </div>
      </section>
      ) : null}

      {customer.webshopSignals ? (
        <section className="crm-card">
          <h3>{lang === "sv" ? "Webshop-signaler" : "Webshop signals"}</h3>
          <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>
            {customer.webshopSignals.title ?? "-"}
          </p>
          <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
            {customer.webshopSignals.description ?? "-"}
          </p>
          <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
            {lang === "sv" ? "Senast synk" : "Last synced"}: {customer.webshopSignals.syncedAt ?? "-"}
          </p>
        </section>
      ) : null}

    </div>
  );
}
