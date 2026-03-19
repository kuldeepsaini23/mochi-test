/**
 * ============================================================================
 * BORDER CONTROL - Comprehensive per-side border editor with gradient support
 * ============================================================================
 *
 * Figma-style border editor with:
 * - Border style selection (none, solid, dashed, dotted)
 * - Border width input
 * - Border color picker with gradient option
 * - Edit mode toggle (all sides, individual, horizontal, vertical)
 * - Per-side configuration when in individual mode
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * This control manages the full BorderConfig structure:
 * - editMode: Controls which sides are edited together
 * - top/right/bottom/left: Individual side configurations
 * - gradient: Optional gradient for border color
 *
 * When gradient is enabled, individual side colors are ignored and the
 * gradient is applied uniformly to all sides.
 *
 * ============================================================================
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BuilderColorPicker } from './builder-color-picker'
import {
  Square,
  Minus,
  MoreHorizontal,
  ArrowUpDown,
  ArrowLeftRight,
  Paintbrush,
} from 'lucide-react'
import type {
  BorderConfig,
  BorderStyle,
  BorderEditMode,
  BorderSide,
  GradientConfig,
} from '../../../_lib/types'
import {
  createEmptyBorderConfig,
  updateBordersByMode,
  setBorderGradient,
  setBorderEditMode,
  hasBorder,
  hasGradientBorder,
  getPrimaryBorderSide,
  getBorderStyleOptions,
  getBorderEditModeOptions,
  DEFAULT_BORDER_COLOR,
} from '../../../_lib/border-utils'
import {
  gradientConfigToCSS,
  createDefaultLinearGradient,
} from '../../../_lib/gradient-utils'
/* color-opacity-utils no longer needed — AdvancedColorPicker handles all color math */
import { GradientControl } from './gradient-control'
import { MobileOverrideIndicator } from './mobile-override-indicator'

// ============================================================================
// TYPES
// ============================================================================

