/**
 * ============================================================================
 * BREAKPOINT TOGGLE - Desktop/Mobile Style Editing Components
 * ============================================================================
 *
 * Two components for responsive style editing:
 *
 * 1. HeaderBreakpointToggle - Compact icon-only toggle for panel header
 * 2. MobileEditingBanner - Warning banner and clear button for Design tab
 *
 * ============================================================================
 * HOW IT WORKS
 * ============================================================================
 *
 * 1. User clicks Mobile icon in header
 * 2. Redux state `editingBreakpoint` changes to 'mobile'
 * 3. All property inputs now read/write from responsiveStyles.mobile
 * 4. MobileEditingBanner shows at top of Design tab
 * 5. Changes only affect the mobile view, not desktop
 *
 * ============================================================================
 */

'use client'

import { Monitor, Smartphone, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Breakpoint, CanvasElement } from '../../../_lib/types'
import {
  useAppDispatch,
  useAppSelector,
  selectEditingBreakpoint,
  selectSelectedIds,
  selectActivePage,
  setEditingBreakpoint,
  clearElementResponsiveStyles,
  clearElementResponsiveProperties,
  hasAnyResponsiveOverrides,
} from '../../../_lib'

// ============================================================================
// HEADER BREAKPOINT TOGGLE - Icon-only toggle for panel header
// ============================================================================

/**
 * HeaderBreakpointToggle - Compact icon buttons for Desktop/Mobile switching
 *
 * Designed to fit in the properties panel header next to the pin button.
 * Uses only icons (no text) to keep it compact.
 *
 * @example
 * <div className="flex items-center gap-2">
 *   <span>Design</span>
 *   <HeaderBreakpointToggle />
 *   <PinButton />
 * </div>
 */
export function HeaderBreakpointToggle() {
  const dispatch = useAppDispatch()
  const editingBreakpoint = useAppSelector(selectEditingBreakpoint)

  /**
   * Handle breakpoint switch - updates Redux state.
   * All property panels will automatically read from the correct style source.
   */
  const handleBreakpointChange = (breakpoint: Breakpoint) => {
    dispatch(setEditingBreakpoint(breakpoint))
  }

  return (
    <div
      className="inline-flex rounded-md border border-border/50 bg-background/50 p-0.5"
      role="group"
    >
      {/* Desktop Button - Icon only */}
      <button
        type="button"
        onClick={() => handleBreakpointChange('desktop')}
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded transition-all',
          editingBreakpoint === 'desktop'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
        title="Edit desktop styles"
      >
        <Monitor className="w-3.5 h-3.5" />
      </button>

      {/* Mobile Button - Icon only */}
      <button
        type="button"
        onClick={() => handleBreakpointChange('mobile')}
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded transition-all',
          editingBreakpoint === 'mobile'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
        title="Edit mobile styles"
      >
        <Smartphone className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ============================================================================
// MOBILE EDITING BANNER - Warning and clear button for Design tab
// ============================================================================

interface MobileEditingBannerProps {
  /** The currently selected element */
  selectedElement: CanvasElement | null
}

/**
 * MobileEditingBanner - Shows mobile editing context and clear button
 *
 * Displays at the top of the Design tab content when:
 * - Mobile editing mode is active (shows warning)
 * - Element has mobile overrides (shows clear button)
 *
 * @example
 * <div className="pt-2">
 *   <MobileEditingBanner selectedElement={selectedElement} />
 *   <PropertySection title="Dimensions">...</PropertySection>
 * </div>
 */
export function MobileEditingBanner({ selectedElement }: MobileEditingBannerProps) {
  const dispatch = useAppDispatch()
  const editingBreakpoint = useAppSelector(selectEditingBreakpoint)

  // Check if the selected element has any mobile overrides (styles OR properties)
  const hasMobileOverrides = selectedElement
    ? hasAnyResponsiveOverrides(selectedElement)
    : false

  /**
   * Clear all mobile overrides for the selected element.
   * Removes both style overrides and property overrides.
   */
  const handleClearMobileOverrides = () => {
    if (!selectedElement) return

    // Clear style overrides
    dispatch(clearElementResponsiveStyles({
      id: selectedElement.id,
      breakpoint: 'mobile',
    }))

    // Clear property overrides
    dispatch(clearElementResponsiveProperties({
      id: selectedElement.id,
      breakpoint: 'mobile',
    }))

    // Switch back to desktop mode after clearing
    dispatch(setEditingBreakpoint('desktop'))
  }

  // Don't show anything if not in mobile mode and no overrides exist
  if (editingBreakpoint !== 'mobile' && !hasMobileOverrides) {
    return null
  }

  return (
    <div className="px-3 pb-2 space-y-2">
      {/* Mobile Editing Indicator */}
      {editingBreakpoint === 'mobile' && (
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg',
            'bg-blue-500/10 border border-blue-500/20 text-blue-400'
          )}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs">
            Editing mobile styles
          </span>
        </div>
      )}

      {/* Clear All Mobile Overrides Button */}
      {hasMobileOverrides && (
        <button
          onClick={handleClearMobileOverrides}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs',
            'bg-red-500/10 border border-red-500/20 text-red-400',
            'hover:bg-red-500/20 hover:text-red-300 transition-colors'
          )}
          title="Remove all mobile-specific overrides"
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear all mobile overrides</span>
        </button>
      )}
    </div>
  )
}

// ============================================================================
// LEGACY EXPORT - For backwards compatibility
// ============================================================================

/**
 * @deprecated Use HeaderBreakpointToggle and MobileEditingBanner instead
 */
export function BreakpointToggle() {
  const selectedIds = useAppSelector(selectSelectedIds)
  const activePage = useAppSelector(selectActivePage)
  const selectedElement = activePage && selectedIds.length > 0
    ? activePage.canvas.elements[selectedIds[selectedIds.length - 1]]
    : null

  return (
    <div className="px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium shrink-0">
          Device
        </span>
        <div className="flex-1 flex justify-end">
          <HeaderBreakpointToggle />
        </div>
      </div>
      <MobileEditingBanner selectedElement={selectedElement} />
    </div>
  )
}
