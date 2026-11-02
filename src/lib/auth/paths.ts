import path from "node:path";

export function getDataDir() {
  return process.env.VOLTDESK_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function getUsersFilePath() {
  return path.join(getDataDir(), "users.json");
}

export function getSettingsFilePath() {
  return path.join(getDataDir(), "settings.json");
}

export function getSamplesFilePath() {
  return path.join(getDataDir(), "samples.jsonl");
}

export function getLatestFilePath() {
  return path.join(getDataDir(), "latest.json");
}
