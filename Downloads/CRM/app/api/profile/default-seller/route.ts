import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { getResearchConfig } from "@/lib/admin/settings";

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

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = readSessionToken(cookieHeader);

  if (!token) return NextResponse.json({ defaultSeller: null }, { status: 401 });

  const session = await verifySession(token);
  const email = String(session?.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ defaultSeller: null }, { status: 401 });

  const config = await getResearchConfig();
  const match = config.sellerAssignments.find((assignment) =>
    assignment.emails.some((candidate) => candidate.trim().toLowerCase() === email)
  );

  return NextResponse.json({
    defaultSeller: match?.seller ?? null,
    email
  });
}
