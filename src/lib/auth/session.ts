import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "voltdesk_session";

export interface SessionPayload {
  sub: string;
  username: string;
}

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.VOLTDESK_AUTH_SECRET ?? "";
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV !== "production") {
      return new TextEncoder().encode("voltdesk-dev-secret-change-me-32b");
    }
    throw new Error("AUTH_SECRET is required in production (min 16 characters)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const username =
      typeof payload.username === "string"
        ? payload.username
        : typeof payload.sub === "string"
          ? payload.sub
          : null;
    if (!username) return null;
    return { sub: username, username };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(request?: Request, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const explicit = (process.env.AUTH_COOKIE_SECURE ?? "").toLowerCase();
  let secure = false;
  if (explicit === "1" || explicit === "true") secure = true;
  else if (explicit === "0" || explicit === "false") secure = false;
  else if (request) {
    const forwarded = request.headers.get("x-forwarded-proto");
    const proto = forwarded?.split(",")[0]?.trim();
    if (proto === "https") secure = true;
    else if (proto === "http") secure = false;
    else {
      try {
        secure = new URL(request.url).protocol === "https:";
      } catch {
        secure = false;
      }
    }
  }
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
