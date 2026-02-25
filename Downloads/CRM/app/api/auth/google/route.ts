import { google } from "googleapis";
import { NextResponse } from "next/server";

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
  const nextPath = url.searchParams.get("next") || "/";
  const oauth = new google.auth.OAuth2(clientId, clientSecret, getRedirectUri(url.origin));
  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
    state: encodeURIComponent(nextPath)
  });

  return NextResponse.redirect(authUrl);
}
