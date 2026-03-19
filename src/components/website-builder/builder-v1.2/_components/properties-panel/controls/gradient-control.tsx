/**
 * ========================================
 * GRADIENT CONTROL - Full Gradient Editor
 * ========================================
 *
 * Figma-style gradient editor with:
 * - Three-mode fill selector: Solid, Linear Gradient, Radial Gradient
 * - Visual circle icons for each fill mode (no text labels on tabs)
 * - Solid mode: AdvancedColorPicker (canvas-based HSV picker)
 * - Visual gradient stop bar for managing color stops
 * - Selected stop editing with AdvancedColorPicker
 * - Angle control for linear gradients
 * - Position controls for radial gradients
 *
 * ========================================
 * USAGE
 * ========================================
 *
 * This control can be used for both background and text fills.
 * When `isTextFill` is true, the control knows it's editing text
 * gradient properties (which use background-clip: text CSS).
 *
 * ========================================
 * EVENTS
 * ========================================
 *
 * - onEditStart: Called when user starts editing the gradient (opens controls)
 * - onEditEnd: Called when user finishes editing (closes controls)
 *
 * These events can be used to show/hide the canvas gradient overlay.
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Circle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BuilderColorPicker } from './builder-color-picker'
import { useBuilderContext } from '../../../_lib/builder-context'
import { trpc } from '@/trpc/react-provider'
import type { GradientConfig } from '../../../_lib/types'
import {
  gradientConfigToCSS,
  createDefaultLinearGradient,
  addGradientStop,
  removeGradientStop,
  updateGradientStop,
} from '../../../_lib/gradient-utils'
import { getColorDisplayText } from '../../../_lib/color-opacity-utils'
import { GradientStopBar } from './gradient-stop-bar'
import { MobileOverrideIndicator } from './mobile-override-indicator'
import {
  parseSavedColorValue,
  serializeSavedFillValue,
} from '@/lib/saved-colors/saved-color-value'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Active fill mode — derived from whether gradient exists and its type.
 * SOURCE OF TRUTH KEYWORDS: FillMode, GradientFillType
 */
type FillMode = 'solid' | 'linear' | 'radial'

interface GradientControlProps {
  /** Label text displayed on the left */
  label: string
  /** Current solid color value (used when fill type is 'solid') */
  solidColor: string
  /** Current gradient config (used when fill type is 'gradient') */
  gradient: GradientConfig | undefined
  /** Called when solid color changes */
  onSolidColorChange: (color: string) => void
  /** Called when gradient config changes */
  onGradientChange: (gradient: GradientConfig | undefined) => void
  /** Whether this is a text fill (affects displayed label) */
  isTextFill?: boolean
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
  /** Called when gradient editing starts (for canvas overlay) */
  onEditStart?: () => void
  /** Called when gradient editing ends */
  onEditEnd?: () => void
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * Check if a color value is transparent
 */
function isTransparent(color: string): boolean {
  return color === 'transparent' || color === 'rgba(0,0,0,0)' || color === ''
}

/**
 * Renders a transparent indicator - white square with red diagonal slash
 */
function TransparentSwatch({ className }: { className?: string }) {
  return (
    <div className={`bg-white relative overflow-hidden ${className ?? ''}`}>
      <div className="absolute inset-0">
        <div
          className="absolute bg-destructive"
          style={{
            width: '141%',
            height: '2px',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(45deg)',
          }}
        />
      </div>
    </div>
  )
}

// ============================================================================
// FILL MODE ICONS — Visual circle indicators for the three fill modes
// ============================================================================

/**
 * Solid fill icon — fully filled circle.
 * Clearly represents a uniform solid color fill.
 */
function SolidFillIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="fill-current">
      <circle cx="10" cy="10" r="8" />
    </svg>
  )
}

/**
 * Linear gradient icon — circle filled with a diagonal linear gradient.
 * Dark on one side fading to light, clearly showing a directional gradient.
 */
function LinearGradientIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <defs>
        <linearGradient id="fill-icon-lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="8" fill="url(#fill-icon-lg)" />
    </svg>
  )
}

