'use client'

/**
 * Global Error Boundary
 *
 * WHY: Catches all unhandled errors in the app and displays them
 * HOW: Next.js automatically uses this for error handling
 *
 * PRODUCTION DEBUGGING:
 * This component shows full error details including:
 * - Error message
 * - Error digest (for matching with server logs)
 * - Stack trace
 *
 * TODO: Remove detailed error display after debugging is complete
 */

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the full error to console for debugging
    console.error('=== GLOBAL ERROR CAUGHT ===')
    console.error('Message:', error.message)
    console.error('Digest:', error.digest)
    console.error('Stack:', error.stack)
    console.error('Full error:', error)
    console.error('===========================')
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-2xl w-full space-y-6">
        {/* Error Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-destructive">
            Something went wrong!
          </h1>
          <p className="text-muted-foreground">
            An error occurred while processing your request.
          </p>
        </div>

        {/* Error Details - PRODUCTION DEBUGGING */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-destructive uppercase tracking-wide">
              Error Message
            </p>
            <p className="text-sm font-mono mt-1 text-foreground break-all">
              {error.message || 'Unknown error'}
            </p>
          </div>

          {error.digest && (
            <div>
              <p className="text-xs font-medium text-destructive uppercase tracking-wide">
                Error Digest (for server logs)
              </p>
              <p className="text-sm font-mono mt-1 text-foreground">
                {error.digest}
              </p>
            </div>
          )}

          {error.stack && (
            <div>
              <p className="text-xs font-medium text-destructive uppercase tracking-wide">
                Stack Trace
              </p>
              <pre className="text-xs font-mono mt-1 text-muted-foreground overflow-auto max-h-64 bg-muted/50 p-2 rounded">
                {error.stack}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button onClick={() => reset()} variant="default">
            Try Again
          </Button>
          <Button onClick={() => window.location.href = '/'} variant="outline">
            Go Home
          </Button>
        </div>

        {/* Debug Info */}
        <p className="text-xs text-center text-muted-foreground">
          Check server logs for digest: <code className="bg-muted px-1 rounded">{error.digest}</code>
        </p>
      </div>
    </div>
  )
}
