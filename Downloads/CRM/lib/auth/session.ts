import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "crm_session";

type SessionPayload = {
  email: string;
  name?: string;
  picture?: string;
};

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET || "";
  if (!secret) {
    throw new Error("Missing AUTH_SECRET");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      email: String(payload.email || ""),
      name: payload.name ? String(payload.name) : undefined,
      picture: payload.picture ? String(payload.picture) : undefined
    };
  } catch {
    return null;
  }
}

export function isAllowedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const allowDomain = (process.env.AUTH_ALLOWED_DOMAIN || "vendora.se").trim().toLowerCase();
  const allowEmails = (process.env.AUTH_ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (allowEmails.includes(normalized)) return true;
  if (allowDomain && normalized.endsWith(`@${allowDomain}`)) return true;
  return false;
}
