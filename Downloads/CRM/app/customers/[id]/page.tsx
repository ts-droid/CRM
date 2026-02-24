"use client";

import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n";
import { useSearchParams } from "next/navigation";

type SimilarCustomer = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  industry: string | null;
  potentialScore: number;
  matchScore: number;
};

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
    role: string | null;
    email: string | null;
    phone: string | null;
  }>;
  plans: Array<{
    id: string;
    title: string;
    status: "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
    owner: string | null;
  }>;
  webshopSignals?: {
    title?: string;
    description?: string;
    syncedAt?: string;
  } | null;
};

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { lang } = useI18n();
  const searchParams = useSearchParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [similar, setSimilar] = useState<SimilarCustomer[]>([]);
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [scope, setScope] = useState<"region" | "country">("region");
  const [status, setStatus] = useState<string>("");
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

  async function loadSimilar(nextScope: "region" | "country") {
    const res = await fetch(`/api/customers/${params.id}/similar?scope=${nextScope}`, { cache: "no-store" });
    if (!res.ok) return;

    const data = (await res.json()) as { results: SimilarCustomer[] };
    setSimilar(data.results);
  }

  useEffect(() => {
    loadCustomer();
    loadSimilar(scope);
  }, [params.id, scope, lang]);

  useEffect(() => {
    const shouldAutoRun = searchParams.get("autoSimilar") === "1";
    const requestedScope = searchParams.get("scope");
    const nextScope = requestedScope === "country" ? "country" : "region";

    if (!shouldAutoRun) return;

    setScope(nextScope);
    setStatus(lang === "sv" ? "Laddar liknande kunder..." : "Loading similar customers...");
    loadSimilar(nextScope).then(() => {
      setStatus(lang === "sv" ? "Liknande kunder laddade." : "Similar customers loaded.");
      const section = document.getElementById("similar-customers");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [searchParams, lang]);

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
        email: form.get("email"),
        phone: form.get("phone"),
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

  async function syncWebshop() {
    setStatus(lang === "sv" ? "Synkar webshop..." : "Syncing webshop...");
    const res = await fetch(`/api/customers/${params.id}/sync-webshop`, { method: "POST" });

    if (!res.ok) {
      setStatus(lang === "sv" ? "Webshop-sync misslyckades" : "Webshop sync failed");
      return;
    }

    setStatus(lang === "sv" ? "Webshop-data uppdaterad" : "Webshop data updated");
    await loadCustomer();
    await loadSimilar(scope);
  }

  async function buildPrompt() {
    setStatus(lang === "sv" ? "Bygger AI-prompt..." : "Building AI prompt...");

    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: params.id,
        scope
      })
    });

    if (!res.ok) {
      setStatus(lang === "sv" ? "Kunde inte skapa prompt" : "Could not build prompt");
      return;
    }

    const data = (await res.json()) as { aiPrompt?: string };
    setAiPrompt(data.aiPrompt ?? "");
    setStatus(lang === "sv" ? "AI-prompt klar" : "AI prompt ready");
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
            <input className="crm-input" name="email" defaultValue={customer.email ?? ""} placeholder={lang === "sv" ? "E-post" : "Email"} />
            <input className="crm-input" name="phone" defaultValue={customer.phone ?? ""} placeholder={lang === "sv" ? "Telefon" : "Phone"} />
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
            <button className="crm-button crm-button-secondary" type="button" onClick={syncWebshop}>
              {lang === "sv" ? "Synka webshop" : "Sync webshop"}
            </button>
            <button className="crm-button crm-button-secondary" type="button" onClick={buildPrompt}>
              {lang === "sv" ? "Skapa AI-prompt" : "Build AI prompt"}
            </button>
          </div>
          {status ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{status}</p> : null}
        </form>
      </section>

      <section className="crm-card" id="similar-customers">
        <div className="crm-item-head">
          <h3>{lang === "sv" ? "Liknande kunder (AI)" : "Similar customers (AI)"}</h3>
          <select className="crm-select" value={scope} onChange={(e) => setScope(e.target.value as "region" | "country")}>
            <option value="region">{lang === "sv" ? "Region" : "Region"}</option>
            <option value="country">{lang === "sv" ? "Land" : "Country"}</option>
          </select>
        </div>
        <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>
          {lang === "sv"
            ? "Rankning baserad på land/region, bransch och potentialscore."
            : "Ranking based on country/region, industry and potential score."}
        </p>

        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {similar.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Inga liknande kunder hittades." : "No similar customers found."}</p>
          ) : (
            similar.map((item) => (
              <article key={item.id} className="crm-item">
                <div className="crm-item-head">
                  <strong>{item.name}</strong>
                  <span className="crm-badge">Match: {item.matchScore}</span>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                  {(item.country ?? "-") + " · " + (item.region ?? "-") + " · " + (item.industry ?? "-")}
                </p>
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {lang === "sv" ? "Potential" : "Potential"}: {item.potentialScore}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="crm-card">
        <h3>{lang === "sv" ? "Kontakter" : "Contacts"}</h3>
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {customer.contacts.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Inga kontakter registrerade." : "No contacts registered."}</p>
          ) : (
            customer.contacts.map((contact) => (
              <article key={contact.id} className="crm-item">
                <div className="crm-item-head">
                  <strong>{contact.firstName} {contact.lastName}</strong>
                  <span className="crm-badge">{contact.role ?? "-"}</span>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
                  {contact.email ?? "-"} {contact.phone ? ` · ${contact.phone}` : ""}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

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
              </article>
            ))
          )}
        </div>
      </section>

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

      {aiPrompt ? (
        <section className="crm-card">
          <h3>{lang === "sv" ? "AI-prompt för analys" : "AI prompt for analysis"}</h3>
          <pre className="crm-pre">{aiPrompt}</pre>
        </section>
      ) : null}
    </div>
  );
}
