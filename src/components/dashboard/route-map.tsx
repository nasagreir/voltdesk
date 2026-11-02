export function RouteMap({
  points,
  className = "h-56",
}: {
  points: Array<{ lat: number; lng: number }>;
  className?: string;
}) {
  const usable = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (usable.length === 0) {
    return <p className="text-sm text-muted-foreground">No coordinates for this trip.</p>;
  }
  const lats = usable.map((point) => point.lat);
  const lngs = usable.map((point) => point.lng);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  if (maxLat - minLat < 0.01) {
    minLat -= 0.008;
    maxLat += 0.008;
  }
  if (maxLng - minLng < 0.01) {
    minLng -= 0.008;
    maxLng += 0.008;
  }
  const width = 640;
  const height = 280;
  const pad = 24;
  const x = (lng: number) => pad + ((lng - minLng) / (maxLng - minLng)) * (width - pad * 2);
  const y = (lat: number) => pad + (1 - (lat - minLat) / (maxLat - minLat)) * (height - pad * 2);
  const line = usable.map((point) => `${x(point.lng).toFixed(1)},${y(point.lat).toFixed(1)}`).join(" ");
  const start = usable[0];
  const end = usable[usable.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`w-full rounded-xl bg-white/5 ${className}`} role="img" aria-label="Route">
      <polyline fill="none" stroke="#e31937" strokeWidth="3" points={line} />
      {usable.length > 2 &&
        usable.map((point, index) => (
          <circle key={`${point.lat}-${point.lng}-${index}`} cx={x(point.lng)} cy={y(point.lat)} r="2" fill="#f4f4f5" opacity="0.45" />
        ))}
      <circle cx={x(start.lng)} cy={y(start.lat)} r="5" fill="#3dd68c" />
      <circle cx={x(end.lng)} cy={y(end.lat)} r="5" fill="#e31937" />
    </svg>
  );
}
