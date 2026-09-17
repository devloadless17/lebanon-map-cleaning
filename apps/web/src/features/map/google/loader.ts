let loaderPromise: Promise<void> | null = null;

const CALLBACK_NAME = '__lebanonCleaningMapsReady';

/**
 * Loads the Maps JS API once per page and resolves when it is genuinely ready to use.
 *
 * Uses the documented `callback=` parameter rather than `importLibrary()`. That function is
 * defined only by Google's inline bootstrap snippet — with a plain script tag it does not
 * exist, and calling it throws `importLibrary is not a function` after the script has
 * apparently loaded fine. Requesting `libraries=marker` in the URL makes
 * `google.maps.marker.AdvancedMarkerElement` available directly, which is all we need.
 *
 * Idempotent on purpose: a map LOAD is the billable event, while panning and zooming are free,
 * so the thing to avoid is ever loading twice.
 */
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Google Maps can only load in the browser'));
      return;
    }

    // Already present from an earlier mount (React StrictMode double-invokes effects in dev).
    if (window.google?.maps?.Map) {
      resolve();
      return;
    }

    const globals = window as unknown as Record<string, unknown>;
    globals[CALLBACK_NAME] = () => {
      delete globals[CALLBACK_NAME];
      resolve();
    };

    const script = document.createElement('script');
    script.id = 'google-maps-bootstrap';
    script.async = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      // `loading=async` is still the recommended pattern alongside `callback=`; without it
      // Google logs a performance warning on every load.
      `&libraries=marker&v=weekly&loading=async&callback=${CALLBACK_NAME}`;
    script.addEventListener('error', () => {
      loaderPromise = null; // let a later attempt retry rather than caching the failure forever
      reject(new Error('Google Maps failed to load'));
    });
    document.head.appendChild(script);
  });

  return loaderPromise;
}
