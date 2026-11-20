'use client';

import { useEffect } from 'react';

/**
 * Last resort: the root layout itself failed, so no stylesheet, font, or theme
 * class can be assumed. Colours are literal and follow the system scheme.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[portal] root layout error', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          colorScheme: 'light dark',
          background: 'Canvas',
          color: 'CanvasText',
        }}
      >
        <div role="alert" style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>The portal could not load.</h1>
          <p style={{ fontSize: 14, margin: '12px 0 20px' }}>
            Nothing was lost. Try again, or refresh the page if it keeps happening.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              font: 'inherit',
              fontSize: 14,
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid currentColor',
              background: 'transparent',
              color: 'inherit',
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
