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
  updatedAt: string;
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

type FormConfig = {
  industries: string[];
  countries: string[];
  regionsByCountry: Array<{ country: string; regions: string[] }>;
  sellers: string[];
  researchBasePrompt: string;
  extraInstructions: string;
  quickSimilarBasePrompt: string;
  quickSimilarQuestionPrompt: string;
  quickSimilarFollowupPrompt: string;
  quickSimilarExtraInstructions: string;
};

type CustomerRegionRow = {
  country: string | null;
  region: string | null;
};

const DEFAULT_FORM_CONFIG: FormConfig = {
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
  regionsByCountry: [
    { country: "SE", regions: ["Stockholm", "Vastra Gotaland", "Skane", "Ostergotland", "Jonkoping", "Uppsala", "Halland", "Sodermanland"] },
    { country: "NO", regions: ["Oslo", "Viken", "Vestland", "Rogaland", "Trondelag", "Agder", "Innlandet", "Troms og Finnmark"] },
    { country: "DK", regions: ["Hovedstaden", "Sjaelland", "Syddanmark", "Midtjylland", "Nordjylland"] },
    { country: "FI", regions: ["Uusimaa", "Pirkanmaa", "Varsinais-Suomi", "Pohjois-Pohjanmaa", "Keski-Suomi", "Satakunta", "Pohjanmaa", "Lappi"] },
    { country: "EE", regions: ["Harju", "Tartu", "Ida-Viru", "Parnu", "Laane-Viru", "Viljandi", "Rapla", "Saare"] },
    { country: "LV", regions: ["Riga", "Pieriga", "Kurzeme", "Zemgale", "Vidzeme", "Latgale"] },
    { country: "LT", regions: ["Vilnius", "Kaunas", "Klaipeda", "Siauliai", "Panevezys", "Alytus", "Marijampole", "Utena", "Taurage", "Telsiai"] }
  ],
  sellers: ["Team Nordics"]
  ,
  researchBasePrompt:
    "You are a senior GTM & Channel Analyst for Vendora Nordic.",
  extraInstructions: "",
  quickSimilarBasePrompt:
    "You are an analyst. Return only compact, evidence-based similar reseller accounts for the selected customer. Prioritize practical fit and likely volume.",
  quickSimilarQuestionPrompt:
    "Find up to 8 similar reseller customers based on this selected account. Use country/region scope first and fall back to country when needed. Prefer public company registers/directories and include confidence + source signals.",
  quickSimilarFollowupPrompt:
    "Deep-research this selected similar company for Vendora fit and commercial potential. Quantify likely Year-1 potential range, highlight top product families to pitch, and provide concrete next steps.",
  quickSimilarExtraInstructions:
    "Keep the response short. Focus on similar profile in segment, geography and category focus."
};

const planStatusClass: Record<Customer["plans"][number]["status"], string> = {
  PLANNED: "",
  IN_PROGRESS: "in_progress",
  ON_HOLD: "on_hold",
  COMPLETED: "completed"
};

