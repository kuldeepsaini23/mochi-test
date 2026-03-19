/**
 * ============================================================================
 * USE PENCIL CREATION - Multi-Stroke Freehand Drawing Hook
 * ============================================================================
 *
 * Handles freehand pencil drawing on the canvas via click-and-drag.
 * Supports both single-stroke and multi-stroke (Shift-held) drawing.
 *
 * ============================================================================
 * CRITICAL ARCHITECTURE - READ BEFORE MODIFYING
 * ============================================================================
 *
 * This hook follows the same REF pattern as useFrameCreation:
 *
 * 1. onPointerDown on canvas → Initialize drawingStateRef (REF)
 * 2. onPointerMove → Collect points in REF, update SVG path preview via RAF
 * 3. onPointerUp → Finalize stroke:
 *    a. No Shift held → create single-stroke element immediately
 *    b. Shift held → accumulate stroke, wait for more strokes
 * 4. Shift key released → finalize all accumulated strokes into one element
 *
 * WHY REFS?
 * - Pointer events fire 60+ times per second during drawing
 * - Redux dispatch on each move would trigger 60 re-renders/second
 * - Refs update without re-renders, SVG preview is smooth via RAF
 *
 * ============================================================================
 * MULTI-STROKE FLOW
 * ============================================================================
 *
 * 1. User activates pen tool → stays in pen mode (no auto-deactivate)
 * 2. User draws stroke WITHOUT Shift → single-stroke element created, pen stays
 * 3. User holds Shift + draws → stroke accumulated in ref
 * 4. User lifts pen (Shift still held) → stroke pushed to accumulator
 * 5. User draws more with Shift → more strokes accumulated
 * 6. User releases Shift → all accumulated strokes finalized into ONE element
 * 7. Esc key → cancel & discard any accumulated strokes
 *
 * ============================================================================
 * SMOOTHING ALGORITHM - Catmull-Rom Spline Interpolation
 * ============================================================================
 *
 * Raw mouse input is noisy and produces jagged paths. We apply:
 * 1. Distance-based sampling: Only add point when cursor moves > 3px from last
 * 2. Catmull-Rom to SVG cubic bezier conversion for smooth curves
 * 3. Path normalization on completion (translate to 0,0 origin)
 *
 * ============================================================================
 * SOURCE OF TRUTH: usePencilCreation, pencil-creation-hook, freehand-drawing,
 *                  multi-stroke-drawing
 * ============================================================================
 */

import React, { useCallback, useRef, useEffect, useState } from 'react'
import {
  useAppDispatch,
  useAppSelector,
  selectViewport,
  selectToolMode,
  selectPenStrokeColor,
  selectPenBrushSize,
  selectPenStrokeOpacity,
  addElement,
  setSelection,
  setToolMode,
  generateElementId,
} from '../_lib'
import type {
  PencilCreationState,
  PencilElement,
  PencilStroke,
  PencilAccumulatedStroke,
} from '../_lib/types'
import {
  MIN_PENCIL_CREATION_SIZE,
  DEFAULT_PENCIL_PROPS,
  DEFAULT_PENCIL_STYLES,
} from '../_lib/types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum distance (px) between consecutive points to reduce noise */
const MIN_POINT_DISTANCE = 3

/** Stroke-width padding added to bounding box so strokes aren't clipped at edges */
const BOUNDING_BOX_PADDING = 2

// ============================================================================
// TYPES
// ============================================================================

interface UsePencilCreationOptions {
  /** Ref to canvas container for coordinate transforms */
  canvasRef: React.RefObject<HTMLDivElement | null>
}

interface UsePencilCreationReturn {
  /** Current preview data for rendering (null when idle) */
  drawingPreview: PencilDrawingPreview | null
  /** Whether pencil drawing is in progress */
  isDrawing: boolean
  /** Whether multi-stroke session is active (Shift held, strokes accumulated) */
  isMultiStrokeActive: boolean
  /** Handler for canvas pointer down (start drawing) */
  handleCanvasPointerDown: (e: React.PointerEvent) => void
}

/**
 * Preview state passed to the PencilCreationPreview component.
 * Contains an array of strokes (each with pathData, color, width) for
 * rendering both the current in-progress stroke and any accumulated strokes.
 *
 * SOURCE OF TRUTH: PencilDrawingPreview, pencil-preview-type
 */
