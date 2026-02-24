import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchWebsiteSnapshot } from "@/lib/research/web";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const customer = await prisma.customer.findUnique({
    where: { id: params.id }
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (!customer.website) {
    return NextResponse.json({ error: "Customer has no website URL" }, { status: 400 });
  }

  try {
    const snapshot = await fetchWebsiteSnapshot(customer.website);
    const potentialScore = snapshot.vendoraFitScore;

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        potentialScore,
        webshopSignals: {
          title: snapshot.title,
          description: snapshot.description,
          h1: snapshot.h1,
          websiteUrl: snapshot.url,
          fitScore: snapshot.vendoraFitScore,
          syncedAt: new Date().toISOString()
        }
      }
    });

    return NextResponse.json({
      customer: updated,
      fetched: {
        title: snapshot.title,
        description: snapshot.description,
        potentialScore
      }
    });
  } catch {
    return NextResponse.json({ error: "Webshop sync failed" }, { status: 500 });
  }
}
