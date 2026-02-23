import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const customers = await prisma.customer.findMany({
    include: {
      contacts: true,
      plans: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return NextResponse.json(customers);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      organization?: string;
      industry?: string;
      email?: string;
      phone?: string;
      notes?: string;
    };

    if (!body.name || body.name.trim().length < 2) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const created = await prisma.customer.create({
      data: {
        name: body.name,
        organization: body.organization,
        industry: body.industry,
        email: body.email,
        phone: body.phone,
        notes: body.notes
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
