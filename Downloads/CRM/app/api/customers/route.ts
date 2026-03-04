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
  const facetsOnly = searchParams.get("facets") === "1";
  const pageRaw = searchParams.get("page");
  const pageSizeRaw = searchParams.get("pageSize");
  const page = pageRaw && pageRaw.trim() !== "" ? Number(pageRaw) : Number.NaN;
  const pageSize = pageSizeRaw && pageSizeRaw.trim() !== "" ? Number(pageSizeRaw) : Number.NaN;
  const usePagination = Number.isFinite(page) && Number.isFinite(pageSize) && Number(page) > 0 && Number(pageSize) > 0;

  const where = {
    ...(country ? { country } : {}),
    ...(seller ? { seller } : {}),
    ...(industry ? { industry } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { organization: { contains: q, mode: "insensitive" as const } },
            { industry: { contains: q, mode: "insensitive" as const } },
            { country: { contains: q, mode: "insensitive" as const } },
            { region: { contains: q, mode: "insensitive" as const } },
            { seller: { contains: q, mode: "insensitive" as const } },
            { website: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { notes: { contains: q, mode: "insensitive" as const } },
            {
              contacts: {
                some: {
                  OR: [
                    { firstName: { contains: q, mode: "insensitive" as const } },
                    { lastName: { contains: q, mode: "insensitive" as const } },
                    { email: { contains: q, mode: "insensitive" as const } },
                    { phone: { contains: q, mode: "insensitive" as const } },
                    { department: { contains: q, mode: "insensitive" as const } },
                    { title: { contains: q, mode: "insensitive" as const } },
                    { role: { contains: q, mode: "insensitive" as const } },
                    { notes: { contains: q, mode: "insensitive" as const } }
                  ]
                }
              }
            },
            {
              plans: {
                some: {
                  OR: [
                    { title: { contains: q, mode: "insensitive" as const } },
                    { description: { contains: q, mode: "insensitive" as const } },
                    { owner: { contains: q, mode: "insensitive" as const } }
                  ]
                }
              }
            },
            {
              activities: {
                some: {
                  message: { contains: q, mode: "insensitive" as const }
                }
              }
            }
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

  if (facetsOnly) {
    const whereForFacets = {
      ...(industry ? { industry } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { organization: { contains: q, mode: "insensitive" as const } },
              { industry: { contains: q, mode: "insensitive" as const } },
              { country: { contains: q, mode: "insensitive" as const } },
              { region: { contains: q, mode: "insensitive" as const } },
              { seller: { contains: q, mode: "insensitive" as const } },
              { website: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q, mode: "insensitive" as const } },
              { notes: { contains: q, mode: "insensitive" as const } }
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
    const rows = await prisma.customer.findMany({
      where: whereForFacets,
      select: {
        country: true,
        seller: true
      }
    });
    const countries = Array.from(new Set(rows.map((row) => row.country).filter(Boolean))).sort();
    const sellers = Array.from(new Set(rows.map((row) => row.seller).filter(Boolean))).sort();
    return NextResponse.json({ countries, sellers });
  }

  try {
    if (usePagination) {
      const boundedPageSize = Math.max(1, Math.min(100, Math.round(pageSize)));
      const boundedPage = Math.max(1, Math.round(page));
      const [total, customers] = await Promise.all([
        prisma.customer.count({ where }),
        prisma.customer.findMany({
          where,
          include: {
            contacts: true,
            plans: true
          },
          orderBy,
          skip: (boundedPage - 1) * boundedPageSize,
          take: boundedPageSize
        })
      ]);
      const totalPages = Math.max(1, Math.ceil(total / boundedPageSize));
      return NextResponse.json({
        items: customers,
        total,
        page: boundedPage,
        pageSize: boundedPageSize,
        totalPages
      });
    }

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
    if (usePagination) {
      const boundedPageSize = Math.max(1, Math.min(100, Math.round(pageSize)));
      const boundedPage = Math.max(1, Math.round(page));
      const [total, customers] = await Promise.all([
        prisma.customer.count({ where }),
        prisma.customer.findMany({
          where,
          orderBy,
          skip: (boundedPage - 1) * boundedPageSize,
          take: boundedPageSize
        })
      ]);
      const totalPages = Math.max(1, Math.ceil(total / boundedPageSize));
      return NextResponse.json({
        items: customers,
        total,
        page: boundedPage,
        pageSize: boundedPageSize,
        totalPages
      });
    }

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
