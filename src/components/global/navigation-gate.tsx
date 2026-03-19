/**
 * ============================================================================
 * NAVIGATION GATE - Prevents accidental navigation during pending operations
 * ============================================================================
 *
 * A lightweight, reusable component that blocks navigation when there's a
 * pending operation (like saving, uploading, etc.). Shows a confirmation
 * dialog when the user tries to navigate away.
 *
 * ============================================================================
 * FEATURES
 * ============================================================================
 *
 * 1. NEXT.JS APP ROUTER SUPPORT
 *    - Intercepts Link clicks and programmatic navigation
 *    - Uses router events and click interception
 *
 * 2. BROWSER EVENTS
 *    - Handles page refresh (beforeunload)
 *    - Handles browser back/forward buttons
 *    - Handles tab/window close
 *
 * 3. CUSTOMIZABLE COPY
 *    - Default messaging included
 *    - Props for custom title/description/buttons
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * // Basic usage - just pass isPending
 * <NavigationGate isPending={isSaving} />
 *
 * // With custom messaging
 * <NavigationGate
 *   isPending={isUploading}
 *   title="Upload in Progress"
 *   description="Your files are still uploading. If you leave now, your upload will be cancelled."
 * />
 * ```
 *
 * ============================================================================
 */

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ============================================================================
// TYPES
// ============================================================================

interface NavigationGateProps {
  /**
   * Whether there's a pending operation that should block navigation.
   * When true, any navigation attempt will show the confirmation dialog.
   */
  isPending: boolean

  /**
   * Custom title for the confirmation dialog.
   * @default "Leave this page?"
   */
  title?: string

  /**
   * Custom description for the confirmation dialog.
   * @default "You have unsaved changes. If you leave now, your changes will be lost."
   */
  description?: string

  /**
   * Custom text for the "Stay" (cancel) button.
   * @default "Stay on page"
   */
  stayButtonText?: string