export interface PencilDrawingPreview {
  /** Array of strokes to render — includes accumulated + current in-progress */
  strokes: Array<{
    pathData: string
    strokeColor: string
    strokeWidth: number
    strokeOpacity: number
  }>
  /** Whether this is a multi-stroke session (shows visual indicator) */
  isMultiStroke: boolean
}

// ============================================================================
// SMOOTHING ALGORITHM - Catmull-Rom Spline to SVG Cubic Bezier
// ============================================================================

/**
 * Convert an array of points to a smooth SVG path string using
 * Catmull-Rom spline interpolation converted to cubic bezier curves.
 *
 * WHY CATMULL-ROM?
 * - The curve passes THROUGH all control points (unlike raw cubic bezier)
 * - Produces visually natural curves from mouse input
 * - Simple math: each segment only needs 4 neighboring points
 *
 * CONVERSION: Each Catmull-Rom segment between P[i] and P[i+1]
 * (with neighbors P[i-1] and P[i+2]) converts to SVG cubic bezier:
 *   C (P[i] + (P[i+1] - P[i-1]) / 6), (P[i+1] - (P[i+2] - P[i]) / 6), P[i+1]
 */
function pointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''

  /* Single point — draw a tiny line so the dot is visible */
  if (points.length === 1) {
    const p = points[0]
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y}`
  }

  /* Two points — straight line */
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  /* 3+ points — Catmull-Rom spline converted to cubic bezier */
  let path = `M ${points[0].x} ${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    /* Clamp neighbors at array boundaries (duplicate first/last as missing neighbor) */
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    /* Catmull-Rom to cubic bezier control points */
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }

  return path
}

/**
 * Normalize an array of points so all coordinates are relative to a given origin.
 * Subtracts the global bounding box origin (minX, minY) from every point.
 *
 * WHY: The element stores its canvas position in x,y. The pathData must be
 * relative to the element's own origin so the SVG viewBox works correctly
 * when the element is moved or resized.
 */
function normalizedPathFromPoints(
  points: Array<{ x: number; y: number }>,
  minX: number,
  minY: number,
): string {
  const shifted = points.map((p) => ({
    x: p.x - minX,
    y: p.y - minY,
  }))
  return pointsToSvgPath(shifted)
}

// ============================================================================
// HELPER: Create empty drawing state
// ============================================================================

function createEmptyDrawingState(): PencilCreationState {
  return {
    isDrawing: false,
    points: [],
    currentPathData: '',
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  }
}

// ============================================================================
// HELPER: Build preview from accumulated strokes + optional current stroke
// ============================================================================

/**
 * Build preview data combining all accumulated strokes and the
 * current in-progress stroke (if actively drawing).
 * Used to update the PencilCreationPreview rendering in real-time.
 */
function buildPreview(
  accumulated: PencilAccumulatedStroke[],
  currentState: PencilCreationState | null,
  currentColor: string,
  currentWidth: number,
  currentOpacity: number,
): PencilDrawingPreview {
  const strokes: PencilDrawingPreview['strokes'] = []

  /* Add all previously completed accumulated strokes */
  for (const acc of accumulated) {
    strokes.push({
      pathData: pointsToSvgPath(acc.points),
      strokeColor: acc.strokeColor,
      strokeWidth: acc.strokeWidth,
      strokeOpacity: acc.strokeOpacity,
    })
  }

  /* Add the current in-progress stroke (if drawing) */
  if (currentState && currentState.isDrawing && currentState.points.length > 0) {
    strokes.push({
      pathData: pointsToSvgPath(currentState.points),
      strokeColor: currentColor,
      strokeWidth: currentWidth,
      strokeOpacity: currentOpacity,
    })
  }

  return {
    strokes,
    isMultiStroke: accumulated.length > 0,
  }
}

// ============================================================================
// HELPER: Finalize strokes into a PencilElement and dispatch to Redux
// ============================================================================

/**
 * Given an array of accumulated strokes, compute the global bounding box,
 * normalize all path coordinates, and create a PencilElement.
 * Returns null if the bounding box is too small (user barely drew).
 */
