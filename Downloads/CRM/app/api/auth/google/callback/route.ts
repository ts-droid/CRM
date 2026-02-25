import { google } from "googleapis";
import { NextResponse } from "next/server";
import { isAllowedEmail, SESSION_COOKIE, signSession } from "@/lib/auth/session";
import { getPublicOrigin } from "@/lib/auth/url";

function getRedirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URL || `${origin}/api/auth/google/callback`;
}

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth is not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const publicOrigin = getPublicOrigin(url.origin);
  const code = url.searchParams.get("code");
  const nextPath = decodeURIComponent(url.searchParams.get("state") || "/");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", publicOrigin));
  }

  try {
    const oauth = new google.auth.OAuth2(clientId, clientSecret, getRedirectUri(publicOrigin));
    const tokenRes = await oauth.getToken(code);
    oauth.setCredentials(tokenRes.tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth });
    const me = await oauth2.userinfo.get();
    const email = String(me.data.email || "").toLowerCase();
    const name = me.data.name ? String(me.data.name) : "";
    const picture = me.data.picture ? String(me.data.picture) : "";

    if (!email || !isAllowedEmail(email)) {
      return NextResponse.redirect(new URL("/login?error=not_allowed", publicOrigin));
    }

    const session = await signSession({ email, name, picture });
    const safePath = nextPath.startsWith("/") ? nextPath : "/";
    const response = NextResponse.redirect(new URL(safePath, publicOrigin));
    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", publicOrigin));
  }
}
