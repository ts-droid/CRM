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
