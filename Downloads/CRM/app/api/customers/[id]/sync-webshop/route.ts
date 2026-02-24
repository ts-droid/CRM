import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function textBetween(input: string, pattern: RegExp): string | null {
  const match = input.match(pattern);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, " ").trim();
}

function estimatePotential(rawText: string): number {
  const text = rawText.toLowerCase();
  const keywords = [
    "premium",
    "nordic",
    "retail",
    "distribution",
    "electronics",
    "accessories",
    "reseller",
    "b2b",
    "enterprise",
    "scandinavia"
  ];

  const hits = keywords.filter((keyword) => text.includes(keyword)).length;
  return Math.max(25, Math.min(100, 40 + hits * 7));
}

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
    const websiteUrl =
      customer.website.startsWith("http://") || customer.website.startsWith("https://")
        ? customer.website
        : `https://${customer.website}`;

    const response = await fetch(websiteUrl, {
      headers: {
        "User-Agent": "VendoraCRM/1.0 (+https://vendora.se)"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Could not fetch website (${response.status})` }, { status: 400 });
    }

    const html = await response.text();
    const title = textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = textBetween(
      html,
      /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i
    );

    const sample = `${title ?? ""} ${description ?? ""} ${html.slice(0, 4000)}`;
    const potentialScore = estimatePotential(sample);

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        potentialScore,
        webshopSignals: {
          title,
          description,
          websiteUrl,
          syncedAt: new Date().toISOString()
        }
      }
    });

    return NextResponse.json({
      customer: updated,
      fetched: {
        title,
        description,
        potentialScore
      }
    });
  } catch {
    return NextResponse.json({ error: "Webshop sync failed" }, { status: 500 });
  }
}
