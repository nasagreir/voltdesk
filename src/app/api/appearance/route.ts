import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { readAppearance, saveAppearance, saveCarScene } from "@/lib/appearance";
import { isColorId, isModelId } from "@/lib/car-photos";

const paintSchema = z.object({
  vehicleId: z.string().min(1).max(80),
  modelId: z.string().min(1).max(40),
  colorId: z.string().min(1).max(40),
});

const sceneSchema = z.object({
  scene: z.enum(["photo", "model"]),
});

export async function GET() {
  await connection();
  try {
    return NextResponse.json(await readAppearance(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load paint choices" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  await connection();
  const raw = await request.json().catch(() => null);
  if (raw && typeof raw === "object" && "scene" in raw) {
    const parsed = sceneSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose the photo or the 3D model." }, { status: 400 });
    }
    try {
      const appearance = await saveCarScene(parsed.data.scene);
      return NextResponse.json(appearance, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not save the car view" },
        { status: 400 },
      );
    }
  }
  const parsed = paintSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a model and a paint color." }, { status: 400 });
  }
  const { vehicleId, modelId, colorId } = parsed.data;
  if (!isModelId(modelId) || !isColorId(colorId)) {
    return NextResponse.json({ error: "That paint is not on the list." }, { status: 400 });
  }
  try {
    const appearance = await saveAppearance(vehicleId, modelId, colorId);
    return NextResponse.json(appearance, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save that paint" },
      { status: 400 },
    );
  }
}
