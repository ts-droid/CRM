"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";

type Tab = "customers" | "prospects" | "new";

type Customer = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  seller: string | null;
  industry: string | null;
  potentialScore: number;
  status: string;
};

type CustomerListResponse = {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

export default function HomePage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [country, setCountry] = useState("");
  const [seller, setSeller] = useState("");
  const [defaultSellerApplied, setDefaultSellerApplied] = useState(false);
  const [sort, setSort] = useState("potential");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [facetCountries, setFacetCountries] = useState<string[]>([]);
  const [facetSellers, setFacetSellers] = useState<string[]>([]);
  const [config, setConfig] = useState<FormConfig>(DEFAULT_CONFIG);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [potentialScore, setPotentialScore] = useState(50);
  const [activeTab, setActiveTab] = useState<Tab>("customers");
  const [prospectNoSellerCount, setProspectNoSellerCount] = useState(0);
  const [customerNoSellerCount, setCustomerNoSellerCount] = useState(0);
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
      // ignore and continue with defaults
    }
  }

  async function loadBadgeCounts() {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/customers?status=prospect&noSeller=1&page=1&pageSize=1&sort=potential", { cache: "no-store" }),
        fetch("/api/customers?status=customer&noSeller=1&page=1&pageSize=1&sort=potential", { cache: "no-store" })
      ]);
      if (pRes.ok) {
        const data = (await pRes.json()) as { total?: number };
        setProspectNoSellerCount(data.total ?? 0);
      }
      if (cRes.ok) {
        const data = (await cRes.json()) as { total?: number };
        setCustomerNoSellerCount(data.total ?? 0);
      }
    } catch {
      // ignore
    }
  }

  async function loadCustomers() {
    if (activeTab === "new") return;
    const params = new URLSearchParams();
    params.set("sort", sort);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("status", activeTab === "customers" ? "customer" : "prospect");
    if (query) params.set("q", query);
    if (country) params.set("country", country);
    if (seller && (facetSellers.length === 0 || facetSellers.includes(seller))) {
      params.set("seller", seller);
    }

    const res = await fetch(`/api/customers?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return;

    const data = (await res.json()) as CustomerListResponse | Customer[];
    if (Array.isArray(data)) {
      setRows(data);
      setTotalRows(data.length);
      setTotalPages(Math.max(1, Math.ceil(data.length / pageSize)));
      return;
    }
    setRows(data.items);
    setTotalRows(data.total);
    setTotalPages(data.totalPages);
  }

  async function loadFacets() {
    const params = new URLSearchParams();
    params.set("facets", "1");
    if (query) params.set("q", query);
    if (activeTab !== "new") {
      params.set("status", activeTab === "customers" ? "customer" : "prospect");
    }
    const res = await fetch(`/api/customers?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { countries?: string[]; sellers?: string[] };
    setFacetCountries(Array.isArray(data.countries) ? data.countries : []);
    setFacetSellers(Array.isArray(data.sellers) ? data.sellers : []);
  }

  useEffect(() => {
    loadSettings();
    loadBadgeCounts();
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
        const normalizedDefaultSeller = String(data.defaultSeller ?? "").trim();
        if (normalizedDefaultSeller && !seller) {
          setSeller(normalizedDefaultSeller);
        }
      } finally {
        setDefaultSellerApplied(true);
      }
    })();
  }, [defaultSellerApplied, seller]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 220);
    return () => clearTimeout(timeoutId);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [country, seller, sort, query, activeTab]);

  useEffect(() => {
    loadCustomers();
  }, [country, seller, sort, page, query, activeTab]);

  useEffect(() => {
    loadFacets();
  }, [query, activeTab]);

  useEffect(() => {
    if (country && facetCountries.length > 0 && !facetCountries.includes(country)) {
      setCountry("");
    }
  }, [country, facetCountries]);

  useEffect(() => {
    if (seller && facetSellers.length > 0 && !facetSellers.includes(seller)) {
      setSeller("");
    }
  }, [seller, facetSellers]);

  async function onSubmitNewCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setCreateError(null);
    const form = new FormData(event.currentTarget);

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          registrationNumber: form.get("registrationNumber"),
          naceCode: form.get("naceCode"),
          industry: form.get("industry"),
          country: form.get("country"),
          region: form.get("region"),
          seller: form.get("seller"),
          website: form.get("website"),
          email: form.get("email"),
          phone: form.get("phone"),
          potentialScore,
          status: form.get("status") ?? "prospect"
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte skapa kund" : "Could not create customer"));
      }

      event.currentTarget.reset();
      setPotentialScore(50);
      setActiveTab("prospects");
      await loadBadgeCounts();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : lang === "sv" ? "Något gick fel" : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const countries = useMemo(() => facetCountries, [facetCountries]);
  const sellers = useMemo(() => facetSellers, [facetSellers]);

  const badgeStyle = (color: string): React.CSSProperties => ({
    position: "absolute",
    top: "-7px",
    right: "-7px",
    background: color,
    color: "#fff",
    borderRadius: "999px",
    fontSize: "0.68rem",
    fontWeight: 700,
    padding: "1px 5px",
    minWidth: "17px",
    textAlign: "center",
    lineHeight: "1.5"
  });

  return (
    <>
      <section className="crm-card">
        {/* Tab bar */}
        <div className="crm-row" style={{ marginTop: "1rem", gap: "0.5rem" }}>
          <button
            className={`crm-tab${activeTab === "customers" ? " active" : ""}`}
            type="button"
            onClick={() => setActiveTab("customers")}
            style={{ position: "relative" }}
          >
            {t("tabCustomers")}
            {customerNoSellerCount > 0 && (
              <span style={badgeStyle("var(--vendora-bad, #c63b25)")}>
                {customerNoSellerCount}
              </span>
            )}
          </button>
          <button
            className={`crm-tab${activeTab === "prospects" ? " active" : ""}`}
            type="button"
            onClick={() => setActiveTab("prospects")}
            style={{ position: "relative" }}
          >
            {t("tabProspects")}
            {prospectNoSellerCount > 0 && (
              <span style={badgeStyle("var(--vendora-warn, #b56b16)")}>
                {prospectNoSellerCount}
              </span>
            )}
          </button>
          <button
            className={`crm-tab${activeTab === "new" ? " active" : ""}`}
            type="button"
            onClick={() => setActiveTab("new")}
          >
            + {t("tabNewCustomer")}
          </button>
        </div>
      </section>

      {activeTab === "new" ? (
        <section className="crm-card" style={{ marginTop: "1rem" }}>
          <h3>{t("tabNewCustomer")}</h3>
          <form onSubmit={onSubmitNewCustomer} style={{ marginTop: "0.85rem" }}>
            <div className="crm-row">
              <input className="crm-input" name="name" placeholder={t("name")} required minLength={2} />
              <input className="crm-input" name="organization" placeholder={t("organization")} />
              <select className="crm-select" name="status" defaultValue="prospect">
                <option value="prospect">{lang === "sv" ? "Prospect" : "Prospect"}</option>
                <option value="customer">{lang === "sv" ? "Kund" : "Customer"}</option>
              </select>
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
              <label className="crm-subtle" htmlFor="overviewPotentialRange">
                {lang === "sv" ? "Potential (0-100)" : "Potential (0-100)"}: {potentialScore}
              </label>
              <input
                id="overviewPotentialRange"
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
            {createError ? (
              <p className="crm-error" style={{ marginTop: "0.6rem" }}>
                {createError}
              </p>
            ) : null}
          </form>
        </section>
      ) : (
        <section className="crm-card" style={{ marginTop: "1rem" }}>
          <div className="crm-item-head">
            <h3>{activeTab === "customers" ? (lang === "sv" ? "Kundlista" : "Customer list") : (lang === "sv" ? "Prospektlista" : "Prospect list")}</h3>
            <select className="crm-select" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="potential">{lang === "sv" ? "Sort: Potential" : "Sort: Potential"}</option>
              <option value="name_asc">{lang === "sv" ? "Sort: Namn A-Ö" : "Sort: Name A-Z"}</option>
              <option value="name_desc">{lang === "sv" ? "Sort: Namn Ö-A" : "Sort: Name Z-A"}</option>
              <option value="updated">{lang === "sv" ? "Sort: Senast uppdaterad" : "Sort: Last updated"}</option>
            </select>
          </div>

          <div className="crm-row" style={{ marginTop: "0.7rem" }}>
            <input
              className="crm-input"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder={lang === "sv" ? "Sök globalt i kunder, kontakter, planer, aktiviteter..." : "Live search across customers, contacts, plans, activities..."}
            />
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
            {rows.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="crm-item-link"
                aria-label={(lang === "sv" ? "Öppna kundkort för " : "Open customer profile for ") + customer.name}
              >
                <article className="crm-item">
                  <div className="crm-item-head">
                    <strong>{customer.name}</strong>
                    <span className="crm-badge">{lang === "sv" ? "Potential" : "Potential"}: {customer.potentialScore}</span>
                  </div>
                  <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                    {(customer.country ?? "-") + " · " + (customer.region ?? "-") + " · " + (customer.seller ?? "-")}
                    {customer.industry ? ` · ${customer.industry}` : ""}
                  </p>
                </article>
              </Link>
            ))}
            {rows.length === 0 ? (
              <article className="crm-item">
                <p className="crm-subtle">
                  {activeTab === "prospects"
                    ? (lang === "sv" ? "Inga prospects matchar din sökning." : "No prospects matched your search.")
                    : (lang === "sv" ? "Inga kunder matchar din sökning." : "No customers matched your search.")}
                </p>
              </article>
            ) : null}
          </div>
          <div className="crm-row" style={{ marginTop: "0.7rem", justifyContent: "space-between", alignItems: "center" }}>
            <p className="crm-subtle">
              {lang === "sv"
                ? `Visar ${(page - 1) * pageSize + (rows.length > 0 ? 1 : 0)}-${(page - 1) * pageSize + rows.length} av ${totalRows}`
                : `Showing ${(page - 1) * pageSize + (rows.length > 0 ? 1 : 0)}-${(page - 1) * pageSize + rows.length} of ${totalRows}`}
            </p>
            <div className="crm-row">
              <button className="crm-button crm-button-secondary" type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                {lang === "sv" ? "Föregående" : "Previous"}
              </button>
              <span className="crm-subtle" style={{ alignSelf: "center" }}>
                {page} / {Math.max(1, totalPages)}
              </span>
              <button
                className="crm-button crm-button-secondary"
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                {lang === "sv" ? "Nästa" : "Next"}
              </button>
            </div>
          </div>
        </section>
      )}

    </>
  );
}
