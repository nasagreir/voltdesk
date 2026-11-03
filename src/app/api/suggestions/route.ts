import { headers } from "next/headers";
import { connection, NextResponse } from "next/server";
import { readMaintenanceFile } from "@/lib/maintenance-store";
import { evaluateMaintenance, resolveMaintenance } from "@/lib/maintenance";
import { environmentApplies, environmentGrokKey, getSettings } from "@/lib/settings";
import { suggestionCacheKey, suggestionsFor, type SuggestionFacts } from "@/lib/suggestions";
import { chicagoYMD } from "@/lib/time";
import { getDashboard } from "@/lib/vehicle-service";

export async function GET(request: Request) {
  await connection();
  try {
    const applyEnv = await environmentApplies();
    const [dash, settings, envKey] = await Promise.all([
      getDashboard(),
      getSettings(),
      applyEnv ? environmentGrokKey() : Promise.resolve(""),
    ]);
    const vehicleId = new URL(request.url).searchParams.get("vehicle");
    const vehicle = dash.vehicles.find((item) => item.id === vehicleId) ?? dash.vehicles[0];
    if (!vehicle) {
      return NextResponse.json({ error: "No vehicle in this feed yet." }, { status: 404 });
    }
    const now = new Date();
    const saved = await readMaintenanceFile();
    const state = resolveMaintenance(saved, dash.mode, now, vehicle.odometerMi);
    const service = evaluateMaintenance({
      now,
      odometerMi: vehicle.odometerMi,
      model: vehicle.model,
      state,
      distanceUnit: dash.units.distance,
    });
    const facts: SuggestionFacts = {
      id: vehicle.id,
      model: vehicle.model,
      state: vehicle.state,
      batteryPercent: vehicle.batteryPercent,
      chargeLimitPercent: vehicle.chargeLimitPercent,
      odometerMi: vehicle.odometerMi,
      tpmsPsi: [vehicle.tpmsPsi.fl, vehicle.tpmsPsi.fr, vehicle.tpmsPsi.rl, vehicle.tpmsPsi.rr],
      softwareVersion: vehicle.softwareVersion,
      updateAvailable: vehicle.updateAvailable,
      climateOn: vehicle.climateOn,
      sentry: vehicle.sentry,
      atHome: vehicle.atHome,
      outsideTempC: vehicle.outsideTempC,
      service,
    };
    const day = chicagoYMD(now);
    const key = settings.grokApiKey || envKey;
    const user = (await headers()).get("x-voltdesk-user") ?? "";
    const payload = await suggestionsFor(
      key,
      facts,
      `${user}|${suggestionCacheKey(facts, `${day.y}-${day.m}-${day.d}`)}`,
    );
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Suggestions failed" },
      { status: 500 },
    );
  }
}