  /**
   * Custom text for the "Leave" (confirm) button.
   * @default "Leave anyway"
   */
  leaveButtonText?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function NavigationGate({
  isPending,
  title = 'Leave this page?',
  description = 'You have unsaved changes. If you leave now, your changes will be lost.',
  stayButtonText = 'Stay on page',
  leaveButtonText = 'Leave anyway',
}: NavigationGateProps) {
  const router = useRouter()
  const pathname = usePathname()

  // Dialog state
  const [showDialog, setShowDialog] = useState(false)

  // Store the pending navigation URL so we can redirect after confirmation
  const pendingNavigationRef = useRef<string | null>(null)

  // Track current pathname to detect actual navigation
  const currentPathnameRef = useRef(pathname)

  // ========================================================================
  // BROWSER BEFOREUNLOAD EVENT
  // ========================================================================

  /**
   * Handle browser-level navigation (refresh, close tab, external links).
   * This shows the browser's native "Leave site?" dialog.
   */
  useEffect(() => {
    if (!isPending) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Standard way to trigger the browser's confirmation dialog
      e.preventDefault()
      // Some browsers require returnValue to be set
      e.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isPending])

  // ========================================================================
  // CLICK INTERCEPTION FOR INTERNAL LINKS
  // ========================================================================

  /**
   * Intercept clicks on anchor tags to catch Next.js Link navigation.
   * This is needed because App Router doesn't have router events like Pages Router.
   */
  useEffect(() => {
    if (!isPending) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')

      // Only intercept internal links
      if (!anchor) return
      if (anchor.target === '_blank') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href) return

      // Check if it's an internal link (starts with / and not external)
      const isInternal = href.startsWith('/') && !href.startsWith('//')

      // Also handle relative links on the same origin
      const isRelative = !href.startsWith('http') && !href.startsWith('//')

      if (isInternal || isRelative) {
        // Get the full URL for comparison
        const targetUrl = new URL(href, window.location.origin)
        const currentUrl = new URL(window.location.href)

        // Don't block same-page navigation (hash links, same path)
        if (targetUrl.pathname === currentUrl.pathname) return

        // Block the navigation and show our dialog
        e.preventDefault()
        e.stopPropagation()
        pendingNavigationRef.current = href
        setShowDialog(true)
      }
    }

    // Use capture phase to intercept before Next.js handles it
    document.addEventListener('click', handleClick, { capture: true })

    return () => {
      document.removeEventListener('click', handleClick, { capture: true })
    }
  }, [isPending])

  // ========================================================================
  // BROWSER HISTORY (BACK/FORWARD) INTERCEPTION
  // ========================================================================

  /**
   * Handle browser back/forward buttons.
   * Push a temporary state and listen for popstate to intercept.
   */
  useEffect(() => {
    if (!isPending) return

    /**
     * Push a marker state so we can detect back navigation.
     *
     * CRITICAL: Spread the existing history.state to PRESERVE Next.js App Router's
     * internal routing tree (`__PRIVATE_NEXTJS_INTERNALS_TREE`). If we overwrite
     * history.state with a plain object, Next.js loses track of the current route
     * tree and `router.push()` silently fails — the URL never changes.
     */
    window.history.pushState(
      { ...window.history.state, navigationGate: true },
      '',
      window.location.href
    )

    const handlePopState = (e: PopStateEvent) => {
      // User pressed back while pending - show dialog and restore URL
      e.preventDefault()

      /**
       * Push the state back to prevent actual navigation.
       * Preserve existing history.state to avoid corrupting Next.js internals.
       */
      window.history.pushState(
        { ...window.history.state, navigationGate: true },
        '',
        window.location.href
      )

      // Store the "back" action as pending navigation
      pendingNavigationRef.current = 'back'
      setShowDialog(true)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      /**
       * Neutralize the marker state WITHOUT calling history.back().
       *
       * WHY NOT history.back():
       * history.back() triggers a popstate event, which Next.js's App Router
       * intercepts. If a programmatic router.push() is happening around the
       * same time (e.g., Mochi AI navigating to the next page after generation
       * completes), the popstate from history.back() can race with it and
       * undo the navigation — the user ends up on the wrong page.
       *
       * replaceState() is synchronous and does NOT trigger popstate, so it
       * safely clears the marker without interfering with any pending navigation.
       * The trade-off is one extra history entry (same URL, neutral state),
       * which means an extra browser-back press — acceptable vs broken navigation.
       */
      if (window.history.state?.navigationGate) {
        /**
         * Remove our marker but PRESERVE the rest of history.state.
         *
         * CRITICAL: Using `null` as the first arg to replaceState OVERWRITES
         * Next.js App Router's internal state (`__PRIVATE_NEXTJS_INTERNALS_TREE`).
         * This corruption causes `router.push()` to silently fail because the
         * router can't resolve the current route tree. We destructure to remove
         * only our `navigationGate` flag while keeping everything else intact.
         */
        const { navigationGate: _, ...preservedState } = window.history.state
        window.history.replaceState(preservedState, '', window.location.href)
      }
    }
  }, [isPending])

  // ========================================================================
  // DIALOG ACTIONS
  // ========================================================================

  /**
   * User confirmed they want to leave - proceed with navigation.
   */
  const handleConfirmLeave = useCallback(() => {
    setShowDialog(false)

    const targetUrl = pendingNavigationRef.current

    if (!targetUrl) return

    // Clear the pending navigation
    pendingNavigationRef.current = null

    // Temporarily disable the gate to allow navigation
    // Use a small timeout to let the dialog close first
    setTimeout(() => {
      if (targetUrl === 'back') {
        // Go back twice: once to undo our marker, once for actual back
        window.history.go(-2)
      } else {
        // Use native navigation to bypass our interceptors
        window.location.href = targetUrl
      }
    }, 100)
  }, [])

  /**
   * User chose to stay - close dialog and do nothing.
   */
  const handleCancelLeave = useCallback(() => {
    setShowDialog(false)
    pendingNavigationRef.current = null
  }, [])

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelLeave}>
            {stayButtonText}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmLeave}>
            {leaveButtonText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
