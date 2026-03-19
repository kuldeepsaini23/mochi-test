'use client'

/**
 * ============================================================================
 * STAGING CANVAS - On-Canvas AI-Generated Content Preview
 * ============================================================================
 *
 * Renders AI-generated elements as floating previews directly ON the canvas,
 * in the empty space to the right of the page element (and any breakpoint
 * frames). Users can see the actual rendered UI and drag-and-drop it onto
 * the page canvas manually.
 *
 * POSITIONING:
 * Staged groups are positioned in CANVAS coordinates (same space as page
 * elements), placed to the right of ALL page-related frames (main page +
 * any active breakpoints). They participate in the same pan/zoom transform
 * as all other canvas content.
 *
 * BREAKPOINT AWARENESS:
 * When the page has a mobile breakpoint enabled, the staging area shifts
 * right to avoid overlapping the 390px mobile frame. Without this offset,
 * the staging preview renders BEHIND the breakpoint and is invisible.
 *
 * RENDERING:
 * Uses RenderModeProvider with mode='preview' so unified elements render
 * in their read-only display mode (no selection chrome, no resize handles).
 *
 * DRAG-AND-DROP:
 * Each staging group is draggable. The user grabs from the preview and drops
 * onto the page canvas. The main canvas handleDrop reads
 * `application/x-staged-elements` data to complete the transfer.
 *
 * MINIMAL CHROME:
 * No label bar, no dismiss button, no "Add to Page" — just the visual
 * preview with a streaming indicator. Users select and delete directly
 * on the canvas if they don't want the content.
 *
 * SOURCE OF TRUTH KEYWORDS: StagingCanvas, AIStagingCanvas, AIPreviewCanvas
 * ============================================================================
 */

import React, { useMemo, useCallback } from 'react'
import { useSelector } from 'react-redux'
import {
  selectStagingGroups,
} from '../../_lib/staging-slice'
import type { StagingGroup } from '../../_lib/staging-slice'
import { selectMainPage } from '../../_lib/canvas-slice'
import type { CanvasElement } from '../../_lib/types'
import type { PageElement } from '../../_lib/types'
import { RenderModeProvider } from '../../_lib/render-mode-context'
import { Loader2 } from 'lucide-react'

// Import unified elements for visual rendering
import {
  UnifiedText,
  UnifiedImage,
  UnifiedVideo,
  UnifiedButton,
  UnifiedFrame,
  UnifiedLink,
  UnifiedForm,
  UnifiedPayment,
  UnifiedFaq,
  UnifiedList,
  UnifiedStickyNote,
  UnifiedTimer,
  UnifiedReceipt,
  UnifiedRichText,
  UnifiedPencil,
} from '../unified-elements'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Gap between the rightmost frame (page or breakpoint) and staging area */
const STAGING_GAP = 60

/** Gap between stacked staging groups */
const STAGING_GROUP_GAP = 40

/** Width of the staging preview */
const STAGING_PREVIEW_WIDTH = 600

/** Scale factor for rendering (full-width content scaled down) */
const CONTENT_RENDER_WIDTH = 1440
const PREVIEW_SCALE = STAGING_PREVIEW_WIDTH / CONTENT_RENDER_WIDTH

/**
 * Mobile breakpoint constants — must match BreakpointMobileFrame values.
 * The staging canvas needs to know these to position itself AFTER the
 * breakpoint frame when one is active.
 *
 * SOURCE OF TRUTH: breakpoint-mobile-frame.tsx MOBILE_WIDTH and FRAME_GAP
 */
const BREAKPOINT_MOBILE_WIDTH = 390
const BREAKPOINT_FRAME_GAP = 40

// ============================================================================
// ELEMENT RENDERER - Recursive visual rendering for staged elements
// ============================================================================

interface StagingElementRendererProps {
  element: CanvasElement
  elementsMap: Record<string, CanvasElement>
  childrenMap: Record<string, string[]>
}

/**
 * Recursively renders a single staged element and its children.
 * Uses the same unified components as page-renderer but without
 * page element wrapping (staged content has no page element).
 *
 * CRITICAL: Root elements in the staging group have parentId === null
 * (they're floating, not parented to any page). The unified components
 * interpret parentId === null as "root element on canvas" and apply
 * position: absolute with x/y offsets. This breaks the staging preview
 * because absolute elements are removed from normal flow, collapsing
 * the preview container to 0px height.
 *
 * FIX: We override parentId to a sentinel value ('__staging__') on root
 * elements so unified components treat them as normal-flow children.
 * This makes them render with position: relative and width: 100%,
 * correctly participating in the preview's flex layout.
 *
 * Simplified version of page-renderer's ElementRenderer — no CMS,
 * no breakpoint, no component instances (AI doesn't generate those).
 */
