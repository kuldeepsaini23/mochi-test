/**
 * ========================================
 * UNIFIED EFFECTS CONTROL COMPONENT
 * ========================================
 *
 * A single control for managing ALL visual effects on elements:
 * - Drop Shadow (outer shadow)
 * - Inner Shadow (inset shadow)
 * - Layer Blur (blurs the element)
 * - Background Blur (frosted glass effect)
 * - Fade Edges (gradient fade at container edges - frames only)
 *
 * UX PATTERN:
 * - Single "Add Effect" button opens a command menu with all available effects
 * - Added effects appear as expandable cards in a flat list (no sub-headers)
 * - Each effect can be toggled, edited, and deleted
 * - Consistent UI across all effect types
 */

'use client'

import { useCallback, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Sun,
  CircleDot,
  Layers,
  Square,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { ShadowEffect, BlurEffect, EffectsConfig } from '../../../_lib/types'
import {
  createDefaultDropShadow,
  createDefaultInnerShadow,
  createDefaultLayerBlur,
  createDefaultBackgroundBlur,
  getEffectLabel,
} from '../../../_lib/effect-utils'
import { ColorPickerControl } from './color-picker-control'

// ============================================================================
// TYPES
// ============================================================================

/** Fade edges effect - treated as a single toggleable effect */
interface FadeEdgesEffect {
  id: 'fade-edges'
  enabled: boolean
  type: 'fade-edges'
  value: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'
}

interface EffectsControlProps {
  /** Current effects configuration (shadows + blurs) */
  effectsConfig: EffectsConfig
  /** Called when effects config changes */
  onEffectsChange: (config: EffectsConfig) => void
  /** Current fade edges direction (frames only) */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'
  /** Called when fade edges direction changes (frames only) */
  onFadeEdgesChange?: (value: string) => void
  /** Current fade edges height as percentage (1-50, default 10) */
  fadeEdgesHeight?: number
  /** Called when fade edges height changes */
  onFadeEdgesHeightChange?: (value: number) => void
  /** Whether this element supports fade edges (frames and smartcms-list) */
  supportsFadeEdges?: boolean
  /** Whether mobile override indicator should be shown */
  hasMobileOverride?: boolean
  /** Called to reset mobile override */
  onResetMobileOverride?: () => void
}

// ============================================================================
// EDITABLE NUMBER INPUT
// ============================================================================

interface EditableNumberProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label: string
}

/**
 * A number display that becomes an input on double-click.
 */
function EditableNumber({ value, onChange, min, max, label }: EditableNumberProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(value))

  const handleDoubleClick = () => {
    setEditValue(String(value))
    setIsEditing(true)
  }

  const handleBlur = () => {
    setIsEditing(false)
    let newValue = parseFloat(editValue) || 0
    if (min !== undefined) newValue = Math.max(min, newValue)
    if (max !== undefined) newValue = Math.min(max, newValue)
    onChange(newValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(String(value))
    }
  }

  if (isEditing) {
    return (
      <Input
        type="number"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        className="h-7 text-xs w-full"
        autoFocus
      />
    )
  }

  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] text-muted-foreground uppercase">{label}</Label>
      <div
        onDoubleClick={handleDoubleClick}
        className="h-7 px-2 flex items-center text-xs bg-background border border-input rounded cursor-text hover:border-ring"
        title="Double-click to edit"
      >
        {value}
      </div>
    </div>
  )
}

// ============================================================================
// SHADOW EFFECT ITEM
// ============================================================================

interface ShadowItemProps {
  shadow: ShadowEffect
  onUpdate: (updates: Partial<Omit<ShadowEffect, 'id'>>) => void
  onRemove: () => void
  onToggle: () => void
}

/**
 * Shadow effect expandable card with all shadow properties.
 */
