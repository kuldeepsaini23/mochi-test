/**
 * ============================================================================
 * TOOLBAR - Tool Mode Selection (Bottom Center)
 * ============================================================================
 *
 * Modern pill-shaped toolbar for switching between tool modes.
 * Positioned at the bottom center of the canvas with a sleek dark design.
 *
 * TOOLS:
 * - Select tool (V): Default mode for moving/resizing elements
 * - Text tool (T): Text element creation
 * - Frame tool (F): Draw new frames/rectangles (hash icon)
 * - Image tool (I): Image element creation
 * - Button tool (B): Button element creation
 * - Sticky Note tool (S): Sticky note element creation
 * - Circle Frame tool (O): Frame with max border-radius (circle/ellipse)
 * - Pen tool (P): Freehand pencil drawing with color/opacity/size bar
 *
 * NOTE: Undo/Redo controls are in the header (BuilderHeader).
 * Keyboard shortcuts for undo/redo are still handled here for convenience.
 * AI assistant is handled separately and is no longer part of this toolbar.
 *
 * ============================================================================
 * ARCHITECTURE REMINDER
 * ============================================================================
 *
 * Tool mode is stored in Redux because:
 * - It changes infrequently (user clicks a tool)
 * - Multiple components need to react to it
 * - It's OK to re-render on tool change
 *
 * This is different from drag/resize state which updates 60fps.
 *
 * ============================================================================
 */

'use client'

import React, { memo, useEffect, useCallback, useState, useRef } from 'react'
import { ArrowBigUpIcon, Pencil } from 'lucide-react'
import {
  useAppDispatch,
  useAppSelector,
  selectToolMode,
  selectCanUndo,
  selectCanRedo,
  selectPenStrokeColor,
  selectPenBrushSize,
  selectPenStrokeOpacity,
  setToolMode,
  setPenStrokeColor,
  setPenBrushSize,
  setPenStrokeOpacity,
  undo,
  redo,
} from '../_lib'
import type { ToolMode } from '../_lib/types'

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Props for the Toolbar component
 */
interface ToolbarProps {
  /** Callback to toggle the spotlight search overlay (Cmd+F) */
  onToggleSpotlight?: () => void
}

/**
 * Modern toolbar for tool selection.
 * Pill-shaped design positioned at bottom center of canvas.
 *
 * Features:
 * - Select tool for moving/resizing elements
 * - Text creation tool
 * - Frame/rectangle tool (hash icon)
 * - Shape tool (circle icon)
 */
