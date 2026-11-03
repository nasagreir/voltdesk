import { timingSafeEqual } from "node:crypto";
import { acceptedBotTokens } from "@/lib/settings";

const MAX_TOKEN_LENGTH = 200;

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

/** Constant-time compare. Unequal lengths return false and do not throw. */
export function tokenMatches(presented: string, expected: string): boolean {
  if (!presented || !expected) return false;
  if (presented.length > MAX_TOKEN_LENGTH || expected.length > MAX_TOKEN_LENGTH) return false;
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function authorizedBot(request: Request): Promise<boolean> {
  const presented = bearerToken(request);
  if (!presented) return false;
  const tokens = await acceptedBotTokens();
  return tokens.some((token) => tokenMatches(presented, token));
}
