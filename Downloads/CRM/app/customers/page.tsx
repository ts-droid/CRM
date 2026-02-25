"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";

type Customer = {
  id: string;
  name: string;
  organization: string | null;
  industry: string | null;
  country: string | null;
  seller: string | null;
  website: string | null;
  potentialScore: number;
  email: string | null;
  phone: string | null;
  createdAt: string;
};

type FormConfig = {
  industries: string[];
  countries: string[];
  sellers: string[];
  requiredCustomerFields: Array<"name" | "industry" | "country" | "seller">;
};

const DEFAULT_CONFIG: FormConfig = {
  industries: [
    "Consumer Electronics",
    "Computer & IT Retail",
    "Mobile & Telecom Retail",
    "Office Supplies & Workplace",
    "B2B IT Reseller",
    "B2B E-commerce",
    "Managed Service Provider (MSP)",
    "System Integrator",
    "AV & Meeting Room Solutions",
    "Smart Home Retail",
    "Home Electronics & Appliances",
    "Photo & Video Retail",
    "Gaming & Esports Retail",
    "Education & School Supplier",
    "Public Sector Procurement",
    "Industrial & Field Service Supply",
    "Hospitality & POS Solutions",
    "Security & Surveillance Integrator",
    "Lifestyle & Design Retail",
    "Marketplace / Pure E-tail"
  ],
  countries: ["SE", "NO", "DK", "FI", "EE", "LV", "LT"],
  sellers: ["Team Nordics"],
  requiredCustomerFields: ["name", "industry", "country", "seller"]
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [defaultSellerApplied, setDefaultSellerApplied] = useState(false);
  const [industryFilter, setIndustryFilter] = useState("");
  const [potentialMin, setPotentialMin] = useState("");
  const [potentialMax, setPotentialMax] = useState("");
  const [viewName, setViewName] = useState("");
  const [savedViews, setSavedViews] = useState<Array<{
    name: string;
    query: string;
    country: string;
    seller: string;
    industry: string;
    potentialMin: string;
    potentialMax: string;
  }>>([]);
  const [potentialScore, setPotentialScore] = useState(50);
  const [config, setConfig] = useState<FormConfig>(DEFAULT_CONFIG);
  const { t, lang } = useI18n();

  const required = useMemo(() => {
    const requiredSet = new Set(config.requiredCustomerFields);
    return {
      industry: requiredSet.has("industry"),
      country: requiredSet.has("country"),
      seller: requiredSet.has("seller")
    };
  }, [config.requiredCustomerFields]);

  async function loadSettings() {
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { config?: FormConfig };
      if (data.config) setConfig(data.config);
    } catch {
      // ignore
    }
  }

  async function loadCustomers() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("sort", "potential");
      if (query) params.set("q", query);
      if (countryFilter) params.set("country", countryFilter);
      if (sellerFilter) params.set("seller", sellerFilter);
      if (industryFilter) params.set("industry", industryFilter);
      if (potentialMin) params.set("potentialMin", potentialMin);
      if (potentialMax) params.set("potentialMax", potentialMax);

      const res = await fetch(`/api/customers?${params.toString()}`, { cache: "no-store" });
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
    loadSettings();
    try {
      const raw = localStorage.getItem("crm-customer-views");
      if (raw) setSavedViews(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (defaultSellerApplied) return;
    (async () => {
      try {
        const res = await fetch("/api/profile/default-seller", { cache: "no-store" });
        if (!res.ok) {
          setDefaultSellerApplied(true);
          return;
        }
        const data = (await res.json()) as { defaultSeller?: string | null };
        if (data.defaultSeller && !sellerFilter) {
          setSellerFilter(data.defaultSeller);
        }
      } finally {
        setDefaultSellerApplied(true);
      }
    })();
  }, [defaultSellerApplied, sellerFilter]);

  useEffect(() => {
    loadCustomers();
  }, [lang, query, countryFilter, sellerFilter, industryFilter, potentialMin, potentialMax]);

  function persistViews(views: typeof savedViews) {
    setSavedViews(views);
    localStorage.setItem("crm-customer-views", JSON.stringify(views));
  }

  function saveCurrentView() {
    if (!viewName.trim()) return;
    const next = [
      ...savedViews.filter((item) => item.name !== viewName.trim()),
      {
        name: viewName.trim(),
        query,
        country: countryFilter,
        seller: sellerFilter,
        industry: industryFilter,
        potentialMin,
        potentialMax
      }
    ];
    persistViews(next);
    setViewName("");
  }

  function applyView(name: string) {
    const item = savedViews.find((view) => view.name === name);
    if (!item) return;
    setQuery(item.query);
    setCountryFilter(item.country);
    setSellerFilter(item.seller);
    setIndustryFilter(item.industry);
    setPotentialMin(item.potentialMin);
    setPotentialMax(item.potentialMax);
  }

  function removeView(name: string) {
    persistViews(savedViews.filter((item) => item.name !== name));
  }

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
          country: form.get("country"),
          region: form.get("region"),
          seller: form.get("seller"),
          website: form.get("website"),
          email: form.get("email"),
          phone: form.get("phone"),
          potentialScore
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte skapa kund" : "Could not create customer"));
      }

      event.currentTarget.reset();
      setPotentialScore(50);
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
          {lang === "sv"
            ? "Standardiserad kundinmatning med dropdowns för land, bransch och säljare."
            : "Standardized customer intake with dropdowns for country, industry and seller."}
        </p>
      </section>

      <section className="crm-card">
        <h3>{t("customerNew")}</h3>
        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
          {lang === "sv"
            ? "Name: kundnamn. Organization: juridiskt bolag. Industry/Country/Seller: välj från listor i Admin > Settings."
            : "Name: account name. Organization: legal entity. Industry/Country/Seller: choose from Admin > Settings lists."}
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: "0.85rem" }}>
          <div className="crm-row">
            <input className="crm-input" name="name" placeholder={t("name")} required minLength={2} />
            <input className="crm-input" name="organization" placeholder={t("organization")} />
            <select className="crm-select" name="industry" required={required.industry} defaultValue="">
              <option value="" disabled>{lang === "sv" ? "Välj bransch" : "Select industry"}</option>
              {config.industries.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <select className="crm-select" name="country" required={required.country} defaultValue="">
              <option value="" disabled>{lang === "sv" ? "Välj land" : "Select country"}</option>
              {config.countries.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <input className="crm-input" name="region" placeholder={lang === "sv" ? "Region (t.ex. Stockholm)" : "Region (e.g. Stockholm)"} />
            <select className="crm-select" name="seller" required={required.seller} defaultValue="">
              <option value="" disabled>{lang === "sv" ? "Välj säljare" : "Select seller"}</option>
              {config.sellers.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <input className="crm-input" name="website" placeholder={lang === "sv" ? "Webbsida (https://...)" : "Website (https://...)"} />
            <input className="crm-input" name="email" placeholder={t("email")} type="email" />
            <input className="crm-input" name="phone" placeholder={t("phone")} />
          </div>
          <div style={{ marginTop: "0.6rem" }}>
            <label className="crm-subtle" htmlFor="potentialRange">
              {lang === "sv" ? "Potential (0-100)" : "Potential (0-100)"}: {potentialScore}
            </label>
            <input
              id="potentialRange"
              className="crm-input"
              type="range"
              min={0}
              max={100}
              step={1}
              value={potentialScore}
              onChange={(event) => setPotentialScore(Number(event.target.value))}
            />
            <p className="crm-subtle" style={{ marginTop: "0.25rem" }}>
              {lang === "sv" ? "0-30 låg, 31-60 medel, 61-80 hög, 81-100 strategisk." : "0-30 low, 31-60 medium, 61-80 high, 81-100 strategic."}
            </p>
          </div>
          <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={submitting}>
            {submitting ? t("saving") : t("saveCustomer")}
          </button>
        </form>
      </section>

      <section className="crm-card">
        <h3>{t("list")}</h3>
        <div className="crm-row" style={{ marginTop: "0.6rem" }}>
          <input
            className="crm-input"
            placeholder={lang === "sv" ? "Sök kund eller bolag" : "Search customer or company"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <input
            className="crm-input"
            placeholder={lang === "sv" ? "Filtrera land" : "Filter country"}
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
          />
          <input
            className="crm-input"
            placeholder={lang === "sv" ? "Filtrera säljare" : "Filter seller"}
            value={sellerFilter}
            onChange={(event) => setSellerFilter(event.target.value)}
          />
          <select className="crm-select" value={industryFilter} onChange={(event) => setIndustryFilter(event.target.value)}>
            <option value="">{lang === "sv" ? "Alla branscher" : "All industries"}</option>
            {config.industries.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <input
            className="crm-input"
            type="number"
            min={0}
            max={100}
            placeholder={lang === "sv" ? "Potential min" : "Potential min"}
            value={potentialMin}
            onChange={(event) => setPotentialMin(event.target.value)}
          />
          <input
            className="crm-input"
            type="number"
            min={0}
            max={100}
            placeholder={lang === "sv" ? "Potential max" : "Potential max"}
            value={potentialMax}
            onChange={(event) => setPotentialMax(event.target.value)}
          />
        </div>
        <div className="crm-row" style={{ marginTop: "0.6rem" }}>
          <input
            className="crm-input"
            placeholder={lang === "sv" ? "Namn på sparad vy" : "Saved view name"}
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
          />
          <button className="crm-button crm-button-secondary" type="button" onClick={saveCurrentView}>
            {lang === "sv" ? "Spara vy" : "Save view"}
          </button>
          {savedViews.length > 0 ? (
            <select className="crm-select" defaultValue="" onChange={(event) => applyView(event.target.value)}>
              <option value="" disabled>{lang === "sv" ? "Ladda sparad vy" : "Load saved view"}</option>
              {savedViews.map((item) => (
                <option key={item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          ) : null}
          {savedViews.length > 0 ? (
            <select className="crm-select" defaultValue="" onChange={(event) => removeView(event.target.value)}>
              <option value="" disabled>{lang === "sv" ? "Radera sparad vy" : "Delete saved view"}</option>
              {savedViews.map((item) => (
                <option key={item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          ) : null}
        </div>

        {error ? <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.5rem" }}>{error}</p> : null}
        {loading ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>{t("loading")}</p> : null}
        {!loading && customers.length === 0 ? <p className="crm-empty">{t("noCustomers")}</p> : null}
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {customers.map((customer) => (
            <article key={customer.id} className="crm-item">
              <div className="crm-item-head">
                <strong>{customer.name}</strong>
                <span className="crm-badge">{lang === "sv" ? "Potential" : "Potential"}: {customer.potentialScore}</span>
              </div>
              <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                {(customer.organization ?? t("noOrganization")) + " · " + (customer.country ?? "-") + " · " + (customer.seller ?? "-")}
              </p>
              <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                {customer.email ?? "-"} {customer.phone ? ` · ${customer.phone}` : ""}
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
    </div>
  );
}
