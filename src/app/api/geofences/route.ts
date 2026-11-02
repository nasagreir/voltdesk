import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { resolveFences, writeFences } from "@/lib/places";
import { getSettings } from "@/lib/settings";
import { getDashboard } from "@/lib/vehicle-service";

const fenceSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().min(20).max(20000),
  costPerKwh: z.number().min(0).max(10),
  sessionFee: z.number().min(0).max(500),
});

export async function GET() {
  await connection();
  const settings = await getSettings();
  const dashboard = await getDashboard();
  const resolved = await resolveFences(settings, dashboard.mode);
  return NextResponse.json(resolved);
}

export async function POST(request: Request) {
  await connection();
  const parsed = z.object({ fences: z.array(fenceSchema).max(50) }).safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the place name, coordinates, and cost." }, { status: 400 });
  }
  const fences = parsed.data.fences.map((fence) => ({
    ...fence,
    id: fence.id.startsWith("new-") ? crypto.randomUUID() : fence.id,
  }));
  await writeFences(fences);
  return NextResponse.json({ fences, persisted: true });
}
