"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";

type CustomerRef = { id: string; name: string };

type Plan = {
  id: string;
  title: string;
  description: string | null;
  status: "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  startDate: string | null;
  endDate: string | null;
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
      COMPLETED: t("statusCompleted"),
      LOW: lang === "sv" ? "Låg" : "Low",
      MEDIUM: lang === "sv" ? "Medel" : "Medium",
      HIGH: lang === "sv" ? "Hög" : "High"
    }),
    [t, lang]
  );

  const statusOrder: Array<Plan["status"]> = ["PLANNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"];

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
          priority: form.get("priority"),
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
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

  async function updatePlanStatus(planId: string, status: Plan["status"]) {
    const response = await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? "Could not update plan");
    }
  }

  async function onDropPlan(status: Plan["status"], planId: string) {
    try {
      await updatePlanStatus(planId, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === "sv" ? "Kunde inte uppdatera plan" : "Could not update plan");
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
            <select className="crm-select" name="priority" defaultValue="MEDIUM">
              <option value="LOW">{labels.LOW}</option>
              <option value="MEDIUM">{labels.MEDIUM}</option>
              <option value="HIGH">{labels.HIGH}</option>
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
            <input className="crm-input" name="startDate" type="date" />
            <input className="crm-input" name="endDate" type="date" />
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
        <h3>{lang === "sv" ? "Pipeline" : "Pipeline"}</h3>
        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
          {lang === "sv" ? "Dra och släpp planer mellan statuskolumner." : "Drag and drop plans between status columns."}
        </p>
        {error ? <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.5rem" }}>{error}</p> : null}
        {loading ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>{t("loading")}</p> : null}
        {!loading && plans.length === 0 ? <p className="crm-empty">{t("noPlans")}</p> : null}

        <div className="crm-kanban" style={{ marginTop: "0.8rem" }}>
          {statusOrder.map((status) => (
            <section
              key={status}
              className="crm-kanban-col"
              onDragOver={(event) => event.preventDefault()}
              onDrop={async (event) => {
                event.preventDefault();
                const planId = event.dataTransfer.getData("text/plain");
                if (!planId) return;
                await onDropPlan(status, planId);
              }}
            >
              <header className="crm-item-head">
                <strong>{labels[status]}</strong>
                <span className="crm-badge">{plans.filter((plan) => plan.status === status).length}</span>
              </header>
              <div className="crm-list" style={{ marginTop: "0.6rem" }}>
                {plans
                  .filter((plan) => plan.status === status)
                  .map((plan) => (
                    <article
                      key={plan.id}
                      className="crm-item"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", plan.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <div className="crm-item-head">
                        <strong>{plan.title}</strong>
                        <span className={`crm-badge ${statusClass[plan.status]}`}>{labels[plan.priority ?? "MEDIUM"]}</span>
                      </div>
                      <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                        {plan.customer.name}
                        {plan.owner ? ` · ${plan.owner}` : ""}
                      </p>
                      <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                        {plan.endDate
                          ? `${lang === "sv" ? "Deadline" : "Deadline"}: ${new Date(plan.endDate).toLocaleDateString()}`
                          : lang === "sv"
                          ? "Ingen deadline"
                          : "No deadline"}
                      </p>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
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
              <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                {lang === "sv" ? "Prioritet" : "Priority"}: {labels[plan.priority]}
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
