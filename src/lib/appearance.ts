import { isColorId, isModelId, modelById, type ColorId, type ModelId } from "@/lib/car-photos";
import { dataPath, readJson, writeJson } from "@/lib/store";

export interface AppearanceFile {
  colors: Record<string, ColorId>;
  models: Record<string, ModelId>;
}

const EMPTY: AppearanceFile = { colors: {}, models: {} };

export const VEHICLE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

export function sanitizeAppearance(raw: unknown): AppearanceFile {
  if (!raw || typeof raw !== "object") return { colors: {}, models: {} };
  const body = raw as { colors?: unknown; models?: unknown };
  const models: AppearanceFile["models"] = {};
  const colors: AppearanceFile["colors"] = {};
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
  return { colors, models };
}

export async function readAppearance(): Promise<AppearanceFile> {
  return sanitizeAppearance(await readJson(dataPath("appearance.json"), EMPTY));
}

export async function saveAppearance(vehicleId: string, modelId: ModelId, colorId: ColorId): Promise<AppearanceFile> {
  if (!VEHICLE_ID_PATTERN.test(vehicleId)) throw new Error("That vehicle id is not valid.");
  if (!modelById(modelId).colors.includes(colorId)) {
    throw new Error("That paint is not offered on this model.");
  }
  const current = await readAppearance();
  const next: AppearanceFile = {
    models: { ...current.models, [vehicleId]: modelId },
    colors: { ...current.colors, [vehicleId]: colorId },
  };
  await writeJson(dataPath("appearance.json"), next);
  return next;
}
