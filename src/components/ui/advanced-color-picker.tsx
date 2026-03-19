/**
 * ============================================================================
 * ADVANCED COLOR PICKER — Canvas-based HSV color picker
 * ============================================================================
 *
 * Professional, Webflow-inspired color picker with:
 *   - Saturation/Brightness 2D canvas (HSV model)
 *   - Hue rainbow slider
 *   - Opacity slider with checkerboard background
 *   - Editable hex input field
 *   - Editable opacity percentage input
 *   - EyeDropper API support (Chromium browsers)
 *
 * This is a reusable component meant for the entire app. It handles
 * all color math internally (HSV ↔ RGB ↔ Hex) and accepts/emits
 * standard color strings (hex, rgba, 'transparent').
 *
 * SOURCE OF TRUTH KEYWORDS: AdvancedColorPicker, HsvColor, color-picker-canvas
 * ============================================================================
 */

'use client'

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Pipette } from 'lucide-react'
import { cn } from '@/lib/utils'
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

/** Internal HSV + Alpha representation (h: 0-360, s: 0-100, v: 0-100, a: 0-100) */
interface Hsva {
  h: number
  s: number
  v: number
  a: number
}

/** EyeDropper API — not in standard TS lib yet */
interface EyeDropperResult {
  sRGBHex: string
}

interface EyeDropperInstance {
  open: (options?: { signal?: AbortSignal }) => Promise<EyeDropperResult>
}

export interface AdvancedColorPickerProps {
  /** Current color value — hex (#ff0000), rgba(…), or 'transparent' */
  value: string
  /** Called on every color change (drag, type, eyedrop) */
  onChange: (value: string) => void
  /** Show the opacity slider and input (default: true) */
  showOpacity?: boolean
  /** Static quick-select color presets (including 'transparent') */
  quickColors?: string[]
  /** Saved/reusable colors from database */
  savedColors?: Array<{ id: string; name: string; color: string }>
  /** Callback to save the current color with a name */
  onSaveColor?: (name: string, color: string) => void
  /** Callback to delete a saved color by ID */
  onDeleteSavedColor?: (id: string) => void
}

// ============================================================================
// COLOR MATH — HSV ↔ RGB ↔ Hex (all self-contained)
// ============================================================================

/** Convert HSV (h:0-360, s:0-100, v:0-100) to RGB (0-255 each) */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const sNorm = s / 100
  const vNorm = v / 100
  const c = vNorm * sNorm
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = vNorm - c

  let r = 0
  let g = 0
  let b = 0
  if (h < 60) {
    r = c; g = x
  } else if (h < 120) {
    r = x; g = c
  } else if (h < 180) {
    g = c; b = x
  } else if (h < 240) {
    g = x; b = c
  } else if (h < 300) {
    r = x; b = c
  } else {
    r = c; b = x
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

/** Convert RGB (0-255 each) to HSV (h:0-360, s:0-100, v:0-100) */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rN = r / 255
  const gN = g / 255
  const bN = b / 255
  const max = Math.max(rN, gN, bN)
  const min = Math.min(rN, gN, bN)
  const d = max - min

  let h = 0
  if (d !== 0) {
    if (max === rN) h = ((gN - bN) / d) % 6
    else if (max === gN) h = (bN - rN) / d + 2
    else h = (rN - gN) / d + 4
    h *= 60
    if (h < 0) h += 360
  }

  const s = max === 0 ? 0 : (d / max) * 100
  const v = max * 100

  return [Math.round(h), Math.round(s), Math.round(v)]
}

/** Convert RGB to 6-digit hex string */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  )
}

/** Parse a hex string (#fff or #ffffff) into [r, g, b] */
function hexToRgbTuple(hex: string): [number, number, number] {
  let clean = hex.replace('#', '')
  /* Expand shorthand (#abc → aabbcc) */
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
  }
  return [
    parseInt(clean.substring(0, 2), 16) || 0,
    parseInt(clean.substring(2, 4), 16) || 0,
    parseInt(clean.substring(4, 6), 16) || 0,
  ]
}

