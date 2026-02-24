import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rankSimilarCustomers } from "@/lib/research/similarity";

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

  const ranked = rankSimilarCustomers(
    {
      id: base.id,
      name: base.name,
      country: base.country,
      region: base.region,
      industry: base.industry,
      seller: base.seller,
      potentialScore: base.potentialScore
    },
    similarCandidates
  ).slice(0, 10);

  return NextResponse.json({
    baseCustomerId: base.id,
    scope,
    results: ranked
  });
}
