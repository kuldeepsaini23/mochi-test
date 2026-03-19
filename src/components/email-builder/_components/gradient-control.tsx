'use client'

/**
 * ============================================================================
 * EMAIL BUILDER - Gradient Control
 * ============================================================================
 *
 * Color picker with gradient support for email template blocks.
 * Provides solid color and gradient fill options.
 *
 * Features:
 * - Toggle between solid color and gradient fill
 * - Color palette with predefined colors
 * - Custom color picker
 * - Gradient stop bar for managing color stops
 * - Linear/radial gradient support
 * - Angle control for linear gradients
 *
 * SOURCE OF TRUTH KEYWORDS: EmailGradientControl, EmailColorPicker
 *
 * ============================================================================
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Paintbrush, Minus, Trash2, AlertTriangle } from 'lucide-react'
import type { EmailGradientConfig } from '@/types/email-templates'
import {
  gradientToCSS,
  createDefaultLinearGradient,
  addGradientStop,
  removeGradientStop,
  updateGradientStop,
  generateStopId,
  EMAIL_COLOR_PALETTE,
  isTransparent,
} from '../_lib/gradient-utils'
import { GradientStopBar } from './gradient-stop-bar'

/**
 * Fill type - either solid color or gradient
 */
type FillType = 'solid' | 'gradient'

interface GradientControlProps {
  /** Label text displayed on the left */
  label: string
  /** Current solid color value (used when fill type is 'solid') */
  solidColor: string
  /** Current gradient config (used when fill type is 'gradient') */
  gradient: EmailGradientConfig | undefined
  /** Called when solid color changes */
  onSolidColorChange: (color: string) => void
  /** Called when gradient config changes */
  onGradientChange: (gradient: EmailGradientConfig | undefined) => void
  /** Whether to allow transparent option */
  allowTransparent?: boolean
  /** Whether to show the color code text next to swatch (default: true) */
  showColorCode?: boolean
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

/**
 * GradientControl Component
 *
 * Provides a complete color/gradient picker for email blocks.
 * Based on the website builder's GradientControl but simplified for email use.
 */
export function GradientControl({
  label,
  solidColor,
  gradient,
  onSolidColorChange,
  onGradientChange,
  allowTransparent = true,
  showColorCode = true,
}: GradientControlProps) {
  // Determine current fill type based on whether gradient exists
  const fillType: FillType = gradient ? 'gradient' : 'solid'

  // Track if popover is open
  const [isOpen, setIsOpen] = useState(false)

  // Track selected stop for editing
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)

  // Auto-select first stop when gradient is created or changed
  useEffect(() => {
    if (gradient && gradient.stops.length > 0) {
      if (!selectedStopId || !gradient.stops.find((s) => s.id === selectedStopId)) {
        setSelectedStopId(gradient.stops[0].id)
      }
    } else {
      setSelectedStopId(null)
    }
  }, [gradient, selectedStopId])

  /**
   * Switch to solid fill mode
   */
  const handleSwitchToSolid = useCallback(() => {
    onGradientChange(undefined)
  }, [onGradientChange])

  /**
   * Switch to gradient fill mode
   */
  const handleSwitchToGradient = useCallback(() => {
    const newGradient = createDefaultLinearGradient()
    onGradientChange(newGradient)
    setSelectedStopId(newGradient.stops[0].id)
  }, [onGradientChange])

  /**
   * Change gradient type (linear/radial)
   */
  const handleTypeChange = useCallback(
    (type: 'linear' | 'radial') => {
      if (!gradient) return

      if (type === 'linear') {
        onGradientChange({
          ...gradient,
          type: 'linear',
          angle: gradient.angle ?? 135,
        })
      } else {
        onGradientChange({
          ...gradient,
          type: 'radial',
          radialShape: gradient.radialShape ?? 'circle',
          radialPosition: gradient.radialPosition ?? { x: 50, y: 50 },
        })
      }
    },
    [gradient, onGradientChange]
  )

  /**
   * Update gradient angle
   */
  const handleAngleChange = useCallback(
    (angle: number) => {
      if (!gradient) return
      onGradientChange({ ...gradient, angle })
    },
    [gradient, onGradientChange]
  )

  /**
   * Add new stop at position
   */
  const handleAddStop = useCallback(
    (position: number) => {
      if (!gradient) return
      const newGradient = addGradientStop(gradient, position)
      const newStop = newGradient.stops.find((s) => s.position === position)
      if (newStop) {
        setSelectedStopId(newStop.id)
      }
      onGradientChange(newGradient)
    },
    [gradient, onGradientChange]
  )

  /**
   * Remove stop by ID
   */
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

  /**
   * Update stop position
   */
  const handleStopPositionChange = useCallback(
    (stopId: string, position: number) => {
      if (!gradient) return
      onGradientChange(updateGradientStop(gradient, stopId, { position }))
    },
    [gradient, onGradientChange]
  )

  /**
   * Update stop color
   */
  const handleStopColorChange = useCallback(
    (stopId: string, color: string) => {
      if (!gradient) return
      onGradientChange(updateGradientStop(gradient, stopId, { color }))
    },
    [gradient, onGradientChange]
  )

  // Get currently selected stop
  const selectedStop = gradient?.stops.find((s) => s.id === selectedStopId)

