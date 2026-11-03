import { AsyncLocalStorage } from "node:async_hooks";
import { ensurePrivateData } from "@/lib/auth/private-data";

const storage = new AsyncLocalStorage<string>();

export function actorUsername(): string | null {
  return storage.getStore() ?? null;
}

export async function runAsUser<T>(username: string, fn: () => Promise<T>): Promise<T> {
  return storage.run(username, async () => {
    await ensurePrivateData(username);
    return fn();
  });
}

async function usernameFromRequest(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const list = await headers();
    const name = list.get("x-voltdesk-user")?.trim() ?? "";
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(name)) return null;
    return name;
  } catch {
    return null;
  }
}

/** Runs inside the signed-in login when this request has one. Scripts and tests stay on the shared files. */
export async function withActor<T>(fn: () => Promise<T>): Promise<T> {
  if (storage.getStore()) return fn();
  const username = await usernameFromRequest();
  if (!username) return fn();
  return runAsUser(username, fn);
}
