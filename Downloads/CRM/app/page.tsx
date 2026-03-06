"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";

type Customer = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  seller: string | null;
  industry: string | null;
  potentialScore: number;
};

type CustomerListResponse = {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type Stats = {
  customers: number;
  contacts: number;
  plans: number;
  available: boolean;
  reason?: string | null;
};

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({ customers: 0, contacts: 0, plans: 0, available: false, reason: null });
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
    params.set("sort", sort);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
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
    const res = await fetch(`/api/customers?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { countries?: string[]; sellers?: string[] };
    setFacetCountries(Array.isArray(data.countries) ? data.countries : []);
    setFacetSellers(Array.isArray(data.sellers) ? data.sellers : []);
  }

  useEffect(() => {
    loadStats();
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
  }, [country, seller, sort, query]);

  useEffect(() => {
    loadCustomers();
  }, [country, seller, sort, page, query]);

  useEffect(() => {
    loadFacets();
  }, [query]);

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

  const countries = useMemo(() => facetCountries, [facetCountries]);

  const sellers = useMemo(() => facetSellers, [facetSellers]);

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
                {lang === "sv" ? "Inga kunder matchar din sökning." : "No customers matched your search."}
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

      {!stats.available ? (
        <section className="crm-card" style={{ marginTop: "1rem" }}>
          <p className="crm-subtle">
            {t("dbMissing")}
            {stats.reason ? ` (${stats.reason})` : ""}
          </p>
        </section>
      ) : null}
    </>
  );
}
