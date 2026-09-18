'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PRECISION_METRES, decodePolyline, type MapCanvasProps, type MapStop } from './types';
import { LEBANON_BORDER } from './lebanon-border';

/*
 * The team only ever works in Lebanon, so the map is confined to it: panning stops at the
 * border and zooming out stops once the whole country is on screen. A world map you can drag
 * away from is just an opportunity to get lost.
 *
 * Padded by roughly a quarter degree so the country is not jammed against the edges and the
 * border and coastline still read as context.
 */
const LEBANON_BOUNDS: L.LatLngBoundsLiteral = [
  [32.85, 34.85], // south-west, out into the sea
  [34.95, 36.90], // north-east, past the Bekaa
];

const MAX_ZOOM = 18;

/*
 * Plain raster tiles from OpenStreetMap: a real map of Lebanon with streets and place names,
 * needing no account, no API key and no billing.
 *
 * Raster rather than vector deliberately. Vector basemaps (MapLibre) parse tiles in a Web
 * Worker, and that worker does not start under this project's bundler — the style loads, the
 * canvas sizes correctly, and not a single tile is ever fetched. Raster tiles are just images:
 * no worker, no WebGL, nothing to go wrong.
 *
 * Overridable so a busier deployment can point at a paid or self-hosted provider without
 * touching code. OSM's tile policy is fine for one team's daily planning, but it is not a CDN
 * for heavy traffic.
 */
const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function OpenMapCanvas({ stops, polyline, onSelect, onMapClick, className, focus }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const circlesRef = useRef(new Map<string, L.Circle>());
  const routeRef = useRef<L.Polyline | null>(null);
  const nodesRef = useRef(new Map<string, HTMLDivElement>());
  const fittedRef = useRef('');
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const clickRef = useRef(onMapClick);
  const selectRef = useRef(onSelect);
  // Leaflet builds its marker elements outside React, so the portals need one nudge once those
  // elements exist.
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  // Held in refs so changing a handler never tears the map down and rebuilds it.
  clickRef.current = onMapClick;
  selectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      maxZoom: MAX_ZOOM,
    });
    // Frame the country, then make that the floor: zoom in freely, never back out past it.
    // Measured rather than hardcoded, because the fitting zoom depends on the window size.
    // Same ordering as the Google renderer: frame the country, read the resulting zoom, then
    // lock it as the floor and switch panning limits on.
    if (focusRef.current) {
      map.setView(
        [focusRef.current.coordinate.latitude, focusRef.current.coordinate.longitude],
        focusRef.current.zoom,
      );
    } else {
      map.fitBounds(LEBANON_BOUNDS);
    }
    map.setMinZoom(Math.min(map.getZoom(), 8));
    map.setMaxBounds(L.latLngBounds(LEBANON_BOUNDS).pad(0.25));
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: MAX_ZOOM }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Same treatment as the Google renderer: a world-sized polygon with a Lebanon-shaped hole,
    // so the surrounding countries recede instead of competing with the route.
    const hole = LEBANON_BORDER.map(([lat, lng]) => [lat, lng] as L.LatLngTuple);
    L.polygon(
      [
        [[40, 28], [40, 42], [28, 42], [28, 28]] as L.LatLngTuple[],
        hole,
      ],
      { stroke: false, fillColor: '#f8fafc', fillOpacity: 0.72, interactive: false },
    ).addTo(map);
    L.polygon(hole, {
      color: '#94a3b8', weight: 1, opacity: 0.9, fill: false, interactive: false,
    }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      clickRef.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });

    mapRef.current = map;
    rerender();

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      circlesRef.current.clear();
      nodesRef.current.clear();
    };
  }, [rerender]);

  // Markers, keyed by stop id: created, moved and removed imperatively.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set(stops.map((s) => s.id));
    let changed = false;

    for (const stop of stops) {
      const position: L.LatLngTuple = [stop.coordinate.latitude, stop.coordinate.longitude];
      // Keeps the selected stop, then the proposal, reachable above the rest.
      const zIndex = stop.selected ? 1000 : stop.kind === 'proposal' ? 900 : 0;
      const existing = markersRef.current.get(stop.id);

      if (existing) {
        existing.setLatLng(position);
        existing.setZIndexOffset(zIndex);
      } else {
        // One element per marker, which React renders into through a portal below.
        const node = document.createElement('div');
        nodesRef.current.set(stop.id, node);
        const marker = L.marker(position, {
          icon: L.divIcon({ html: node, className: '!bg-transparent !border-0', iconSize: [0, 0] }),
          zIndexOffset: zIndex,
        }).addTo(map);
        marker.on('click', () => selectRef.current?.(stop.id));
        markersRef.current.set(stop.id, marker);
        changed = true;
      }

      syncCircle(map, circlesRef.current, stop, position);
    }

    for (const [id, marker] of markersRef.current) {
      if (seen.has(id)) continue;
      marker.remove();
      markersRef.current.delete(id);
      circlesRef.current.get(id)?.remove();
      circlesRef.current.delete(id);
      nodesRef.current.delete(id);
      changed = true;
    }

    if (changed) rerender();
  }, [stops, rerender]);

  // Route: real road geometry once settled, straight connectors while experimenting.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    routeRef.current?.remove();
    routeRef.current = null;

    const path: L.LatLngTuple[] = polyline
      ? decodePolyline(polyline).map((c) => [c.latitude, c.longitude])
      : stops
          .filter((s) => s.kind !== 'proposal')
          .map((s) => [s.coordinate.latitude, s.coordinate.longitude]);

    if (path.length < 2) return;

    routeRef.current = L.polyline(path, {
      color: '#4338ca',
      weight: 4,
      opacity: polyline ? 0.9 : 0.65,
      // Dashed while still a straight-line approximation, so the map never implies a precision
      // it does not have.
      dashArray: polyline ? undefined : '10 8',
      lineJoin: 'round',
    }).addTo(map);
  }, [polyline, stops]);

  // Deliberately no per-day refit: every route is inside Lebanon and Lebanon is always in
  // frame, so refitting only made the map lurch between dates.

  // Two stops at one doorstep — or two locality-precision pins sharing a centroid — land on the
  // exact same point, and the upper one hides the lower entirely. The brief's own example does
  // this: Khalde on the way out and Khalde again on the way home.
  const offsets = spreadCoincident(stops);

  return (
    <div className={className}>
      <div ref={containerRef} className="h-full w-full" />
      {stops.map((stop) => {
        const node = nodesRef.current.get(stop.id);
        return node
          ? createPortal(
              <StopPin stop={stop} offset={offsets.get(stop.id) ?? { dx: 0, dy: 0 }} />,
              node,
              stop.id,
            )
          : null;
      })}
    </div>
  );
}