/**
 * Radial gradient icon — concentric circles fading from center.
 * Creates a visual effect of a radial gradient spreading outward.
 */
function RadialGradientIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="fill-current">
      {/* Concentric circles — more opaque toward center */}
      <circle cx="10" cy="10" r="8" opacity="0.1" />
      <circle cx="10" cy="10" r="6" opacity="0.18" />
      <circle cx="10" cy="10" r="4" opacity="0.32" />
      <circle cx="10" cy="10" r="2.2" opacity="0.55" />
      <circle cx="10" cy="10" r="1" opacity="0.85" />
      {/* Subtle circle outline to define the shape */}
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
    </svg>
  )
}

// ============================================================================
// SAVED FILLS SECTION — Shows saved solid + gradient fills with save/delete
// ============================================================================

/**
 * Props for the SavedFillsSection sub-component.
 * Handles the unified saved fills UI that shows both solid and gradient swatches.
 */
interface SavedFillsSectionProps {
  /** All saved color entries from DB (may include solid and gradient values) */
  savedFills: Array<{ id: string; name: string; color: string }>
  /** Apply a solid color from saved fills */
  onApplySolid: (color: string) => void
  /** Apply a gradient config from saved fills */
  onApplyGradient: (gradient: GradientConfig) => void
  /** Save the current fill with a name */
  onSave: (name: string, serializedValue: string) => void
  /** Delete a saved fill by ID */
  onDelete: (id: string) => void
  /** Current gradient (null/undefined if in solid mode) — used to serialize on save */
  currentGradient: GradientConfig | undefined
  /** Current solid color — used to serialize on save when no gradient is active */
  currentSolidColor: string
}

/**
 * Unified saved fills section that shows both solid and gradient swatches.
 * Placed at the GradientControl popover level — above the fill mode content.
 * Includes save, apply, and delete functionality with a confirmation dialog.
 */
