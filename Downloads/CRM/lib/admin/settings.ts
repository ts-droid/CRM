import { prisma } from "@/lib/prisma";

export const RESEARCH_CONFIG_KEY = "research_config";

export type ResearchConfig = {
  vendorWebsites: string[];
  brandWebsites: string[];
  extraInstructions: string;
  defaultScope: "region" | "country";
  industries: string[];
  countries: string[];
  sellers: string[];
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

export const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  vendorWebsites: ["https://www.vendora.se"],
  brandWebsites: [],
  extraInstructions: "",
  defaultScope: "region",
  industries: ["Consumer Electronics", "Retail", "E-commerce", "B2B Reseller", "Enterprise IT"],
  countries: ["SE", "NO", "DK", "FI"],
  sellers: ["Team Nordics"],
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

export function normalizeResearchConfig(input: unknown): ResearchConfig {
  const value = typeof input === "object" && input ? (input as Record<string, unknown>) : {};

  const defaultScope = value.defaultScope === "country" ? "country" : "region";

  return {
    vendorWebsites: uniqueTrimmed(value.vendorWebsites, 30),
    brandWebsites: uniqueTrimmed(value.brandWebsites, 60),
    extraInstructions: String(value.extraInstructions ?? "").trim(),
    defaultScope,
    industries: uniqueTrimmed(value.industries, 50),
    countries: uniqueTrimmed(value.countries, 50),
    sellers: uniqueTrimmed(value.sellers, 50),
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
      industries: normalized.industries.length ? normalized.industries : DEFAULT_RESEARCH_CONFIG.industries,
      countries: normalized.countries.length ? normalized.countries : DEFAULT_RESEARCH_CONFIG.countries,
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
    industries: normalized.industries.length ? normalized.industries : DEFAULT_RESEARCH_CONFIG.industries,
    countries: normalized.countries.length ? normalized.countries : DEFAULT_RESEARCH_CONFIG.countries,
    sellers: normalized.sellers.length ? normalized.sellers : DEFAULT_RESEARCH_CONFIG.sellers
  };

  await prisma.appSetting.upsert({
    where: { key: RESEARCH_CONFIG_KEY },
    update: { value: toSave },
    create: { key: RESEARCH_CONFIG_KEY, value: toSave }
  });

  return toSave;
}
