"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";

type Customer = {
  id: string;
  name: string;
  country: string | null;
  seller: string | null;
  industry: string | null;
  potentialScore: number;
};

type Stats = {
  customers: number;
  contacts: number;
  plans: number;
  available: boolean;
};

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({ customers: 0, contacts: 0, plans: 0, available: false });
  const [rows, setRows] = useState<Customer[]>([]);
  const [country, setCountry] = useState("");
  const [seller, setSeller] = useState("");
  const { t, lang } = useI18n();

  async function loadStats() {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      if (!res.ok) return;
      setStats((await res.json()) as Stats);
    } catch {
      // ignore: dashboard still renders with fallback values
    }
  }

  async function loadCustomers() {
    const params = new URLSearchParams();
    params.set("sort", "potential");
    if (country) params.set("country", country);
    if (seller) params.set("seller", seller);

    const res = await fetch(`/api/customers?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return;

    setRows((await res.json()) as Customer[]);
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [country, seller]);

  const countries = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.country).filter(Boolean))).sort() as string[];
  }, [rows]);

  const sellers = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.seller).filter(Boolean))).sort() as string[];
  }, [rows]);

  return (
    <>
      <section className="crm-card">
        <h2>{t("overviewTitle")}</h2>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          {lang === "sv"
            ? "Sortera kunder på land och säljare, och prioritera efter potential för Vendora Nordics produktutbud."
            : "Filter customers by country and seller, and prioritize by potential for Vendora Nordic's product portfolio."}
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

      <section className="crm-card" style={{ marginTop: "1rem" }}>
        <div className="crm-item-head">
          <h3>{lang === "sv" ? "Prioriterad kundlista" : "Prioritized customer list"}</h3>
          <span className="crm-badge">{lang === "sv" ? "Sortering: Potential" : "Sort: Potential"}</span>
        </div>

        <div className="crm-row" style={{ marginTop: "0.7rem" }}>
          <select className="crm-select" value={country} onChange={(event) => setCountry(event.target.value)}>
            <option value="">{lang === "sv" ? "Alla länder" : "All countries"}</option>
            {countries.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select className="crm-select" value={seller} onChange={(event) => setSeller(event.target.value)}>
            <option value="">{lang === "sv" ? "Alla säljare" : "All sellers"}</option>
            {sellers.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {rows.slice(0, 12).map((customer) => (
            <article key={customer.id} className="crm-item">
              <div className="crm-item-head">
                <strong>{customer.name}</strong>
                <span className="crm-badge">{lang === "sv" ? "Potential" : "Potential"}: {customer.potentialScore}</span>
              </div>
              <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                {(customer.country ?? "-") + " · " + (customer.seller ?? "-")}
                {customer.industry ? ` · ${customer.industry}` : ""}
              </p>
              <p style={{ marginTop: "0.45rem" }}>
                <Link href={`/customers/${customer.id}`} className="crm-link-inline">
                  {lang === "sv" ? "Öppna kundkort" : "Open customer profile"}
                </Link>
              </p>
            </article>
          ))}
        </div>
      </section>

      {!stats.available ? (
        <section className="crm-card" style={{ marginTop: "1rem" }}>
          <p className="crm-subtle">{t("dbMissing")}</p>
        </section>
      ) : null}
    </>
  );
}
