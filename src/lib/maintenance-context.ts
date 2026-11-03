import {
  presentMaintenance,
  resolveMaintenance,
  type MaintenanceState,
} from "@/lib/maintenance";
import { readMaintenanceFile, writeMaintenanceFile } from "@/lib/maintenance-store";
import type { PaperlessConfig } from "@/lib/paperless";
import { environmentPaperlessToken, getSettings } from "@/lib/settings";
import type { MaintenancePayload } from "@/lib/types";
import { getDashboard } from "@/lib/vehicle-service";

export async function openMaintenance(vehicleId: string | null) {
  const [dash, saved, settings, envToken] = await Promise.all([
    getDashboard(),
    readMaintenanceFile(),
    getSettings(),
    environmentPaperlessToken(),
  ]);
  const vehicle = dash.vehicles.find((item) => item.id === vehicleId) ?? dash.vehicles[0] ?? null;
  const now = new Date();
  const odometerMi = vehicle?.odometerMi ?? 0;
  const state = resolveMaintenance(saved, dash.mode, now, odometerMi);
  const token = settings.paperlessToken || envToken;
  const paperless: PaperlessConfig | null =
    settings.paperlessUrl && token
      ? { url: settings.paperlessUrl, token, tag: settings.paperlessTag }
      : null;
  return {
    dash,
    vehicle,
    now,
    odometerMi,
    state,
    persisted: saved != null,
    paperless,
  };
}

export function maintenancePayload(
  state: MaintenanceState,
  persisted: boolean,
  ctx: {
    now: Date;
    odometerMi: number;
    vehicle: { name: string; model: string } | null;
    dash: { units: { distance: "mi" | "km" } };
    paperless: PaperlessConfig | null;
  },
): MaintenancePayload {
  return presentMaintenance({
    state,
    persisted,
    now: ctx.now,
    odometerMi: ctx.odometerMi,
    model: ctx.vehicle?.model ?? "",
    vehicleName: ctx.vehicle?.name ?? null,
    distanceUnit: ctx.dash.units.distance,
    paperlessConfigured: Boolean(ctx.paperless),
    paperlessTag: ctx.paperless?.tag,
    paperlessUrl: ctx.paperless?.url,
  });
}

export async function persistMaintenance(state: MaintenanceState) {
  await writeMaintenanceFile(state);
}
