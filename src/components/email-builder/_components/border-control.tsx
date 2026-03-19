'use client'

/**
 * ============================================================================
 * EMAIL BUILDER - Border Control
 * ============================================================================
 *
 * Border configuration control for email template blocks.
 * Provides border style, width, color, and radius options.
 *
 * Features:
 * - Border style selection (none, solid, dashed, dotted)
 * - Border width input
 * - Border color picker with gradient support
 * - Border radius input
 *
 * SOURCE OF TRUTH KEYWORDS: EmailBorderControl, EmailBorderPicker
 *
 * ============================================================================
 */

import { useState, useCallback } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { MoreHorizontal, Paintbrush, Minus, AlertTriangle } from 'lucide-react'
import type { EmailBorderConfig, EmailGradientConfig } from '@/types/email-templates'
import {
  gradientToCSS,
  createDefaultLinearGradient,
  EMAIL_COLOR_PALETTE,
} from '../_lib/gradient-utils'
import { GradientStopBar } from './gradient-stop-bar'
import {
  addGradientStop,
  removeGradientStop,
  updateGradientStop,
} from '../_lib/gradient-utils'

interface BorderControlProps {
  /** Current border configuration */
  value: EmailBorderConfig | undefined
  /** Called when border configuration changes */
  onChange: (config: EmailBorderConfig | undefined) => void
}

