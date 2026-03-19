'use client'

/**
 * Global Error Boundary for Root Layout Errors
 *
 * WHY: Catches errors that occur in the root layout (which error.tsx cannot catch)
 * HOW: Must include its own <html> and <body> tags since root layout failed
 *
 * PRODUCTION DEBUGGING:
 * Shows full error details for debugging production issues.
 * TODO: Remove detailed error display after debugging is complete
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Log to console immediately
  console.error('=== ROOT LAYOUT ERROR ===')
  console.error('Message:', error.message)
  console.error('Digest:', error.digest)
  console.error('Stack:', error.stack)
  console.error('=========================')

  return (
    <html lang="en">
      <body style={{
        margin: 0,
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#0a0a0a',
        color: '#fafafa',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ maxWidth: '600px', width: '100%' }}>
          <h1 style={{ color: '#ef4444', marginBottom: '1rem' }}>
            Critical Error
          </h1>

          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
          }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '12px', color: '#ef4444', textTransform: 'uppercase' }}>
              Error Message
            </p>
            <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '14px', wordBreak: 'break-all' }}>
              {error.message || 'Unknown error'}
            </p>

            {error.digest && (
              <>
                <p style={{ margin: '1rem 0 0.5rem', fontSize: '12px', color: '#ef4444', textTransform: 'uppercase' }}>
                  Digest
                </p>
                <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '14px' }}>
                  {error.digest}
                </p>
              </>
            )}

            {error.stack && (
              <>
                <p style={{ margin: '1rem 0 0.5rem', fontSize: '12px', color: '#ef4444', textTransform: 'uppercase' }}>
                  Stack Trace
                </p>
                <pre style={{
                  margin: 0,
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  overflow: 'auto',
                  maxHeight: '200px',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  color: '#a1a1aa',
                }}>
                  {error.stack}
                </pre>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#fafafa',
                color: '#0a0a0a',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                color: '#fafafa',
                border: '1px solid #27272a',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Go Home
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
