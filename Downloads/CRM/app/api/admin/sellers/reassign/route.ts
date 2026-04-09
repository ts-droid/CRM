import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { fromSeller?: string; toSeller?: string };
    const fromSeller = String(body.fromSeller ?? "").trim();
    const toSeller = String(body.toSeller ?? "").trim();

    if (!fromSeller || !toSeller || fromSeller === toSeller) {
      return NextResponse.json({ error: "Invalid seller selection" }, { status: 400 });
    }

    const result = await prisma.customer.updateMany({
      where: { seller: fromSeller },
      data: { seller: toSeller }
    });

    return NextResponse.json({ moved: result.count, fromSeller, toSeller });
  } catch {
    return NextResponse.json({ error: "Failed to reassign customers" }, { status: 400 });
  }
}

// PATCH: batch rename multiple seller abbreviations at once
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { mappings?: Array<{ from: string; to: string }> };
    const mappings = Array.isArray(body.mappings) ? body.mappings : [];
    const results: Array<{ from: string; to: string; moved: number }> = [];

    for (const { from, to } of mappings) {
      const fromStr = String(from ?? "").trim();
      const toStr = String(to ?? "").trim();
      if (!fromStr || !toStr || fromStr === toStr) continue;
      const result = await prisma.customer.updateMany({
        where: { seller: fromStr },
        data: { seller: toStr }
      });
      results.push({ from: fromStr, to: toStr, moved: result.count });
    }

    return NextResponse.json({ results, total: results.reduce((sum, r) => sum + r.moved, 0) });
  } catch {
    return NextResponse.json({ error: "Failed to batch reassign" }, { status: 400 });
  }
}
