"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";

type CustomerRef = { id: string; name: string };

type Plan = {
  id: string;
  title: string;
  description: string | null;
  status: "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
  owner: string | null;
  customer: CustomerRef;
};

const statusClass: Record<Plan["status"], string> = {
  PLANNED: "",
  IN_PROGRESS: "in_progress",
  ON_HOLD: "on_hold",
  COMPLETED: "completed"
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, lang } = useI18n();

  const labels = useMemo(
    () => ({
      PLANNED: t("statusPlanned"),
      IN_PROGRESS: t("statusInProgress"),
      ON_HOLD: t("statusOnHold"),
      COMPLETED: t("statusCompleted")
    }),
    [t]
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [plansRes, customersRes] = await Promise.all([
        fetch("/api/plans", { cache: "no-store" }),
        fetch("/api/customers", { cache: "no-store" })
      ]);

      if (!plansRes.ok || !customersRes.ok) {
        throw new Error(lang === "sv" ? "Kunde inte hämta data" : "Could not fetch data");
      }

      setPlans((await plansRes.json()) as Plan[]);
      setCustomers((await customersRes.json()) as CustomerRef[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === "sv" ? "Något gick fel" : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [lang]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          owner: form.get("owner"),
          status: form.get("status"),
          customerId: form.get("customerId")
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte skapa plan" : "Could not create plan"));
      }

      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === "sv" ? "Något gick fel" : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="crm-section">
      <section className="crm-card">
        <h2>{t("planTitle")}</h2>
        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
          {t("planDesc")}
        </p>
      </section>

      <section className="crm-card">
        <h3>{t("planNew")}</h3>
        <form onSubmit={onSubmit} style={{ marginTop: "0.85rem" }}>
          <div className="crm-row">
            <input className="crm-input" name="title" placeholder={t("title")} required />
            <input className="crm-input" name="owner" placeholder={t("owner")} />
            <select className="crm-select" name="status" defaultValue="PLANNED">
              <option value="PLANNED">{labels.PLANNED}</option>
              <option value="IN_PROGRESS">{labels.IN_PROGRESS}</option>
              <option value="ON_HOLD">{labels.ON_HOLD}</option>
              <option value="COMPLETED">{labels.COMPLETED}</option>
            </select>
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <select className="crm-select" name="customerId" required defaultValue="">
              <option value="" disabled>
                {t("chooseCustomer")}
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <textarea className="crm-textarea" name="description" placeholder={t("description")} />
          </div>
          <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={submitting}>
            {submitting ? t("saving") : t("savePlan")}
          </button>
        </form>
      </section>

      <section className="crm-card">
        <h3>{t("list")}</h3>
        {error ? <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.5rem" }}>{error}</p> : null}
        {loading ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>{t("loading")}</p> : null}
        {!loading && plans.length === 0 ? <p className="crm-empty">{t("noPlans")}</p> : null}
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {plans.map((plan) => (
            <article key={plan.id} className="crm-item">
              <div className="crm-item-head">
                <strong>{plan.title}</strong>
                <span className={`crm-badge ${statusClass[plan.status]}`}>{labels[plan.status]}</span>
              </div>
              <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                {plan.customer.name}
                {plan.owner ? ` · ${plan.owner}` : ""}
              </p>
              {plan.description ? (
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {plan.description}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
