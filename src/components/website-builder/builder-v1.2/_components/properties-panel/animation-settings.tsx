/**
 * ============================================================================
 * ANIMATION SETTINGS SECTION - Auto-scroll configuration for frames
 * ============================================================================
 *
 * This component provides animation settings for frame elements, specifically
 * the auto-scroll (infinite marquee) animation.
 *
 * FEATURES:
 * - Enable/disable auto-scroll animation
 * - Configure scroll speed and direction
 * - Shows informational notes about how the animation works
 * - Shows warnings when setup won't work properly
 *
 * NOT AVAILABLE FOR:
 * - SmartCMS List frames (would cause data issues with CMS items)
 *
 * ============================================================================
 */

'use client'

import { useMemo } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { PropertySection, ToggleControl, DropdownControl } from './controls'
import { InputGroupControl } from './controls/input-group-control'
import { useAppDispatch, useAppSelector, updateElement, selectActivePage } from '../../_lib'
import type { FrameElement, CanvasElement } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface AnimationSettingsSectionProps {
  /** The frame element being configured */
  element: FrameElement
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate the total width of all children in a frame.
 * Used to determine if there's enough content for seamless animation.
 */
function calculateChildrenWidth(
  frameId: string,
  elements: Record<string, CanvasElement>,
  childrenMap: Record<string, string[]>
): number {
  const childIds = childrenMap[frameId] || []
  let totalWidth = 0

  for (const childId of childIds) {
    const child = elements[childId]
    if (child && child.visible !== false) {
      // Add child width plus gap (estimated from frame styles)
      totalWidth += child.width
    }
  }

  return totalWidth
}

/**
 * Get the gap value from frame styles.
 */
function getFrameGap(element: FrameElement): number {
  return (element.styles?.gap as number) ?? 0
}

// ============================================================================
// INFO/WARNING COMPONENTS
// ============================================================================

/**
 * Info note component - blue styling for informational messages.
 */
function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
      <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
      <p className="text-xs text-blue-300/90 leading-relaxed">{children}</p>
    </div>
  )
}

/**
 * Warning note component - red/orange styling for warnings.
 */
function WarningNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
      <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
      <p className="text-xs text-destructive/90 leading-relaxed">{children}</p>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AnimationSettingsSection({ element }: AnimationSettingsSectionProps) {
  const dispatch = useAppDispatch()
  const activePage = useAppSelector(selectActivePage)

  // Get elements and childrenMap from canvas
  const elements = activePage?.canvas?.elements ?? {}
  const childrenMap = activePage?.canvas?.childrenMap ?? {}

  // Current auto-scroll settings
  const autoScroll = element.autoScroll ?? false
  const autoScrollSpeed = element.autoScrollSpeed ?? 50
  const autoScrollDirection = element.autoScrollDirection ?? 'left'

  // Check if scroll mode is enabled (required for auto-scroll)
  // Uses scrollEnabled (new) with fallback to responsive (deprecated) for backwards compat
  const isScrollEnabled = element.scrollEnabled === true || element.responsive === true

  // Check frame layout direction
  const isHorizontalLayout = element.styles?.flexDirection === 'row'
  const isVerticalDirection = autoScrollDirection === 'up' || autoScrollDirection === 'down'

  // Calculate children metrics
  const childrenWidth = useMemo(
    () => calculateChildrenWidth(element.id, elements, childrenMap),
    [element.id, elements, childrenMap]
  )
  const gap = getFrameGap(element)
  const childCount = (childrenMap[element.id] || []).length
  const totalWidthWithGaps = childrenWidth + (gap * Math.max(0, childCount - 1))

  // Check if content is wide enough for seamless animation
  // Content should be at least as wide as the container
  const isContentWideEnough = totalWidthWithGaps >= element.width

  // Determine validation state
  const validationIssues = useMemo(() => {
    const issues: string[] = []

    if (!isScrollEnabled) {
      issues.push('Scroll mode must be enabled for auto-scroll to work. Enable "Scroll" in the Layout section.')
    }

    /**
     * Layout direction validation:
     * - Horizontal scrolling (left/right) needs row layout
     * - Vertical scrolling (up/down) needs column layout
     */
    if (!isVerticalDirection && !isHorizontalLayout) {
      issues.push('Horizontal auto-scroll works with row layout. Set flex direction to "Row" in the Layout section.')
    }
    if (isVerticalDirection && isHorizontalLayout) {
      issues.push('Vertical auto-scroll works with column layout. Set flex direction to "Column" in the Layout section.')
    }

    if (childCount === 0) {
      issues.push('Add some child elements to the frame for the animation to work.')
    } else if (!isVerticalDirection && !isContentWideEnough && autoScroll) {
      issues.push(`Content width (${Math.round(totalWidthWithGaps)}px) is less than container width (${Math.round(element.width)}px). Add more elements or reduce the container width for a seamless loop.`)
    }

    return issues
  }, [isScrollEnabled, isHorizontalLayout, isVerticalDirection, childCount, isContentWideEnough, totalWidthWithGaps, element.width, autoScroll])

  const hasValidationErrors = validationIssues.length > 0 && autoScroll

  /**
   * Handle toggle change for auto-scroll.
   */
  const handleAutoScrollChange = (enabled: boolean) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { autoScroll: enabled },
      })
    )
  }

  /**
   * Handle speed change.
   */
  const handleSpeedChange = (value: string | number) => {
    const speed = typeof value === 'string' ? parseInt(value, 10) : value
    if (!isNaN(speed) && speed > 0) {
      dispatch(
        updateElement({
          id: element.id,
          updates: { autoScrollSpeed: speed },
        })
      )
    }
  }

  /**
   * Handle direction change.
   */
  const handleDirectionChange = (value: string) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { autoScrollDirection: value as 'left' | 'right' | 'up' | 'down' },
      })
    )
  }

  return (
    <PropertySection title="Animation" defaultOpen>
      <div className="space-y-3 px-1">
        {/* How it works info note */}
        <InfoNote>
          Creates an infinite marquee. Content must overflow the container (wider for horizontal, taller for vertical) for seamless looping.
        </InfoNote>

        {/* Validation warnings */}
        {hasValidationErrors && (
          <div className="space-y-2">
            {validationIssues.map((issue, index) => (
              <WarningNote key={index}>{issue}</WarningNote>
            ))}
          </div>
        )}

        {/* Auto-scroll toggle */}
        <ToggleControl
          label="Auto Scroll"
          checked={autoScroll}
          onChange={handleAutoScrollChange}
        />

        {/* Speed and direction controls - only show when enabled */}
        {autoScroll && (
          <>
            {/* Speed control (pixels per second) */}
            <InputGroupControl
              label="Speed (px/s)"
              value={autoScrollSpeed}
              onChange={handleSpeedChange}
              type="number"
            />

            {/* Direction control */}
            <DropdownControl
              label="Direction"
              value={autoScrollDirection}
              options={[
                { value: 'left', label: '← Scroll Left' },
                { value: 'right', label: '→ Scroll Right' },
                { value: 'up', label: '↑ Scroll Up' },
                { value: 'down', label: '↓ Scroll Down' },
              ]}
              onChange={handleDirectionChange}
            />

            {/* Content width status */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded bg-muted/30">
              <span className="text-xs text-muted-foreground">Content Width</span>
              <span className={`text-xs font-medium ${isContentWideEnough ? 'text-green-400' : 'text-amber-400'}`}>
                {Math.round(totalWidthWithGaps)}px / {Math.round(element.width)}px
                {isContentWideEnough ? ' ✓' : ' (needs more)'}
              </span>
            </div>
          </>
        )}
      </div>
    </PropertySection>
  )
}
