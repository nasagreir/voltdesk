import path from "node:path";
import { actorUsername } from "@/lib/auth/actor";
import { getDataDir } from "@/lib/auth/paths";
import { userDataDir } from "@/lib/auth/paths";

export function activeDataDir() {
  const user = actorUsername();
  return user ? userDataDir(user) : getDataDir();
}

export function getSettingsFilePath() {
  return path.join(activeDataDir(), "settings.json");
}

export function getSamplesFilePath() {
  return path.join(activeDataDir(), "samples.jsonl");
}

export function getLatestFilePath() {
  return path.join(activeDataDir(), "latest.json");
}
