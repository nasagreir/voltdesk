import { withActor } from "@/lib/auth/actor";
import { dataPath, readJson, writeJson } from "@/lib/store";
import { sanitizeMaintenance, type MaintenanceState } from "@/lib/maintenance";

const FILE = "maintenance.json";

export async function readMaintenanceFile(): Promise<MaintenanceState | null> {
  return withActor(readMaintenanceNow);
}

async function readMaintenanceNow(): Promise<MaintenanceState | null> {
  const raw = await readJson<unknown | null>(dataPath(FILE), null);
  if (raw == null) return null;
  const parsed = sanitizeMaintenance(raw);
  if (!parsed) throw new Error("Maintenance file is unreadable");
  return parsed;
}

export async function writeMaintenanceFile(state: MaintenanceState) {
  await withActor(() => writeJson(dataPath(FILE), state));
}