function createPencilElementFromStrokes(
  allStrokes: PencilAccumulatedStroke[],
): PencilElement | null {
  if (allStrokes.length === 0) return null

  /* Compute the maximum strokeWidth across all strokes (for padding) */
  let maxStrokeWidth = 0
  for (const s of allStrokes) {
    if (s.strokeWidth > maxStrokeWidth) maxStrokeWidth = s.strokeWidth
  }

  /* Compute GLOBAL bounding box — union of all per-stroke bounding boxes */
  let globalMinX = Infinity
  let globalMinY = Infinity
  let globalMaxX = -Infinity
  let globalMaxY = -Infinity

  for (const s of allStrokes) {
    if (s.minX < globalMinX) globalMinX = s.minX
    if (s.minY < globalMinY) globalMinY = s.minY
    if (s.maxX > globalMaxX) globalMaxX = s.maxX
    if (s.maxY > globalMaxY) globalMaxY = s.maxY
  }

  /* Add padding so strokes aren't clipped at SVG edges */
  const padding = maxStrokeWidth + BOUNDING_BOX_PADDING
  globalMinX -= padding
  globalMinY -= padding
  globalMaxX += padding
  globalMaxY += padding

  const bboxWidth = globalMaxX - globalMinX
  const bboxHeight = globalMaxY - globalMinY

  /* Only create element if it meets minimum size */
  if (bboxWidth < MIN_PENCIL_CREATION_SIZE || bboxHeight < MIN_PENCIL_CREATION_SIZE) {
    return null
  }

  /* Normalize each stroke's points to the global bounding box origin */
  const pencilStrokes: PencilStroke[] = allStrokes.map((s) => ({
    pathData: normalizedPathFromPoints(s.points, globalMinX, globalMinY),
    strokeColor: s.strokeColor,
    strokeWidth: s.strokeWidth,
    strokeOpacity: s.strokeOpacity,
  }))

  return {
    id: generateElementId(),
    type: 'pencil',
    name: 'Drawing',
    x: globalMinX,
    y: globalMinY,
    width: bboxWidth,
    height: bboxHeight,
    parentId: null,
    order: 0,
    visible: true,
    locked: false,
    container: false,
    strokes: pencilStrokes,
    viewBoxWidth: bboxWidth,
    viewBoxHeight: bboxHeight,
    fillColor: DEFAULT_PENCIL_PROPS.fillColor,
    lineCap: DEFAULT_PENCIL_PROPS.lineCap,
    lineJoin: DEFAULT_PENCIL_PROPS.lineJoin,
    autoHeight: false,
    autoWidth: false,
    styles: { ...DEFAULT_PENCIL_STYLES },
  }
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for freehand pencil drawing on the canvas.
 *
 * ARCHITECTURE:
 * - Uses refs for drawing state (60fps performance)
 * - Uses RAF for preview SVG updates
 * - Dispatches addElement to Redux only on drawing complete
 * - Reads pen stroke color + brush size from Redux (set by toolbar swatches)
 * - Stays in pen mode after drawing (user must press Esc or switch tools)
 * - Shift key enables multi-stroke accumulation into one element
 *
 * SOURCE OF TRUTH: usePencilCreation, pencil-creation-hook
 */
export function usePencilCreation({
  canvasRef,
}: UsePencilCreationOptions): UsePencilCreationReturn {
  const dispatch = useAppDispatch()
  const viewport = useAppSelector(selectViewport)
  const toolMode = useAppSelector(selectToolMode)
  const penStrokeColor = useAppSelector(selectPenStrokeColor)
  const penBrushSize = useAppSelector(selectPenBrushSize)
  const penStrokeOpacity = useAppSelector(selectPenStrokeOpacity)

  // ========================================================================
  // REFS - Performance-critical state (NO re-renders during drawing)
  // ========================================================================

  /** Drawing state stored in REF — updated 60+ times/sec without re-renders */
  const drawingStateRef = useRef<PencilCreationState>(createEmptyDrawingState())

  /** RAF handle for cancellation */
  const rafRef = useRef<number | null>(null)

  /** Snapshot pen color at drawing start (don't change mid-stroke) */
  const strokeColorRef = useRef<string>('#000000')

  /** Snapshot brush size at drawing start (don't change mid-stroke) */
  const brushSizeRef = useRef<number>(3)

  /** Snapshot stroke opacity at drawing start (don't change mid-stroke) */
  const opacityRef = useRef<number>(1)

  /** Whether Shift key is currently held (for multi-stroke mode) */
  const isShiftHeldRef = useRef<boolean>(false)

  /** Accumulated strokes for multi-stroke mode (Shift-held between drawings) */
  const accumulatedStrokesRef = useRef<PencilAccumulatedStroke[]>([])

  // ========================================================================
  // UI STATE - For rendering preview SVG + external components
  // ========================================================================

  /** Preview data for the SVG path(s) being drawn (null when idle) */
  const [drawingPreview, setDrawingPreview] = useState<PencilDrawingPreview | null>(null)

  /** Simple boolean — true while pen is down and drawing */
  const [isDrawing, setIsDrawing] = useState(false)

  /** True when multi-stroke session has accumulated strokes (for hint UI) */
  const [isMultiStrokeActive, setIsMultiStrokeActive] = useState(false)

  // ========================================================================
  // COORDINATE HELPERS
  // ========================================================================

  /** Convert screen coordinates to canvas coordinates (accounts for pan + zoom) */
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: clientX, y: clientY }

      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left - viewport.panX) / viewport.zoom,
        y: (clientY - rect.top - viewport.panY) / viewport.zoom,
      }
    },
    [canvasRef, viewport.panX, viewport.panY, viewport.zoom],
  )

  // ========================================================================
  // FINALIZE: Create element from accumulated strokes and dispatch to Redux
  // ========================================================================

  /**
   * Finalize all accumulated strokes into one PencilElement.
   * Called when Shift is released (multi-stroke) or on single-stroke completion.
   */
  const finalizeStrokes = useCallback(
    (strokes: PencilAccumulatedStroke[]) => {
      const element = createPencilElementFromStrokes(strokes)
      if (element) {
        dispatch(addElement(element))
        dispatch(setSelection(element.id))
      }

      /* Clear accumulator and preview */
      accumulatedStrokesRef.current = []
      setIsMultiStrokeActive(false)
      setDrawingPreview(null)
    },
    [dispatch],
  )

  // ========================================================================
  // DRAWING START
  // ========================================================================

  /**
   * Start a freehand pencil drawing.
   * Only activates when toolMode is 'pen'.
   */
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (toolMode !== 'pen') return

      /* Only handle direct canvas clicks, not element clicks */
      const target = e.target as HTMLElement
      if (target.closest('[data-element-id]')) return

      e.preventDefault()
      target.setPointerCapture(e.pointerId)

      /* Snapshot the pen color and brush size at the moment drawing starts */
      strokeColorRef.current = penStrokeColor
      brushSizeRef.current = penBrushSize
      opacityRef.current = penStrokeOpacity

      /* Get start position in canvas coords */
      const startPos = screenToCanvas(e.clientX, e.clientY)

      /* Initialize drawing state in REF (not Redux!) */
      drawingStateRef.current = {
        isDrawing: true,
        points: [startPos],
        currentPathData: `M ${startPos.x} ${startPos.y}`,
        minX: startPos.x,
        minY: startPos.y,
        maxX: startPos.x,
        maxY: startPos.y,
      }

      setIsDrawing(true)

      /* Build preview with accumulated strokes + current in-progress stroke */
      setDrawingPreview(
        buildPreview(
          accumulatedStrokesRef.current,
          drawingStateRef.current,
          penStrokeColor,
          penBrushSize,
          penStrokeOpacity,
        ),
      )
    },
    [toolMode, screenToCanvas, penStrokeColor, penBrushSize, penStrokeOpacity],
  )

  // ========================================================================
  // DRAWING MOVE - Collects points, updates preview via RAF
  // ========================================================================

  const handleDrawingMove = useCallback(
    (e: PointerEvent) => {
      const state = drawingStateRef.current
      if (!state.isDrawing) return

      const pos = screenToCanvas(e.clientX, e.clientY)

      /* Distance-based sampling — skip if too close to last point */
      const lastPoint = state.points[state.points.length - 1]
      const dx = pos.x - lastPoint.x
      const dy = pos.y - lastPoint.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < MIN_POINT_DISTANCE) return

      /* Add point to REF array */
      state.points.push(pos)

      /* Update running bounding box */
      if (pos.x < state.minX) state.minX = pos.x
      if (pos.y < state.minY) state.minY = pos.y
      if (pos.x > state.maxX) state.maxX = pos.x
      if (pos.y > state.maxY) state.maxY = pos.y

      /* Update preview SVG via RAF for smooth 60fps rendering */
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        state.currentPathData = pointsToSvgPath(state.points)
        setDrawingPreview(
          buildPreview(
            accumulatedStrokesRef.current,
            state,
            strokeColorRef.current,
            brushSizeRef.current,
            opacityRef.current,
          ),
        )
      })
    },
    [screenToCanvas],
  )

  // ========================================================================
  // DRAWING END - Finalize stroke or accumulate for multi-stroke
  // ========================================================================

  const handleDrawingEnd = useCallback(
    (e: PointerEvent) => {
      const state = drawingStateRef.current
      if (!state.isDrawing) return

      /* Release pointer capture */
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

      /* Mark drawing as done in ref */
      state.isDrawing = false
      setIsDrawing(false)

      /* Cancel any pending RAF */
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      /* Only process if we have enough points for a meaningful stroke */
      if (state.points.length < 2) {
        /* Not enough points — if no accumulated strokes, clear preview */
        if (accumulatedStrokesRef.current.length === 0) {
          setDrawingPreview(null)
        } else {
          /* Show accumulated strokes without the failed current one */
          setDrawingPreview(
            buildPreview(accumulatedStrokesRef.current, null, '', 0, 1),
          )
        }
        drawingStateRef.current = createEmptyDrawingState()
        return
      }

      /* Build the completed stroke from the current drawing state */
      const completedStroke: PencilAccumulatedStroke = {
        points: [...state.points],
        strokeColor: strokeColorRef.current,
        strokeWidth: brushSizeRef.current,
        strokeOpacity: opacityRef.current,
        minX: state.minX,
        minY: state.minY,
        maxX: state.maxX,
        maxY: state.maxY,
      }

      /* Reset drawing state for the next potential stroke */
      drawingStateRef.current = createEmptyDrawingState()

      if (isShiftHeldRef.current) {
        /* MULTI-STROKE MODE: Accumulate this stroke, wait for more */
        accumulatedStrokesRef.current.push(completedStroke)
        setIsMultiStrokeActive(true)

        /* Update preview to show all accumulated strokes (no current in-progress) */
        setDrawingPreview(
          buildPreview(accumulatedStrokesRef.current, null, '', 0, 1),
        )
      } else {
        /* SINGLE-STROKE MODE: Create element immediately */
        const allStrokes = [...accumulatedStrokesRef.current, completedStroke]
        finalizeStrokes(allStrokes)
      }

      /* Pen tool stays active — no setToolMode('select') here */
    },
    [finalizeStrokes],
  )

  // ========================================================================
  // KEYBOARD LISTENERS - Shift (multi-stroke) + Escape (cancel)
  // ========================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      /* Track Shift key state for multi-stroke mode */
      if (e.key === 'Shift') {
        isShiftHeldRef.current = true
      }

      /* Escape: cancel current drawing + discard accumulated strokes */
      if (e.key === 'Escape' && toolMode === 'pen') {
        /* Cancel any in-progress drawing */
        drawingStateRef.current = createEmptyDrawingState()
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }

        /* Discard accumulated strokes */
        accumulatedStrokesRef.current = []
        setIsDrawing(false)
        setIsMultiStrokeActive(false)
        setDrawingPreview(null)

        /* Switch back to select mode */
        dispatch(setToolMode('select'))
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isShiftHeldRef.current = false

        /* If not currently drawing and we have accumulated strokes, finalize them */
        const currentState = drawingStateRef.current
        if (!currentState.isDrawing && accumulatedStrokesRef.current.length > 0) {
          finalizeStrokes(accumulatedStrokesRef.current)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [toolMode, dispatch, finalizeStrokes])

  // ========================================================================
  // GLOBAL POINTER EVENT LISTENERS
  // ========================================================================

  useEffect(() => {
    window.addEventListener('pointermove', handleDrawingMove)
    window.addEventListener('pointerup', handleDrawingEnd)

    return () => {
      window.removeEventListener('pointermove', handleDrawingMove)
      window.removeEventListener('pointerup', handleDrawingEnd)
    }
  }, [handleDrawingMove, handleDrawingEnd])

  // ========================================================================
  // CLEANUP: Reset accumulator when leaving pen mode
  // ========================================================================

  useEffect(() => {
    if (toolMode !== 'pen') {
      /* If user switches away from pen mode, finalize any accumulated strokes */
      if (accumulatedStrokesRef.current.length > 0) {
        finalizeStrokes(accumulatedStrokesRef.current)
      }
      /* Reset everything */
      drawingStateRef.current = createEmptyDrawingState()
      setIsDrawing(false)
      setIsMultiStrokeActive(false)
      setDrawingPreview(null)
    }
  }, [toolMode, finalizeStrokes])

  return { drawingPreview, isDrawing, isMultiStrokeActive, handleCanvasPointerDown }
}
