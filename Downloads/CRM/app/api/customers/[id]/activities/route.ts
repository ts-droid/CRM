import { ActivityType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

function isMissingTableError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2021";
}

function readSessionToken(cookieHeader: string): string | null {
  const cookiePart = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookiePart) return null;
  const raw = cookiePart.slice(`${SESSION_COOKIE}=`.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const activities = await prisma.activity.findMany({
      where: { customerId: params.id },
      include: {
        plan: {
          select: { id: true, title: true }
        },
        contact: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return NextResponse.json(activities);
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Activity table is missing in database. Run prisma db push to sync schema." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not load activities" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as { message?: string; actorName?: string };
    if (!body.message || !body.message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const cookieHeader = req.headers.get("cookie") || "";
    const token = readSessionToken(cookieHeader);
    const session = token ? await verifySession(token) : null;
    const actorName = session?.email || body.actorName?.trim() || undefined;

    const created = await prisma.activity.create({
      data: {
        type: ActivityType.NOTE,
        message: body.message.trim(),
        customerId: params.id,
        actorName
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Activity table is missing in database. Run prisma db push to sync schema." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
