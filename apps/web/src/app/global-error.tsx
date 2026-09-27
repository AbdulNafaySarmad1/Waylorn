'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
        <h1>Waylorn could not render this page</h1>
        <p>Equipment and site operations are unaffected by this interface error.</p>
        {error.digest ? <p>Reference: <code>{error.digest}</code></p> : null}
        <button type="button" onClick={reset}>
          Try again
        </button>
      </body>
    </html>
  );
}
