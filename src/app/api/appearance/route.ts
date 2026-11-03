import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { readAppearance, saveAppearance } from "@/lib/appearance";
import { isColorId, isModelId } from "@/lib/car-photos";

const bodySchema = z.object({
  vehicleId: z.string().min(1).max(80),
  modelId: z.string().min(1).max(40),
  colorId: z.string().min(1).max(40),
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
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
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
