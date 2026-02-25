import { NextResponse } from "next/server";
import { ActivityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country");
  const seller = searchParams.get("seller");
  const industry = searchParams.get("industry");
  const q = searchParams.get("q");
  const potentialMinRaw = searchParams.get("potentialMin");
  const potentialMaxRaw = searchParams.get("potentialMax");
  const potentialMin = potentialMinRaw && potentialMinRaw.trim() !== "" ? Number(potentialMinRaw) : Number.NaN;
  const potentialMax = potentialMaxRaw && potentialMaxRaw.trim() !== "" ? Number(potentialMaxRaw) : Number.NaN;
  const sort = searchParams.get("sort");

  const where = {
    ...(country ? { country } : {}),
    ...(seller ? { seller } : {}),
    ...(industry ? { industry } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { organization: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {}),
    ...(!Number.isNaN(potentialMin) || !Number.isNaN(potentialMax)
      ? {
          potentialScore: {
            ...(Number.isNaN(potentialMin) ? {} : { gte: potentialMin }),
            ...(Number.isNaN(potentialMax) ? {} : { lte: potentialMax })
          }
        }
      : {})
  };

  const orderBy =
    sort === "potential"
      ? [{ potentialScore: "desc" as const }, { createdAt: "desc" as const }]
      : sort === "name_asc"
      ? [{ name: "asc" as const }]
      : sort === "name_desc"
      ? [{ name: "desc" as const }]
      : sort === "updated"
      ? [{ updatedAt: "desc" as const }]
      : [{ createdAt: "desc" as const }];

  try {
    const customers = await prisma.customer.findMany({
      where,
      include: {
        contacts: true,
        plans: true
      },
      orderBy
    });

    return NextResponse.json(customers);
  } catch {
    const customers = await prisma.customer.findMany({
      where,
      orderBy
    });

    return NextResponse.json(customers);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      organization?: string;
      industry?: string;
      country?: string;
      region?: string;
      seller?: string;
      website?: string;
      email?: string;
      phone?: string;
      notes?: string;
      potentialScore?: number;
    };

    if (!body.name || body.name.trim().length < 2) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const created = await prisma.customer.create({
      data: {
        name: body.name,
        organization: body.organization,
        industry: body.industry,
        country: body.country,
        region: body.region,
        seller: body.seller,
        website: body.website,
        email: body.email,
        phone: body.phone,
        notes: body.notes,
        potentialScore: typeof body.potentialScore === "number" ? body.potentialScore : 50
      }
    });

    await logActivity({
      type: ActivityType.CUSTOMER_UPDATED,
      message: `Customer created: ${created.name}`,
      customerId: created.id,
      metadata: { created: true }
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