export const Toolbar = memo(function Toolbar({
  onToggleSpotlight,
}: ToolbarProps) {
  const dispatch = useAppDispatch()
  const toolMode = useAppSelector(selectToolMode)
  const canUndo = useAppSelector(selectCanUndo)
  const canRedo = useAppSelector(selectCanRedo)
  const penStrokeColor = useAppSelector(selectPenStrokeColor)
  const penBrushSize = useAppSelector(selectPenBrushSize)
  const penStrokeOpacity = useAppSelector(selectPenStrokeOpacity)

  /** Ref for the pen button — used to position the color bar popover */
  const penButtonRef = useRef<HTMLDivElement>(null)

  /**
   * Handle tool selection.
   * Dispatches to Redux to update tool mode.
   */
  const handleToolSelect = useCallback(
    (mode: ToolMode) => {
      dispatch(setToolMode(mode))
    },
    [dispatch],
  )

  // ========================================================================
  // KEYBOARD SHORTCUTS
  // ========================================================================

  /**
   * Global keyboard shortcuts for toolbar actions.
   *
   * SHORTCUTS:
   * - V: Select tool (move/resize elements)
   * - T: Text tool
   * - F: Frame tool (draw new frames)
   * - I: Image tool
   * - B: Button tool
   * - S: Sticky note tool
   * - O: Circle frame tool
   * - P: Pen/Pencil tool
   * - Cmd/Ctrl + J: Toggle AI panel
   * - Cmd/Ctrl + Z: Undo
   * - Cmd/Ctrl + Shift + Z: Redo
   * - Cmd/Ctrl + Y: Redo (Windows alternative)
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when user is typing in any editable element
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return
      }

      const isMac = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // Tool shortcuts (no modifier needed)
      if (!modKey && !e.shiftKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            e.preventDefault()
            handleToolSelect('select')
            break
          case 't':
            e.preventDefault()
            handleToolSelect('text')
            break
          case 'f':
            e.preventDefault()
            handleToolSelect('frame')
            break
          case 'i':
            e.preventDefault()
            handleToolSelect('image')
            break
          case 'b':
            e.preventDefault()
            handleToolSelect('button')
            break
          case 's':
            e.preventDefault()
            handleToolSelect('sticky-note')
            break
          case 'o':
            e.preventDefault()
            handleToolSelect('circle-frame')
            break
          case 'p':
            e.preventDefault()
            handleToolSelect('pen')
            break
        }
      }

      // Toggle Spotlight Search: Cmd/Ctrl + F
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        onToggleSpotlight?.()
      }

      // Undo: Cmd/Ctrl + Z
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (canUndo) {
          dispatch(undo())
        }
      }

      // Redo: Cmd/Ctrl + Shift + Z (Mac & Windows) OR Ctrl + Y (Windows)
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (canRedo) {
          dispatch(redo())
        }
      }

      // Redo alternative: Ctrl + Y (Windows)
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        if (canRedo) {
          dispatch(redo())
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dispatch, canUndo, canRedo, handleToolSelect, onToggleSpotlight])

  return (
    <>
      {/* ================================================================
        PEN TOOL BAR — Centered above toolbar, only when pen mode active
        Rendered OUTSIDE the toolbar pill so it centers independently.
        ================================================================ */}
      {toolMode === 'pen' && (
        <div
          style={{
            position: 'absolute',
            bottom: 76,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {/* Hint message — sits right above the color bar */}
          <div
            style={{
              padding: '4px 12px',
              borderRadius: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: 11,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            Hold
            <ArrowBigUpIcon size={18} /> to continue drawing
          </div>

          {/* The actual color/opacity/size bar */}
          <PenToolBar
            activeColor={penStrokeColor}
            brushSize={penBrushSize}
            opacity={penStrokeOpacity}
            onColorChange={(color) => dispatch(setPenStrokeColor(color))}
            onBrushSizeChange={(size) => dispatch(setPenBrushSize(size))}
            onOpacityChange={(opacity) =>
              dispatch(setPenStrokeOpacity(opacity))
            }
          />
        </div>
      )}

      <div
        className="toolbar-container"
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '8px 12px',
          backgroundColor: '#0a0a0a',
          borderRadius: 40,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow:
            '0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)',
          zIndex: 9999,
        }}
      >
        {/* Select Tool */}
        <ToolButton
          active={toolMode === 'select'}
          onClick={() => handleToolSelect('select')}
          title="Select tool (V)"
        >
          <SelectIcon />
        </ToolButton>

        {/* Divider */}
        <Divider />

        {/* Text Tool */}
        <ToolButton
          active={toolMode === 'text'}
          onClick={() => handleToolSelect('text')}
          title="Text tool (T)"
        >
          <TextIcon />
        </ToolButton>

        {/* Frame Tool - uses hash/grid icon */}
        <ToolButton
          active={toolMode === 'frame'}
          onClick={() => handleToolSelect('frame')}
          title="Frame tool (F)"
        >
          <HashIcon />
        </ToolButton>

        {/* Circle Frame Tool - frame with max border-radius */}
        <ToolButton
          active={toolMode === 'circle-frame'}
          onClick={() => handleToolSelect('circle-frame')}
          title="Circle frame (O)"
        >
          <CircleFrameIcon />
        </ToolButton>

        {/* Divider */}
        <Divider />

        {/* Image Tool - image/picture icon */}
        <ToolButton
          active={toolMode === 'image'}
          onClick={() => handleToolSelect('image')}
          title="Image tool (I)"
        >
          <ImageIcon />
        </ToolButton>

        {/* Button Tool - rectangle with text */}
        <ToolButton
          active={toolMode === 'button'}
          onClick={() => handleToolSelect('button')}
          title="Button tool (B)"
        >
          <ButtonIcon />
        </ToolButton>

        {/* Divider */}
        <Divider />

        {/* Sticky Note Tool - post-it note icon */}
        <ToolButton
          active={toolMode === 'sticky-note'}
          onClick={() => handleToolSelect('sticky-note')}
          title="Sticky note (S)"
        >
          <StickyNoteIcon />
        </ToolButton>

        {/* Pen/Pencil Drawing Tool — lucide Pencil icon */}
        <div ref={penButtonRef}>
          <ToolButton
            active={toolMode === 'pen'}
            onClick={() => handleToolSelect('pen')}
            title="Pencil tool (P)"
          >
            <Pencil size={18} />
          </ToolButton>
        </div>

      </div>
    </>
  )
})

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface ToolButtonProps {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}

/**
 * Individual tool button with active/disabled states.
 * Clean, minimal design without dropdown indicators.
 */
function ToolButton({
  active = false,
  disabled = false,
  onClick,
  title,
  children,
}: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        minWidth: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 8px',
        backgroundColor: active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'
        }
      }}
    >
      {children}
    </button>
  )
}

/**
 * Vertical divider between tool groups.
 */
function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        margin: '0 6px',
      }}
    />
  )
}