/**
 * Parse any color string into HSVA.
 * Handles hex, rgba, transparent, empty.
 */
function parseColorToHsva(color: string): Hsva {
  if (!color || color === 'transparent' || color === 'rgba(0,0,0,0)') {
    return { h: 0, s: 0, v: 100, a: 0 }
  }

  /* RGBA format */
  const rgbaMatch = color.match(
    /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+))?\s*\)/
  )
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10)
    const g = parseInt(rgbaMatch[2], 10)
    const b = parseInt(rgbaMatch[3], 10)
    const alpha = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    const [h, s, v] = rgbToHsv(r, g, b)
    return { h, s, v, a: Math.round(alpha * 100) }
  }

  /* 8-digit hex with alpha */
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    const [r, g, b] = hexToRgbTuple(color.slice(0, 7))
    const alphaHex = color.slice(7, 9)
    const a = Math.round((parseInt(alphaHex, 16) / 255) * 100)
    const [h, s, v] = rgbToHsv(r, g, b)
    return { h, s, v, a }
  }

  /* Standard hex */
  if (/^#[0-9a-fA-F]{3,6}$/.test(color)) {
    const [r, g, b] = hexToRgbTuple(color)
    const [h, s, v] = rgbToHsv(r, g, b)
    return { h, s, v, a: 100 }
  }

  return { h: 0, s: 0, v: 100, a: 100 }
}

/**
 * Convert HSVA to a storable color string.
 * Returns hex when fully opaque, rgba otherwise, 'transparent' at 0%.
 */
function hsvaToColorString(hsva: Hsva): string {
  if (hsva.a <= 0) return 'transparent'

  const [r, g, b] = hsvToRgb(hsva.h, hsva.s, hsva.v)

  if (hsva.a >= 100) return rgbToHex(r, g, b)

  return `rgba(${r},${g},${b},${hsva.a / 100})`
}

/**
 * Get the pure hue color as an HSL string for CSS gradient rendering.
 * At s=100% l=50%, HSL gives us the pure saturated hue color.
 */
function hueToHsl(h: number): string {
  return `hsl(${h}, 100%, 50%)`
}

// ============================================================================
// CHECKERBOARD CSS PATTERN — for the opacity slider background
// ============================================================================

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage: [
    'linear-gradient(45deg, #808080 25%, transparent 25%)',
    'linear-gradient(-45deg, #808080 25%, transparent 25%)',
    'linear-gradient(45deg, transparent 75%, #808080 75%)',
    'linear-gradient(-45deg, transparent 75%, #808080 75%)',
  ].join(', '),
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
}

// ============================================================================
// POINTER DRAG HOOK — handles mouse + touch + pointer capture
// ============================================================================

type DragControl = 'canvas' | 'hue' | 'opacity'

/**
 * Gets the position (0-1 clamped) of a pointer event relative to an element.
 */
