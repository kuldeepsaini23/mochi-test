/**
 * ========================================
 * BLUR CONTROL COMPONENT
 * ========================================
 *
 * A control for managing blur effects on elements.
 * Users can add, edit, and remove blur effects with a user-friendly interface.
 *
 * Features:
 * - Add layer blur or background blur via searchable command menu
 * - Adjust blur intensity with slider (max 100px)
 * - Double-click on value to enter custom amount
 * - Toggle individual blurs on/off
 * - Remove blurs
 * - Collapsed view showing count of effects (not a long list)
 *
 * Uses user-friendly terminology:
 * - "Layer Blur" instead of "filter: blur()"
 * - "Background Blur" instead of "backdrop-filter: blur()"
 */

'use client'

import { useCallback, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Plus, Trash2, Layers, Square } from 'lucide-react'
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
import type { BlurEffect } from '../../../_lib/types'
import {
  createDefaultLayerBlur,
  createDefaultBackgroundBlur,
  getEffectLabel,
} from '../../../_lib/effect-utils'

// ============================================================================
// TYPES
// ============================================================================

interface BlurControlProps {
  /** Current list of blur effects */
  blurs: BlurEffect[]
  /** Called when blurs are updated */
  onChange: (blurs: BlurEffect[]) => void
  /** Whether mobile override indicator should be shown */
  hasMobileOverride?: boolean
  /** Called to reset mobile override */
  onResetMobileOverride?: () => void
}

// ============================================================================
// BLUR ITEM COMPONENT
// ============================================================================

interface BlurItemProps {
  blur: BlurEffect
  onUpdate: (updates: Partial<Omit<BlurEffect, 'id'>>) => void
  onRemove: () => void
  onToggle: () => void
}

/**
 * Individual blur item with expandable settings.
 * Shows blur type label and toggle/delete controls.
 */
function BlurItem({ blur, onUpdate, onRemove, onToggle }: BlurItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditingAmount, setIsEditingAmount] = useState(false)
  const [editValue, setEditValue] = useState(String(blur.amount))

  /**
   * Handle double-click on the amount value to enable editing.
   */
  const handleAmountDoubleClick = () => {
    setEditValue(String(blur.amount))
    setIsEditingAmount(true)
  }

  /**
   * Commit the edited value on blur or enter.
   */
  const handleAmountBlur = () => {
    setIsEditingAmount(false)
    const newValue = Math.max(0, parseFloat(editValue) || 0)
    onUpdate({ amount: newValue })
  }

  /**
   * Handle keyboard events in the amount input.
   */
  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAmountBlur()
    } else if (e.key === 'Escape') {
      setIsEditingAmount(false)
      setEditValue(String(blur.amount))
    }
  }

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      {/* Header row - always visible */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse indicator */}
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}

        {/* Blur type label */}
        <span className={cn('text-xs flex-1', !blur.enabled && 'text-muted-foreground')}>
          {getEffectLabel(blur)}
        </span>

        {/* Toggle visibility */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="p-1 hover:bg-muted rounded"
          title={blur.enabled ? 'Hide blur' : 'Show blur'}
        >
          {blur.enabled ? (
            <Eye className="w-3 h-3 text-muted-foreground" />
          ) : (
            <EyeOff className="w-3 h-3 text-muted-foreground/50" />
          )}
        </button>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
          title="Remove blur"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Expanded settings */}
      {isExpanded && (
        <div className="p-2 space-y-2 bg-background">
          {/* Blur amount slider with editable value */}
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
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    handleAmountDoubleClick()
                  }}
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

          {/* Description based on blur type */}
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
// MAIN BLUR CONTROL COMPONENT
// ============================================================================

/**
 * Blur control for managing layer blurs and background blurs.
 * Shows a compact list with add button that opens a searchable command menu.
 */
export function BlurControl({
  blurs,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: BlurControlProps) {
  const [commandOpen, setCommandOpen] = useState(false)

  /**
   * Add a new blur effect of the specified type.
   */
  const handleAddBlur = useCallback(
    (type: 'layer' | 'background') => {
      const newBlur = type === 'layer' ? createDefaultLayerBlur() : createDefaultBackgroundBlur()
      onChange([...blurs, newBlur])
      setCommandOpen(false)
    },
    [blurs, onChange]
  )

  /**
   * Update a blur by ID with partial changes.
   */
  const handleUpdateBlur = useCallback(
    (blurId: string, updates: Partial<Omit<BlurEffect, 'id'>>) => {
      const updatedBlurs = blurs.map((blur) =>
        blur.id === blurId ? { ...blur, ...updates } : blur
      )
      onChange(updatedBlurs)
    },
    [blurs, onChange]
  )

  /**
   * Remove a blur by ID.
   */
  const handleRemoveBlur = useCallback(
    (blurId: string) => {
      const filteredBlurs = blurs.filter((blur) => blur.id !== blurId)
      onChange(filteredBlurs)
    },
    [blurs, onChange]
  )

  /**
   * Toggle a blur's enabled state by ID.
   */
  const handleToggleBlur = useCallback(
    (blurId: string) => {
      const updatedBlurs = blurs.map((blur) =>
        blur.id === blurId ? { ...blur, enabled: !blur.enabled } : blur
      )
      onChange(updatedBlurs)
    },
    [blurs, onChange]
  )

  return (
    <div className="space-y-2">
      {/* Header with count and add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">Blurs</Label>
          {blurs.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {blurs.length}
            </span>
          )}
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
          {/* Add button with command menu */}
          <Popover open={commandOpen} onOpenChange={setCommandOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-0" align="end">
              <Command>
                <CommandInput placeholder="Search effects..." />
                <CommandList>
                  <CommandEmpty>No effects found.</CommandEmpty>
                  <CommandGroup heading="Blur Effects">
                    <CommandItem onSelect={() => handleAddBlur('layer')}>
                      <Layers className="w-4 h-4 mr-2" />
                      Layer Blur
                    </CommandItem>
                    <CommandItem onSelect={() => handleAddBlur('background')}>
                      <Square className="w-4 h-4 mr-2" />
                      Background Blur
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Blur list - compact view */}
      {blurs.length > 0 && (
        <div className="space-y-1.5">
          {blurs.map((blur) => (
            <BlurItem
              key={blur.id}
              blur={blur}
              onUpdate={(updates) => handleUpdateBlur(blur.id, updates)}
              onRemove={() => handleRemoveBlur(blur.id)}
              onToggle={() => handleToggleBlur(blur.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
