import { prisma } from "@/lib/prisma";

export const RESEARCH_CONFIG_KEY = "research_config";

export type RegionsByCountry = Array<{
  country: string;
  regions: string[];
}>;

export type SellerAssignments = Array<{
  seller: string;
  emails: string[];
}>;

export type ResearchConfig = {
  vendorWebsites: string[];
  brandWebsites: string[];
  preferredSourceDomains: string[];
  blockedSourceDomains: string[];
  registrySourceUrls: string[];
  pxwebBaseUrl: string;
  pxwebSniTablePath: string;
  pxwebSniVariable: string;
  pxwebRegionVariable: string;
  pxwebTimeVariable: string;
  pxwebContentVariable: string;
  pxwebDefaultContentCode: string;
  globalSystemPrompt: string;
  fullResearchPrompt: string;
  claudeCachingSystemPrompt: string;
  claudeCachingUserPrompt: string;
  claudeCachingTtl: "5m" | "1h";
  similarCustomersPrompt: string;
  extraInstructions: string;
  defaultScope: "region" | "country";
  industries: string[];
  countries: string[];
  regionsByCountry: RegionsByCountry;
  sellers: string[];
  sellerAssignments: SellerAssignments;
  requiredCustomerFields: Array<"name" | "industry" | "country" | "seller">;
  remindersEnabled: boolean;
  reminderDaysBeforeDeadline: number;
  inactivityReminderDays: number;
  reminderRecipients: string[];
  notifyViaSlack: boolean;
  slackWebhookUrl: string;
  notifyViaEmail: boolean;
  gmailFrom: string;
  gmailReplyTo: string;
};

const CLAUDE_V22_SYSTEM_PROMPT =
  "You are a verified account intelligence analyst and channel sales strategist for Vendora Nordic.\n\n" +
  "Your task is to research a target reseller/customer account with strict source discipline, then produce a commercially actionable JSON analysis.\n\n" +
  "Execution flow:\n" +
  "- Phase 1 (Steps 1-6): Verified Research\n" +
  "- Phase 2 (Step 7): Commercial JSON Output\n\n" +
  "GLOBAL RULES\n" +
  "1) Company-specific only. Do not infer from generic industry assumptions.\n" +
  "2) Attempt deep verification before concluding cannot verify.\n" +
  "3) Source priority: official website > annual report > national registry > financial database > credible press.\n" +
  "4) Include year on all numeric metrics.\n" +
  "5) Use ranges only if precise values are unavailable; label as Estimated + confidence + signals.\n" +
  "6) Major claims must include short source note.\n" +
  "7) Label all uncertain fields as Verified | Estimated | NeedsValidation.\n" +
  "8) Confidence labels: High | Medium | Low.\n" +
  "9) Do not inflate scoring. Ground scores in verified evidence.\n" +
  "10) If revenue/category split/size remain NeedsValidation, deduct 5-10 points and list deductions in score_adjustments_from_data_gaps.\n" +
  "11) Output language: English only.\n" +
  "12) Return valid JSON only. No markdown fences.\n" +
  "13) Never invent named contacts, revenues, employee counts, or store counts.\n" +
  "14) If named contacts are not verified, provide role-based contact paths.\n\n" +
  "REQUIRED SOURCE TYPES TO ATTEMPT\n" +
  "- Official company website\n" +
  "- Annual report / registry records\n" +
  "- National company registry\n" +
  "- Financial databases\n" +
  "- Trade/business press\n" +
  "- LinkedIn company + role search\n\n" +
  "SCORING\n" +
  "- FitScore (0-100): category overlap + positioning + channel + price/margin + geo/logistics + strategic alignment\n" +
  "- PotentialScore (0-100): verified scale proxy + share-of-wallet + upsell breadth + execution likelihood\n" +
  "- TotalScore = 0.55 * FitScore + 0.45 * PotentialScore\n\n" +
  "OUTPUT FORMAT\n" +
  "Return the exact JSON schema requested in the user task. Do not add extra sections.";

