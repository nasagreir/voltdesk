import { withActor } from "@/lib/auth/actor";
import { isColorId, isModelId, modelById, type ColorId, type ModelId } from "@/lib/car-photos";
import { dataPath, readJson, writeJson } from "@/lib/store";

export interface AppearanceFile {
  colors: Record<string, ColorId>;
  models: Record<string, ModelId>;
  names: Record<string, string>;
}

const EMPTY: AppearanceFile = { colors: {}, models: {}, names: {} };

export const VEHICLE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

export function sanitizeAppearance(raw: unknown): AppearanceFile {
  if (!raw || typeof raw !== "object") return { colors: {}, models: {}, names: {} };
  const body = raw as { colors?: unknown; models?: unknown; names?: unknown };
  const models: AppearanceFile["models"] = {};
  const colors: AppearanceFile["colors"] = {};
  const names: AppearanceFile["names"] = {};
  if (body.models && typeof body.models === "object") {
    for (const [id, value] of Object.entries(body.models)) {
      if (VEHICLE_ID_PATTERN.test(id) && typeof value === "string" && isModelId(value)) models[id] = value;
    }
  }
  if (body.colors && typeof body.colors === "object") {
    for (const [id, value] of Object.entries(body.colors)) {
      if (!VEHICLE_ID_PATTERN.test(id) || typeof value !== "string" || !isColorId(value)) continue;
      const model = models[id];
      if (model && !modelById(model).colors.includes(value)) continue;
      colors[id] = value;
    }
  }
  if (body.names && typeof body.names === "object") {
    for (const [id, value] of Object.entries(body.names)) {
      if (!VEHICLE_ID_PATTERN.test(id) || typeof value !== "string") continue;
      const trimmed = value.trim().slice(0, 40);
      if (trimmed) names[id] = trimmed;
    }
  }
  return { colors, models, names };
}

export function vehicleDisplayName(
  vehicleId: string,
  reported: string,
  names: Record<string, string> | undefined,
): string {
  return names?.[vehicleId] || reported;
}

export async function readAppearance(): Promise<AppearanceFile> {
  return withActor(async () => sanitizeAppearance(await readJson(dataPath("appearance.json"), EMPTY)));
}

export async function saveAppearance(vehicleId: string, modelId: ModelId, colorId: ColorId): Promise<AppearanceFile> {
  return withActor(() => saveAppearanceNow(vehicleId, modelId, colorId));
}

async function saveAppearanceNow(vehicleId: string, modelId: ModelId, colorId: ColorId): Promise<AppearanceFile> {
  if (!VEHICLE_ID_PATTERN.test(vehicleId)) throw new Error("That vehicle id is not valid.");
  if (!modelById(modelId).colors.includes(colorId)) {
    throw new Error("That paint is not offered on this model.");
  }
  const current = await readAppearance();
  const next: AppearanceFile = {
    models: { ...current.models, [vehicleId]: modelId },
    colors: { ...current.colors, [vehicleId]: colorId },
    names: current.names,
  };
  await writeJson(dataPath("appearance.json"), next);
  return next;
}

export async function saveVehicleName(vehicleId: string, name: string | null): Promise<AppearanceFile> {
  return withActor(() => saveVehicleNameNow(vehicleId, name));
}

async function saveVehicleNameNow(vehicleId: string, name: string | null): Promise<AppearanceFile> {
  if (!VEHICLE_ID_PATTERN.test(vehicleId)) throw new Error("That vehicle id is not valid.");
  const current = await readAppearance();
  const names = { ...current.names };
  const trimmed = name?.trim().slice(0, 40) ?? "";
  if (!trimmed) delete names[vehicleId];
  else names[vehicleId] = trimmed;
  const next: AppearanceFile = { ...current, names };
  await writeJson(dataPath("appearance.json"), next);
  return next;
}
