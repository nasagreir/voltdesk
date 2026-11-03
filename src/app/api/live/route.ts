import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { isLiveData, liveDataUntilFrom } from "@/lib/live-data";
import { getSettings, setLiveDataUntil } from "@/lib/settings";
import { clearDashboardCache } from "@/lib/vehicle-service";

const bodySchema = z.object({
  enabled: z.boolean(),
});

export async function POST(request: Request) {
  await connection();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose whether live data should be on." }, { status: 400 });
  }
  const until = parsed.data.enabled ? liveDataUntilFrom() : null;
  await setLiveDataUntil(until);
  await clearDashboardCache();
  const settings = await getSettings();
  const live = isLiveData(settings.liveDataUntil);
  return NextResponse.json(
    { liveData: live, liveDataUntil: live ? settings.liveDataUntil : null },
    { headers: { "cache-control": "no-store" } },
  );
}