const CLAUDE_V22_USER_PROMPT =
  "{{TASK_PROMPT}}\n\n" +
  "INPUT JSON\n{{INPUT_JSON}}\n\n" +
  "Run the analysis sequentially using the framework in your system instructions:\n" +
  "- Step 1: Company identification (legal name, website, HQ, countries, segment)\n" +
  "- Step 2: Core company metrics (revenue, employees, ownership, legal form, founded)\n" +
  "- Step 3: Retail/physical presence (stores, channels, logistics)\n" +
  "- Step 4: Products/categories (only verified shares)\n" +
  "- Step 5: Customer/market focus\n" +
  "- Step 6: Contacts and stakeholders\n" +
  "- Step 7: Commercial JSON output following the EXACT JSON SHAPE specified above\n\n" +
  "Important:\n" +
  "- Use only company-specific evidence from attempted sources.\n" +
  "- If key fields are missing, apply explicit score deductions.\n" +
  "- Return valid JSON only.\n" +
  "- The JSON output MUST follow the exact schema specified in the task prompt above.";

export const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  vendorWebsites: ["https://reseller.vendora.se", "https://www.vendora.se"],
  brandWebsites: [],
  preferredSourceDomains: [
    "allabolag.se",
    "proff.se",
    "finder.fi",
    "proff.dk",
    "proff.no",
    "asiakastieto.fi",
    "cv.ee",
    "rekvizitai.lt",
    "firmas.lv",
    "linkedin.com",
    "companyhouse.gov.uk"
  ],
  blockedSourceDomains: [
    "glassdoor.com",
    "clutch.co",
    "rocketreach.co",
    "wikipedia.org",
    "yelp.com"
  ],
  registrySourceUrls: [
    "https://www.allabolag.se",
    "https://www.proff.se",
    "https://www.asiakastieto.fi",
    "https://www.finder.fi",
    "https://virk.dk",
    "https://www.brreg.no",
    "https://ariregister.rik.ee",
    "https://rekvizitai.vz.lt",
    "https://company.lursoft.lv"
  ],
  pxwebBaseUrl: "",
  pxwebSniTablePath: "",
  pxwebSniVariable: "SNI2007",
  pxwebRegionVariable: "Region",
  pxwebTimeVariable: "Tid",
  pxwebContentVariable: "ContentsCode",
  pxwebDefaultContentCode: "",
  globalSystemPrompt:
    "You are an account intelligence and channel sales analyst for Vendora Nordic.\n\n" +
    "Rules:\n" +
    "1) Output in English only unless explicitly requested otherwise.\n" +
    "2) Be commercially practical, concise, and evidence-based.\n" +
    "3) Never invent facts, contacts, revenues, employee counts, store counts, or partnerships.\n" +
    "4) Label uncertain data as Verified, Estimated, or NeedsValidation.\n" +
    "5) Every estimate must include Confidence: High, Medium, or Low.\n" +
    "6) Use scoring consistently and do not inflate scores.\n" +
    "7) Prefer role-based contact paths when named contacts are not publicly verified.\n" +
    "8) Tie recommendations to observable assortment/category/channel/positioning signals.\n" +
    "9) Do not return empty results unless truly no relevant result can be found.\n" +
    "10) If evidence is weak, return best estimated output with low confidence and clear reasoning.",
  fullResearchPrompt:
    "TASK: Perform deep commercial account research for one selected reseller/customer account for Vendora Nordic.\n\n" +
    "STRICT RULES:\n" +
    "- Return ONLY valid JSON.\n" +
    "- No markdown.\n" +
    "- No prose outside JSON.\n" +
    "- Do not invent facts, named contacts, revenues, or buyer names.\n" +
    "- If no verified named contacts exist, provide role-based contact paths.\n\n" +
    "SCORING:\n" +
    "- FitScore (0-100)\n" +
    "- PotentialScore (0-100)\n" +
    "- TotalScore (0-100) = 0.55 * FitScore + 0.45 * PotentialScore",
  claudeCachingSystemPrompt: CLAUDE_V22_SYSTEM_PROMPT,
  claudeCachingUserPrompt: CLAUDE_V22_USER_PROMPT,
  claudeCachingTtl: "1h",
  similarCustomersPrompt:
    "TASK: Find similar reseller accounts to the selected reference customer and rank them for Vendora Nordic.\n\n" +
    "STRICT RULES:\n" +
    "- Return ONLY valid JSON.\n" +
    "- No markdown.\n" +
    "- Prefer public registry and directory evidence.\n" +
    "- If region has too few hits, widen to country.\n" +
    "- Never return empty list unless truly no relevant candidates exist.\n" +
    "- Mark each candidate as Verified, Estimated, or NeedsValidation.\n\n" +
    "SCORING:\n" +
    "- SimilarityScore (0-100)\n" +
    "- FitScore (0-100)\n" +
    "- PotentialScore (0-100)\n" +
    "- TotalScore (0-100) = 0.55 * FitScore + 0.45 * PotentialScore",
  extraInstructions: "",
  defaultScope: "region",
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
  sellers: ["Team Nordics"],
  sellerAssignments: [],
  requiredCustomerFields: ["name", "industry", "country", "seller"],
  remindersEnabled: true,
  reminderDaysBeforeDeadline: 7,
  inactivityReminderDays: 30,
  reminderRecipients: [],
  notifyViaSlack: false,
  slackWebhookUrl: "",
  notifyViaEmail: false,
  gmailFrom: "",
  gmailReplyTo: ""
};