function SavedFillsSection({
  savedFills,
  onApplySolid,
  onApplyGradient,
  onSave,
  onDelete,
  currentGradient,
  currentSolidColor,
}: SavedFillsSectionProps) {
  /* Save flow state — inline name input (same pattern as AdvancedColorPicker) */
  const [isSaving, setIsSaving] = useState(false)
  const [saveName, setSaveName] = useState('')

  /* Delete confirmation state */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  /** Save the current fill (solid or gradient) with the typed name */
  const handleSave = useCallback(() => {
    if (!saveName.trim()) return
    const value = currentGradient
      ? serializeSavedFillValue({ type: 'gradient', gradient: currentGradient })
      : serializeSavedFillValue({ type: 'solid', color: currentSolidColor })
    onSave(saveName.trim(), value)
    setSaveName('')
    setIsSaving(false)
  }, [saveName, currentGradient, currentSolidColor, onSave])

  /** Cancel the save flow */
  const handleCancelSave = useCallback(() => {
    setSaveName('')
    setIsSaving(false)
  }, [])

  return (
    <div className="space-y-1.5 mb-3 pb-3 border-b border-border/50">
      {/* Header — label + save button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Saved Fills</span>
        {!isSaving && (
          <button
            onClick={() => setIsSaving(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Save current fill"
          >
            +
          </button>
        )}
      </div>

      {/* Saved fill swatches grid */}
      {savedFills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {savedFills.map((fill) => {
            const parsed = parseSavedColorValue(fill.color)
            /* Gradient swatches show the gradient as background, solids show the color */
            const swatchBg =
              parsed.type === 'gradient'
                ? gradientConfigToCSS(parsed.gradient)
                : parsed.color
            const isTransparentFill =
              parsed.type === 'solid' &&
              (parsed.color === 'transparent' || parsed.color === 'rgba(0,0,0,0)')

            return (
              <div key={fill.id} className="relative group">
                <button
                  onClick={() => {
                    if (parsed.type === 'gradient') {
                      onApplyGradient(parsed.gradient)
                    } else {
                      onApplySolid(parsed.color)
                    }
                  }}
                  className={cn(
                    'w-5 h-5 rounded-full border border-border hover:border-foreground transition-colors',
                    'hover:scale-110'
                  )}
                  title={fill.name}
                >
                  {isTransparentFill ? (
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
                      style={{ background: swatchBg }}
                    />
                  )}
                </button>
                {/* Delete X — shows on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setPendingDeleteId(fill.id)
                  }}
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive text-white text-[8px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title={`Delete "${fill.name}"`}
                >
                  x
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state when no saved fills yet */}
      {savedFills.length === 0 && !isSaving && (
        <p className="text-[10px] text-muted-foreground/60">No saved fills yet</p>
      )}

      {/* Inline save form — name input + save/cancel */}
      {isSaving && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') handleCancelSave()
            }}
            placeholder="Fill name..."
            autoFocus
            className={cn(
              'flex-1 h-7 px-2 text-xs rounded bg-muted border-none text-foreground',
              'focus:outline-none'
            )}
          />
          <button
            onClick={handleSave}
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

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved fill?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>
                {savedFills.find((f) => f.id === pendingDeleteId)?.name ?? 'this fill'}
              </strong>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) {
                  onDelete(pendingDeleteId)
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
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function GradientControl({
  label,
  solidColor,
  gradient,
  onSolidColorChange,
  onGradientChange,
  isTextFill: _isTextFill = false, // Reserved for future text gradient styling
  hasMobileOverride,
  onResetMobileOverride,
  onEditStart,
  onEditEnd,
}: GradientControlProps) {
  const { organizationId } = useBuilderContext()

  /* Determine active fill mode from current state */
  const fillMode: FillMode = gradient
    ? gradient.type === 'radial'
      ? 'radial'
      : 'linear'
    : 'solid'

  /* Human-readable label for the active fill mode, shown above content */
  const fillModeLabel =
    fillMode === 'solid'
      ? 'Solid Color'
      : fillMode === 'linear'
        ? 'Linear Gradient'
        : 'Radial Gradient'

  /* Track if popover is open */
  const [isOpen, setIsOpen] = useState(false)

  /* Track selected stop for editing */
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)

  // ============================================================================
  // SAVED FILLS — tRPC queries and mutations for the unified saved fills section
  // ============================================================================

  /** Fetch all saved colors (solid + gradient) for this organization */
  const savedColorsQuery = trpc.savedColors.list.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  )

  /** Mutation to create a new saved fill (color string may be plain or JSON) */
  const createFillMutation = trpc.savedColors.create.useMutation({
    onSuccess: () => { savedColorsQuery.refetch() },
  })

  /** Mutation to delete a saved fill by ID */
  const deleteFillMutation = trpc.savedColors.delete.useMutation({
    onSuccess: () => { savedColorsQuery.refetch() },
  })

  /** Save handler — creates a new saved fill entry */
  const handleSaveFill = useCallback(
    (name: string, serializedValue: string) => {
      if (!organizationId) return
      createFillMutation.mutate({ organizationId, name, color: serializedValue })
    },
    [organizationId, createFillMutation]
  )

  /** Delete handler — removes a saved fill by ID */
  const handleDeleteFill = useCallback(
    (id: string) => {
      if (!organizationId) return
      deleteFillMutation.mutate({ organizationId, id })
    },
    [organizationId, deleteFillMutation]
  )

  /**
   * Apply a solid color from saved fills.
   * Switches to solid mode and sets the color.
   */
  const handleApplySavedSolid = useCallback(
    (color: string) => {
      onGradientChange(undefined)
      onSolidColorChange(color)
    },
    [onGradientChange, onSolidColorChange]
  )

  /**
   * Apply a gradient config from saved fills.
   * Switches to the appropriate gradient mode and sets the config.
   */
  const handleApplySavedGradient = useCallback(
    (gradientConfig: GradientConfig) => {
      onGradientChange(gradientConfig)
      /* Auto-select first stop for editing */
      if (gradientConfig.stops.length > 0) {
        setSelectedStopId(gradientConfig.stops[0].id)
      }
    },
    [onGradientChange]
  )

  /* Notify parent when popover opens/closes for gradient mode */
  useEffect(() => {
    if (isOpen && gradient) {
      onEditStart?.()
    } else {
      onEditEnd?.()
    }
  }, [isOpen, gradient, onEditStart, onEditEnd])

  /* Auto-select first stop when gradient is created or changed */
  useEffect(() => {
    if (gradient && gradient.stops.length > 0) {
      if (
        !selectedStopId ||
        !gradient.stops.find((s) => s.id === selectedStopId)
      ) {
        setSelectedStopId(gradient.stops[0].id)
      }
    } else {
      setSelectedStopId(null)
    }
  }, [gradient, selectedStopId])

  /**
   * Unified fill mode switcher — handles solid, linear, and radial modes.
   * Preserves existing gradient stops when switching between linear and radial.
   */
  const handleSwitchFillMode = useCallback(
    (mode: FillMode) => {
      if (mode === 'solid') {
        onGradientChange(undefined)
      } else if (mode === 'linear') {
        if (gradient) {
          /* Preserve existing stops, switch type to linear */
          onGradientChange({
            ...gradient,
            type: 'linear',
            angle: gradient.angle ?? 180,
          })
        } else {
          /* Create a fresh linear gradient */
          const newGradient = createDefaultLinearGradient()
          onGradientChange(newGradient)
          setSelectedStopId(newGradient.stops[0].id)
        }
      } else {
        if (gradient) {
          /* Preserve existing stops, switch type to radial */
          onGradientChange({
            ...gradient,
            type: 'radial',
            radialShape: gradient.radialShape ?? 'circle',
            radialPosition: gradient.radialPosition ?? { x: 50, y: 50 },
          })
        } else {
          /* Create a fresh radial gradient */
          const newGradient = createDefaultLinearGradient()
          onGradientChange({
            ...newGradient,
            type: 'radial',
            radialShape: 'circle',
            radialPosition: { x: 50, y: 50 },
          })
          setSelectedStopId(newGradient.stops[0].id)
        }
      }
    },
    [gradient, onGradientChange]
  )

  /** Update gradient angle */
  const handleAngleChange = useCallback(
    (angle: number) => {
      if (!gradient) return
      onGradientChange({ ...gradient, angle })
    },
    [gradient, onGradientChange]
  )

  /** Add new stop at position */
  const handleAddStop = useCallback(
    (position: number) => {
      if (!gradient) return
      const newGradient = addGradientStop(gradient, position)
      const newStop = newGradient.stops.find((s) => s.position === position)
      if (newStop) setSelectedStopId(newStop.id)
      onGradientChange(newGradient)
    },
    [gradient, onGradientChange]
  )

  /** Remove stop by ID */
  const handleRemoveStop = useCallback(
    (stopId: string) => {
      if (!gradient) return
      const newGradient = removeGradientStop(gradient, stopId)
      if (selectedStopId === stopId && newGradient.stops.length > 0) {
        setSelectedStopId(newGradient.stops[0].id)
      }
      onGradientChange(newGradient)
    },
    [gradient, selectedStopId, onGradientChange]
  )

  /** Update stop position (used by stop bar handles) */
  const handleStopPositionChange = useCallback(
    (stopId: string, position: number) => {
      if (!gradient) return
      onGradientChange(updateGradientStop(gradient, stopId, { position }))
    },
    [gradient, onGradientChange]
  )

  /** Update stop color */
  const handleStopColorChange = useCallback(
    (stopId: string, color: string) => {
      if (!gradient) return
      onGradientChange(updateGradientStop(gradient, stopId, { color }))
    },
    [gradient, onGradientChange]
  )

  /* Get currently selected stop */
  const selectedStop = gradient?.stops.find((s) => s.id === selectedStopId)

  /* Generate preview gradient CSS */
  const previewCSS = gradient ? gradientConfigToCSS(gradient) : undefined

  /* For the swatch preview, use gradient or solid color */
  const swatchBackground = previewCSS ?? solidColor

  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      {/* Label with optional mobile override indicator */}
      <div className="col-span-1 flex items-center gap-1.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <MobileOverrideIndicator
          hasOverride={hasMobileOverride ?? false}
          onReset={onResetMobileOverride}
        />
      </div>

      {/* Color/Gradient Swatch + Popover */}
      <div className="col-span-2 flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            {/* Trigger button — shows current fill preview */}
            {isTransparent(solidColor) && !gradient ? (
              <button
                className="w-7 h-7 rounded border border-border hover:border-muted-foreground transition-colors shrink-0 overflow-hidden"
                title="Click to edit fill"
              >
                <TransparentSwatch className="w-full h-full" />
              </button>
            ) : (
              <button
                className="w-7 h-7 rounded border border-border hover:border-muted-foreground transition-colors shrink-0"
                style={{ background: swatchBackground }}
                title="Click to edit fill"
              />
            )}
          </PopoverTrigger>

          <PopoverContent
            className="w-[300px] p-3"
            side="left"
            align="start"
          >
            {/* Fill Mode Selector — 3 visual circle icon buttons (no text labels) */}
            <div className="flex gap-1.5 mb-2">
              {(['solid', 'linear', 'radial'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleSwitchFillMode(mode)}
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded transition-colors',
                    fillMode === mode
                      ? 'bg-accent text-foreground ring-1 ring-primary'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                  title={
                    mode === 'solid'
                      ? 'Solid Color'
                      : mode === 'linear'
                        ? 'Linear Gradient'
                        : 'Radial Gradient'
                  }
                >
                  {mode === 'solid' && <SolidFillIcon />}
                  {mode === 'linear' && <LinearGradientIcon />}
                  {mode === 'radial' && <RadialGradientIcon />}
                </button>
              ))}
            </div>

            {/* Saved Fills — unified section showing both solid and gradient swatches */}
            {organizationId && (
              <SavedFillsSection
                savedFills={savedColorsQuery.data?.map((c) => ({
                  id: c.id,
                  name: c.name,
                  color: c.color,
                })) ?? []}
                onApplySolid={handleApplySavedSolid}
                onApplyGradient={handleApplySavedGradient}
                onSave={handleSaveFill}
                onDelete={handleDeleteFill}
                currentGradient={gradient}
                currentSolidColor={solidColor}
              />
            )}

            {/* Content label describing the active fill mode */}
            <p className="text-xs text-muted-foreground mb-2">
              {fillModeLabel}
            </p>

            {/* ============================================== */}
            {/* SOLID COLOR MODE — Full AdvancedColorPicker    */}
            {/* hideSavedColors: GradientControl shows its own */}
            {/* unified Saved Fills section above              */}
            {/* ============================================== */}
            {fillMode === 'solid' && (
              <BuilderColorPicker
                value={solidColor}
                onChange={onSolidColorChange}
                showOpacity
                hideSavedColors
              />
            )}

            {/* ============================================== */}
            {/* GRADIENT MODE (Linear or Radial)               */}
            {/* ============================================== */}
            {fillMode !== 'solid' && gradient && (
              <>
                {/* Gradient Stop Bar */}
                <div className="mb-3">
                  <GradientStopBar
                    gradient={gradient}
                    selectedStopId={selectedStopId}
                    onSelectStop={setSelectedStopId}
                    onStopPositionChange={handleStopPositionChange}
                    onDeleteStop={handleRemoveStop}
                    onAddStop={handleAddStop}
                  />
                </div>

                {/* Selected Stop Editor — AdvancedColorPicker for the stop color */}
                {selectedStop && (
                  <GradientStopEditor
                    stop={selectedStop}
                    canDelete={gradient.stops.length > 2}
                    onColorChange={(color) =>
                      handleStopColorChange(selectedStop.id, color)
                    }
                    onRemove={() => handleRemoveStop(selectedStop.id)}
                  />
                )}

                {/* Angle Control (Linear only) */}
                {gradient.type === 'linear' && (
                  <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground w-12">
                      Angle:
                    </span>
                    <Slider
                      value={[gradient.angle ?? 180]}
                      onValueChange={([value]) => handleAngleChange(value)}
                      min={0}
                      max={360}
                      step={1}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={360}
                      value={gradient.angle ?? 180}
                      onChange={(e) =>
                        handleAngleChange(
                          Math.max(
                            0,
                            Math.min(360, parseInt(e.target.value) || 0)
                          )
                        )
                      }
                      className="h-7 w-14 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">°</span>
                  </div>
                )}

                {/* Radial Position Controls (Radial only) */}
                {gradient.type === 'radial' && (
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    {/* Shape Toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12">
                        Shape:
                      </span>
                      <div className="flex gap-1 flex-1">
                        <Button
                          variant={
                            gradient.radialShape === 'circle'
                              ? 'secondary'
                              : 'ghost'
                          }
                          size="sm"
                          className="flex-1 h-6 text-xs"
                          onClick={() =>
                            onGradientChange({
                              ...gradient,
                              radialShape: 'circle',
                            })
                          }
                        >
                          <Circle className="w-3 h-3 mr-1" />
                          Circle
                        </Button>
                        <Button
                          variant={
                            gradient.radialShape === 'ellipse'
                              ? 'secondary'
                              : 'ghost'
                          }
                          size="sm"
                          className="flex-1 h-6 text-xs"
                          onClick={() =>
                            onGradientChange({
                              ...gradient,
                              radialShape: 'ellipse',
                            })
                          }
                        >
                          Ellipse
                        </Button>
                      </div>
                    </div>

                    {/* Center Position */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12">
                        Center:
                      </span>
                      <span className="text-xs text-muted-foreground">X</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={gradient.radialPosition?.x ?? 50}
                        onChange={(e) =>
                          onGradientChange({
                            ...gradient,
                            radialPosition: {
                              x: Math.max(
                                0,
                                Math.min(100, parseInt(e.target.value) || 0)
                              ),
                              y: gradient.radialPosition?.y ?? 50,
                            },
                          })
                        }
                        className="h-6 w-12 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">Y</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={gradient.radialPosition?.y ?? 50}
                        onChange={(e) =>
                          onGradientChange({
                            ...gradient,
                            radialPosition: {
                              x: gradient.radialPosition?.x ?? 50,
                              y: Math.max(
                                0,
                                Math.min(100, parseInt(e.target.value) || 0)
                              ),
                            },
                          })
                        }
                        className="h-6 w-12 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </PopoverContent>
        </Popover>

        {/* Fill type text indicator — shows gradient type or solid color with opacity */}
        <span className="text-sm text-muted-foreground truncate">
          {fillMode === 'solid'
            ? getColorDisplayText(solidColor)
            : fillMode === 'linear'
              ? 'Linear Gradient'
              : 'Radial Gradient'}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// GRADIENT STOP EDITOR — Stop color via AdvancedColorPicker + delete
// ============================================================================

interface GradientStopEditorProps {
  /** The gradient stop being edited */
  stop: { id: string; color: string; position: number }
  /** Whether this stop can be deleted (must have > 2 stops) */
  canDelete: boolean
  /** Called when the stop's color changes */
  onColorChange: (color: string) => void
  /** Called to delete this stop */
  onRemove: () => void
}

/**
 * Editing UI for a single gradient stop.
 * Shows the AdvancedColorPicker for color editing and an optional delete button.
 * Position is controlled via the gradient stop bar handles (not an input field).
 */
function GradientStopEditor({
  stop,
  canDelete,
  onColorChange,
  onRemove,
}: GradientStopEditorProps) {
  return (
    <div className="p-2 bg-muted/30 rounded-md mb-3 space-y-3">
      {/* Header row — stop label + delete */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground flex-1">Stop Color</span>

        {/* Delete stop button (only if > 2 stops) */}
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            title="Delete this stop"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Builder-aware color picker for this stop's color.
          hideSavedColors: The GradientControl's SavedFillsSection handles all
          save/delete operations — hiding it here prevents users from accidentally
          saving a stop color when they meant to save the whole gradient. */}
      <BuilderColorPicker
        value={stop.color}
        onChange={onColorChange}
        showOpacity
        hideSavedColors
      />
    </div>
  )
}
