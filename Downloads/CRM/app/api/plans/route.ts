import { ActivityType, PlanPriority, PlanStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

const VALID_STATUSES = new Set(Object.values(PlanStatus));
const VALID_PRIORITIES = new Set(Object.values(PlanPriority));
function isMissingTableError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2021";
}

export async function GET() {
  try {
    const plans = await prisma.plan.findMany({
      include: {
        customer: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json(plans);
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Plan table is missing in database. Run prisma db push to sync schema." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not load plans" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      status?: PlanStatus;
      priority?: PlanPriority;
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
    if (body.priority && !VALID_PRIORITIES.has(body.priority)) {
      return NextResponse.json({ error: "Invalid plan priority" }, { status: 400 });
    }

    const created = await prisma.plan.create({
      data: {
        title: body.title,
        description: body.description,
        status: body.status ?? PlanStatus.PLANNED,
        priority: body.priority ?? PlanPriority.MEDIUM,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        owner: body.owner,
        customerId: body.customerId
      }
    });

    await logActivity({
      type: ActivityType.PLAN_CREATED,
      message: `Plan created: ${created.title}`,
      customerId: created.customerId,
      planId: created.id,
      metadata: {
        status: created.status,
        priority: created.priority,
        owner: created.owner
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Plan table is missing in database. Run prisma db push to sync schema." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