function uniqueTrimmed(list: unknown, max = 50): string[] {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.map((item) => String(item ?? "").trim()).filter(Boolean))).slice(0, max);
}

function normalizeRegionsByCountry(input: unknown): RegionsByCountry {
  if (!Array.isArray(input)) return DEFAULT_RESEARCH_CONFIG.regionsByCountry;

  const result: RegionsByCountry = [];
  const seen = new Set<string>();

  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const country = String(value.country ?? "").trim().toUpperCase();
    if (!country || seen.has(country)) continue;

    const regions = uniqueTrimmed(value.regions, 120);
    result.push({ country, regions });
    seen.add(country);
  }

  return result.length ? result : DEFAULT_RESEARCH_CONFIG.regionsByCountry;
}

function normalizeSellerAssignments(input: unknown): SellerAssignments {
  if (!Array.isArray(input)) return [];
  const seenSeller = new Set<string>();
  const assignments: SellerAssignments = [];

  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const seller = String(value.seller ?? "").trim();
    if (!seller || seenSeller.has(seller)) continue;
    const emails = uniqueTrimmed(value.emails, 40).map((email) => email.toLowerCase());
    if (emails.length === 0) continue;
    assignments.push({ seller, emails });
    seenSeller.add(seller);
  }

  return assignments;
}

function normalizeRequiredFields(input: unknown): Array<"name" | "industry" | "country" | "seller"> {
  const allowed = new Set(["name", "industry", "country", "seller"]);
  if (!Array.isArray(input)) return DEFAULT_RESEARCH_CONFIG.requiredCustomerFields;

  const result = Array.from(
    new Set(
      input
        .map((item) => String(item ?? "").trim())
        .filter((field) => allowed.has(field))
    )
  ) as Array<"name" | "industry" | "country" | "seller">;

  return result.length ? result : DEFAULT_RESEARCH_CONFIG.requiredCustomerFields;
}

