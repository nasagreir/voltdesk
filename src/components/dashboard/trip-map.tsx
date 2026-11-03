"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

export type TripLine = {
  id: string;
  path: Array<{ lat: number; lng: number }>;
};

type LeafletApi = typeof import("leaflet");

function usable(path: TripLine["path"]) {
  return path.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function paint(
  leaflet: LeafletApi,
  map: LeafletMap,
  group: LayerGroup,
  trips: TripLine[],
  selectedId: string | null,
  onSelect: ((id: string) => void) | undefined,
) {
  group.clearLayers();
  const lines = trips
    .map((trip) => ({ ...trip, path: usable(trip.path) }))
    .filter((trip) => trip.path.length > 0);
  const selected = lines.find((trip) => trip.id === selectedId) ?? null;
  const ordered = selected ? [...lines.filter((trip) => trip.id !== selected.id), selected] : lines;
  for (const trip of ordered) {
    const active = trip.id === selected?.id;
    const latlngs = trip.path.map((point) => leaflet.latLng(point.lat, point.lng));
    if (latlngs.length > 1) {
      const line = leaflet.polyline(latlngs, {
        color: active || !selected ? "#e31937" : "#a1a1aa",
        weight: active || !selected ? 4 : 3,
        opacity: active || !selected ? 0.95 : 0.55,
      });
      line.on("click", () => onSelect?.(trip.id));
      line.addTo(group);
    }
    if (active || (!selected && lines.length === 1)) {
      const start = latlngs[0];
      const end = latlngs[latlngs.length - 1];
      leaflet.circleMarker(start, { radius: 6, color: "#052e16", weight: 1, fillColor: "#3dd68c", fillOpacity: 1 }).addTo(group);
      leaflet.circleMarker(end, { radius: 6, color: "#450a0a", weight: 1, fillColor: "#e31937", fillOpacity: 1 }).addTo(group);
    }
  }
  const focus = selected ? selected.path : lines.flatMap((trip) => trip.path);
  if (focus.length === 0) {
    map.setView([41.9482, -87.6684], 11);
    return;
  }
  const bounds = leaflet.latLngBounds(focus.map((point) => [point.lat, point.lng]));
  if (!bounds.isValid()) return;
  if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
    map.setView(bounds.getCenter(), 14);
    return;
  }
  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
}

export function TripMap({
  trips,
  selectedId,
  onSelect,
  className = "h-64 min-[720px]:h-[28rem] short:h-40",
}: {
  trips: TripLine[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<LeafletApi | null>(null);
  const dataRef = useRef({ trips, selectedId, onSelect });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = node.current;
    if (!host) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    if (!document.querySelector("link[data-voltdesk-leaflet]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/leaflet/leaflet.css";
      link.dataset.voltdeskLeaflet = "true";
      document.head.appendChild(link);
    }
    void (async () => {
      try {
        const loaded = await import("leaflet");
        const leaflet = (loaded.default ?? loaded) as LeafletApi;
        if (cancelled || !node.current || typeof leaflet.map !== "function") return;
        const map = leaflet.map(node.current, { zoomControl: true, attributionControl: true });
        if (cancelled) {
          map.remove();
          return;
        }
        leaflet
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap",
            maxZoom: 19,
          })
          .addTo(map);
        const group = leaflet.layerGroup().addTo(map);
        mapRef.current = map;
        groupRef.current = group;
        leafletRef.current = leaflet;
        const latest = dataRef.current;
        paint(leaflet, map, group, latest.trips, latest.selectedId, latest.onSelect);
        observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(node.current);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      groupRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    dataRef.current = { trips, selectedId, onSelect };
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!leaflet || !map || !group) return;
    paint(leaflet, map, group, trips, selectedId, onSelect);
  }, [trips, selectedId, onSelect]);

  return (
    <div className="relative">
      <div ref={node} className={`w-full overflow-hidden rounded-xl ${className}`} role="img" aria-label="Trips on a map" />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          The map could not be loaded.
        </p>
      )}
    </div>
  );
}
