import path from "node:path";

export function getDataDir() {
  return process.env.VOLTDESK_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function getUsersFilePath() {
  return path.join(getDataDir(), "users.json");
}

export function userSlug(username: string) {
  return username.trim().toLowerCase();
}

export function userDataDir(username: string) {
  const slug = userSlug(username);
  if (!/^[a-z0-9._-]{3,32}$/.test(slug)) throw new Error("Bad username");
  return path.join(getDataDir(), "users", slug);
}

export function legacyDataFile(name: string) {
  return path.join(getDataDir(), name);
}