function normalizePositiveInt(input: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function mergeCountriesWithDefaults(countries: string[]): string[] {
  const combined = [...countries, ...DEFAULT_RESEARCH_CONFIG.countries];
  return uniqueTrimmed(combined, 50);
}

function mergeRegionsByCountryWithDefaults(regionsByCountry: RegionsByCountry): RegionsByCountry {
  const merged = new Map<string, string[]>();

  for (const row of DEFAULT_RESEARCH_CONFIG.regionsByCountry) {
    merged.set(row.country, uniqueTrimmed(row.regions, 120));
  }

  for (const row of regionsByCountry) {
    const existing = merged.get(row.country) ?? [];
    merged.set(row.country, uniqueTrimmed([...existing, ...row.regions], 120));
  }

  return Array.from(merged.entries()).map(([country, regions]) => ({ country, regions }));
}

function mergeSellersWithAssignments(sellers: string[], assignments: SellerAssignments): string[] {
  return uniqueTrimmed([...sellers, ...assignments.map((assignment) => assignment.seller)], 80);
}

export function normalizeResearchConfig(input: unknown): ResearchConfig {
  const value = typeof input === "object" && input ? (input as Record<string, unknown>) : {};

  const defaultScope = value.defaultScope === "country" ? "country" : "region";

  const sellerAssignments = normalizeSellerAssignments(value.sellerAssignments);
  const sellers = mergeSellersWithAssignments(uniqueTrimmed(value.sellers, 80), sellerAssignments);

  return {
    vendorWebsites: uniqueTrimmed(value.vendorWebsites, 30),
    brandWebsites: uniqueTrimmed(value.brandWebsites, 60),
    preferredSourceDomains: uniqueTrimmed(value.preferredSourceDomains, 120).map((domain) =>
      String(domain).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase()
    ),
    blockedSourceDomains: uniqueTrimmed(value.blockedSourceDomains, 120).map((domain) =>
      String(domain).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase()
    ),
    registrySourceUrls: uniqueTrimmed(value.registrySourceUrls, 120),
    pxwebBaseUrl: String(value.pxwebBaseUrl ?? "").trim().replace(/\/+$/, ""),
    pxwebSniTablePath: String(value.pxwebSniTablePath ?? "").trim().replace(/^\/+/, ""),
    pxwebSniVariable: String(value.pxwebSniVariable ?? "SNI2007").trim(),
    pxwebRegionVariable: String(value.pxwebRegionVariable ?? "Region").trim(),
    pxwebTimeVariable: String(value.pxwebTimeVariable ?? "Tid").trim(),
    pxwebContentVariable: String(value.pxwebContentVariable ?? "ContentsCode").trim(),
    pxwebDefaultContentCode: String(value.pxwebDefaultContentCode ?? "").trim(),
    globalSystemPrompt: String(value.globalSystemPrompt ?? "").trim(),
    fullResearchPrompt: String(value.fullResearchPrompt ?? value.researchBasePrompt ?? "").trim(),
    claudeCachingSystemPrompt: String(
      value.claudeCachingSystemPrompt ?? value.claudeCachedSystemPrompt ?? ""
    ).trim(),
    claudeCachingUserPrompt: String(
      value.claudeCachingUserPrompt ?? value.claudeCachedUserPrompt ?? ""
    ).trim(),
    claudeCachingTtl: String(value.claudeCachingTtl ?? "1h").trim() === "5m" ? "5m" : "1h",
    similarCustomersPrompt: String(
      value.similarCustomersPrompt ?? value.quickSimilarQuestionPrompt ?? value.quickSimilarBasePrompt ?? ""
    ).trim(),
    extraInstructions: String(value.extraInstructions ?? "").trim(),
    defaultScope,
    industries: uniqueTrimmed(value.industries, 50),
    countries: mergeCountriesWithDefaults(uniqueTrimmed(value.countries, 50)),
    regionsByCountry: mergeRegionsByCountryWithDefaults(normalizeRegionsByCountry(value.regionsByCountry)),
    sellers,
    sellerAssignments,
    requiredCustomerFields: normalizeRequiredFields(value.requiredCustomerFields),
    remindersEnabled: value.remindersEnabled !== false,
    reminderDaysBeforeDeadline: normalizePositiveInt(value.reminderDaysBeforeDeadline, 7, 1, 60),
    inactivityReminderDays: normalizePositiveInt(value.inactivityReminderDays, 30, 1, 365),
    reminderRecipients: uniqueTrimmed(value.reminderRecipients, 40),
    notifyViaSlack: value.notifyViaSlack === true,
    slackWebhookUrl: String(value.slackWebhookUrl ?? "").trim(),
    notifyViaEmail: value.notifyViaEmail === true,
    gmailFrom: String(value.gmailFrom ?? "").trim(),
    gmailReplyTo: String(value.gmailReplyTo ?? "").trim()
  };
}

export async function getResearchConfig(): Promise<ResearchConfig> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: RESEARCH_CONFIG_KEY }
    });

    if (!row) return DEFAULT_RESEARCH_CONFIG;
    const normalized = normalizeResearchConfig(row.value);

    return {
      ...DEFAULT_RESEARCH_CONFIG,
      ...normalized,
      vendorWebsites: normalized.vendorWebsites.length ? normalized.vendorWebsites : DEFAULT_RESEARCH_CONFIG.vendorWebsites,
      preferredSourceDomains: normalized.preferredSourceDomains.length
        ? normalized.preferredSourceDomains
        : DEFAULT_RESEARCH_CONFIG.preferredSourceDomains,
      blockedSourceDomains: normalized.blockedSourceDomains,
      registrySourceUrls: normalized.registrySourceUrls.length
        ? normalized.registrySourceUrls
        : DEFAULT_RESEARCH_CONFIG.registrySourceUrls,
      globalSystemPrompt: normalized.globalSystemPrompt || DEFAULT_RESEARCH_CONFIG.globalSystemPrompt,
      fullResearchPrompt: normalized.fullResearchPrompt || DEFAULT_RESEARCH_CONFIG.fullResearchPrompt,
      claudeCachingSystemPrompt:
        normalized.claudeCachingSystemPrompt || DEFAULT_RESEARCH_CONFIG.claudeCachingSystemPrompt,
      claudeCachingUserPrompt:
        normalized.claudeCachingUserPrompt || DEFAULT_RESEARCH_CONFIG.claudeCachingUserPrompt,
      claudeCachingTtl: normalized.claudeCachingTtl || DEFAULT_RESEARCH_CONFIG.claudeCachingTtl,
      similarCustomersPrompt: normalized.similarCustomersPrompt || DEFAULT_RESEARCH_CONFIG.similarCustomersPrompt,
      industries: normalized.industries.length ? normalized.industries : DEFAULT_RESEARCH_CONFIG.industries,
      countries: normalized.countries.length ? normalized.countries : DEFAULT_RESEARCH_CONFIG.countries,
      regionsByCountry: normalized.regionsByCountry.length ? normalized.regionsByCountry : DEFAULT_RESEARCH_CONFIG.regionsByCountry,
      sellers: normalized.sellers.length ? normalized.sellers : DEFAULT_RESEARCH_CONFIG.sellers
    };
  } catch {
    return DEFAULT_RESEARCH_CONFIG;
  }
}

