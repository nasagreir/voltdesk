export const MODEL_IDS = ["model-3", "model-y", "model-s", "model-x", "cybertruck"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const COLOR_IDS = [
  "pearl-white",
  "stealth-grey",
  "diamond-black",
  "ultra-red",
  "quicksilver",
  "marine-blue",
  "frost-blue",
  "lunar-silver",
  "stainless",
  "satin-white",
] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export interface Paint {
  id: ColorId;
  name: string;
  hex: string;
  note?: string;
}

export interface CarModel {
  id: ModelId;
  name: string;
  colors: readonly ColorId[];
}

const PAINT: Record<ColorId, Omit<Paint, "id">> = {
  "pearl-white": { name: "Pearl White", hex: "#F3F0E8" },
  "stealth-grey": { name: "Stealth Grey", hex: "#6A6D72" },
  "diamond-black": { name: "Diamond Black", hex: "#161618" },
  "ultra-red": { name: "Ultra Red", hex: "#9C1C30" },
  quicksilver: { name: "Quicksilver", hex: "#C5C8C6" },
  "marine-blue": { name: "Marine Blue", hex: "#1A3E6E" },
  "frost-blue": { name: "Frost Blue", hex: "#8EAFBF" },
  "lunar-silver": { name: "Lunar Silver", hex: "#A7ADB6" },
  stainless: { name: "Stainless", hex: "#C5C7C4", note: "Unpainted from the factory" },
  "satin-white": { name: "Satin White", hex: "#E6E3DB" },
};

const CURRENT: readonly ColorId[] = [
  "pearl-white",
  "stealth-grey",
  "diamond-black",
  "ultra-red",
  "quicksilver",
  "marine-blue",
  "frost-blue",
];

const FLAGSHIP: readonly ColorId[] = [
  "pearl-white",
  "stealth-grey",
  "diamond-black",
  "ultra-red",
  "lunar-silver",
  "frost-blue",
];

export const CAR_MODELS: readonly CarModel[] = [
  { id: "model-3", name: "Model 3", colors: CURRENT },
  { id: "model-y", name: "Model Y", colors: CURRENT },
  { id: "model-s", name: "Model S", colors: FLAGSHIP },
  { id: "model-x", name: "Model X", colors: FLAGSHIP },
  { id: "cybertruck", name: "Cybertruck", colors: ["stainless", "stealth-grey", "satin-white"] },
];

const MODEL_SET = new Set<string>(MODEL_IDS);
const COLOR_SET = new Set<string>(COLOR_IDS);

export function isModelId(value: string): value is ModelId {
  return MODEL_SET.has(value);
}

export function isColorId(value: string): value is ColorId {
  return COLOR_SET.has(value);
}

export function modelById(id: ModelId): CarModel {
  const model = CAR_MODELS.find((item) => item.id === id);
  if (!model) throw new Error("Unknown model");
  return model;
}

export function paintById(id: ColorId): Paint {
  return { id, ...PAINT[id] };
}

export function colorsFor(modelId: ModelId): Paint[] {
  return modelById(modelId).colors.map((id) => paintById(id));
}

export function carPhotoSrc(modelId: ModelId, colorId: ColorId): string {
  return `/cars/${modelId}/${colorId}.jpg`;
}

export function matchModel(input: string): ModelId | null {
  const text = input.toLowerCase();
  if (text.includes("cyber")) return "cybertruck";
  if (/\bmodel\s*x\b/.test(text) || text.includes("modelx")) return "model-x";
  if (/\bmodel\s*s\b/.test(text)) return "model-s";
  if (/\bmodel\s*y\b/.test(text) || text.includes("modely")) return "model-y";
  if (/\bmodel\s*3\b/.test(text) || text.includes("model3")) return "model-3";
  return null;
}

export function matchColor(reported: string, modelId: ModelId): ColorId {
  const offered = new Set(modelById(modelId).colors);
  const fallback = modelById(modelId).colors[0];
  const pick = (id: ColorId) => (offered.has(id) ? id : fallback);
  const text = reported.toLowerCase();
  if (!text.trim()) return fallback;
  if (text.includes("satin")) return pick("satin-white");
  if (text.includes("stainless") || text.includes("unpainted")) return pick("stainless");
  if (text.includes("lunar")) return pick("lunar-silver");
  if (text.includes("quicksilver")) return pick("quicksilver");
  if (text.includes("frost")) return pick("frost-blue");
  if (text.includes("marine") || text.includes("deep blue") || (text.includes("deep") && text.includes("blue"))) {
    return pick("marine-blue");
  }
  if (text.includes("pearl") || text.includes("white")) {
    return pick(modelId === "cybertruck" ? "satin-white" : "pearl-white");
  }
  if (text.includes("stealth") || text.includes("grey") || text.includes("gray")) return pick("stealth-grey");
  if (text.includes("black") || text.includes("diamond")) return pick("diamond-black");
  if (text.includes("garnet") || text.includes("red") || text.includes("ultra")) return pick("ultra-red");
  if (text.includes("silver")) return pick(offered.has("lunar-silver") ? "lunar-silver" : "quicksilver");
  if (text.includes("blue")) return pick(offered.has("marine-blue") ? "marine-blue" : "frost-blue");
  return fallback;
}

export function resolvePaint(input: {
  modelText: string;
  reportedColor: string;
  savedModel?: string | null;
  savedColor?: string | null;
}): { modelId: ModelId | null; colorId: ColorId | null } {
  const savedModel = input.savedModel && isModelId(input.savedModel) ? input.savedModel : null;
  const modelId = savedModel ?? matchModel(input.modelText);
  if (!modelId) return { modelId: null, colorId: null };
  const allowed = modelById(modelId).colors;
  const savedColor =
    input.savedColor && isColorId(input.savedColor) && allowed.includes(input.savedColor)
      ? input.savedColor
      : null;
  return { modelId, colorId: savedColor ?? matchColor(input.reportedColor, modelId) };
}
