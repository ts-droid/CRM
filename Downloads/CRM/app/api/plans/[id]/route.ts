import { ActivityType, PlanPriority, PlanStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

const VALID_STATUSES = new Set(Object.values(PlanStatus));
const VALID_PRIORITIES = new Set(Object.values(PlanPriority));
function isMissingTableError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2021";
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      status?: PlanStatus;
      priority?: PlanPriority;
      startDate?: string | null;
      endDate?: string | null;
      owner?: string | null;
    };

    if (body.status && !VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid plan status" }, { status: 400 });
    }
    if (body.priority && !VALID_PRIORITIES.has(body.priority)) {
      return NextResponse.json({ error: "Invalid plan priority" }, { status: 400 });
    }

    const updated = await prisma.plan.update({
      where: { id: params.id },
      data: {
        title: body.title,
        description: body.description,
        status: body.status,
        priority: body.priority,
        startDate: body.startDate === null ? null : body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate === null ? null : body.endDate ? new Date(body.endDate) : undefined,
        owner: body.owner
      }
    });

    await logActivity({
      type: ActivityType.PLAN_UPDATED,
      message: `Plan updated: ${updated.title}`,
      customerId: updated.customerId,
      planId: updated.id,
      metadata: {
        status: updated.status,
        priority: updated.priority,
        owner: updated.owner
      }
    });

    return NextResponse.json(updated);
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
