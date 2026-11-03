/** Highest reading on a drive, and average speed as miles divided by time driving. */
export function speedOverDrives(
  drives: readonly { distanceMi: number; durationMin: number; maxSpeedMph: number }[],
): {
  driveCount: number;
  distanceMi: number;
  driveMinutes: number;
  avgSpeedMph: number | null;
  maxSpeedMph: number | null;
} {
  const distanceMi = drives.reduce((sum, drive) => sum + drive.distanceMi, 0);
  const driveMinutes = drives.reduce((sum, drive) => sum + drive.durationMin, 0);
  const peaks = drives.map((drive) => drive.maxSpeedMph).filter((speed) => Number.isFinite(speed));
  return {
    driveCount: drives.length,
    distanceMi,
    driveMinutes,
    avgSpeedMph: driveMinutes > 0 ? distanceMi / (driveMinutes / 60) : null,
    maxSpeedMph: peaks.length ? Math.max(...peaks) : null,
  };
}
