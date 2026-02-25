import type { SimilarOutput } from "@/lib/research/similarity";
import type { WebsiteSnapshot } from "@/lib/research/web";

type PromptInput = {
  companyName: string;
  country?: string | null;
  region?: string | null;
  seller?: string | null;
  basePotential?: number;
  segmentFocus?: "B2B" | "B2C" | "MIXED";
  basePrompt?: string;
  websiteSnapshots: WebsiteSnapshot[];
  similarCustomers: SimilarOutput[];
};

export function buildResearchPrompt(input: PromptInput): string {
  const websitesBlock = input.websiteSnapshots
    .map((site, index) => {
      return [
        `Source ${index + 1}: ${site.url}`,
        `Title: ${site.title ?? "-"}`,
        `Description: ${site.description ?? "-"}`,
        `H1: ${site.h1 ?? "-"}`,
        `Vendora fit score: ${site.vendoraFitScore}`,
        `Snippet: ${site.textSample}`
      ].join("\n");
    })
    .join("\n\n");

  const similarBlock = input.similarCustomers
    .slice(0, 10)
    .map((row, index) => `${index + 1}. ${row.name} | match=${row.matchScore} | potential=${row.potentialScore} | country=${row.country ?? "-"} | region=${row.region ?? "-"} | industry=${row.industry ?? "-"}`)
    .join("\n");

  return [
    input.basePrompt?.trim() || "You are a senior GTM analyst for Vendora Nordic.",
    "",
    "RUNTIME DATA (from CRM):",
    "Target company context:",
    `- Name: ${input.companyName}`,
    `- Country: ${input.country ?? "-"}`,
    `- Region: ${input.region ?? "-"}`,
    `- Seller owner: ${input.seller ?? "-"}`,
    `- Current potential score: ${input.basePotential ?? "-"}`,
    `- Segment focus: ${input.segmentFocus ?? "MIXED"}`,
    "",
    "Collected website data:",
    websitesBlock || "No website data available.",
    "",
    "Similar-company candidates:",
    similarBlock || "No similar customers found.",
    "",
    "Instructions:",
    "1. Output in English only.",
    "2. Ignore distributors and focus on reseller/end-retail opportunities.",
    "3. Build the result in the exact markdown section structure below.",
    "4. Be practical: include contact entry paths (procurement/business sales), onboarding links, and next step.",
    "5. If a named contact is not publicly verified, use team/function + likely email format and mark confidence.",
    "6. Segment rule: if Segment focus is B2B, prioritize B2B reseller list and Top10 as B2B-first. If B2C, do the inverse.",
    "7. For non-focused segment, include only secondary opportunities.",
    "",
    "Required markdown structure:",
    "## Top10_Priority",
    "- 10 prioritized targets sorted by assortment fit + likely volume.",
    "- For each: company, segment (B2B/B2C), why now, contact entry path, onboarding link, first outreach angle, next step.",
    "",
    "## B2C_50",
    "- 50 consumer-facing reseller prospects.",
    "",
    "## B2B_50",
    "- 50 business-facing reseller prospects.",
    "",
    "## CM_Leads",
    "- Buyer roles, named leads when public, sourcing note, email format, confidence.",
    "",
    "## Outreach_Email_Templates",
    "- ENG template per category: retail, operator, B2B e-tail.",
    "",
    "## Call_Script",
    "- Practical call script for first outreach.",
    "",
    "## MailMerge_Fields",
    "- Include fields like {FirstName}, {CM_Name}, {Company}, {StoreCount}, {OnboardingLink}, {CategoryFocus}.",
    "",
    "## Next_Steps",
    "- 10 concrete actions for the first 2 weeks."
  ].join("\n");
}
