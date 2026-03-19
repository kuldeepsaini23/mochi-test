/**
 * ============================================================================
 * RULERS - Canvas Rulers and Smart Alignment Guides
 * ============================================================================
 *
 * Provides visual feedback for element positioning through:
 * 1. Horizontal ruler at the top (shows X coordinates)
 * 2. Vertical ruler on the left (shows Y coordinates)
 * 3. Guide lines from active element edges to rulers
 * 4. Smart alignment guides (cyan lines when edges align with other elements)
 *
 * ============================================================================
 * PERFORMANCE ARCHITECTURE
 * ============================================================================
 *
 * - Rulers use React state (static during interactions)
 * - Tick intervals are dynamic based on zoom level (fewer ticks when zoomed out)
 * - Smart alignment guides use direct DOM manipulation via ref
 * - Maximum 100 ticks rendered at any zoom level
 *
 * ============================================================================
 * COORDINATE SYSTEM
 * ============================================================================
 *
 * - Canvas coordinates: Position on the infinite canvas
 * - Viewport coordinates: Position on screen
 * - Conversion: viewportPos = (canvasPos * zoom) + pan
 *
 * ============================================================================
 */

'use client'

import { useMemo, useRef, useEffect } from 'react'
import type { AlignmentGuide } from '../../_lib/snap-service'

// ============================================================================
// TYPES
// ============================================================================

/** Bounds for the currently active element (selected, dragging, resizing, or drawing) */
export interface ActiveElementBounds {
  x: number
  y: number
  width: number
  height: number
}