function getRelativePos(
  clientX: number,
  clientY: number,
  el: HTMLElement
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AdvancedColorPicker({
  value,
  onChange,
  showOpacity = true,
  quickColors,
  savedColors,
  onSaveColor,
  onDeleteSavedColor,
}: AdvancedColorPickerProps) {
  /* Internal HSVA state — the single source of truth while the picker is open */
  const [hsva, setHsva] = useState<Hsva>(() => parseColorToHsva(value))

  /* Track what we last emitted to avoid re-parsing our own output */
  const lastOutputRef = useRef<string>(value)

  /* Refs for the three interactive areas */
  const canvasRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const opacityRef = useRef<HTMLDivElement>(null)

  /* Which control is actively being dragged (null = none) */
  const activeControlRef = useRef<DragControl | null>(null)

  /* Hex input local editing state */
  const [hexInput, setHexInput] = useState('')
  const [isEditingHex, setIsEditingHex] = useState(false)

  /* Opacity input local editing state */
  const [opacityInput, setOpacityInput] = useState('')
  const [isEditingOpacity, setIsEditingOpacity] = useState(false)

  /* Track whether the "save color" inline input is visible */
  const [isSaving, setIsSaving] = useState(false)
  /* The name being typed for the new saved color */
  const [saveName, setSaveName] = useState('')
  /* ID of the saved color pending deletion — triggers confirmation dialog */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // ============================================================================
  // SYNC: External value → internal HSVA
  // ============================================================================

  useEffect(() => {
    /* Skip if this value came from our own onChange */
    if (value === lastOutputRef.current) return

    if (!value || value === 'transparent' || value === 'rgba(0,0,0,0)') {
      /* For transparent, preserve the current hue so the user can slide opacity back up */
      setHsva((prev) => ({ ...prev, a: 0 }))
    } else {
      setHsva(parseColorToHsva(value))
    }
    lastOutputRef.current = value
  }, [value])

  // ============================================================================
  // CHANGE HANDLER — updates internal state + calls parent onChange
  // ============================================================================

  const handleChange = useCallback(
    (update: Partial<Hsva>) => {
      /* Compute the new HSVA and stash the serialized output in a ref.
         onChange is called AFTER the updater returns — calling it inside
         the updater triggers "Cannot update X while rendering Y" because
         React is still processing setHsva when onChange fires a parent
         setState (BuilderContent). */
      setHsva((prev) => {
        const next = { ...prev, ...update }
        lastOutputRef.current = hsvaToColorString(next)
        return next
      })
      /* Emit OUTSIDE the state updater so the parent update is batched
         normally instead of being interleaved with our own state update. */
      onChange(lastOutputRef.current)
    },
    [onChange]
  )

  /* Ref to the latest handleChange so document-level listeners are stable */
  const handleChangeRef = useRef(handleChange)
  handleChangeRef.current = handleChange

  // ============================================================================
  // POINTER EVENT HANDLERS — unified mouse + touch via pointer events
  // ============================================================================

  /**
   * Start drag on one of the three interactive controls.
   * Uses setPointerCapture so moves outside the element still track.
   */
  const handlePointerDown = useCallback(
    (control: DragControl) => (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      activeControlRef.current = control
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

      /* Immediately update to the clicked position */
      const refs = { canvas: canvasRef, hue: hueRef, opacity: opacityRef }
      const el = refs[control].current
      if (!el) return
      const pos = getRelativePos(e.clientX, e.clientY, el)

      if (control === 'canvas') {
        handleChangeRef.current({ s: Math.round(pos.x * 100), v: Math.round((1 - pos.y) * 100) })
      } else if (control === 'hue') {
        handleChangeRef.current({ h: Math.round(pos.x * 360) })
      } else {
        handleChangeRef.current({ a: Math.round(pos.x * 100) })
      }
    },
    []
  )

  /**
   * Continue drag — fired while pointer is captured.
   */
  const handlePointerMove = useCallback(
    (control: DragControl) => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activeControlRef.current !== control) return

      const refs = { canvas: canvasRef, hue: hueRef, opacity: opacityRef }
      const el = refs[control].current
      if (!el) return
      const pos = getRelativePos(e.clientX, e.clientY, el)

      if (control === 'canvas') {
        handleChangeRef.current({ s: Math.round(pos.x * 100), v: Math.round((1 - pos.y) * 100) })
      } else if (control === 'hue') {
        handleChangeRef.current({ h: Math.round(pos.x * 360) })
      } else {
        handleChangeRef.current({ a: Math.round(pos.x * 100) })
      }
    },
    []
  )

  /**
   * End drag — release pointer capture.
   */
  const handlePointerUp = useCallback(() => {
    activeControlRef.current = null
  }, [])

  // ============================================================================
  // HEX INPUT HANDLERS
  // ============================================================================

  const handleHexFocus = useCallback(() => {
    const [r, g, b] = hsvToRgb(hsva.h, hsva.s, hsva.v)
    setHexInput(rgbToHex(r, g, b).replace('#', '').toUpperCase())
    setIsEditingHex(true)
  }, [hsva.h, hsva.s, hsva.v])

  const handleHexBlur = useCallback(() => {
    setIsEditingHex(false)
    /* Validate and apply the typed hex */
    const cleaned = hexInput.replace('#', '').trim()
    if (/^[0-9a-fA-F]{6}$/.test(cleaned) || /^[0-9a-fA-F]{3}$/.test(cleaned)) {
      const [r, g, b] = hexToRgbTuple('#' + cleaned)
      const [h, s, v] = rgbToHsv(r, g, b)
      handleChange({ h, s, v })
    }
  }, [hexInput, handleChange])

  const handleHexKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        ;(e.target as HTMLInputElement).blur()
      }
    },
    []
  )

  // ============================================================================
  // OPACITY INPUT HANDLERS
  // ============================================================================

  const handleOpacityFocus = useCallback(() => {
    setOpacityInput(String(hsva.a))
    setIsEditingOpacity(true)
  }, [hsva.a])

  const handleOpacityBlur = useCallback(() => {
    setIsEditingOpacity(false)
    const parsed = parseInt(opacityInput, 10)
    if (!isNaN(parsed)) {
      handleChange({ a: Math.max(0, Math.min(100, parsed)) })
    }
  }, [opacityInput, handleChange])

  const handleOpacityKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        ;(e.target as HTMLInputElement).blur()
      }
    },
    []
  )

  // ============================================================================
  // SAVED COLOR HANDLERS
  // ============================================================================

  /** Handle saving the current color with the typed name */
  const handleSaveColor = useCallback(() => {
    if (!onSaveColor || !saveName.trim()) return
    const colorStr = hsvaToColorString(hsva)
    onSaveColor(saveName.trim(), colorStr)
    setSaveName('')
    setIsSaving(false)
  }, [onSaveColor, saveName, hsva])

  /** Cancel the save flow */
  const handleCancelSave = useCallback(() => {
    setSaveName('')
    setIsSaving(false)
  }, [])

  // ============================================================================
  // EYEDROPPER
  // ============================================================================

  const [eyedropperSupported] = useState(() => {
    if (typeof window === 'undefined') return false
    return 'EyeDropper' in window
  })

  const handleEyedropper = useCallback(async () => {
    if (!eyedropperSupported) return
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const EyeDropperCtor = (window as any).EyeDropper as new () => EyeDropperInstance
      const eyeDropper = new EyeDropperCtor()
      const result = await eyeDropper.open()
      if (result?.sRGBHex) {
        const [r, g, b] = hexToRgbTuple(result.sRGBHex)
        const [h, s, v] = rgbToHsv(r, g, b)
        handleChange({ h, s, v, a: 100 })
      }
    } catch {
      /* User cancelled — nothing to do */
    }
  }, [eyedropperSupported, handleChange])

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  /* The pure hue color for the canvas background gradient */
  const hueColor = useMemo(() => hueToHsl(hsva.h), [hsva.h])

  /* Current color as hex (for display, ignoring opacity) */
  const currentHex = useMemo(() => {
    const [r, g, b] = hsvToRgb(hsva.h, hsva.s, hsva.v)
    return rgbToHex(r, g, b)
  }, [hsva.h, hsva.s, hsva.v])

  /* Display hex for the input field */
  const displayHex = isEditingHex ? hexInput : currentHex.replace('#', '').toUpperCase()

  /* Display opacity for the input field */
  const displayOpacity = isEditingOpacity ? opacityInput : String(hsva.a)

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex flex-col gap-3 select-none">
      {/* ------------------------------------------------------------------ */}
      {/* SATURATION-BRIGHTNESS CANVAS                                        */}
      {/* Horizontal = saturation (white → pure hue)                         */}
      {/* Vertical = value/brightness (bright → black)                       */}
      {/* ------------------------------------------------------------------ */}
      <div
        ref={canvasRef}
        className="relative w-full rounded overflow-hidden cursor-crosshair"
        style={{
          height: 180,
          background: `
            linear-gradient(to top, rgb(0,0,0), rgba(0,0,0,0)),
            linear-gradient(to right, rgb(255,255,255), ${hueColor})
          `,
        }}
        onPointerDown={handlePointerDown('canvas')}
        onPointerMove={handlePointerMove('canvas')}
        onPointerUp={handlePointerUp}
      >
        {/* Draggable thumb — circle positioned at (s%, inverted v%) */}
        <div
          className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.6)] pointer-events-none"
          style={{
            left: `${hsva.s}%`,
            top: `${100 - hsva.v}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* HUE SLIDER — rainbow gradient from 0° to 360°                      */}
      {/* ------------------------------------------------------------------ */}
      <div
        ref={hueRef}
        className="relative w-full h-3 rounded-full cursor-pointer"
        style={{
          background:
            'linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))',
        }}
        onPointerDown={handlePointerDown('hue')}
        onPointerMove={handlePointerMove('hue')}
        onPointerUp={handlePointerUp}
      >
        <div
          className="absolute w-4 h-4 -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.6)] pointer-events-none"
          style={{
            left: `${(hsva.h / 360) * 100}%`,
            backgroundColor: hueToHsl(hsva.h),
          }}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* OPACITY SLIDER — checkerboard → solid color                        */}
      {/* ------------------------------------------------------------------ */}
      {showOpacity && (
        <div
          ref={opacityRef}
          className="relative w-full h-3 rounded-full cursor-pointer"
          onPointerDown={handlePointerDown('opacity')}
          onPointerMove={handlePointerMove('opacity')}
          onPointerUp={handlePointerUp}
        >
          {/* Background layer — checkerboard + color overlay, clipped to pill shape */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
            style={CHECKERBOARD_STYLE}
          >
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to right, transparent, ${currentHex})`,
              }}
            />
          </div>
          {/* Thumb — sits outside the clipped layer so it isn't cut off */}
          <div
            className="absolute w-4 h-4 -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.6)] pointer-events-none"
            style={{
              left: `${hsva.a}%`,
              backgroundColor: hsva.a > 0 ? currentHex : 'transparent',
            }}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* QUICK COLORS — grid of preset color swatches                       */}
      {/* ------------------------------------------------------------------ */}
      {quickColors && quickColors.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Quick Colors</span>
          <div className="flex flex-wrap gap-1.5">
            {quickColors.map((color, i) => (
              <button
                key={`${color}-${i}`}
                onClick={() => onChange(color)}
                className={cn(
                  'w-5 h-5 rounded-full border border-border hover:border-foreground transition-colors',
                  'hover:scale-110'
                )}
                title={color === 'transparent' ? 'Transparent' : color}
              >
                {/* Transparent: white bg with red diagonal slash */}
                {color === 'transparent' ? (
                  <div className="w-full h-full rounded-full bg-white relative overflow-hidden">
                    <div
                      className="absolute bg-red-500"
                      style={{
                        width: '141%',
                        height: '1.5px',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(45deg)',
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="w-full h-full rounded-full"
                    style={{ backgroundColor: color }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SAVED COLORS — user's reusable color palette with save/delete      */}
      {/* ------------------------------------------------------------------ */}
      {(savedColors || onSaveColor) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Saved Colors</span>
            {/* "+" button to start the save flow */}
            {onSaveColor && !isSaving && (
              <button
                onClick={() => setIsSaving(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Save current color"
              >
                +
              </button>
            )}
          </div>

          {/* Saved color swatches grid */}
          {savedColors && savedColors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {savedColors.map((saved) => (
                <div key={saved.id} className="relative group">
                  <button
                    onClick={() => onChange(saved.color)}
                    className={cn(
                      'w-5 h-5 rounded-full border border-border hover:border-foreground transition-colors',
                      'hover:scale-110'
                    )}
                    title={saved.name}
                  >
                    {saved.color === 'transparent' ? (
                      <div className="w-full h-full rounded-full bg-white relative overflow-hidden">
                        <div
                          className="absolute bg-red-500"
                          style={{
                            width: '141%',
                            height: '1.5px',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%) rotate(45deg)',
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className="w-full h-full rounded-full"
                        style={{ backgroundColor: saved.color }}
                      />
                    )}
                  </button>
                  {/* Delete X — shows on hover, opens confirmation dialog */}
                  {onDeleteSavedColor && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPendingDeleteId(saved.id)
                      }}
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive text-white text-[8px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title={`Delete "${saved.name}"`}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state when no saved colors yet */}
          {(!savedColors || savedColors.length === 0) && !isSaving && (
            <p className="text-[10px] text-muted-foreground/60">No saved colors yet</p>
          )}

          {/* Inline save form — name input + save/cancel */}
          {isSaving && (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveColor()
                  if (e.key === 'Escape') handleCancelSave()
                }}
                placeholder="Color name..."
                autoFocus
                className={cn(
                  'flex-1 h-7 px-2 text-xs rounded bg-muted border-none text-foreground',
                  'focus:outline-none'
                )}
              />
              <button
                onClick={handleSaveColor}
                disabled={!saveName.trim()}
                className={cn(
                  'h-7 px-2 text-xs rounded transition-colors',
                  saveName.trim()
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                Save
              </button>
              <button
                onClick={handleCancelSave}
                className="h-7 px-2 text-xs rounded bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* HEX INPUT + OPACITY INPUT                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex gap-2">
        {/* Hex input — shows uppercase hex without # prefix */}
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            #
          </span>
          <input
            type="text"
            value={displayHex}
            onChange={(e) => setHexInput(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
            onFocus={handleHexFocus}
            onBlur={handleHexBlur}
            onKeyDown={handleHexKeyDown}
            maxLength={6}
            className={cn(
              'w-full h-7 pl-5 pr-2 text-xs rounded bg-muted border-none text-foreground',
              'focus:outline-none'
            )}
          />
        </div>

        {/* Opacity input — shows percentage */}
        {showOpacity && (
          <div className="relative w-[72px]">
            <input
              type="text"
              value={displayOpacity}
              onChange={(e) =>
                setOpacityInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))
              }
              onFocus={handleOpacityFocus}
              onBlur={handleOpacityBlur}
              onKeyDown={handleOpacityKeyDown}
              maxLength={3}
              className={cn(
                'w-full h-7 pl-2 pr-6 text-xs rounded bg-muted border-none text-foreground text-right',
                'focus:outline-none'
              )}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              %
            </span>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* EYEDROPPER BUTTON — only in supported browsers                     */}
      {/* ------------------------------------------------------------------ */}
      {eyedropperSupported && (
        <button
          onClick={handleEyedropper}
          className={cn(
            'flex items-center justify-center gap-2 h-7 w-full rounded',
            'bg-muted text-muted-foreground',
            'hover:bg-muted/80 hover:text-foreground transition-colors',
            'text-xs'
          )}
          title="Pick color from screen"
        >
          <Pipette className="w-3.5 h-3.5" />
          Eyedropper
        </button>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* DELETE CONFIRMATION DIALOG — prevents accidental saved color removal */}
      {/* ------------------------------------------------------------------ */}
      {onDeleteSavedColor && (
        <AlertDialog
          open={!!pendingDeleteId}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteId(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete saved color?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{' '}
                <strong>
                  {savedColors?.find((c) => c.id === pendingDeleteId)?.name ?? 'this color'}
                </strong>
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingDeleteId) {
                    onDeleteSavedColor(pendingDeleteId)
                    setPendingDeleteId(null)
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