function StagingElementRenderer({
  element,
  elementsMap,
  childrenMap,
}: StagingElementRendererProps) {
  if (!element.visible) return null

  /**
   * Override parentId for root elements (parentId === null) so unified
   * components render in normal flow instead of absolute positioning.
   * Uses a sentinel value that won't match any real element ID.
   */
  const renderElement = element.parentId === null
    ? { ...element, parentId: '__staging__' }
    : element

  /** Get and sort children for this element */
  const childIds = childrenMap[element.id] || []
  const children = childIds
    .map((id) => elementsMap[id])
    .filter((el): el is CanvasElement => el !== undefined && el.visible)
    .sort((a, b) => a.order - b.order)

  /** Render children recursively */
  const renderChildren = () =>
    children.map((child) => (
      <StagingElementRenderer
        key={child.id}
        element={child}
        elementsMap={elementsMap}
        childrenMap={childrenMap}
      />
    ))

  /** Frame — renders with children inside */
  if (renderElement.type === 'frame') {
    return (
      <UnifiedFrame key={renderElement.id} element={renderElement}>
        {renderChildren()}
      </UnifiedFrame>
    )
  }

  /** Text — leaf element */
  if (renderElement.type === 'text') {
    return <UnifiedText key={renderElement.id} element={renderElement} />
  }

  /** Image — leaf element */
  if (renderElement.type === 'image') {
    return <UnifiedImage key={renderElement.id} element={renderElement} />
  }

  /** Video — leaf element */
  if (renderElement.type === 'video') {
    return <UnifiedVideo key={renderElement.id} element={renderElement} />
  }

  /** Button — leaf element */
  if (renderElement.type === 'button') {
    return <UnifiedButton key={renderElement.id} element={renderElement} />
  }

  /** Form — leaf element */
  if (renderElement.type === 'form') {
    return <UnifiedForm key={renderElement.id} element={renderElement} />
  }

  /** Payment — leaf element */
  if (renderElement.type === 'payment') {
    return <UnifiedPayment key={renderElement.id} element={renderElement} />
  }

  /** FAQ — leaf element */
  if (renderElement.type === 'faq') {
    return <UnifiedFaq key={renderElement.id} element={renderElement} />
  }

  /** List — leaf element */
  if (renderElement.type === 'list') {
    return <UnifiedList key={renderElement.id} element={renderElement} />
  }

  /** Sticky Note — leaf element */
  if (renderElement.type === 'sticky-note') {
    return <UnifiedStickyNote key={renderElement.id} element={renderElement} />
  }

  /** Timer — leaf element */
  if (renderElement.type === 'timer') {
    return <UnifiedTimer key={renderElement.id} element={renderElement} />
  }

  /** Receipt — leaf element */
  if (renderElement.type === 'receipt') {
    return <UnifiedReceipt key={renderElement.id} element={renderElement} />
  }

  /** Rich Text — leaf element */
  if (renderElement.type === 'rich-text') {
    return <UnifiedRichText key={renderElement.id} element={renderElement} />
  }

  /** Pencil — leaf element */
  if (renderElement.type === 'pencil') {
    return <UnifiedPencil key={renderElement.id} element={renderElement} />
  }

  /** Link — renders with children inside */
  if (renderElement.type === 'link') {
    return (
      <UnifiedLink key={renderElement.id} element={renderElement}>
        {renderChildren()}
      </UnifiedLink>
    )
  }

  /** Unsupported type — skip */
  return null
}

// ============================================================================
// STAGING GROUP - On-canvas floating preview of a single generation
// ============================================================================

interface StagingGroupOnCanvasProps {
  group: StagingGroup
  /** X position in canvas coordinates (right of page + breakpoints) */
  canvasX: number
  /** Y position in canvas coordinates */
  canvasY: number
}

/**
 * Renders a single staging group as a floating preview on the canvas.
 * Positioned in canvas space (participates in pan/zoom). Draggable to
 * the page canvas. No label bar or dismiss buttons — just the content
 * preview with a streaming indicator while generating.
 */