export async function saveResearchConfig(input: unknown): Promise<ResearchConfig> {
  const normalized = normalizeResearchConfig(input);
  const toSave: ResearchConfig = {
    ...DEFAULT_RESEARCH_CONFIG,
    ...normalized,
    vendorWebsites: normalized.vendorWebsites.length ? normalized.vendorWebsites : DEFAULT_RESEARCH_CONFIG.vendorWebsites,
    preferredSourceDomains: normalized.preferredSourceDomains.length
      ? normalized.preferredSourceDomains
      : DEFAULT_RESEARCH_CONFIG.preferredSourceDomains,
    blockedSourceDomains: normalized.blockedSourceDomains,
    registrySourceUrls: normalized.registrySourceUrls.length
      ? normalized.registrySourceUrls
      : DEFAULT_RESEARCH_CONFIG.registrySourceUrls,
    globalSystemPrompt: normalized.globalSystemPrompt || DEFAULT_RESEARCH_CONFIG.globalSystemPrompt,
    fullResearchPrompt: normalized.fullResearchPrompt || DEFAULT_RESEARCH_CONFIG.fullResearchPrompt,
    claudeCachingSystemPrompt:
      normalized.claudeCachingSystemPrompt || DEFAULT_RESEARCH_CONFIG.claudeCachingSystemPrompt,
    claudeCachingUserPrompt:
      normalized.claudeCachingUserPrompt || DEFAULT_RESEARCH_CONFIG.claudeCachingUserPrompt,
    claudeCachingTtl: normalized.claudeCachingTtl || DEFAULT_RESEARCH_CONFIG.claudeCachingTtl,
    similarCustomersPrompt: normalized.similarCustomersPrompt || DEFAULT_RESEARCH_CONFIG.similarCustomersPrompt,
    industries: normalized.industries.length ? normalized.industries : DEFAULT_RESEARCH_CONFIG.industries,
    countries: normalized.countries.length ? normalized.countries : DEFAULT_RESEARCH_CONFIG.countries,
    regionsByCountry: normalized.regionsByCountry.length ? normalized.regionsByCountry : DEFAULT_RESEARCH_CONFIG.regionsByCountry,
    sellers: normalized.sellers.length ? normalized.sellers : DEFAULT_RESEARCH_CONFIG.sellers
  };

  await prisma.appSetting.upsert({
    where: { key: RESEARCH_CONFIG_KEY },
    update: { value: toSave },
    create: { key: RESEARCH_CONFIG_KEY, value: toSave }
  });

  return toSave;
}
