import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") === "country" ? "country" : "region";

  const base = await prisma.customer.findUnique({
    where: { id: params.id }
  });

  if (!base) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const similarCandidates = await prisma.customer.findMany({
    where: {
      id: { not: base.id },
      ...(scope === "country" && base.country ? { country: base.country } : {}),
      ...(scope === "region" && base.region ? { region: base.region } : {})
    },
    take: 50
  });

  const ranked = similarCandidates
    .map((candidate) => {
      let similarity = 0;

      if (base.country && candidate.country && base.country === candidate.country) similarity += 30;
      if (base.region && candidate.region && base.region === candidate.region) similarity += 20;
      if (base.industry && candidate.industry && base.industry === candidate.industry) similarity += 25;
      if (base.seller && candidate.seller && base.seller === candidate.seller) similarity += 10;

      similarity += Math.max(0, 15 - Math.abs((base.potentialScore ?? 50) - (candidate.potentialScore ?? 50)) / 2);

      const potentialPriority = (candidate.potentialScore ?? 50) * 0.5;

      return {
        ...candidate,
        matchScore: Math.round(similarity + potentialPriority)
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  return NextResponse.json({
    baseCustomerId: base.id,
    scope,
    results: ranked
  });
}