/**
 * Fans out markers that share a point, deterministically so the arrangement never jitters
 * between renders. Purely visual — the stored coordinates are never touched, and nothing is
 * fed back into routing.
 */
function spreadCoincident(
  stops: readonly MapStop[],
): Map<string, { dx: number; dy: number }> {
  const groups = new Map<string, MapStop[]>();
  for (const stop of stops) {
    const key = `${stop.coordinate.latitude.toFixed(4)},${stop.coordinate.longitude.toFixed(4)}`;
    const group = groups.get(key);
    if (group) group.push(stop);
    else groups.set(key, [stop]);
  }

  const offsets = new Map<string, { dx: number; dy: number }>();
  const RADIUS = 24;
  for (const group of groups.values()) {
    if (group.length === 1) {
      offsets.set(group[0]!.id, { dx: 0, dy: 0 });
      continue;
    }
    group.forEach((stop, index) => {
      const angle = (index / group.length) * Math.PI * 2 - Math.PI / 2;
      offsets.set(stop.id, { dx: Math.cos(angle) * RADIUS, dy: Math.sin(angle) * RADIUS });
    });
  }
  return offsets;
}

/** A real React component inside the marker, so pins use our own design system. */
function StopPin({ stop, offset }: { stop: MapStop; offset: { dx: number; dy: number } }) {
  const isDepot = stop.kind === 'depot';
  const isProposal = stop.kind === 'proposal';

  return (
    <div
      // Depot label ABOVE its pin, stops below — otherwise the two collide at country zoom.
      className={`flex cursor-pointer items-center ${isDepot ? 'flex-col-reverse' : 'flex-col'}`}
      style={{ transform: `translate(calc(-50% + ${offset.dx}px), calc(-50% + ${offset.dy}px))` }}
    >
      <div
        className={[
          'flex items-center justify-center rounded-full text-xs font-semibold shadow-md ring-2 ring-white',
          isDepot ? 'h-6 w-6 bg-ink text-white' : 'h-8 w-8',
          isProposal
            ? 'border-2 border-dashed border-accent bg-white text-accent'
            : !isDepot
              ? 'bg-accent text-white'
              : '',
          stop.selected ? 'ring-4 ring-ink' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {stop.sequence ?? (isDepot ? '◆' : '+')}
      </div>
      <span className="mt-1 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-ink shadow-sm">
        {stop.time ?? stop.label}
      </span>
    </div>
  );
}

/** How much we do NOT know about this location, drawn to scale on the ground. */
function syncCircle(
  map: L.Map,
  circles: Map<string, L.Circle>,
  stop: MapStop,
  position: L.LatLngTuple,
): void {
  const radius = stop.precision ? PRECISION_METRES[stop.precision] : 0;
  const existing = circles.get(stop.id);

  if (radius <= 0) {
    existing?.remove();
    circles.delete(stop.id);
    return;
  }

  if (existing) {
    existing.setLatLng(position);
    existing.setRadius(radius);
    return;
  }

  circles.set(
    stop.id,
    L.circle(position, {
      radius,
      color: '#4338ca',
      weight: 1,
      opacity: 0.3,
      fillColor: '#4338ca',
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(map),
  );
}
