import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { getDataDir, userDataDir } from "@/lib/auth/paths";
import { listUsers, ownerUsername } from "@/lib/auth/users";
import { readJson } from "@/lib/store";
import { collectBotTokens, environmentApiToken } from "@/lib/settings";
import type { AppSettings } from "@/lib/types";

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

async function tokensIn(file: string): Promise<string[]> {
  const raw = await readJson<Partial<AppSettings>>(file, {});
  return collectBotTokens(raw).map((item) => item.token);
}

/**
 * The login whose bot token this is.
 * "*" means the container env token and there is no login yet, so the shared files still apply.
 */
export async function userForBotToken(presented: string): Promise<string | null> {
  if (!presented) return null;
  const users = await listUsers();
  const owner = await ownerUsername();
  let found: string | null = null;
  for (const user of users) {
    const tokens = await tokensIn(path.join(userDataDir(user.username), "settings.json"));
    if (tokens.some((token) => tokenMatches(presented, token))) found ??= user.username;
  }
  if (owner) {
    const legacy = await tokensIn(path.join(getDataDir(), "settings.json"));
    if (legacy.some((token) => tokenMatches(presented, token))) found ??= owner;
  }
  const envToken = await environmentApiToken();
  if (envToken && tokenMatches(presented, envToken)) found ??= owner ?? "*";
  return found;
}

export async function authorizedBot(request: Request): Promise<boolean> {
  const presented = bearerToken(request);
  if (!presented) return false;
  return (await userForBotToken(presented)) != null;
}
