import { PlanStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set(Object.values(PlanStatus));

export async function GET() {
  const plans = await prisma.plan.findMany({
    include: {
      customer: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return NextResponse.json(plans);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      status?: PlanStatus;
      startDate?: string;
      endDate?: string;
      owner?: string;
      customerId?: string;
    };

    if (!body.title || !body.customerId) {
      return NextResponse.json({ error: "title and customerId are required" }, { status: 400 });
    }

    if (body.status && !VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid plan status" }, { status: 400 });
    }

    const created = await prisma.plan.create({
      data: {
        title: body.title,
        description: body.description,
        status: body.status ?? PlanStatus.PLANNED,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        owner: body.owner,
        customerId: body.customerId
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
