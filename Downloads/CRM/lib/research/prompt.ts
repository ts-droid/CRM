import type { SimilarOutput } from "@/lib/research/similarity";
import type { WebsiteSnapshot } from "@/lib/research/web";

type PromptInput = {
  companyName: string;
  country?: string | null;
  region?: string | null;
  seller?: string | null;
  basePotential?: number;
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
    "You are a GTM analyst for Vendora Nordic.",
    "Task: produce a concise execution plan after researching similar companies.",
    "",
    "Target company context:",
    `- Name: ${input.companyName}`,
    `- Country: ${input.country ?? "-"}`,
    `- Region: ${input.region ?? "-"}`,
    `- Seller owner: ${input.seller ?? "-"}`,
    `- Current potential score: ${input.basePotential ?? "-"}`,
    "",
    "Collected website data:",
    websitesBlock || "No website data available.",
    "",
    "Similar-company candidates:",
    similarBlock || "No similar customers found.",
    "",
    "Instructions:",
    "1. Summarize why this account is (or is not) a strong fit for Vendora Nordic.",
    "2. Propose top 5 product-category angles (with confidence 1-5).",
    "3. Suggest a 30/60/90-day outreach and partnership plan.",
    "4. Recommend whether to increase/decrease potential score and why.",
    "5. Output in Swedish and English (short sections)."
  ].join("\n");
}
