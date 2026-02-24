import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ customers: 0, contacts: 0, plans: 0, available: false });
  }

  try {
    const [customers, contacts, plans] = await Promise.all([
      prisma.customer.count(),
      prisma.contact.count(),
      prisma.plan.count()
    ]);

    return NextResponse.json({ customers, contacts, plans, available: true });
  } catch {
    return NextResponse.json({ customers: 0, contacts: 0, plans: 0, available: false });
  }
}