function StagingGroupOnCanvas({ group, canvasX, canvasY }: StagingGroupOnCanvasProps) {
  const isStreaming = group.status === 'streaming'

  /** Drag handler — attaches staging group ID to the transfer data */
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (isStreaming) {
        e.preventDefault()
        return
      }
      const transferData = JSON.stringify({
        groupId: group.id,
        elementIds: Object.keys(group.elements),
      })
      e.dataTransfer.setData('application/x-staged-elements', transferData)
      e.dataTransfer.effectAllowed = 'copy'
    },
    [group.id, group.elements, isStreaming]
  )

  /** Root elements for rendering */
  const rootElements = useMemo(
    () =>
      group.rootIds
        .map((id) => group.elements[id])
        .filter(Boolean)
        .sort((a, b) => a.order - b.order),
    [group.rootIds, group.elements]
  )

  return (
    <div
      style={{
        position: 'absolute',
        left: canvasX,
        top: canvasY,
        width: STAGING_PREVIEW_WIDTH,
      }}
    >
      {/**
       * Streaming indicator — minimal spinner shown while AI is generating.
       * Positioned above the preview area, disappears when generation completes.
       */}
      {isStreaming && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
            padding: '4px 0',
          }}
        >
          <Loader2
            style={{
              width: 14,
              height: 14,
              color: '#3b82f6',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#94a3b8',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            Generating...
          </span>
        </div>
      )}

      {/* Visual preview — the actual rendered UI, draggable to page canvas */}
      <div
        draggable={!isStreaming}
        onDragStart={handleDragStart}
        style={{
          position: 'relative',
          width: STAGING_PREVIEW_WIDTH,
          overflow: 'hidden',
          borderRadius: 8,
          /**
           * Subtle border and shadow so the preview stands out
           * from the dark canvas background without being heavy.
           * Blue border while streaming, neutral when ready.
           */
          border: isStreaming
            ? '1px solid rgba(59, 130, 246, 0.3)'
            : '1px solid rgba(148, 163, 184, 0.2)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
          cursor: isStreaming ? 'default' : 'grab',
          background: '#ffffff',
        }}
      >
        {/**
         * Scale the full-width content (1440px) down to fit the preview width.
         * Uses CSS transform for clean pixel-perfect scaling.
         */}
        <div
          style={{
            transformOrigin: '0 0',
            transform: `scale(${PREVIEW_SCALE})`,
            width: CONTENT_RENDER_WIDTH,
            position: 'relative',
          }}
        >
          <RenderModeProvider mode="preview">
            {rootElements.map((element) => (
              <StagingElementRenderer
                key={element.id}
                element={element}
                elementsMap={group.elements}
                childrenMap={group.childrenMap}
              />
            ))}
          </RenderModeProvider>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN STAGING CANVAS COMPONENT
// ============================================================================

/**
 * StagingCanvas — renders AI-generated content as floating previews
 * directly on the canvas, positioned in the empty space to the right
 * of the page element (and any active breakpoint frames).
 *
 * This component renders INSIDE the canvas transform layer, so its
 * children participate in pan/zoom alongside page elements.
 *
 * BREAKPOINT AWARENESS: When the page has a mobile breakpoint enabled,
 * the staging position shifts right by the breakpoint width + gap to
 * avoid overlapping. Without this, staging previews render BEHIND the
 * mobile breakpoint frame and are invisible to the user.
 *
 * Only renders when there are staged groups to show.
 *
 * SOURCE OF TRUTH KEYWORDS: StagingCanvas, AIStagingCanvasComponent
 */
export function StagingCanvas() {
  const groups = useSelector(selectStagingGroups)
  const mainPage = useSelector(selectMainPage)

  /**
   * Compute position for each staging group in canvas coordinates.
   * Groups stack vertically to the right of ALL page-related frames.
   *
   * When a mobile breakpoint is active, the staging area shifts right
   * by BREAKPOINT_FRAME_GAP + BREAKPOINT_MOBILE_WIDTH to clear the
   * breakpoint frame. This matches the breakpoint positioning in
   * breakpoint-mobile-frame.tsx (left: page.x + page.width + FRAME_GAP).
   */
  const groupPositions = useMemo(() => {
    if (!mainPage || groups.length === 0) return []

    /**
     * Calculate the rightmost edge of all page-related frames.
     * Start with the main page, then add breakpoint offset if active.
     */
    let rightEdge = mainPage.x + mainPage.width

    /** Check if mobile breakpoint is active — shift past it */
    const hasMobileBreakpoint = (mainPage as PageElement).breakpoints?.mobile === true
    if (hasMobileBreakpoint) {
      rightEdge += BREAKPOINT_FRAME_GAP + BREAKPOINT_MOBILE_WIDTH
    }

    /** Position staging groups with a gap from the rightmost frame */
    const startX = rightEdge + STAGING_GAP
    const startY = mainPage.y

    let currentY = startY
    return groups.map(() => {
      const pos = { x: startX, y: currentY }
      /**
       * Estimate height for stacking. Use 300px as a reasonable default
       * since the actual rendered height isn't known until paint.
       * The gap between groups ensures they don't overlap.
       */
      currentY += 300 + STAGING_GROUP_GAP
      return pos
    })
  }, [groups, mainPage])

  /** Don't render anything when empty or no page to anchor to */
  if (groups.length === 0 || !mainPage) return null

  return (
    <>
      {groups.map((group, index) => (
        <StagingGroupOnCanvas
          key={group.id}
          group={group}
          canvasX={groupPositions[index]?.x ?? 0}
          canvasY={groupPositions[index]?.y ?? 0}
        />
      ))}
    </>
  )
}