function buildOptionList(...lists: Array<Array<string | null | undefined> | undefined>): string[] {
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      const value = String(item ?? "").trim();
      if (!value) continue;
      seen.add(value);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

type ContactDraft = {
  key: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  title: string;
  notes: string;
};

type SimilarCustomer = {
  id?: string;
  name: string;
  country: string | null;
  region: string | null;
  industry: string | null;
  seller: string | null;
  potentialScore: number;
  matchScore: number;
  website?: string | null;
  organizationNumber?: string | null;
  reason?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  confidence?: string | null;
  alreadyCustomer?: boolean;
  existingCustomerId?: string | null;
  existingCustomerName?: string | null;
};

type ResearchApiResponse = {
  similarCustomers?: SimilarCustomer[];
  aiResult?: { outputText: string; model: string } | null;
  aiError?: string | null;
};

type MarkdownSection = {
  title: string;
  body: string;
};

function parseMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split("\n");
  const sections: MarkdownSection[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  const pushCurrent = () => {
    if (!currentTitle && currentBody.length === 0) return;
    sections.push({
      title: currentTitle || "Output",
      body: currentBody.join("\n").trim()
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("## ")) {
      pushCurrent();
      currentTitle = line.replace(/^##\s+/, "").trim();
      currentBody = [];
    } else {
      currentBody.push(rawLine);
    }
  }

  pushCurrent();
  return sections.filter((section) => section.body.length > 0 || section.title !== "Output");
}

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
  const [activityStatus, setActivityStatus] = useState("");
  const [activitySaving, setActivitySaving] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [planStatus, setPlanStatus] = useState("");
  const [status, setStatus] = useState<string>("");
  const [contactStatus, setContactStatus] = useState<string>("");
  const [contactsSaving, setContactsSaving] = useState(false);
  const [newContacts, setNewContacts] = useState<ContactDraft[]>([emptyContactDraft()]);
  const [salesData, setSalesData] = useState<SalesResponse | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState("");
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarStatus, setSimilarStatus] = useState("");
  const [similarResults, setSimilarResults] = useState<SimilarCustomer[]>([]);
  const [similarScopeUsed, setSimilarScopeUsed] = useState<"region" | "country" | null>(null);
  const [selectedSimilar, setSelectedSimilar] = useState<SimilarCustomer | null>(null);
  const [selectedSimilarResearch, setSelectedSimilarResearch] = useState("");
  const [selectedSimilarResearchError, setSelectedSimilarResearchError] = useState("");
  const [selectedSimilarResearchLoading, setSelectedSimilarResearchLoading] = useState(false);
  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG);
  const [regionsByCountry, setRegionsByCountry] = useState<Record<string, string[]>>({});
  const [allRegions, setAllRegions] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
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

    const data = (await res.json()) as Customer;
    setCustomer(data);
    setSelectedCountry(data.country ?? "");
    setLoading(false);
  }

  async function loadFormOptions() {
    try {
      const [settingsRes, customersRes] = await Promise.all([
        fetch("/api/admin/settings", { cache: "no-store" }),
        fetch("/api/customers?sort=name_asc", { cache: "no-store" })
      ]);

      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as { config?: FormConfig };
        if (data.config) {
          const settingsRegionMap: Record<string, string[]> = Array.isArray(data.config.regionsByCountry)
            ? Object.fromEntries(
                data.config.regionsByCountry
                  .map((entry) => [
                    String(entry.country ?? "").trim().toUpperCase(),
                    buildOptionList(Array.isArray(entry.regions) ? entry.regions : [])
                  ])
                  .filter(([country, regions]) => country && regions.length > 0)
              )
            : {};

          setFormConfig({
            industries: Array.isArray(data.config.industries) ? data.config.industries : DEFAULT_FORM_CONFIG.industries,
            countries: Array.isArray(data.config.countries) ? data.config.countries : DEFAULT_FORM_CONFIG.countries,
            regionsByCountry: Array.isArray(data.config.regionsByCountry)
              ? data.config.regionsByCountry
              : DEFAULT_FORM_CONFIG.regionsByCountry,
            sellers: Array.isArray(data.config.sellers) ? data.config.sellers : DEFAULT_FORM_CONFIG.sellers,
            researchBasePrompt:
              typeof (data.config as { researchBasePrompt?: string }).researchBasePrompt === "string" &&
              (data.config as { researchBasePrompt?: string }).researchBasePrompt?.trim()
                ? String((data.config as { researchBasePrompt?: string }).researchBasePrompt)
                : DEFAULT_FORM_CONFIG.researchBasePrompt,
            extraInstructions:
              typeof (data.config as { extraInstructions?: string }).extraInstructions === "string"
                ? String((data.config as { extraInstructions?: string }).extraInstructions)
                : DEFAULT_FORM_CONFIG.extraInstructions,
            quickSimilarBasePrompt:
              typeof data.config.quickSimilarBasePrompt === "string" && data.config.quickSimilarBasePrompt.trim()
                ? data.config.quickSimilarBasePrompt
                : DEFAULT_FORM_CONFIG.quickSimilarBasePrompt,
            quickSimilarQuestionPrompt:
              typeof (data.config as { quickSimilarQuestionPrompt?: string }).quickSimilarQuestionPrompt === "string" &&
              (data.config as { quickSimilarQuestionPrompt?: string }).quickSimilarQuestionPrompt?.trim()
                ? String((data.config as { quickSimilarQuestionPrompt?: string }).quickSimilarQuestionPrompt)
                : DEFAULT_FORM_CONFIG.quickSimilarQuestionPrompt,
            quickSimilarFollowupPrompt:
              typeof (data.config as { quickSimilarFollowupPrompt?: string }).quickSimilarFollowupPrompt === "string" &&
              (data.config as { quickSimilarFollowupPrompt?: string }).quickSimilarFollowupPrompt?.trim()
                ? String((data.config as { quickSimilarFollowupPrompt?: string }).quickSimilarFollowupPrompt)
                : DEFAULT_FORM_CONFIG.quickSimilarFollowupPrompt,
            quickSimilarExtraInstructions:
              typeof data.config.quickSimilarExtraInstructions === "string"
                ? data.config.quickSimilarExtraInstructions
                : DEFAULT_FORM_CONFIG.quickSimilarExtraInstructions
          });
          if (Object.keys(settingsRegionMap).length > 0) {
            setRegionsByCountry((prev) => ({ ...settingsRegionMap, ...prev }));
            setAllRegions(buildOptionList(...Object.values(settingsRegionMap)));
          }
        }
      }

      if (customersRes.ok) {
        const rows = (await customersRes.json()) as CustomerRegionRow[];
        const nextRegionsByCountry: Record<string, string[]> = {};
        const regionPool: string[] = [];

        for (const row of rows) {
          const country = String(row.country ?? "").trim();
          const region = String(row.region ?? "").trim();
          if (!region) continue;
          regionPool.push(region);
          if (!country) continue;
          if (!nextRegionsByCountry[country]) nextRegionsByCountry[country] = [];
          nextRegionsByCountry[country].push(region);
        }

        for (const [country, regions] of Object.entries(nextRegionsByCountry)) {
          nextRegionsByCountry[country] = buildOptionList(regions);
        }

        setRegionsByCountry(nextRegionsByCountry);
        setAllRegions(buildOptionList(regionPool));
      }
    } catch {
      // Keep defaults
    }
  }

  async function loadCurrentUser() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { email?: string };
      if (data.email) setCurrentUserEmail(data.email);
    } catch {
      // no-op
    }
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
    loadFormOptions();
    loadActivities();
    loadSales();
    loadCurrentUser();
  }, [params.id, lang]);

  const industryOptions = buildOptionList(formConfig.industries, [customer?.industry]);
  const countryOptions = buildOptionList(formConfig.countries, [customer?.country]);
  const sellerOptions = buildOptionList(formConfig.sellers, [customer?.seller]);
  const settingsRegionMap: Record<string, string[]> = Object.fromEntries(
    formConfig.regionsByCountry
      .map((entry) => [
        String(entry.country ?? "").trim().toUpperCase(),
        buildOptionList(Array.isArray(entry.regions) ? entry.regions : [])
      ])
      .filter(([country, regions]) => country && regions.length > 0)
  );
  const regionMap = Object.keys(settingsRegionMap).length ? settingsRegionMap : regionsByCountry;
  const scopedRegionOptions = selectedCountry ? regionsByCountry[selectedCountry] ?? [] : allRegions;
  const regionOptionsFromMap = selectedCountry ? regionMap[selectedCountry] ?? [] : buildOptionList(...Object.values(regionMap));
  const regionOptions = buildOptionList(regionOptionsFromMap.length ? regionOptionsFromMap : scopedRegionOptions, [customer?.region]);
  const latestCustomerUpdate = activities.find((activity) => activity.type === "CUSTOMER_UPDATED");
  const lastSavedBy = latestCustomerUpdate?.actorName || currentUserEmail || "-";
  const savedAtText = customer
    ? new Date(customer.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const similarResearchSections = parseMarkdownSections(selectedSimilarResearch);

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
    setSimilarLoading(true);
    setSimilarStatus(lang === "sv" ? "AI arbetar med att hitta liknande kunder..." : "AI is finding similar customers...");
    setSelectedSimilar(null);
    setSelectedSimilarResearch("");
    setSelectedSimilarResearchError("");

    const initialScope: "region" | "country" = customer?.region ? "region" : "country";

    const callResearch = async (scope: "region" | "country") => {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: params.id,
          scope,
          maxSimilar: 8,
          externalOnly: true,
          basePrompt:
            formConfig.quickSimilarQuestionPrompt ||
            formConfig.quickSimilarBasePrompt ||
            DEFAULT_FORM_CONFIG.quickSimilarQuestionPrompt,
          extraInstructions: formConfig.quickSimilarExtraInstructions || DEFAULT_FORM_CONFIG.quickSimilarExtraInstructions
        })
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte köra AI-sökning." : "Could not run AI search."));
      }
      return (await res.json()) as ResearchApiResponse;
    };

    try {
      const first = await callResearch(initialScope);
      let rows = first.similarCustomers ?? [];
      let scopeUsed: "region" | "country" = initialScope;

      if (rows.length === 0 && initialScope === "region" && customer?.country) {
        const fallback = await callResearch("country");
        rows = fallback.similarCustomers ?? [];
        scopeUsed = "country";
      }

      setSimilarResults(rows);
      setSimilarScopeUsed(scopeUsed);

      const topMatches = rows.slice(0, 3).map((item) => item.name).join(", ");
      setSimilarStatus(
        lang === "sv"
          ? `Hittade ${rows.length} liknande kunder (${scopeUsed === "region" ? "region" : "land"}). ${topMatches || ""}`.trim()
          : `Found ${rows.length} similar customers (${scopeUsed}). ${topMatches || ""}`.trim()
      );
    } catch (error) {
      setSimilarResults([]);
      setSimilarScopeUsed(null);
      setSimilarStatus(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte köra AI-sökning." : "Could not run AI search."));
    } finally {
      setSimilarLoading(false);
    }
  }

  async function runDeepResearchForSimilar(candidate: SimilarCustomer) {
    setSelectedSimilar(candidate);
    setSelectedSimilarResearch("");
    setSelectedSimilarResearchError("");
    setSelectedSimilarResearchLoading(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId:
            candidate.existingCustomerId ||
            (candidate.id && !candidate.id.startsWith("external-") ? candidate.id : undefined),
          companyName: candidate.name,
          country: candidate.country ?? undefined,
          region: candidate.region ?? undefined,
          industry: candidate.industry ?? undefined,
          websites: candidate.website ? [candidate.website] : [],
          externalOnly: true,
          scope: "country",
          maxSimilar: 10,
          basePrompt:
            formConfig.quickSimilarFollowupPrompt ||
            formConfig.researchBasePrompt ||
            DEFAULT_FORM_CONFIG.quickSimilarFollowupPrompt,
          extraInstructions: formConfig.extraInstructions || DEFAULT_FORM_CONFIG.extraInstructions
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte köra full research." : "Could not run full research."));
      }
      const data = (await res.json()) as ResearchApiResponse;
      if (data.aiError) {
        setSelectedSimilarResearchError(data.aiError);
      }
      setSelectedSimilarResearch(data.aiResult?.outputText ?? "");
    } catch (error) {
      setSelectedSimilarResearchError(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte köra full research." : "Could not run full research."));
    } finally {
      setSelectedSimilarResearchLoading(false);
    }
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

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanSaving(true);
    setPlanStatus("");

    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          owner: String(form.get("owner") ?? "").trim() || null,
          status: String(form.get("status") ?? "PLANNED"),
          priority: String(form.get("priority") ?? "MEDIUM"),
          startDate: String(form.get("startDate") ?? "").trim() || null,
          endDate: String(form.get("endDate") ?? "").trim() || null,
          description: String(form.get("description") ?? "").trim() || null,
          customerId: params.id
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte skapa plan." : "Could not create plan."));
      }

      formEl.reset();
      setPlanStatus(lang === "sv" ? "Plan sparad." : "Plan saved.");
      await loadCustomer();
      await loadActivities();
    } catch (error) {
      setPlanStatus(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte skapa plan." : "Could not create plan."));
    } finally {
      setPlanSaving(false);
    }
  }

  async function updatePlanStatus(planId: string, status: Customer["plans"][number]["status"]) {
    const res = await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? (lang === "sv" ? "Kunde inte uppdatera plan." : "Could not update plan."));
    }
  }

  async function onDropPlan(status: Customer["plans"][number]["status"], planId: string) {
    try {
      await updatePlanStatus(planId, status);
      await loadCustomer();
      await loadActivities();
      setPlanStatus(lang === "sv" ? "Plan uppdaterad." : "Plan updated.");
    } catch (error) {
      setPlanStatus(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte uppdatera plan." : "Could not update plan."));
    }
  }

  async function addActivityNote() {
    if (!noteText.trim()) {
      setActivityStatus(lang === "sv" ? "Skriv en notering först." : "Write a note first.");
      return;
    }
    setActivitySaving(true);
    setActivityStatus("");
    const res = await fetch(`/api/customers/${params.id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: noteText.trim(), actorName: currentUserEmail || "CRM user" })
    });
    if (!res.ok) {
      let apiError = "";
      try {
        const data = (await res.json()) as { error?: string };
        apiError = data.error || "";
      } catch {
        apiError = "";
      }
      setActivityStatus(apiError || (lang === "sv" ? "Kunde inte spara notering." : "Could not save note."));
      setActivitySaving(false);
      return;
    }
    const created = (await res.json()) as Activity;
    setNoteText("");
    setActivities((prev) => [created, ...prev]);
    setActivityStatus(lang === "sv" ? "Notering sparad." : "Note saved.");
    setActivitySaving(false);
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
                <select className="crm-select" name="industry" defaultValue={customer.industry ?? ""}>
                  <option value="">{lang === "sv" ? "Välj bransch" : "Select industry"}</option>
                  {industryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <select
                  className="crm-select"
                  name="country"
                  defaultValue={customer.country ?? ""}
                  onChange={(event) => setSelectedCountry(event.target.value)}
                >
                  <option value="">{lang === "sv" ? "Välj land" : "Select country"}</option>
                  {countryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select className="crm-select" name="region" defaultValue={customer.region ?? ""}>
                  <option value="">{lang === "sv" ? "Välj region" : "Select region"}</option>
                  {regionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select className="crm-select" name="seller" defaultValue={customer.seller ?? ""}>
                  <option value="">{lang === "sv" ? "Välj säljare" : "Select seller"}</option>
                  {sellerOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
                  href={`/admin/research?tab=research&customerId=${encodeURIComponent(customer.id)}&companyName=${encodeURIComponent(customer.name)}&autorun=1`}
                  className="crm-button crm-button-secondary"
                >
                  {lang === "sv" ? "Öppna research för kund" : "Open research for customer"}
                </Link>
              </div>
              <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>
                {lang === "sv"
                  ? `Sparat ${savedAtText} av ${lastSavedBy}`
                  : `Saved at ${savedAtText} by ${lastSavedBy}`}
              </p>
              {status ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{status}</p> : null}
              {similarLoading ? (
                <div style={{ marginTop: "0.6rem" }}>
                  <p className="crm-subtle">{lang === "sv" ? "AI arbetar..." : "AI is working..."}</p>
                  <progress style={{ width: "100%" }} />
                </div>
              ) : null}
              {similarStatus ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{similarStatus}</p> : null}
              {similarResults.length > 0 ? (
                <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                  {similarResults.map((row) => (
                    <button
                      key={`${row.id || row.name}-${row.website || ""}`}
                      type="button"
                      className="crm-item"
                      style={{ textAlign: "left", width: "100%", cursor: "pointer" }}
                      onClick={() => runDeepResearchForSimilar(row)}
                    >
                      <div className="crm-item-head">
                        <strong>{row.name}</strong>
                        <div className="crm-row">
                          {row.alreadyCustomer ? (
                            <span className="crm-badge completed">{lang === "sv" ? "Redan kund" : "Already customer"}</span>
                          ) : null}
                          <span className="crm-badge">
                            {lang === "sv" ? "Match" : "Match"}: {row.matchScore}
                          </span>
                        </div>
                      </div>
                      <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
                        {(row.country || "-")} · {(row.region || "-")} · {(row.industry || "-")} · {(lang === "sv" ? "Potential" : "Potential")}: {row.potentialScore}
                      </p>
                      {(row.organizationNumber || row.sourceUrl || row.reason) ? (
                        <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                          {row.organizationNumber ? `${lang === "sv" ? "Org.nr" : "Org no"}: ${row.organizationNumber} · ` : ""}
                          {row.sourceType ? `${lang === "sv" ? "Källa" : "Source"}: ${row.sourceType}` : ""}
                          {row.sourceUrl ? ` · ${row.sourceUrl}` : ""}
                          {row.confidence ? ` · ${lang === "sv" ? "Säkerhet" : "Confidence"}: ${row.confidence}` : ""}
                        </p>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedSimilar ? (
                <section className="crm-card" style={{ marginTop: "0.8rem" }}>
                  <h3>{lang === "sv" ? `Research: ${selectedSimilar.name}` : `Research: ${selectedSimilar.name}`}</h3>
                  {selectedSimilarResearchLoading ? (
                    <div style={{ marginTop: "0.6rem" }}>
                      <p className="crm-subtle">{lang === "sv" ? "AI analyserar kund..." : "AI is analyzing customer..."}</p>
                      <progress style={{ width: "100%" }} />
                    </div>
                  ) : null}
                  {selectedSimilarResearchError ? (
                    <p className="crm-subtle" style={{ marginTop: "0.6rem", color: "#b42318" }}>{selectedSimilarResearchError}</p>
                  ) : null}
                  {selectedSimilarResearch ? (
                    similarResearchSections.length > 0 ? (
                      <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                        {similarResearchSections.map((section) => (
                          <article key={section.title} className="crm-item">
                            <h4 style={{ margin: 0 }}>{section.title}</h4>
                            <pre className="crm-pre" style={{ marginTop: "0.55rem" }}>{section.body}</pre>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <pre className="crm-pre" style={{ marginTop: "0.7rem" }}>{selectedSimilarResearch}</pre>
                    )
                  ) : null}
                </section>
              ) : null}
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
        <form onSubmit={createPlan} style={{ marginTop: "0.8rem" }}>
          <div className="crm-row">
            <input className="crm-input" name="title" placeholder={lang === "sv" ? "Titel" : "Title"} required />
            <select className="crm-select" name="owner" defaultValue={customer.seller ?? ""}>
              <option value="">{lang === "sv" ? "Ansvarig (valfritt)" : "Owner (optional)"}</option>
              {sellerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select className="crm-select" name="status" defaultValue="PLANNED">
              <option value="PLANNED">{lang === "sv" ? "Planerad" : "Planned"}</option>
              <option value="IN_PROGRESS">{lang === "sv" ? "Pågående" : "In progress"}</option>
              <option value="ON_HOLD">{lang === "sv" ? "Pausad" : "On hold"}</option>
              <option value="COMPLETED">{lang === "sv" ? "Avslutad" : "Completed"}</option>
            </select>
            <select className="crm-select" name="priority" defaultValue="MEDIUM">
              <option value="LOW">{lang === "sv" ? "Låg" : "Low"}</option>
              <option value="MEDIUM">{lang === "sv" ? "Medel" : "Medium"}</option>
              <option value="HIGH">{lang === "sv" ? "Hög" : "High"}</option>
            </select>
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <input className="crm-input" name="startDate" type="date" />
            <input className="crm-input" name="endDate" type="date" />
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <textarea className="crm-textarea" name="description" placeholder={lang === "sv" ? "Beskrivning" : "Description"} />
          </div>
          <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={planSaving}>
            {planSaving ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara plan" : "Save plan")}
          </button>
          {planStatus ? <p className="crm-subtle" style={{ marginTop: "0.55rem" }}>{planStatus}</p> : null}
        </form>
        <h3 style={{ marginTop: "1rem" }}>{lang === "sv" ? "Pipeline" : "Pipeline"}</h3>
        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
          {lang === "sv" ? "Dra och släpp planer mellan statuskolumner." : "Drag and drop plans between status columns."}
        </p>
        <div className="crm-kanban" style={{ marginTop: "0.8rem" }}>
          {(["PLANNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"] as const).map((status) => (
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
                <strong>
                  {status === "PLANNED"
                    ? (lang === "sv" ? "Planerad" : "Planned")
                    : status === "IN_PROGRESS"
                    ? (lang === "sv" ? "Pågående" : "In progress")
                    : status === "ON_HOLD"
                    ? (lang === "sv" ? "Pausad" : "On hold")
                    : (lang === "sv" ? "Avslutad" : "Completed")}
                </strong>
                <span className="crm-badge">{customer.plans.filter((plan) => plan.status === status).length}</span>
              </header>
              <div className="crm-list" style={{ marginTop: "0.6rem" }}>
                {customer.plans
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
                        <span className={`crm-badge ${planStatusClass[plan.status]}`}>{plan.priority ?? "MEDIUM"}</span>
                      </div>
                      <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                        {lang === "sv" ? "Ansvarig" : "Owner"}: {plan.owner ?? "-"}
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
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {customer.plans.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Inga planer registrerade." : "No plans registered."}</p>
          ) : (
            customer.plans.map((plan) => (
              <article key={plan.id} className="crm-item">
                <div className="crm-item-head">
                  <strong>{plan.title}</strong>
                  <span className={`crm-badge ${planStatusClass[plan.status]}`}>
                    {plan.status === "PLANNED"
                      ? (lang === "sv" ? "Planerad" : "Planned")
                      : plan.status === "IN_PROGRESS"
                      ? (lang === "sv" ? "Pågående" : "In progress")
                      : plan.status === "ON_HOLD"
                      ? (lang === "sv" ? "Pausad" : "On hold")
                      : (lang === "sv" ? "Avslutad" : "Completed")}
                  </span>
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
          <button className="crm-button" type="button" onClick={addActivityNote} disabled={activitySaving}>
            {activitySaving ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara notering" : "Save note")}
          </button>
        </div>
        {activityStatus ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>{activityStatus}</p> : null}
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
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {(item.actorName || "-") + " · " + new Date(item.createdAt).toLocaleString()}
                </p>
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