// ============================================================================
// ICONS (Refined inline SVGs matching the reference design)
// ============================================================================

function SelectIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <path d="M4 4l8 16 2-6 6-2L4 4z" />
    </svg>
  )
}

function HashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line
        x1="9"
        y1="4"
        x2="9"
        y2="20"
      />
      <line
        x1="15"
        y1="4"
        x2="15"
        y2="20"
      />
      <line
        x1="4"
        y1="9"
        x2="20"
        y2="9"
      />
      <line
        x1="4"
        y1="15"
        x2="20"
        y2="15"
      />
    </svg>
  )
}

function TextIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="19"
      />
      <line
        x1="6"
        y1="5"
        x2="18"
        y2="5"
      />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
        ry="2"
      />
      <circle
        cx="8.5"
        cy="8.5"
        r="1.5"
      />
      <polyline points="21,15 16,10 5,21" />
    </svg>
  )
}

function ButtonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect
        x="3"
        y="6"
        width="18"
        height="12"
        rx="4"
      />
      <line
        x1="8"
        y1="12"
        x2="16"
        y2="12"
      />
    </svg>
  )
}

function CircleFrameIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeDasharray="3 2"
    >
      <circle
        cx="12"
        cy="12"
        r="8"
      />
    </svg>
  )
}

function StickyNoteIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z" />
      <path d="M14 3v6h7" />
    </svg>
  )
}


// ============================================================================
// PEN TOOL BAR — Floating horizontal dark bar with gradient slider, opacity,
//                quick swatches, and brush size. Centered like the toolbar.
// ============================================================================

/**
 * CSS for the pen tool bar slide-up entrance animation.
 */
const PEN_BAR_CSS = `
@keyframes penBarSlideUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`

/** Quick-pick color swatches — 4 useful preset colors */
const QUICK_COLORS = ['#000000', '#ffffff', '#ef4444', '#3b82f6'] as const

/** Brush size presets with visual dot diameters */
const BRUSH_SIZES = [
  { value: 2, dot: 4 },
  { value: 4, dot: 7 },
  { value: 6, dot: 10 },
  { value: 8, dot: 14 },
] as const

/**
 * Soft spectrum gradient matching the reference screenshot.
 * Pink → purple → blue → cyan → green → yellow-green → yellow
 * Much more subtle than a raw HSL rainbow.
 */
const SOFT_SPECTRUM_GRADIENT =
  'linear-gradient(to right, #e84393, #a855f7, #6366f1, #38bdf8, #34d399, #a3e635, #facc15)'

interface PenToolBarProps {
  activeColor: string
  brushSize: number
  opacity: number
  onColorChange: (color: string) => void
  onBrushSizeChange: (size: number) => void
  onOpacityChange: (opacity: number) => void
}

/**
 * Floating horizontal dark bar with color slider, opacity, swatches, and size.
 * No labels — clean minimal design matching the reference screenshot.
 *
 * LAYOUT: [ Color Slider | Opacity Slider | 4 Quick Swatches | 4 Size Dots ]
 *
 * SOURCE OF TRUTH: PenToolBar, pen-tool-bar, pencil-color-picker
 */
