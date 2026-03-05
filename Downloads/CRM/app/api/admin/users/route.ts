import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function humanizeEmailLocalPart(email: string): string {
  const local = email.split("@")[0] || "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function GET() {
  const usersRawInitial = await prisma.userProfile.findMany({
    orderBy: [{ lastLoginAt: "desc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      slackMemberId: true,
      lastLoginAt: true,
      updatedAt: true
    }
  });

  // Backfill profiles for historical users that created activities before UserProfile tracking existed.
  const existingEmails = new Set(usersRawInitial.map((user) => user.email.toLowerCase()));
  const activityActors = await prisma.activity.findMany({
    where: { actorName: { not: null } },
    select: { actorName: true },
    distinct: ["actorName"]
  });
  const missingEmails = activityActors
    .map((row) => String(row.actorName || "").trim().toLowerCase())
    .filter((email) => Boolean(email) && isLikelyEmail(email) && !existingEmails.has(email));

  if (missingEmails.length > 0) {
    await Promise.all(
      missingEmails.map((email) =>
        prisma.userProfile.upsert({
          where: { email },
          create: {
            email,
            name: humanizeEmailLocalPart(email) || null
          },
          update: {}
        })
      )
    );
  }

  const usersRaw = await prisma.userProfile.findMany({
    orderBy: [{ lastLoginAt: "desc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      slackMemberId: true,
      lastLoginAt: true,
      updatedAt: true
    }
  });

  const users = usersRaw.map((user) => ({
    ...user,
    isAdmin: isAdminEmail(user.email)
  }));

  return NextResponse.json({ users });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; slackMemberId?: string | null };
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }

    const slackMemberId = String(body.slackMemberId || "").trim();
    const user = await prisma.userProfile.update({
      where: { id },
      data: { slackMemberId: slackMemberId || null },
      select: {
        id: true,
        email: true,
        name: true,
        slackMemberId: true,
        lastLoginAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      user: {
        ...user,
        isAdmin: isAdminEmail(user.email)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user" },
      { status: 400 }
    );
  }
}