/** Border style options */
const BORDER_STYLES: { value: EmailBorderConfig['style']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

/**
 * Create default border config
 */
function createDefaultBorder(): EmailBorderConfig {
  return {
    style: 'solid',
    width: 1,
    color: '#e5e7eb',
    radius: 0,
  }
}

/**
 * BorderControl Component
 *
 * Provides a complete border configuration UI for email blocks.
 */
export function BorderControl({ value, onChange }: BorderControlProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)

  // Use default config if none provided
  const config = value ?? { style: 'none', width: 0, color: '#e5e7eb' }

  const hasGradient = !!config.gradient
  const hasBorder = config.style !== 'none' && config.width > 0

  /**
   * Update border property
   */
  const updateBorder = useCallback(
    (updates: Partial<EmailBorderConfig>) => {
      const newConfig = { ...createDefaultBorder(), ...config, ...updates }
      onChange(newConfig)
    },
    [config, onChange]
  )

  /**
   * Toggle gradient on/off
   */
  const handleToggleGradient = useCallback(() => {
    if (hasGradient) {
      // Remove gradient
      onChange({ ...config, gradient: undefined })
    } else {
      // Enable gradient with default
      const gradient = createDefaultLinearGradient()
      setSelectedStopId(gradient.stops[0].id)
      onChange({ ...config, gradient })
    }
  }, [config, hasGradient, onChange])

  /**
   * Update gradient
   */
  const handleGradientChange = useCallback(
    (gradient: EmailGradientConfig | undefined) => {
      onChange({ ...config, gradient })
    },
    [config, onChange]
  )

  // Generate preview style
  const previewStyle: React.CSSProperties = hasBorder
    ? {
        border: hasGradient
          ? undefined
          : `${config.width}px ${config.style} ${config.color}`,
        background: hasGradient && config.gradient ? gradientToCSS(config.gradient) : undefined,
        borderRadius: config.radius ? `${config.radius}px` : undefined,
      }
    : {}

  return (
    <div className="space-y-2">
      {/* Header */}
      <Label className="text-xs text-muted-foreground">Border</Label>

      {/* Main control row */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 justify-between"
          >
            <div className="flex items-center gap-2">
              {/* Preview */}
              <div
                className="w-6 h-4 rounded border border-border"
                style={previewStyle}
              />

              {/* Style and width info */}
              <span className="text-xs text-muted-foreground">
                {hasBorder
                  ? hasGradient
                    ? `Gradient ${config.width}px`
                    : `${config.style} ${config.width}px`
                  : 'No border'}
              </span>
            </div>

            <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="left"
          align="start"
          className="w-72 p-3"
          sideOffset={8}
        >
          <div className="space-y-4">
            {/* Style Selection */}
            <div className="space-y-2">
              <Label className="text-xs">Style</Label>
              <div className="grid grid-cols-4 gap-1">
                {BORDER_STYLES.map((style) => (
                  <Button
                    key={style.value}
                    variant={config.style === style.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => updateBorder({ style: style.value })}
                  >
                    {style.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Width and Radius (only when border is visible) */}
            {config.style !== 'none' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Width</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={config.width}
                      onChange={(e) => updateBorder({ width: parseInt(e.target.value, 10) || 0 })}
                      className="h-7 text-xs"
                      min={0}
                      max={20}
                    />
                    <span className="text-xs text-muted-foreground">px</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Radius</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={config.radius ?? 0}
                      onChange={(e) => updateBorder({ radius: parseInt(e.target.value, 10) || 0 })}
                      className="h-7 text-xs"
                      min={0}
                      max={50}
                    />
                    <span className="text-xs text-muted-foreground">px</span>
                  </div>
                </div>
              </div>
            )}

            {/* Color Selection (only when border is visible) */}
            {config.style !== 'none' && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                {/* Solid/Gradient Toggle */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Color</Label>
                  <div className="flex gap-1">
                    <Button
                      variant={!hasGradient ? 'default' : 'ghost'}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => hasGradient && handleToggleGradient()}
                    >
                      <Paintbrush className="w-3 h-3 mr-1" />
                      Solid
                    </Button>
                    <Button
                      variant={hasGradient ? 'default' : 'ghost'}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => !hasGradient && handleToggleGradient()}
                    >
                      <Minus className="w-3 h-3 mr-1 rotate-45" />
                      Gradient
                    </Button>
                  </div>
                </div>

                {/* Solid Color Picker */}
                {!hasGradient && (
                  <>
                    <div className="grid grid-cols-7 gap-1.5">
                      {EMAIL_COLOR_PALETTE.slice(0, 14).map((color, index) => (
                        <button
                          key={`${color}-${index}`}
                          onClick={() => updateBorder({ color })}
                          className={`w-6 h-6 rounded border hover:scale-110 transition-transform ${
                            config.color === color ? 'border-primary border-2' : 'border-border/50'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.color}
                        onChange={(e) => updateBorder({ color: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                      />
                      <Input
                        value={config.color}
                        onChange={(e) => updateBorder({ color: e.target.value })}
                        placeholder="#000000"
                        className="h-7 text-xs font-mono flex-1"
                      />
                    </div>
                  </>
                )}

                {/* Gradient Editor */}
                {hasGradient && config.gradient && (
                  <div className="space-y-3">
                    {/* Dark Mode Warning */}
                    <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-md">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] leading-tight text-amber-600 dark:text-amber-400">
                        Gradient borders may display incorrectly on mobile dark mode.
                      </p>
                    </div>

                    {/* Gradient Type Toggle */}
                    <div className="flex gap-1">
                      <Button
                        variant={config.gradient.type === 'linear' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={() => {
                          handleGradientChange({
                            ...config.gradient!,
                            type: 'linear',
                            angle: config.gradient!.angle ?? 135,
                          })
                        }}
                      >
                        Linear
                      </Button>
                      <Button
                        variant={config.gradient.type === 'radial' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={() => {
                          handleGradientChange({
                            ...config.gradient!,
                            type: 'radial',
                            radialShape: config.gradient!.radialShape ?? 'circle',
                            radialPosition: config.gradient!.radialPosition ?? { x: 50, y: 50 },
                          })
                        }}
                      >
                        Radial
                      </Button>
                    </div>

                    {/* Gradient Stop Bar */}
                    <GradientStopBar
                      gradient={config.gradient}
                      selectedStopId={selectedStopId}
                      onSelectStop={setSelectedStopId}
                      onStopPositionChange={(id, position) => {
                        handleGradientChange(updateGradientStop(config.gradient!, id, { position }))
                      }}
                      onDeleteStop={(id) => {
                        handleGradientChange(removeGradientStop(config.gradient!, id))
                      }}
                      onAddStop={(position) => {
                        const newGradient = addGradientStop(config.gradient!, position)
                        const newStop = newGradient.stops.find((s) => s.position === position)
                        if (newStop) setSelectedStopId(newStop.id)
                        handleGradientChange(newGradient)
                      }}
                    />

                    {/* Selected stop color */}
                    {selectedStopId && config.gradient.stops.find((s) => s.id === selectedStopId) && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Stop:</span>
                        <input
                          type="color"
                          value={config.gradient.stops.find((s) => s.id === selectedStopId)?.color ?? '#000000'}
                          onChange={(e) => {
                            handleGradientChange(
                              updateGradientStop(config.gradient!, selectedStopId, { color: e.target.value })
                            )
                          }}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                        />
                        <span className="text-xs font-mono">
                          {config.gradient.stops.find((s) => s.id === selectedStopId)?.color.toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* Angle Control (Linear only) */}
                    {config.gradient.type === 'linear' && (
                      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                        <span className="text-xs text-muted-foreground w-12">Angle:</span>
                        <Slider
                          value={[config.gradient.angle ?? 135]}
                          onValueChange={([value]) => {
                            handleGradientChange({ ...config.gradient!, angle: value })
                          }}
                          min={0}
                          max={360}
                          step={1}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min={0}
                          max={360}
                          value={config.gradient.angle ?? 135}
                          onChange={(e) => {
                            const value = Math.max(0, Math.min(360, parseInt(e.target.value) || 0))
                            handleGradientChange({ ...config.gradient!, angle: value })
                          }}
                          className="h-7 w-14 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">°</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