interface RulersProps {
  /** Current zoom level */
  zoom: number
  /** Horizontal pan offset */
  panX: number
  /** Vertical pan offset */
  panY: number
  /** Ruler thickness in pixels (default: 20) */
  rulerSize?: number
  /** Bounds of the currently active element (for guide lines to rulers) */
  activeBounds?: ActiveElementBounds | null
  /** Alignment guides to render (calculated by snap service) */
  alignmentGuides?: AlignmentGuide[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default ruler thickness */
const DEFAULT_RULER_SIZE = 20

/** Guide line color - pink/magenta for visibility */
const GUIDE_LINE_COLOR = 'rgba(236, 72, 153, 0.8)'

/** Smart alignment guide color - cyan for distinction */
const SMART_GUIDE_COLOR = 'rgba(0, 200, 255, 0.9)'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get tick intervals based on zoom level.
 *
 * When zoomed out, we use larger intervals to reduce DOM elements.
 * When zoomed in, we use smaller intervals for precision.
 */
function getTickIntervals(zoom: number): { major: number; minor: number } {
  if (zoom < 0.4) {
    return { major: 500, minor: 500 }
  } else if (zoom < 0.6) {
    return { major: 200, minor: 100 }
  } else if (zoom < 1.0) {
    return { major: 100, minor: 50 }
  } else {
    return { major: 100, minor: 10 }
  }
}

/**
 * Convert canvas coordinates to viewport coordinates.
 */
function canvasToViewport(
  canvasX: number,
  canvasY: number,
  zoom: number,
  panX: number,
  panY: number
): { x: number; y: number } {
  return {
    x: canvasX * zoom + panX,
    y: canvasY * zoom + panY,
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Rulers Component
 *
 * Renders rulers along the top and left edges of the canvas,
 * plus guide lines and smart alignment indicators.
 *
 * PERFORMANCE OPTIMIZATION:
 * Rulers are only rendered when actively needed (during drag, resize, or
 * frame creation operations). This significantly reduces DOM overhead
 * since ticks can be expensive to render and recalculate on every pan/zoom.
 */
export function Rulers({
  zoom,
  panX,
  panY,
  rulerSize = DEFAULT_RULER_SIZE,
  activeBounds,
  alignmentGuides = [],
}: RulersProps) {
  // ========================================================================
  // PERFORMANCE: Early return if rulers aren't needed
  // ========================================================================

  /**
   * Determine if rulers should be visible.
   *
   * WHY THIS MATTERS:
   * - Rulers render up to 200 tick DOM elements (100 horizontal + 100 vertical)
   * - These ticks recompute on every pan/zoom change
   * - When idle, there's no reason to show rulers - they add visual clutter
   *   and consume CPU/GPU resources
   *
   * SHOW RULERS WHEN:
   * - An element is being dragged (activeBounds from useDrag)
   * - An element is being resized (activeBounds from useResize)
   * - A frame is being created (activeBounds from useFrameCreation)
   * - Smart alignment guides are active (snapping to other elements)
   */
  const isRulerNeeded = Boolean(activeBounds) || alignmentGuides.length > 0

  // Ref for smart alignment guides container (direct DOM manipulation)
  const smartGuidesRef = useRef<HTMLDivElement>(null)

  // ========================================================================
  // GUIDE LINE CALCULATIONS
  // ========================================================================

  /**
   * Calculate viewport positions for the active element's guide lines.
   * These are the pink lines that extend from element edges to the rulers.
   */
  const guideLines = useMemo(() => {
    if (!activeBounds || activeBounds.width <= 0 || activeBounds.height <= 0) {
      return null
    }

    const topLeft = canvasToViewport(activeBounds.x, activeBounds.y, zoom, panX, panY)
    const bottomRight = canvasToViewport(
      activeBounds.x + activeBounds.width,
      activeBounds.y + activeBounds.height,
      zoom,
      panX,
      panY
    )

    return {
      left: topLeft.x,
      right: bottomRight.x,
      top: topLeft.y,
      bottom: bottomRight.y,
      viewportWidth: bottomRight.x - topLeft.x,
      viewportHeight: bottomRight.y - topLeft.y,
      canvasX: Math.round(activeBounds.x),
      canvasY: Math.round(activeBounds.y),
      canvasWidth: Math.round(activeBounds.width),
      canvasHeight: Math.round(activeBounds.height),
    }
  }, [activeBounds, zoom, panX, panY])

  // ========================================================================
  // SMART ALIGNMENT GUIDES (Direct DOM for performance)
  // ========================================================================

  /**
   * Render alignment guides via direct DOM manipulation.
   *
   * WHY: React reconciliation during drag causes performance issues.
   * By manipulating DOM directly, we bypass React's render cycle.
   */
  useEffect(() => {
    const container = smartGuidesRef.current
    if (!container) return

    // Clear existing guides
    container.innerHTML = ''

    // Skip if no guides to render
    if (alignmentGuides.length === 0) return

    // Render each guide
    for (const guide of alignmentGuides) {
      const line = document.createElement('div')

      if (guide.axis === 'x') {
        // Vertical guide line (X-axis alignment)
        const viewportX = guide.position * zoom + panX
        const startY = guide.start * zoom + panY
        const endY = guide.end * zoom + panY

        line.style.cssText = `
          position: absolute;
          left: ${viewportX}px;
          top: ${Math.min(startY, endY)}px;
          width: 1px;
          height: ${Math.abs(endY - startY)}px;
          background: ${SMART_GUIDE_COLOR};
          box-shadow: 0 0 4px ${SMART_GUIDE_COLOR};
          pointer-events: none;
          z-index: 45;
        `
      } else {
        // Horizontal guide line (Y-axis alignment)
        const viewportY = guide.position * zoom + panY
        const startX = guide.start * zoom + panX
        const endX = guide.end * zoom + panX

        line.style.cssText = `
          position: absolute;
          left: ${Math.min(startX, endX)}px;
          top: ${viewportY}px;
          width: ${Math.abs(endX - startX)}px;
          height: 1px;
          background: ${SMART_GUIDE_COLOR};
          box-shadow: 0 0 4px ${SMART_GUIDE_COLOR};
          pointer-events: none;
          z-index: 45;
        `
      }

      container.appendChild(line)
    }
  }, [alignmentGuides, zoom, panX, panY])

  // ========================================================================
  // RULER TICK CALCULATIONS
  // ========================================================================

  /**
   * Generate horizontal ruler tick marks.
   * Dynamically adjusts interval based on zoom for performance.
   */
  const horizontalTicks = useMemo(() => {
    const { major: MAJOR_INTERVAL, minor: MINOR_INTERVAL } = getTickIntervals(zoom)
    const ticks: Array<{ position: number; label: string; isMajor: boolean }> = []

    // Calculate visible range in canvas coordinates
    const viewportWidth = 3000 // Generous viewport estimate
    const startCanvas = Math.floor(-panX / zoom / MINOR_INTERVAL) * MINOR_INTERVAL
    const endCanvas = Math.ceil((viewportWidth - panX) / zoom / MINOR_INTERVAL) * MINOR_INTERVAL

    // Limit total ticks for performance
    const maxTicks = 100
    let tickCount = 0

    for (let canvasX = startCanvas; canvasX <= endCanvas && tickCount < maxTicks; canvasX += MINOR_INTERVAL) {
      const viewportX = canvasX * zoom + panX
      const isMajor = canvasX % MAJOR_INTERVAL === 0
      ticks.push({
        position: viewportX,
        label: isMajor ? `${canvasX}` : '',
        isMajor,
      })
      tickCount++
    }

    return ticks
  }, [zoom, panX])

  /**
   * Generate vertical ruler tick marks.
   */
  const verticalTicks = useMemo(() => {
    const { major: MAJOR_INTERVAL, minor: MINOR_INTERVAL } = getTickIntervals(zoom)
    const ticks: Array<{ position: number; label: string; isMajor: boolean }> = []

    // Calculate visible range in canvas coordinates
    const viewportHeight = 2000 // Generous viewport estimate
    const startCanvas = Math.floor(-panY / zoom / MINOR_INTERVAL) * MINOR_INTERVAL
    const endCanvas = Math.ceil((viewportHeight - panY) / zoom / MINOR_INTERVAL) * MINOR_INTERVAL

    // Limit total ticks for performance
    const maxTicks = 100
    let tickCount = 0

    for (let canvasY = startCanvas; canvasY <= endCanvas && tickCount < maxTicks; canvasY += MINOR_INTERVAL) {
      const viewportY = canvasY * zoom + panY
      const isMajor = canvasY % MAJOR_INTERVAL === 0
      ticks.push({
        position: viewportY,
        label: isMajor ? `${canvasY}` : '',
        isMajor,
      })
      tickCount++
    }

    return ticks
  }, [zoom, panY])

  // ========================================================================
  // RENDER
  // ========================================================================

  /**
   * PERFORMANCE: Don't render rulers when not actively needed.
   *
   * This is the key optimization - by returning null when there's no
   * active drag/resize/creation operation, we avoid:
   * - Rendering 200+ tick mark DOM elements
   * - Running useMemo calculations for tick positions
   * - Layout thrashing from positioning calculations
   *
   * The rulers will smoothly appear when the user starts dragging,
   * resizing, or creating an element.
   */
  if (!isRulerNeeded) {
    return null
  }

  return (
    <>
      {/* ========================================
          HORIZONTAL RULER (TOP)
          ======================================== */}
      <div
        className="absolute top-0 right-0 bg-muted/95 border-b border-border overflow-hidden pointer-events-none z-50"
        style={{ left: rulerSize, height: rulerSize }}
      >
        {/* Tick marks */}
        {horizontalTicks.map((tick, index) => (
          <div
            key={`h-tick-${index}`}
            className="absolute bottom-0 bg-muted-foreground/60"
            style={{
              left: tick.position - rulerSize,
              width: 1,
              height: tick.isMajor ? 8 : 4,
            }}
          >
            {tick.isMajor && tick.label && (
              <span
                className="absolute text-muted-foreground font-mono text-[8px] whitespace-nowrap"
                style={{ left: 2, top: -12 }}
              >
                {tick.label}
              </span>
            )}
          </div>
        ))}

        {/* Active element guide markers */}
        {guideLines && (
          <>
            {/* Left edge marker */}
            <div
              className="absolute top-0"
              style={{
                left: guideLines.left - rulerSize,
                width: 2,
                height: rulerSize,
                background: GUIDE_LINE_COLOR,
              }}
            />
            {/* Right edge marker */}
            <div
              className="absolute top-0"
              style={{
                left: guideLines.right - rulerSize,
                width: 2,
                height: rulerSize,
                background: GUIDE_LINE_COLOR,
              }}
            />
            {/* Width indicator */}
            {guideLines.viewportWidth > 40 && (
              <div
                className="absolute flex items-center justify-center rounded"
                style={{
                  left: guideLines.left - rulerSize,
                  width: guideLines.viewportWidth,
                  top: 2,
                  height: rulerSize - 4,
                  background: 'rgba(236, 72, 153, 0.2)',
                }}
              >
                <span
                  className="font-mono text-[9px] font-medium"
                  style={{ color: GUIDE_LINE_COLOR }}
                >
                  {guideLines.canvasWidth}px
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================
          VERTICAL RULER (LEFT)
          ======================================== */}
      <div
        className="absolute left-0 bottom-0 bg-muted/95 border-r border-border overflow-hidden pointer-events-none z-50"
        style={{ top: rulerSize, width: rulerSize }}
      >
        {/* Tick marks */}
        {verticalTicks.map((tick, index) => (
          <div
            key={`v-tick-${index}`}
            className="absolute right-0 bg-muted-foreground/60"
            style={{
              top: tick.position - rulerSize,
              height: 1,
              width: tick.isMajor ? 8 : 4,
            }}
          >
            {tick.isMajor && tick.label && (
              <span
                className="absolute text-muted-foreground font-mono text-[8px] whitespace-nowrap"
                style={{
                  right: 10,
                  top: -4,
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'right center',
                }}
              >
                {tick.label}
              </span>
            )}
          </div>
        ))}

        {/* Active element guide markers */}
        {guideLines && (
          <>
            {/* Top edge marker */}
            <div
              className="absolute left-0"
              style={{
                top: guideLines.top - rulerSize,
                height: 2,
                width: rulerSize,
                background: GUIDE_LINE_COLOR,
              }}
            />
            {/* Bottom edge marker */}
            <div
              className="absolute left-0"
              style={{
                top: guideLines.bottom - rulerSize,
                height: 2,
                width: rulerSize,
                background: GUIDE_LINE_COLOR,
              }}
            />
            {/* Height indicator */}
            {guideLines.viewportHeight > 40 && (
              <div
                className="absolute flex items-center justify-center rounded"
                style={{
                  top: guideLines.top - rulerSize,
                  height: guideLines.viewportHeight,
                  left: 2,
                  width: rulerSize - 4,
                  background: 'rgba(236, 72, 153, 0.2)',
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                }}
              >
                <span
                  className="font-mono text-[9px] font-medium"
                  style={{ color: GUIDE_LINE_COLOR, transform: 'rotate(180deg)' }}
                >
                  {guideLines.canvasHeight}px
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================
          CORNER SQUARE
          ======================================== */}
      <div
        className="absolute top-0 left-0 bg-muted/95 border-r border-b border-border pointer-events-none z-50"
        style={{ width: rulerSize, height: rulerSize }}
      />

      {/* ========================================
          GUIDE LINES FROM ELEMENT TO RULERS
          ======================================== */}
      {guideLines && (
        <>
          {/* Vertical guide lines to top ruler */}
          {guideLines.top > rulerSize && (
            <>
              <div
                className="absolute pointer-events-none z-40"
                style={{
                  left: guideLines.left,
                  top: rulerSize,
                  width: 1,
                  height: Math.max(0, guideLines.top - rulerSize),
                  background: `linear-gradient(to bottom, ${GUIDE_LINE_COLOR}, transparent)`,
                }}
              />
              <div
                className="absolute pointer-events-none z-40"
                style={{
                  left: guideLines.right,
                  top: rulerSize,
                  width: 1,
                  height: Math.max(0, guideLines.top - rulerSize),
                  background: `linear-gradient(to bottom, ${GUIDE_LINE_COLOR}, transparent)`,
                }}
              />
            </>
          )}

          {/* Horizontal guide lines to left ruler */}
          {guideLines.left > rulerSize && (
            <>
              <div
                className="absolute pointer-events-none z-40"
                style={{
                  left: rulerSize,
                  top: guideLines.top,
                  height: 1,
                  width: Math.max(0, guideLines.left - rulerSize),
                  background: `linear-gradient(to right, ${GUIDE_LINE_COLOR}, transparent)`,
                }}
              />
              <div
                className="absolute pointer-events-none z-40"
                style={{
                  left: rulerSize,
                  top: guideLines.bottom,
                  height: 1,
                  width: Math.max(0, guideLines.left - rulerSize),
                  background: `linear-gradient(to right, ${GUIDE_LINE_COLOR}, transparent)`,
                }}
              />
            </>
          )}

          {/* Position labels */}
          <div
            className="absolute font-mono text-[9px] text-white rounded pointer-events-none z-50"
            style={{
              left: guideLines.left + 4,
              top: rulerSize + 4,
              padding: '2px 4px',
              background: 'rgba(236, 72, 153, 0.9)',
            }}
          >
            X: {guideLines.canvasX}
          </div>

          <div
            className="absolute font-mono text-[9px] text-white rounded pointer-events-none z-50"
            style={{
              left: rulerSize + 4,
              top: guideLines.top + 4,
              padding: '2px 4px',
              background: 'rgba(236, 72, 153, 0.9)',
            }}
          >
            Y: {guideLines.canvasY}
          </div>
        </>
      )}

      {/* ========================================
          SMART ALIGNMENT GUIDES CONTAINER
          Rendered via direct DOM manipulation for performance
          ======================================== */}
      <div
        ref={smartGuidesRef}
        className="absolute inset-0 pointer-events-none"
      />
    </>
  )
}

export default Rulers
