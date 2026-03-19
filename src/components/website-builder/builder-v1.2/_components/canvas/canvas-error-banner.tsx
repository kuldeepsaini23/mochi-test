/**
 * ============================================================================
 * CANVAS ERROR BANNER - Critical Error Display
 * ============================================================================
 *
 * Displays a prominent error banner when a critical canvas integrity error
 * is detected (e.g., duplicate elements, duplicate pages, save failures).
 *
 * DESIGN: Based on subscription-canceled-banner.tsx for consistency.
 *
 * BEHAVIOR:
 * - Appears at the top of the canvas area
 * - Critical errors cannot be dismissed (must refresh)
 * - Save errors can be dismissed and will auto-retry on next edit
 * - Red/destructive styling to indicate severity
 *
 * ============================================================================
 */

'use client'

import { AlertTriangle, RefreshCw, X, RotateCcw } from 'lucide-react'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * Error type determines the banner behavior and styling.
 *
 * CRITICAL ERRORS (require refresh):
 * - DUPLICATE_ELEMENT: Same element ID appears twice
 * - DUPLICATE_PAGE: Same page element appears twice
 * - INTEGRITY_ERROR: Canvas state is corrupted
 *
 * RECOVERABLE ERRORS (dismissible):
 * - SAVE_ERROR: Failed to save changes to database
 */
export type CanvasErrorType =
  | 'DUPLICATE_ELEMENT'
  | 'DUPLICATE_PAGE'
  | 'INTEGRITY_ERROR'
  | 'SAVE_ERROR'

interface CanvasErrorBannerProps {
  /** Error type for specific messaging and behavior */
  type: CanvasErrorType
  /** Human-readable error message */
  message: string
  /** Optional element ID that caused the error */
  elementId?: string
  /**
   * Callback when user dismisses the banner (only for recoverable errors).
   * If not provided, banner cannot be dismissed.
   */
  onDismiss?: () => void
  /**
   * Callback to retry the failed operation (only for SAVE_ERROR).
   */
  onRetry?: () => void
}

/**
 * Get user-friendly error title based on error type.
 */
function getErrorTitle(type: CanvasErrorType): string {
  switch (type) {
    case 'DUPLICATE_ELEMENT':
      return 'Critical Error: Duplicate Element Detected'
    case 'DUPLICATE_PAGE':
      return 'Critical Error: Duplicate Page Detected'
    case 'INTEGRITY_ERROR':
      return 'Critical Error: Canvas Integrity Compromised'
    case 'SAVE_ERROR':
      return 'Save Failed'
    default:
      return 'Critical Canvas Error'
  }
}

/**
 * Determine if an error type is critical (requires page refresh).
 */
function isCriticalError(type: CanvasErrorType): boolean {
  return type !== 'SAVE_ERROR'
}

/**
 * Canvas Error Banner Component
 *
 * Displays when a canvas error occurs. Behavior depends on error type:
 *
 * CRITICAL ERRORS (DUPLICATE_*, INTEGRITY_ERROR):
 * - Cannot be dismissed
 * - Shows refresh button
 * - User must refresh to recover
 *
 * SAVE ERRORS:
 * - Can be dismissed via X button
 * - Shows retry button
 * - Will auto-retry on next edit if dismissed
 */
export function CanvasErrorBanner({
  type,
  message,
  elementId,
  onDismiss,
  onRetry,
}: CanvasErrorBannerProps) {
  const isCritical = isCriticalError(type)

  /**
   * Handle page refresh - force reload to clear corrupted state.
   */
  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <Alert
      variant="destructive"
      className="rounded-none border-x-0 border-t-0 border-b border-destructive/50 bg-[rgb(223,89,89)] absolute top-0 left-0 right-0 z-[9999] flex items-center justify-between px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-white flex-shrink-0" />
        <AlertTitle className="text-white text-sm font-medium m-0">
          <span className="font-bold">{getErrorTitle(type)}</span>
          <span className="mx-2">—</span>
          <span>{message}</span>
          {elementId && (
            <span className="ml-2 opacity-75 text-xs">
              (Element: {elementId.slice(0, 8)}...)
            </span>
          )}
        </AlertTitle>
      </div>

      <div className="flex items-center gap-2">
        {/* Critical errors: Show refresh button */}
        {isCritical && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Page
          </Button>
        )}

        {/* Save errors: Show retry button if callback provided */}
        {!isCritical && onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </Button>
        )}

        {/* Save errors: Show dismiss button if callback provided */}
        {!isCritical && onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="text-white hover:bg-white/20 hover:text-white p-1 h-auto"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Alert>
  )
}
