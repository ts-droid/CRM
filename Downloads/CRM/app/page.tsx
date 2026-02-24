"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n";

type Stats = {
  customers: number;
  contacts: number;
  plans: number;
  available: boolean;
};

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({ customers: 0, contacts: 0, plans: 0, available: false });
  const { t } = useI18n();

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (!res.ok) return;
        setStats((await res.json()) as Stats);
      } catch {
        // ignore: dashboard still renders with fallback values
      }
    }

    loadStats();
  }, []);

  return (
    <>
      <section className="crm-card">
        <h2>{t("overviewTitle")}</h2>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          {t("overviewDesc")}
        </p>
      </section>

      <section className="crm-grid" style={{ marginTop: "1rem" }}>
        <article className="crm-card">
          <h3>{t("customers")}</h3>
          <p className="crm-stat">{stats.customers}</p>
        </article>
        <article className="crm-card">
          <h3>{t("contacts")}</h3>
          <p className="crm-stat">{stats.contacts}</p>
        </article>
        <article className="crm-card">
          <h3>{t("plans")}</h3>
          <p className="crm-stat">{stats.plans}</p>
        </article>
      </section>

      {!stats.available ? (
        <section className="crm-card" style={{ marginTop: "1rem" }}>
          <p className="crm-subtle">{t("dbMissing")}</p>
        </section>
      ) : null}

      <section className="crm-card" style={{ marginTop: "1rem" }}>
        <h3>{t("nextSteps")}</h3>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          {t("nextStepsDesc")}
        </p>
      </section>
    </>
  );
}