interface BorderControlProps {
  /** Current border configuration */
  value: BorderConfig | undefined
  /** Called when border configuration changes */
  onChange: (config: BorderConfig | undefined) => void
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * Small color swatch preview for inline display.
 */
function ColorSwatch({
  color,
  gradient,
  className,
}: {
  color?: string
  gradient?: GradientConfig
  className?: string
}) {
  const style: React.CSSProperties = gradient
    ? { background: gradientConfigToCSS(gradient) }
    : { backgroundColor: color || 'transparent' }

  return (
    <div
      className={`w-4 h-4 rounded border border-border ${className ?? ''}`}
      style={style}
    />
  )
}

/**
 * Side indicator icon for individual mode.
 */
function SideIcon({ side }: { side: BorderSide }) {
  const iconClass = 'w-3 h-3'

  switch (side) {
    case 'top':
      return (
        <div className={iconClass}>
          <div className="w-full h-0.5 bg-current rounded" />
        </div>
      )
    case 'right':
      return (
        <div className={`${iconClass} flex justify-end`}>
          <div className="w-0.5 h-full bg-current rounded" />
        </div>
      )
    case 'bottom':
      return (
        <div className={`${iconClass} flex items-end`}>
          <div className="w-full h-0.5 bg-current rounded" />
        </div>
      )
    case 'left':
      return (
        <div className={iconClass}>
          <div className="w-0.5 h-full bg-current rounded" />
        </div>
      )
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * BorderControl - Full-featured border editor.
 *
 * Provides comprehensive border editing with support for:
 * - All sides at once (uniform borders)
 * - Individual side editing
 * - Horizontal (left/right) or vertical (top/bottom) pairs
 * - Solid colors or gradients
 */
export function BorderControl({
  value,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: BorderControlProps) {
  // Use empty config if no value provided
  const config = value ?? createEmptyBorderConfig()

  // Track popover open state
  const [isOpen, setIsOpen] = useState(false)

  // Get primary side for display
  const primarySide = getPrimaryBorderSide(config)
  const hasVisibleBorder = hasBorder(config)
  const hasGradient = hasGradientBorder(config)

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Handle border style change for current edit mode.
   */
  const handleStyleChange = useCallback(
    (style: BorderStyle, side?: BorderSide) => {
      let newConfig: BorderConfig

      if (style === 'none') {
        // Setting to 'none' - clear border for affected sides
        newConfig = updateBordersByMode(
          config,
          { style: 'none', width: 0 },
          side
        )
      } else {
        // Setting to visible style - ensure width and color are set
        newConfig = updateBordersByMode(
          config,
          {
            style,
            width: primarySide.width || 1,
            color: primarySide.color || DEFAULT_BORDER_COLOR,
          },
          side
        )
      }

      onChange(newConfig)
    },
    [config, onChange, primarySide]
  )

  /**
   * Handle border width change for current edit mode.
   */
  const handleWidthChange = useCallback(
    (width: number, side?: BorderSide) => {
      const newConfig = updateBordersByMode(config, { width }, side)
      onChange(newConfig)
    },
    [config, onChange]
  )

  /**
   * Handle border color change for current edit mode.
   */
  const handleColorChange = useCallback(
    (color: string, side?: BorderSide) => {
      const newConfig = updateBordersByMode(config, { color }, side)
      onChange(newConfig)
    },
    [config, onChange]
  )

  /**
   * Handle gradient change (applies to all sides).
   */
  const handleGradientChange = useCallback(
    (gradient: GradientConfig | undefined) => {
      const newConfig = setBorderGradient(config, gradient)
      onChange(newConfig)
    },
    [config, onChange]
  )

  /**
   * Handle edit mode change.
   */
  const handleEditModeChange = useCallback(
    (mode: BorderEditMode) => {
      const newConfig = setBorderEditMode(config, mode)
      onChange(newConfig)
    },
    [config, onChange]
  )

  /**
   * Toggle gradient on/off.
   */
  const handleToggleGradient = useCallback(() => {
    if (hasGradient) {
      // Remove gradient
      const newConfig = setBorderGradient(config, undefined)
      onChange(newConfig)
    } else {
      // Enable gradient with default
      const newConfig = setBorderGradient(config, createDefaultLinearGradient())
      // Ensure borders are visible
      if (!hasVisibleBorder) {
        const withBorders = updateBordersByMode(newConfig, {
          style: 'solid',
          width: 2,
        })
        onChange(withBorders)
      } else {
        onChange(newConfig)
      }
    }
  }, [config, onChange, hasGradient, hasVisibleBorder])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-2">
      {/* Header row with label and mobile override indicator */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Border</span>
        {hasMobileOverride && (
          <MobileOverrideIndicator hasOverride={hasMobileOverride} onReset={onResetMobileOverride} />
        )}
      </div>

      {/* Main control row */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 justify-between bg-popover border-border hover:bg-accent hover:border-border"
          >
            <div className="flex items-center gap-2">
              {/* Color/gradient preview */}
              <ColorSwatch
                color={hasGradient ? undefined : primarySide.color}
                gradient={hasGradient ? config.gradient : undefined}
              />

              {/* Style and width info */}
              <span className="text-xs text-foreground">
                {hasVisibleBorder
                  ? hasGradient
                    ? `Gradient ${primarySide.width}px`
                    : `${primarySide.style} ${primarySide.width}px`
                  : 'No border'}
              </span>
            </div>

            <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="left"
          align="start"
          className="w-72 p-3 bg-popover border-border"
          sideOffset={8}
        >
          <div className="space-y-4">
            {/* Edit Mode Toggle */}
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">Edit Mode</span>
              <div className="flex gap-1">
                {getBorderEditModeOptions().map((option) => (
                  <Button
                    key={option.value}
                    variant={config.editMode === option.value ? 'default' : 'outline'}
                    size="sm"
                    className={`flex-1 h-7 text-xs ${
                      config.editMode === option.value
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-secondary border-border hover:bg-accent'
                    }`}
                    onClick={() => handleEditModeChange(option.value)}
                  >
                    {option.value === 'all' && <Square className="w-3 h-3 mr-1" />}
                    {option.value === 'individual' && <Minus className="w-3 h-3 mr-1" />}
                    {option.value === 'horizontal' && <ArrowLeftRight className="w-3 h-3 mr-1" />}
                    {option.value === 'vertical' && <ArrowUpDown className="w-3 h-3 mr-1" />}
                    <span className="hidden sm:inline">{option.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Border Properties - shown based on edit mode */}
            {config.editMode === 'individual' ? (
              // Individual mode - show all four sides
              <div className="space-y-3">
                {(['top', 'right', 'bottom', 'left'] as BorderSide[]).map((side) => (
                  <BorderSideEditor
                    key={side}
                    side={side}
                    config={config[side]}
                    onStyleChange={(style) => handleStyleChange(style, side)}
                    onWidthChange={(width) => handleWidthChange(width, side)}
                    onColorChange={(color) => handleColorChange(color, side)}
                    showGradient={false}
                  />
                ))}
              </div>
            ) : (
              // Unified mode - show single editor for affected sides
              <BorderSideEditor
                side={config.editMode === 'horizontal' ? 'left' : 'top'}
                config={primarySide}
                onStyleChange={handleStyleChange}
                onWidthChange={handleWidthChange}
                onColorChange={handleColorChange}
                showGradient={false}
                hideLabel
              />
            )}

            {/* Gradient Toggle and Editor */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Gradient Border</span>
                <Button
                  variant={hasGradient ? 'default' : 'outline'}
                  size="sm"
                  className={`h-6 px-2 text-xs ${
                    hasGradient
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-secondary border-border hover:bg-accent'
                  }`}
                  onClick={handleToggleGradient}
                >
                  <Paintbrush className="w-3 h-3 mr-1" />
                  {hasGradient ? 'On' : 'Off'}
                </Button>
              </div>

              {/* Gradient editor when gradient is enabled */}
              {hasGradient && config.gradient && (
                <GradientControl
                  label="Gradient"
                  solidColor={primarySide.color}
                  gradient={config.gradient}
                  onSolidColorChange={() => {}} // Not used when in gradient mode
                  onGradientChange={handleGradientChange}
                />
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ============================================================================
// BORDER SIDE EDITOR - Individual side editing
// ============================================================================

interface BorderSideEditorProps {
  side: BorderSide
  config: {
    style: BorderStyle
    width: number
    color: string
  }
  onStyleChange: (style: BorderStyle) => void
  onWidthChange: (width: number) => void
  onColorChange: (color: string) => void
  showGradient?: boolean
  hideLabel?: boolean
}

/**
 * Editor for a single border side.
 * Shows style dropdown, width input, and color picker using AdvancedColorPicker.
 */
function BorderSideEditor({
  side,
  config,
  onStyleChange,
  onWidthChange,
  onColorChange,
  hideLabel = false,
}: BorderSideEditorProps) {
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false)

  return (
    <div className="space-y-2">
      {/* Side label */}
      {!hideLabel && (
        <div className="flex items-center gap-2">
          <SideIcon side={side} />
          <span className="text-xs text-muted-foreground capitalize">{side}</span>
        </div>
      )}

      {/* Style, Width, Color row */}
      <div className="flex gap-2">
        {/* Style dropdown */}
        <select
          value={config.style}
          onChange={(e) => onStyleChange(e.target.value as BorderStyle)}
          className="flex-1 h-7 px-2 text-xs bg-transparent dark:bg-input/30 border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {getBorderStyleOptions().map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Width input — only show when style is not 'none' */}
        {config.style !== 'none' && (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={config.width}
              onChange={(e) => onWidthChange(parseInt(e.target.value, 10) || 0)}
              className="w-14 h-7 text-xs border-border"
              min={0}
              max={100}
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        )}

        {/* Color picker — opens AdvancedColorPicker in a popover */}
        {config.style !== 'none' && (
          <Popover open={colorPopoverOpen} onOpenChange={setColorPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-7 h-7 p-0 bg-popover border-border"
              >
                <div
                  className="w-4 h-4 rounded border border-border"
                  style={{ backgroundColor: config.color }}
                />
              </Button>
            </PopoverTrigger>

            <PopoverContent
              side="left"
              className="w-[300px] p-3 bg-popover border-border"
              sideOffset={8}
            >
              {/* Builder-aware color picker with quick presets + saved colors */}
              <BuilderColorPicker
                value={config.color}
                onChange={onColorChange}
                showOpacity
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}

export default BorderControl
