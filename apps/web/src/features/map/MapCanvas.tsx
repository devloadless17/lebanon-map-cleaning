'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import type { MapCanvasProps } from './types';

// Both renderers touch `window` on import, so neither may be server-rendered. The Google bundle
// is only ever fetched when a key is actually configured.
const OpenMapCanvas = dynamic(() => import('./OpenMapCanvas').then((m) => m.OpenMapCanvas), {
  ssr: false,
});
const GoogleMapCanvas = dynamic(
  () => import('./google/GoogleMapCanvas').then((m) => m.GoogleMapCanvas),
  { ssr: false },
);

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? '';
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '';

/**
 * Picks a renderer and hides the choice from everything above it.
 *
 * The default needs no account, no API key and no billing: real OpenStreetMap data through
 * Carto's light basemap. Google is used only when a key AND a Map ID are both configured —
 * Advanced Markers require the Map ID, so a key on its own would fail at runtime rather than
 * degrade gracefully.
 */
export function MapCanvas(props: MapCanvasProps) {
  // Configuring Google is a REQUEST for Google, not a promise that it will work. Billing can be
  // unpaid, an API disabled, a referrer restriction wrong — and a scheduler staring at a blank
  // rectangle cannot plan a route. Falling back keeps the product working while the account is
  // sorted out.
  const [googleFailed, setGoogleFailed] = useState(false);
  const handleUnavailable = useCallback(() => setGoogleFailed(true), []);

  if (BROWSER_KEY && MAP_ID && !googleFailed) {
    return (
      <GoogleMapCanvas
        {...props}
        apiKey={BROWSER_KEY}
        mapId={MAP_ID}
        onUnavailable={handleUnavailable}
      />
    );
  }
  return <OpenMapCanvas {...props} />;
}

export type { MapCanvasProps, MapStop } from './types';