  // Generate preview gradient CSS
  const previewCSS = gradient ? gradientToCSS(gradient) : undefined

  // For the swatch preview, use gradient or solid color
  const swatchBackground = previewCSS ?? solidColor

  return (
    <div className="flex items-center justify-between gap-2">
      {/* Label */}
      <p className="text-xs text-muted-foreground">{label}</p>

      {/* Color/Gradient Swatch + Popover */}
      <div className="flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
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
            className="w-[280px] p-3"
            side="left"
            align="start"
          >
            {/* Fill Type Toggle */}
            <div className="flex gap-1 mb-3">
              <Button
                variant={fillType === 'solid' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1 h-7"
                onClick={handleSwitchToSolid}
              >
                <Paintbrush className="w-3.5 h-3.5 mr-1.5" />
                Solid
              </Button>
              <Button
                variant={fillType === 'gradient' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1 h-7"
                onClick={handleSwitchToGradient}
              >
                <Minus className="w-3.5 h-3.5 mr-1.5 rotate-45" />
                Gradient
              </Button>
            </div>

            {/* ============================================== */}
            {/* SOLID COLOR MODE */}
            {/* ============================================== */}
            {fillType === 'solid' && (
              <>
                {/* Color Palette Grid */}
                <div className="grid grid-cols-7 gap-1.5 mb-3">
                  {/* Transparent option */}
                  {allowTransparent && (
                    <button
                      onClick={() => onSolidColorChange('transparent')}
                      className={`w-6 h-6 rounded border hover:scale-110 transition-transform relative overflow-hidden ${
                        isTransparent(solidColor) ? 'border-primary border-2' : 'border-border/50'
                      }`}
                      title="Transparent"
                    >
                      <TransparentSwatch className="w-full h-full" />
                    </button>
                  )}

                  {EMAIL_COLOR_PALETTE.map((color, index) => (
                    <button
                      key={`${color}-${index}`}
                      onClick={() => onSolidColorChange(color)}
                      className={`w-6 h-6 rounded border hover:scale-110 transition-transform ${
                        solidColor === color ? 'border-primary border-2' : 'border-border/50'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>

                {/* Custom Color Picker */}
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">Custom:</span>
                  <input
                    type="color"
                    value={isTransparent(solidColor) ? '#ffffff' : solidColor}
                    onChange={(e) => onSolidColorChange(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <Input
                    value={isTransparent(solidColor) ? '' : solidColor}
                    onChange={(e) => onSolidColorChange(e.target.value)}
                    placeholder="#000000"
                    className="h-7 text-xs font-mono flex-1"
                  />
                </div>
              </>
            )}

            {/* ============================================== */}
            {/* GRADIENT MODE */}
            {/* ============================================== */}
            {fillType === 'gradient' && gradient && (
              <>
                {/* Dark Mode Warning */}
                <div className="flex items-start gap-2 p-2 mb-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] leading-tight text-amber-600 dark:text-amber-400">
                    Gradients may cause display issues on mobile devices in dark mode.
                    Text colors can appear inverted while gradients remain unchanged.
                  </p>
                </div>

                {/* Gradient Type Toggle */}
                <div className="flex gap-1 mb-3">
                  <Button
                    variant={gradient.type === 'linear' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="flex-1 h-7"
                    onClick={() => handleTypeChange('linear')}
                  >
                    Linear
                  </Button>
                  <Button
                    variant={gradient.type === 'radial' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="flex-1 h-7"
                    onClick={() => handleTypeChange('radial')}
                  >
                    Radial
                  </Button>
                </div>

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

                {/* Selected Stop Editor */}
                {selectedStop && (
                  <div className="p-2 bg-muted/30 rounded-md mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-muted-foreground">Stop Color:</span>
                      <input
                        type="color"
                        value={selectedStop.color}
                        onChange={(e) => handleStopColorChange(selectedStop.id, e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                      />
                      <span className="text-xs font-mono flex-1 truncate">
                        {selectedStop.color.toUpperCase()}
                      </span>

                      {/* Delete stop button (only if > 2 stops) */}
                      {gradient.stops.length > 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveStop(selectedStop.id)}
                          title="Delete this stop"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16">Position:</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={selectedStop.position}
                        onChange={(e) =>
                          handleStopPositionChange(
                            selectedStop.id,
                            Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                          )
                        }
                        className="h-7 w-16 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                )}

                {/* Angle Control (Linear only) */}
                {gradient.type === 'linear' && (
                  <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground w-12">Angle:</span>
                    <Slider
                      value={[gradient.angle ?? 135]}
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
                      value={gradient.angle ?? 135}
                      onChange={(e) =>
                        handleAngleChange(
                          Math.max(0, Math.min(360, parseInt(e.target.value) || 0))
                        )
                      }
                      className="h-7 w-14 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">°</span>
                  </div>
                )}
              </>
            )}
          </PopoverContent>
        </Popover>

        {/* Fill type text indicator - only show if showColorCode is true */}
        {showColorCode && (
          <span className="text-xs text-muted-foreground font-mono truncate">
            {fillType === 'gradient'
              ? `${gradient?.type === 'radial' ? 'Radial' : 'Linear'}`
              : isTransparent(solidColor)
                ? 'None'
                : solidColor.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  )
}
