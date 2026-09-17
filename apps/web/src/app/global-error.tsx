'use client';

/**
 * Replaces Next's built-in global error boundary.
 *
 * It must render its own <html>/<body>, because at this point the root layout has itself
 * failed. Deliberately dependency-free: a boundary that needs a provider cannot be trusted to
 * render when the provider is what broke.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          background: '#fbfbfa',
          color: '#1c1917',
        }}
      >
        <div style={{ maxWidth: '28rem', padding: '1.5rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: '0.5rem', color: '#57534e', fontSize: '0.875rem' }}>
            The page could not be displayed. Your schedule data has not been affected.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.25rem',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#4338ca',
              color: '#fff',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
