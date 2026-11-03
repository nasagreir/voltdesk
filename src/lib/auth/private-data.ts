import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataDir, legacyDataFile, userDataDir, userSlug } from "@/lib/auth/paths";
import { ownerUsername } from "@/lib/auth/users";

const PRIVATE_FILES = [
  "settings.json",
  "samples.jsonl",
  "latest.json",
  "appearance.json",
  "geofences.json",
  "addresses.json",
  "charge-prices.json",
  "maintenance.json",
];

const ready = new Set<string>();

async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Moves the original shared data onto the first login, once. Later logins start empty. */
export async function ensurePrivateData(username: string) {
  const slug = userSlug(username);
  if (ready.has(slug)) return;
  const dir = userDataDir(username);
  await fs.mkdir(dir, { recursive: true });
  const owner = await ownerUsername();
  if (!owner || userSlug(owner) !== slug) {
    ready.add(slug);
    return;
  }
  const marker = path.join(getDataDir(), "users", ".owner-migrated");
  if (await exists(marker)) {
    ready.add(slug);
    return;
  }
  for (const name of PRIVATE_FILES) {
    const from = legacyDataFile(name);
    const to = path.join(dir, name);
    if (await exists(to) || !(await exists(from))) continue;
    await fs.rename(from, to);
  }
  const serviceFrom = legacyDataFile("service-files");
  const serviceTo = path.join(dir, "service-files");
  if (!(await exists(serviceTo)) && (await exists(serviceFrom))) {
    await fs.rename(serviceFrom, serviceTo);
  }
  await fs.writeFile(marker, `${slug}\n`, { mode: 0o600 });
  ready.add(slug);
}
