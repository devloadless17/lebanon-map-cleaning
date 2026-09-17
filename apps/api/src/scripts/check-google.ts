/**
 * Verifies a Google Maps setup and says plainly what is wrong when it is not working.
 *
 * Google's own errors are famously unhelpful ("REQUEST_DENIED"), and every failure mode — API
 * not enabled, billing not attached, wrong key type, key restricted to the wrong thing — looks
 * roughly the same from the outside. This maps each one to the actual fix.
 *
 *   npm run check:google
 */
import { haversineMetres, ROAD_WINDING_FACTOR } from '../domain/scheduling/geo.js';

const BEIRUT = { latitude: 33.8938, longitude: 35.5018 };
const SAIDA = { latitude: 33.5571, longitude: 35.3729 };

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const ok = (msg: string) => console.log(`${GREEN}  PASS${RESET}  ${msg}`);
const bad = (msg: string, fix: string) => {
  console.log(`${RED}  FAIL${RESET}  ${msg}`);
  console.log(`${DIM}        → ${fix}${RESET}`);
};

/** Turns Google's opaque refusals into the one thing you actually need to change. */
function explain(status: number, body: string): string {
  const text = body.toLowerCase();

  // Google phrases this differently per API: Routes says "API key not valid", Geocoding says
  // "The provided API key is invalid".
  if (
    text.includes('api key not valid') ||
    text.includes('api key is invalid') ||
    text.includes('api_key_invalid')
  ) {
    return 'The key itself is wrong. Re-copy it from Console → APIs & Services → Credentials.';
  }
  if (text.includes('billing')) {
    return 'Billing is not enabled on the project. Google returns nothing at all without a billing account, even inside the free tier.';
  }
  if (text.includes('referer') || text.includes('referrer')) {
    return 'This is the BROWSER key. GOOGLE_MAPS_SERVER_KEY must be the server key, restricted by IP, not by referrer.';
  }
  if (text.includes('not authorized') || text.includes('has not been used') || text.includes('is disabled')) {
    return 'That API is not enabled on this project. Enable it in Console → APIs & Services → Library.';
  }
  if (text.includes('ip') && text.includes('restrict')) {
    return 'The key is IP-restricted and this machine is not on the list. Add your current IP, or test from the server.';
  }
  if (status === 403) {
    return 'Permission denied — usually the API is not enabled, or the key restrictions exclude it.';
  }
  if (status === 429) {
    return 'Rate limited or over quota. Check the quota caps you set in the Console.';
  }
  return 'Check the raw response above against Console → APIs & Services → Credentials.';
}

async function checkGeocoding(key: string): Promise<boolean> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', 'Saida');
  url.searchParams.set('components', 'country:LB');
  url.searchParams.set('key', key);

  const response = await fetch(url);
  const body = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{ formatted_address?: string }>;
  };

  if (body.status === 'OK' && body.results?.[0]) {
    ok(`Geocoding API — "Saida" resolved to ${body.results[0].formatted_address}`);
    return true;
  }

  const detail = `${body.status ?? response.status} ${body.error_message ?? ''}`.trim();
  bad(`Geocoding API — ${detail}`, explain(response.status, detail));
  return false;
}

async function checkRoutes(key: string): Promise<boolean> {
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      // Pinned to Essentials fields only. A wildcard here silently promotes the request to a
      // more expensive tier as Google adds features.
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: BEIRUT.latitude, longitude: BEIRUT.longitude } } },
      destination: { location: { latLng: { latitude: SAIDA.latitude, longitude: SAIDA.longitude } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    bad(`Routes API — HTTP ${response.status}`, explain(response.status, raw));
    console.log(`${DIM}        ${raw.slice(0, 200)}${RESET}`);
    return false;
  }

  const body = JSON.parse(raw) as { routes?: Array<{ duration?: string; distanceMeters?: number }> };
  const route = body.routes?.[0];
  if (!route) {
    bad('Routes API — responded, but returned no route', 'Unexpected. Check the raw response.');
    return false;
  }

  const realMinutes = Math.round(Number.parseFloat((route.duration ?? '0s').replace('s', '')) / 60);
  const realKm = Math.round((route.distanceMeters ?? 0) / 1000);

  // Show what Google actually buys you, in the terms that matter for this product.
  const estimateKm = Math.round((haversineMetres(BEIRUT, SAIDA) * ROAD_WINDING_FACTOR) / 1000);
  const estimateMinutes = Math.round((estimateKm / 40) * 60);

  ok(`Routes API — Beirut to Saida: ${realKm} km, ${realMinutes} min by road`);
  console.log(
    `${DIM}        without Google this app estimates ${estimateKm} km / ${estimateMinutes} min` +
      ` (${realMinutes === 0 ? '?' : Math.round(((estimateMinutes - realMinutes) / realMinutes) * 100)}% off)${RESET}`,
  );
  return true;
}