function PenToolBar({
  activeColor,
  brushSize,
  opacity,
  onColorChange,
  onBrushSizeChange,
  onOpacityChange,
}: PenToolBarProps) {
  const hueTrackRef = useRef<HTMLDivElement>(null)
  const opacityTrackRef = useRef<HTMLDivElement>(null)
  const [isDraggingHue, setIsDraggingHue] = useState(false)
  const [isDraggingOpacity, setIsDraggingOpacity] = useState(false)

  // ========================================================================
  // COLOR CONVERSION — HSL ↔ Hex for slider positioning
  // ========================================================================

  /** Convert hue (0–360) to hex at full saturation, 50% lightness */
  const hueToHex = useCallback((hue: number): string => {
    const h = hue / 360
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = 1 // l=0.5, s=1 → q = 1
    const p = 0 // 2*0.5 - 1 = 0
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255)
    const g = Math.round(hue2rgb(p, q, h) * 255)
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }, [])

  /** Convert hex to approximate hue (0–360) for slider thumb position */
  const hexToHue = useCallback((hex: string): number => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!m) return 0
    const r = parseInt(m[1], 16) / 255
    const g = parseInt(m[2], 16) / 255
    const b = parseInt(m[3], 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max === min) return 0
    const d = max - min
    let h = 0
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
    return Math.round(h * 360)
  }, [])

  // ========================================================================
  // SLIDER INTERACTIONS — Click + drag on color / opacity tracks
  // ========================================================================

  const handleHueInteraction = useCallback(
    (clientX: number) => {
      const track = hueTrackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      onColorChange(hueToHex(Math.round(ratio * 360)))
    },
    [onColorChange, hueToHex],
  )

  const handleOpacityInteraction = useCallback(
    (clientX: number) => {
      const track = opacityTrackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      onOpacityChange(Math.round(ratio * 100) / 100)
    },
    [onOpacityChange],
  )

  /** Global mouse listeners for drag-to-slide on both sliders */
  useEffect(() => {
    if (!isDraggingHue && !isDraggingOpacity) return
    const handleMove = (e: MouseEvent) => {
      if (isDraggingHue) handleHueInteraction(e.clientX)
      if (isDraggingOpacity) handleOpacityInteraction(e.clientX)
    }
    const handleUp = () => {
      setIsDraggingHue(false)
      setIsDraggingOpacity(false)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [
    isDraggingHue,
    isDraggingOpacity,
    handleHueInteraction,
    handleOpacityInteraction,
  ])

  const huePosition = hexToHue(activeColor) / 360

  // ========================================================================
  // RENDER — Horizontal dark pill bar
  // ========================================================================

  return (
    <div
      style={{
        marginBottom:"16px",
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        backgroundColor: '#111111',
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.07)',
        boxShadow:
          '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
        animation: 'penBarSlideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      }}
    >
      <style>{PEN_BAR_CSS}</style>

      {/* COLOR SLIDER — Soft spectrum gradient, pill-shaped Apple-style thumb */}
      <div
        ref={hueTrackRef}
        onMouseDown={(e) => {
          setIsDraggingHue(true)
          handleHueInteraction(e.clientX)
        }}
        style={{
          position: 'relative',
          width: 180,
          height: 22,
          borderRadius: 11,
          background: SOFT_SPECTRUM_GRADIENT,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {/* Apple-style oval/pill thumb */}
        <div
          style={{
            position: 'absolute',
            left: `${huePosition * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8,
            height: 18,
            borderRadius: 4,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            boxShadow:
              '0 1px 4px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(0,0,0,0.1)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Thin vertical separator */}
      <div
        style={{
          width: 1,
          height: 22,
          backgroundColor: 'rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      />

      {/* OPACITY SLIDER — Gradient from transparent to active color */}
      <div
        ref={opacityTrackRef}
        onMouseDown={(e) => {
          setIsDraggingOpacity(true)
          handleOpacityInteraction(e.clientX)
        }}
        style={{
          position: 'relative',
          width: 90,
          height: 22,
          borderRadius: 11,
          /* Checkerboard behind the gradient for transparency visualization */
          backgroundImage: `
            linear-gradient(to right, transparent, ${activeColor}),
            repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%)
          `,
          backgroundSize: '100% 100%, 6px 6px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {/* Apple-style oval/pill thumb */}
        <div
          style={{
            position: 'absolute',
            left: `${opacity * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8,
            height: 18,
            borderRadius: 4,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            boxShadow:
              '0 1px 4px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(0,0,0,0.1)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Thin vertical separator */}
      <div
        style={{
          width: 1,
          height: 22,
          backgroundColor: 'rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      />

      {/* QUICK COLOR SWATCHES — 4 preset circles */}
      <div
        style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}
      >
        {QUICK_COLORS.map((color) => {
          const isActive = color === activeColor
          return (
            <button
              key={color}
              onClick={() => onColorChange(color)}
              title={color}
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: color,
                border: isActive
                  ? '2px solid #60a5fa'
                  : color === '#000000'
                    ? '1.5px solid rgba(255,255,255,0.15)'
                    : color === '#ffffff'
                      ? '1.5px solid rgba(255,255,255,0.25)'
                      : '1.5px solid rgba(0,0,0,0.15)',
                boxShadow: isActive
                  ? '0 0 0 1.5px rgba(96,165,250,0.3)'
                  : 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'transform 0.1s ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
              }}
            />
          )
        })}
      </div>

      {/* Thin vertical separator */}
      <div
        style={{
          width: 1,
          height: 22,
          backgroundColor: 'rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      />

      {/* BRUSH SIZE — 4 dot indicators */}
      <div
        style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}
      >
        {BRUSH_SIZES.map(({ value, dot }) => {
          const isActive = value === brushSize
          return (
            <button
              key={value}
              onClick={() => onBrushSizeChange(value)}
              title={`${value}px`}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: 'transparent',
                border: isActive
                  ? '1.5px solid rgba(96,165,250,0.5)'
                  : '1.5px solid transparent',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color 0.1s ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.borderColor = 'transparent'
              }}
            >
              <div
                style={{
                  width: dot,
                  height: dot,
                  borderRadius: '50%',
                  backgroundColor: isActive
                    ? '#60a5fa'
                    : 'rgba(255,255,255,0.4)',
                  transition: 'background-color 0.1s ease',
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
