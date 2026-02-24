"use client";

import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n";

type Customer = {
  id: string;
  name: string;
  organization: string | null;
  industry: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, lang } = useI18n();

  async function loadCustomers() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/customers", { cache: "no-store" });
      if (!res.ok) throw new Error(lang === "sv" ? "Kunde inte hämta kunder" : "Could not fetch customers");
      const data = (await res.json()) as Customer[];
      setCustomers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === "sv" ? "Något gick fel" : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, [lang]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          organization: form.get("organization"),
          industry: form.get("industry"),
          email: form.get("email"),
          phone: form.get("phone")
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte skapa kund" : "Could not create customer"));
      }

      event.currentTarget.reset();
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === "sv" ? "Något gick fel" : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="crm-section">
      <section className="crm-card">
        <h2>{t("customerTitle")}</h2>
        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
          {t("customerDesc")}
        </p>
      </section>

      <section className="crm-card">
        <h3>{t("customerNew")}</h3>
        <form onSubmit={onSubmit} style={{ marginTop: "0.85rem" }}>
          <div className="crm-row">
            <input className="crm-input" name="name" placeholder={t("name")} required minLength={2} />
            <input className="crm-input" name="organization" placeholder={t("organization")} />
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <input className="crm-input" name="industry" placeholder={t("industry")} />
            <input className="crm-input" name="email" placeholder={t("email")} type="email" />
            <input className="crm-input" name="phone" placeholder={t("phone")} />
          </div>
          <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={submitting}>
            {submitting ? t("saving") : t("saveCustomer")}
          </button>
        </form>
      </section>

      <section className="crm-card">
        <h3>{t("list")}</h3>
        {error ? <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.5rem" }}>{error}</p> : null}
        {loading ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>{t("loading")}</p> : null}
        {!loading && customers.length === 0 ? <p className="crm-empty">{t("noCustomers")}</p> : null}
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {customers.map((customer) => (
            <article key={customer.id} className="crm-item">
              <div className="crm-item-head">
                <strong>{customer.name}</strong>
                <span className="crm-badge">{new Date(customer.createdAt).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}</span>
              </div>
              <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                {customer.organization ?? t("noOrganization")}
                {customer.industry ? ` · ${customer.industry}` : ""}
              </p>
              <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                {customer.email ?? "-"} {customer.phone ? ` · ${customer.phone}` : ""}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