async function checkRouteMatrix(key: string): Promise<boolean> {
  const response = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
    },
    body: JSON.stringify({
      origins: [
        { waypoint: { location: { latLng: { latitude: BEIRUT.latitude, longitude: BEIRUT.longitude } } } },
      ],
      destinations: [
        { waypoint: { location: { latLng: { latitude: SAIDA.latitude, longitude: SAIDA.longitude } } } },
      ],
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    bad(`Route Matrix — HTTP ${response.status}`, explain(response.status, raw));
    console.log(`${DIM}        ${raw.slice(0, 200)}${RESET}`);
    return false;
  }

  const elements = JSON.parse(raw) as Array<{ condition?: string }>;
  if (!Array.isArray(elements) || elements.length === 0) {
    bad('Route Matrix — responded, but returned no elements', 'Unexpected. Check the raw response.');
    return false;
  }

  // This is the call the scheduling engine leans on hardest, so it is worth proving separately.
  ok(`Route Matrix — returned ${elements.length} element(s)`);
  return true;
}

/**
 * The browser key is referrer-restricted, so these send a localhost Referer — the same one the
 * setup guide tells you to allow. A failure here is either the API not being enabled, or the
 * referrer list not matching, and the message says which.
 */
async function checkMapsJs(key: string, referer: string): Promise<boolean> {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=marker&loading=async`,
    { headers: { Referer: referer } },
  );
  const body = await response.text();

  // Google answers a rejected key with JS that just logs an error, not an HTTP failure.
  if (!response.ok || /ApiNotActivated|RefererNotAllowed|InvalidKey|ApiProjectMapError/i.test(body)) {
    const detail = /(\w*MapError|\w*ApiNotActivated\w*)/i.exec(body)?.[0] ?? `HTTP ${response.status}`;
    bad(`Maps JavaScript API — ${detail}`, explain(response.status, body));
    return false;
  }
  if (!body.includes('google.maps')) {
    bad('Maps JavaScript API — unexpected response', 'Check the key in the Console.');
    return false;
  }

  ok('Maps JavaScript API — loads (the map will render)');
  return true;
}

async function checkPlaces(key: string, referer: string): Promise<boolean> {
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, Referer: referer },
    body: JSON.stringify({ input: 'Hamra', includedRegionCodes: ['lb'] }),
  });
  const raw = await response.text();

  if (!response.ok) {
    bad(`Places API (New) — HTTP ${response.status}`, explain(response.status, raw));
    return false;
  }

  const body = JSON.parse(raw) as { suggestions?: Array<{ placePrediction?: { text?: { text?: string } } }> };
  const first = body.suggestions?.[0]?.placePrediction?.text?.text;
  ok(`Places API (New) — "Hamra" suggested ${first ?? '(no match, but the API answered)'}`);
  return true;
}

async function main(): Promise<void> {
  const key = process.env['GOOGLE_MAPS_SERVER_KEY']?.trim();
  const browserKey = process.env['NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY']?.trim();
  const mapId = process.env['NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID']?.trim();

  console.log('\nChecking the Google Maps setup\n');

  if (!key) {
    console.log(`${YELLOW}  GOOGLE_MAPS_SERVER_KEY is empty.${RESET}`);
    console.log(
      `${DIM}  That is a supported setup: the app runs on OpenStreetMap and straight-line\n` +
        `  estimates. Set the key in .env to switch on real road distances.${RESET}\n`,
    );
    return;
  }

  console.log(`${DIM}  SERVER KEY  ${key.slice(0, 6)}…${key.slice(-4)}  — road distances${RESET}`);
  const results = [
    await checkGeocoding(key),
    await checkRoutes(key),
    await checkRouteMatrix(key),
  ];

  // The browser half fails independently of the server half, and its failure is what leaves a
  // blank map — so it is worth reporting in the same run rather than discovering it later.
  if (browserKey) {
    const referer = process.env['FRONTEND_ORIGIN']?.trim() ?? 'http://localhost:4101';
    console.log(`\n${DIM}  BROWSER KEY ${browserKey.slice(0, 6)}…${browserKey.slice(-4)}  — the map itself${RESET}`);
    results.push(await checkMapsJs(browserKey, `${referer}/`));
    results.push(await checkPlaces(browserKey, `${referer}/`));

    if (mapId) {
      ok(`Map ID — set (${mapId})`);
    } else {
      // Not something we can verify over HTTP, but its absence is fatal to the custom pins.
      bad(
        'Map ID — not set',
        'NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID is required for the numbered pins. Create one under Google Maps Platform → Map Management.',
      );
      results.push(false);
    }
  } else {
    console.log(
      `\n${YELLOW}  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is empty — the map will use OpenStreetMap.${RESET}`,
    );
  }

  const passed = results.filter(Boolean).length;
  console.log('');
  if (passed === results.length) {
    console.log(`${GREEN}  All ${results.length} checks passed.${RESET}`);
    console.log(`${DIM}  Restart: npm run cache:clear, then stop and restart npm run dev.${RESET}\n`);
  } else {
    console.log(`${RED}  ${results.length - passed} of ${results.length} checks failed.${RESET}`);
    console.log(`${DIM}  Fix the items above, then run this again. Nothing else needs changing.${RESET}\n`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\n${RED}  Could not reach Google at all:${RESET}`, error instanceof Error ? error.message : error);
  console.error(`${DIM}  Check your network connection and try again.${RESET}\n`);
  process.exitCode = 1;
});
