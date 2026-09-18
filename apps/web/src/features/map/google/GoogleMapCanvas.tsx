'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { decodePolyline, PRECISION_METRES, type MapCanvasProps, type MapStop } from '../types';
import { LEBANON_BORDER } from '../lebanon-border';
import { loadGoogleMaps } from './loader';

/*
 * The team only works in Lebanon, so the map is confined to it: panning stops at the border and
 * zooming out stops once the country is on screen. Padded so the border and coast still read as
 * context rather than sitting hard against the edge.
 */
const LEBANON_RESTRICTION = {
  latLngBounds: { south: 32.85, west: 34.85, north: 34.95, east: 36.9 },
  strictBounds: false,
};
const LEBANON_CENTER = { lat: 33.85, lng: 35.75 };
const MIN_ZOOM = 8;

interface Props extends MapCanvasProps {
  readonly apiKey: string;
  readonly mapId: string;
  /** Called when Google cannot render at all, so the caller can fall back to the free map. */
  readonly onUnavailable: () => void;
}

/**
 * The ONLY file in the app that touches `google.maps`.
 *
 * Everything else talks to the MapCanvas contract, which is what makes the provider genuinely
 * replaceable rather than nominally abstracted.
 */
export function GoogleMapCanvas({
  stops,
  polyline,
  onSelect,
  onMapClick,
  className,
  apiKey,
  mapId,
  onUnavailable,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const circlesRef = useRef<Map<string, google.maps.Circle>>(new Map());
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [ready, setReady] = useState(false);
  const [markerNodes, setMarkerNodes] = useState<Map<string, HTMLDivElement>>(new Map());

  // Created exactly once. Re-creating the map is both a visible flash and another billable load.
  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        // `libraries=marker` in the loader URL means AdvancedMarkerElement is already present;
        // no importLibrary indirection needed.
        if (!google.maps.marker?.AdvancedMarkerElement) {
          throw new Error('Advanced Markers unavailable — check the marker library loaded');
        }

        mapRef.current = new google.maps.Map(containerRef.current, {
          center: LEBANON_CENTER,
          zoom: MIN_ZOOM,
          restriction: LEBANON_RESTRICTION,
          minZoom: MIN_ZOOM,
          // Required for Advanced Markers. Inline `styles[]` was decommissioned in 2025, so the
          // map's visual design lives in the Cloud console against this ID.
          mapId,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        });

        // Dim everything outside the country.
        //
        // `restriction` only stops the user panning away; it does not crop what is drawn, and
        // Lebanon is ~200 km tall by ~50 km wide, so filling a landscape pane vertically always
        // leaves a few hundred kilometres of Syria on screen. A world-sized polygon with a
        // Lebanon-shaped hole pushes the neighbours back without hiding them.
        new google.maps.Polygon({
          map: mapRef.current ?? undefined,
          paths: [
            [
              { lat: 40, lng: 28 }, { lat: 40, lng: 42 },
              { lat: 28, lng: 42 }, { lat: 28, lng: 28 },
            ],
            LEBANON_BORDER.map(([lat, lng]) => ({ lat, lng })),
          ],
          strokeWeight: 0,
          fillColor: '#f8fafc',
          fillOpacity: 0.72,
          clickable: false,
          zIndex: 1,
        });

        new google.maps.Polygon({
          map: mapRef.current ?? undefined,
          paths: LEBANON_BORDER.map(([lat, lng]) => ({ lat, lng })),
          strokeColor: '#94a3b8',
          strokeWeight: 1,
          strokeOpacity: 0.9,
          fillOpacity: 0,
          clickable: false,
          zIndex: 2,
        });

        setReady(true);
      })
      .catch((error: unknown) => {
        // Billing not enabled, API not enabled, or a referrer restriction that does not match.
        // Whatever the cause, a blank rectangle helps nobody — hand back to the free map.
        // Logged loudly, because a SILENT fallback is indistinguishable from never having
        // configured Google at all.
        console.error('[map] Google Maps unavailable, falling back to OpenStreetMap:', error);
        if (!cancelled) onUnavailable();
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, mapId, onUnavailable]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !onMapClick) return;

    const listener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      onMapClick({ latitude: event.latLng.lat(), longitude: event.latLng.lng() });
    });
    return () => listener.remove();
  }, [ready, onMapClick]);

  // Markers: create, update and destroy imperatively, keyed by stop id.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const seen = new Set(stops.map((s) => s.id));
    const nextNodes = new Map(markerNodes);
    let nodesChanged = false;

    for (const stop of stops) {
      let marker = markersRef.current.get(stop.id);
      if (!marker) {
        // One container node PER MARKER: AdvancedMarkerElement does not clone the node it is
        // given, so sharing one would silently blank the other marker.
        const node = document.createElement('div');
        marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          content: node,
          position: { lat: stop.coordinate.latitude, lng: stop.coordinate.longitude },
          gmpClickable: true,
        });
        // addListener('click') is deprecated on advanced markers in favour of the gmp- events.
        marker.addEventListener('gmp-click', () => onSelect?.(stop.id));
        markersRef.current.set(stop.id, marker);
        nextNodes.set(stop.id, node);
        nodesChanged = true;
      } else {
        marker.position = { lat: stop.coordinate.latitude, lng: stop.coordinate.longitude };
      }

      syncCircle(map, circlesRef.current, stop);
    }

    for (const [id, marker] of markersRef.current) {
      if (seen.has(id)) continue;
      marker.map = null;
      markersRef.current.delete(id);
      circlesRef.current.get(id)?.setMap(null);
      circlesRef.current.delete(id);
      nextNodes.delete(id);
      nodesChanged = true;
    }

    if (nodesChanged) setMarkerNodes(nextNodes);
  }, [ready, stops, onSelect, markerNodes]);

  // Route: real road geometry when we have it, straight connectors while experimenting.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const path = polyline
      ? decodePolyline(polyline).map((c) => ({ lat: c.latitude, lng: c.longitude }))
      : stops
          .filter((s) => s.kind !== 'proposal')
          .map((s) => ({ lat: s.coordinate.latitude, lng: s.coordinate.longitude }));

    polylineRef.current?.setMap(null);
    if (path.length < 2) return;

    // Drawn by us rather than by DirectionsRenderer, so the map looks like our product and
    // needs no browser-side routing call.
    polylineRef.current = new google.maps.Polyline({
      map,
      path,
      strokeColor: '#4338ca',
      strokeOpacity: polyline ? 0.85 : 0.5,
      strokeWeight: 4,
      ...(polyline ? {} : { strokeOpacity: 0, icons: dashedIcons() }),
    });
  }, [ready, polyline, stops]);

  // Fit the route when its shape changes, but leave the user free to pan and zoom afterwards.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || stops.length === 0) return;

    // Fewer than two DISTINCT points has no extent, and Google answers that by slamming to
    // maximum zoom — one building filling the screen. Settings (the depot) resolve before the
    // day's appointments, so without this it fires on every single load, not just empty days.
    // The OpenStreetMap renderer already guards this; the guard was never ported here.
    const distinct = new Set(
      stops.map((s) => `${s.coordinate.latitude.toFixed(4)},${s.coordinate.longitude.toFixed(4)}`),
    );
    if (distinct.size < 2) {
      map.fitBounds(LEBANON_RESTRICTION.latLngBounds, 24);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    for (const stop of stops) {
      bounds.extend({ lat: stop.coordinate.latitude, lng: stop.coordinate.longitude });
    }
    map.fitBounds(bounds, 64);
    // Matches the other renderer: several stops in one town should not zoom to street level and
    // lose the sense of where in the country the day is happening.
    const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > 12) map.setZoom(12);
    });
    return () => listener.remove();
  }, [ready, stops.length]);

  // Two stops at one doorstep land on the same point and the upper one hides the lower — which
  // the brief's own example produces: Khalde on the way out and Khalde again on the way home.
  const offsets = spreadCoincident(stops);

  return (
    <div className={className}>
      <div ref={containerRef} className="h-full w-full" />
      {stops.map((stop) => {
        const node = markerNodes.get(stop.id);
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
 * Fans out markers sharing a point, deterministically so the arrangement never jitters between
 * renders. Purely visual — the stored coordinates are untouched and nothing reaches routing.
 */
function spreadCoincident(stops: readonly MapStop[]): Map<string, { dx: number; dy: number }> {
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

/** A real React component rendered into the marker, so pins use our design system. */
function StopPin({ stop, offset }: { stop: MapStop; offset: { dx: number; dy: number } }) {
  const isDepot = stop.kind === 'depot';
  const isProposal = stop.kind === 'proposal';

  return (
    <div
      // Depot label ABOVE its pin, stops below: the depot sits a few km from the first
      // stop, so at country zoom two labels under two pins overlap into an unreadable
      // pile right where the eye lands.
      className={`flex items-center gap-1 ${isDepot ? 'flex-col-reverse' : 'flex-col'}`}
      style={{ transform: `translate(${offset.dx}px, calc(-50% + ${offset.dy}px))` }}
    >
      <div
        className={[
          'flex items-center justify-center rounded-full text-xs font-semibold shadow-md',
          isDepot ? 'h-6 w-6 bg-[#1c1917] text-white' : 'h-8 w-8',
          isProposal
            ? 'border-2 border-dashed border-[#4338ca] bg-white text-[#4338ca]'
            : !isDepot && 'bg-[#4338ca] text-white',
          stop.selected ? 'ring-2 ring-[#1c1917] ring-offset-2' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {stop.sequence ?? (isDepot ? '◆' : '+')}
      </div>
      <span className="rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-[#1c1917] shadow-sm">
        {stop.time ?? stop.label}
      </span>
    </div>
  );
}

function syncCircle(
  map: google.maps.Map,
  circles: Map<string, google.maps.Circle>,
  stop: MapStop,
): void {
  const radius = stop.precision ? PRECISION_METRES[stop.precision] : 0;
  const existing = circles.get(stop.id);

  if (radius <= 0) {
    existing?.setMap(null);
    circles.delete(stop.id);
    return;
  }

  const center = { lat: stop.coordinate.latitude, lng: stop.coordinate.longitude };
  if (existing) {
    existing.setCenter(center);
    existing.setRadius(radius);
    return;
  }

  circles.set(
    stop.id,
    new google.maps.Circle({
      map,
      center,
      radius,
      strokeColor: '#4338ca',
      strokeOpacity: 0.25,
      strokeWeight: 1,
      fillColor: '#4338ca',
      fillOpacity: 0.08,
      clickable: false,
    }),
  );
}

function dashedIcons(): google.maps.IconSequence[] {
  return [
    {
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 0.7,
        strokeColor: '#4338ca',
        strokeWeight: 4,
        scale: 3,
      },
      offset: '0',
      repeat: '18px',
    },
  ];
}