function ShadowItem({ shadow, onUpdate, onRemove, onToggle }: ShadowItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <span className={cn('text-xs flex-1', !shadow.enabled && 'text-muted-foreground')}>
          {getEffectLabel(shadow)}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="p-1 hover:bg-muted rounded"
          title={shadow.enabled ? 'Hide effect' : 'Show effect'}
        >
          {shadow.enabled ? (
            <Eye className="w-3 h-3 text-muted-foreground" />
          ) : (
            <EyeOff className="w-3 h-3 text-muted-foreground/50" />
          )}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
          title="Remove effect"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Expanded settings */}
      {isExpanded && (
        <div className="p-2 space-y-2 bg-background">
          <div className="grid grid-cols-2 gap-2">
            <EditableNumber label="X Offset" value={shadow.x} onChange={(val) => onUpdate({ x: val })} />
            <EditableNumber label="Y Offset" value={shadow.y} onChange={(val) => onUpdate({ y: val })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <EditableNumber label="Blur" value={shadow.blur} min={0} onChange={(val) => onUpdate({ blur: val })} />
            <EditableNumber label="Spread" value={shadow.spread} onChange={(val) => onUpdate({ spread: val })} />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase">Color</Label>
            <ColorPickerControl label="" value={shadow.color} onChange={(color) => onUpdate({ color })} />
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// BLUR EFFECT ITEM
// ============================================================================

interface BlurItemProps {
  blur: BlurEffect
  onUpdate: (updates: Partial<Omit<BlurEffect, 'id'>>) => void
  onRemove: () => void
  onToggle: () => void
}

/**
 * Blur effect expandable card with slider and description.
 */
function BlurItem({ blur, onUpdate, onRemove, onToggle }: BlurItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditingAmount, setIsEditingAmount] = useState(false)
  const [editValue, setEditValue] = useState(String(blur.amount))

  const handleAmountDoubleClick = () => {
    setEditValue(String(blur.amount))
    setIsEditingAmount(true)
  }

  const handleAmountBlur = () => {
    setIsEditingAmount(false)
    const newValue = Math.max(0, parseFloat(editValue) || 0)
    onUpdate({ amount: newValue })
  }

  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAmountBlur()
    else if (e.key === 'Escape') {
      setIsEditingAmount(false)
      setEditValue(String(blur.amount))
    }
  }

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <span className={cn('text-xs flex-1', !blur.enabled && 'text-muted-foreground')}>
          {getEffectLabel(blur)}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="p-1 hover:bg-muted rounded"
          title={blur.enabled ? 'Hide effect' : 'Show effect'}
        >
          {blur.enabled ? (
            <Eye className="w-3 h-3 text-muted-foreground" />
          ) : (
            <EyeOff className="w-3 h-3 text-muted-foreground/50" />
          )}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
          title="Remove effect"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Expanded settings */}
      {isExpanded && (
        <div className="p-2 space-y-2 bg-background">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-[10px] text-muted-foreground uppercase">Amount</Label>
              {isEditingAmount ? (
                <Input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleAmountBlur}
                  onKeyDown={handleAmountKeyDown}
                  min={0}
                  className="h-5 w-16 text-[10px] px-1 py-0"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="text-[10px] text-muted-foreground cursor-text hover:text-foreground px-1 py-0.5 rounded hover:bg-muted"
                  onDoubleClick={(e) => { e.stopPropagation(); handleAmountDoubleClick() }}
                  title="Double-click to edit"
                >
                  {blur.amount}px
                </span>
              )}
            </div>
            <Slider
              value={[blur.amount]}
              onValueChange={([value]) => onUpdate({ amount: value })}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            {blur.type === 'layer'
              ? 'Blurs this element, making it appear out of focus.'
              : 'Blurs content behind this element, creating a frosted glass effect.'}
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// FADE EDGES EFFECT ITEM
// ============================================================================

interface FadeEdgesItemProps {
  /** Current fade direction */
  value: string
  /** Current fade height as percentage (1-50) */
  height: number
  /** Called when direction changes */
  onUpdateDirection: (value: string) => void
  /** Called when height changes */
  onUpdateHeight: (value: number) => void
  /** Called to remove the effect */
  onRemove: () => void
}

/**
 * Fade edges effect expandable card with direction and height controls.
 * Shows direction dropdown and height slider for customizing the fade effect.
 */
function FadeEdgesItem({ value, height, onUpdateDirection, onUpdateHeight, onRemove }: FadeEdgesItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const fadeOptions = [
    { value: 'top', label: 'Top' },
    { value: 'bottom', label: 'Bottom' },
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
    { value: 'top-bottom', label: 'Top & Bottom' },
    { value: 'left-right', label: 'Left & Right' },
    { value: 'all', label: 'All Edges' },
  ]

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      {/* Header row - no eye toggle, just expand and delete */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <span className="text-xs flex-1">Fade Edges</span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
          title="Remove effect"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Expanded settings */}
      {isExpanded && (
        <div className="p-2 space-y-3 bg-background">
          {/* Direction dropdown */}
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase mb-1 block">Direction</Label>
            <select
              value={value}
              onChange={(e) => onUpdateDirection(e.target.value)}
              className={cn(
                'w-full h-8 px-2 text-xs rounded-md',
                'bg-muted/50 border border-border',
                'focus:outline-none focus:ring-1 focus:ring-primary'
              )}
            >
              {fadeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Height slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-[10px] text-muted-foreground uppercase">Height</Label>
              <span className="text-[10px] text-muted-foreground">{height}%</span>
            </div>
            <Slider
              value={[height]}
              onValueChange={([val]) => onUpdateHeight(val)}
              min={1}
              max={50}
              step={1}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN EFFECTS CONTROL COMPONENT
// ============================================================================

/**
 * Unified effects control with single "Add Effect" button.
 * All effects appear in a flat list with consistent UI.
 */
export function EffectsControl({
  effectsConfig,
  onEffectsChange,
  fadeEdges,
  onFadeEdgesChange,
  fadeEdgesHeight = 10,
  onFadeEdgesHeightChange,
  supportsFadeEdges = false,
  hasMobileOverride,
  onResetMobileOverride,
}: EffectsControlProps) {
  const [commandOpen, setCommandOpen] = useState(false)

  // Calculate total effect count
  const totalEffects =
    effectsConfig.shadows.length +
    effectsConfig.blurs.length +
    (fadeEdges && fadeEdges !== 'none' ? 1 : 0)

  // Check if fade edges effect is already added
  const hasFadeEdges = fadeEdges && fadeEdges !== 'none'

  // ========================================
  // ADD EFFECT HANDLERS
  // ========================================

  const handleAddDropShadow = useCallback(() => {
    onEffectsChange({
      ...effectsConfig,
      shadows: [...effectsConfig.shadows, createDefaultDropShadow()],
    })
    setCommandOpen(false)
  }, [effectsConfig, onEffectsChange])

  const handleAddInnerShadow = useCallback(() => {
    onEffectsChange({
      ...effectsConfig,
      shadows: [...effectsConfig.shadows, createDefaultInnerShadow()],
    })
    setCommandOpen(false)
  }, [effectsConfig, onEffectsChange])

  const handleAddLayerBlur = useCallback(() => {
    onEffectsChange({
      ...effectsConfig,
      blurs: [...effectsConfig.blurs, createDefaultLayerBlur()],
    })
    setCommandOpen(false)
  }, [effectsConfig, onEffectsChange])

  const handleAddBackgroundBlur = useCallback(() => {
    onEffectsChange({
      ...effectsConfig,
      blurs: [...effectsConfig.blurs, createDefaultBackgroundBlur()],
    })
    setCommandOpen(false)
  }, [effectsConfig, onEffectsChange])

  const handleAddFadeEdges = useCallback(() => {
    if (onFadeEdgesChange) {
      onFadeEdgesChange('bottom') // Default to bottom fade
    }
    setCommandOpen(false)
  }, [onFadeEdgesChange])

  // ========================================
  // UPDATE/REMOVE HANDLERS
  // ========================================

  const handleUpdateShadow = useCallback(
    (shadowId: string, updates: Partial<Omit<ShadowEffect, 'id'>>) => {
      onEffectsChange({
        ...effectsConfig,
        shadows: effectsConfig.shadows.map((s) =>
          s.id === shadowId ? { ...s, ...updates } : s
        ),
      })
    },
    [effectsConfig, onEffectsChange]
  )

  const handleRemoveShadow = useCallback(
    (shadowId: string) => {
      onEffectsChange({
        ...effectsConfig,
        shadows: effectsConfig.shadows.filter((s) => s.id !== shadowId),
      })
    },
    [effectsConfig, onEffectsChange]
  )

  const handleToggleShadow = useCallback(
    (shadowId: string) => {
      onEffectsChange({
        ...effectsConfig,
        shadows: effectsConfig.shadows.map((s) =>
          s.id === shadowId ? { ...s, enabled: !s.enabled } : s
        ),
      })
    },
    [effectsConfig, onEffectsChange]
  )

  const handleUpdateBlur = useCallback(
    (blurId: string, updates: Partial<Omit<BlurEffect, 'id'>>) => {
      onEffectsChange({
        ...effectsConfig,
        blurs: effectsConfig.blurs.map((b) =>
          b.id === blurId ? { ...b, ...updates } : b
        ),
      })
    },
    [effectsConfig, onEffectsChange]
  )

  const handleRemoveBlur = useCallback(
    (blurId: string) => {
      onEffectsChange({
        ...effectsConfig,
        blurs: effectsConfig.blurs.filter((b) => b.id !== blurId),
      })
    },
    [effectsConfig, onEffectsChange]
  )

  const handleToggleBlur = useCallback(
    (blurId: string) => {
      onEffectsChange({
        ...effectsConfig,
        blurs: effectsConfig.blurs.map((b) =>
          b.id === blurId ? { ...b, enabled: !b.enabled } : b
        ),
      })
    },
    [effectsConfig, onEffectsChange]
  )

  // Fade edges handlers - removes by setting to 'none'
  const handleRemoveFadeEdges = useCallback(() => {
    if (onFadeEdgesChange) {
      onFadeEdgesChange('none')
    }
  }, [onFadeEdgesChange])

  return (
    <div className="space-y-2">
      {/* Empty state - show prominent Add Effect button */}
      {totalEffects === 0 ? (
        <Popover open={commandOpen} onOpenChange={setCommandOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs gap-2 border-dashed"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Effect
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search effects..." />
              <CommandList>
                <CommandEmpty>No effects found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem onSelect={handleAddDropShadow}>
                    <Sun className="w-4 h-4 mr-2" />
                    Drop Shadow
                  </CommandItem>
                  <CommandItem onSelect={handleAddInnerShadow}>
                    <CircleDot className="w-4 h-4 mr-2" />
                    Inner Shadow
                  </CommandItem>
                  <CommandItem onSelect={handleAddLayerBlur}>
                    <Layers className="w-4 h-4 mr-2" />
                    Layer Blur
                  </CommandItem>
                  <CommandItem onSelect={handleAddBackgroundBlur}>
                    <Square className="w-4 h-4 mr-2" />
                    Background Blur
                  </CommandItem>
                  {supportsFadeEdges && (
                    <CommandItem onSelect={handleAddFadeEdges}>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Fade Edges
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <>
          {/* Header with count and add button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {totalEffects} {totalEffects === 1 ? 'effect' : 'effects'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {hasMobileOverride && onResetMobileOverride && (
                <button
                  onClick={onResetMobileOverride}
                  className="text-[10px] text-blue-500 hover:text-blue-600"
                  title="Reset to desktop value"
                >
                  Reset
                </button>
              )}
              <Popover open={commandOpen} onOpenChange={setCommandOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search effects..." />
                    <CommandList>
                      <CommandEmpty>No effects found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={handleAddDropShadow}>
                          <Sun className="w-4 h-4 mr-2" />
                          Drop Shadow
                        </CommandItem>
                        <CommandItem onSelect={handleAddInnerShadow}>
                          <CircleDot className="w-4 h-4 mr-2" />
                          Inner Shadow
                        </CommandItem>
                        <CommandItem onSelect={handleAddLayerBlur}>
                          <Layers className="w-4 h-4 mr-2" />
                          Layer Blur
                        </CommandItem>
                        <CommandItem onSelect={handleAddBackgroundBlur}>
                          <Square className="w-4 h-4 mr-2" />
                          Background Blur
                        </CommandItem>
                        {supportsFadeEdges && !hasFadeEdges && (
                          <CommandItem onSelect={handleAddFadeEdges}>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Fade Edges
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Effects list - flat, no sub-headers */}
          <div className="space-y-1.5">
            {/* Shadow effects */}
            {effectsConfig.shadows.map((shadow) => (
              <ShadowItem
                key={shadow.id}
                shadow={shadow}
                onUpdate={(updates) => handleUpdateShadow(shadow.id, updates)}
                onRemove={() => handleRemoveShadow(shadow.id)}
                onToggle={() => handleToggleShadow(shadow.id)}
              />
            ))}

            {/* Blur effects */}
            {effectsConfig.blurs.map((blur) => (
              <BlurItem
                key={blur.id}
                blur={blur}
                onUpdate={(updates) => handleUpdateBlur(blur.id, updates)}
                onRemove={() => handleRemoveBlur(blur.id)}
                onToggle={() => handleToggleBlur(blur.id)}
              />
            ))}

            {/* Fade edges effect */}
            {hasFadeEdges && onFadeEdgesChange && (
              <FadeEdgesItem
                value={fadeEdges!}
                height={fadeEdgesHeight}
                onUpdateDirection={onFadeEdgesChange}
                onUpdateHeight={onFadeEdgesHeightChange || (() => {})}
                onRemove={handleRemoveFadeEdges}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
