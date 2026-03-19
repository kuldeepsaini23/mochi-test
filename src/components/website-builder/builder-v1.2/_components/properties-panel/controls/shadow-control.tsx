/**
 * ========================================
 * SHADOW CONTROL COMPONENT
 * ========================================
 *
 * A control for managing drop shadow and inner shadow effects.
 * Users can add, edit, and remove shadow effects with a user-friendly interface.
 *
 * Features:
 * - Add drop shadow (outer shadow) or inner shadow via searchable command menu
 * - Adjust X/Y offset, blur, spread, and color
 * - Toggle individual shadows on/off
 * - Remove shadows
 * - Collapsed view showing count of effects (not a long list)
 *
 * Uses user-friendly terminology:
 * - "Drop Shadow" instead of "box-shadow"
 * - "Inner Shadow" instead of "inset shadow"
 */

'use client'

import { useCallback, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Plus, Trash2, Sun, CircleDot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type { ShadowEffect } from '../../../_lib/types'
import {
  createDefaultDropShadow,
  createDefaultInnerShadow,
  getEffectLabel,
} from '../../../_lib/effect-utils'
import { ColorPickerControl } from './color-picker-control'

// ============================================================================
// TYPES
// ============================================================================

interface ShadowControlProps {
  /** Current list of shadow effects */
  shadows: ShadowEffect[]
  /** Called when shadows are updated */
  onChange: (shadows: ShadowEffect[]) => void
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
 * Shows the value normally, allows editing on double-click.
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
// SHADOW ITEM COMPONENT
// ============================================================================

interface ShadowItemProps {
  shadow: ShadowEffect
  onUpdate: (updates: Partial<Omit<ShadowEffect, 'id'>>) => void
  onRemove: () => void
  onToggle: () => void
}

/**
 * Individual shadow item with expandable settings.
 * Shows shadow type label and toggle/delete controls.
 */
function ShadowItem({ shadow, onUpdate, onRemove, onToggle }: ShadowItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

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

        {/* Shadow type label */}
        <span className={cn('text-xs flex-1', !shadow.enabled && 'text-muted-foreground')}>
          {getEffectLabel(shadow)}
        </span>

        {/* Toggle visibility */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="p-1 hover:bg-muted rounded"
          title={shadow.enabled ? 'Hide shadow' : 'Show shadow'}
        >
          {shadow.enabled ? (
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
          title="Remove shadow"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Expanded settings */}
      {isExpanded && (
        <div className="p-2 space-y-2 bg-background">
          {/* X and Y offset row */}
          <div className="grid grid-cols-2 gap-2">
            <EditableNumber
              label="X Offset"
              value={shadow.x}
              onChange={(val) => onUpdate({ x: val })}
            />
            <EditableNumber
              label="Y Offset"
              value={shadow.y}
              onChange={(val) => onUpdate({ y: val })}
            />
          </div>

          {/* Blur and Spread row */}
          <div className="grid grid-cols-2 gap-2">
            <EditableNumber
              label="Blur"
              value={shadow.blur}
              min={0}
              onChange={(val) => onUpdate({ blur: val })}
            />
            <EditableNumber
              label="Spread"
              value={shadow.spread}
              onChange={(val) => onUpdate({ spread: val })}
            />
          </div>

          {/* Color picker */}
          <div>
            <Label className="text-[10px] text-muted-foreground uppercase">Color</Label>
            <ColorPickerControl
              label=""
              value={shadow.color}
              onChange={(color) => onUpdate({ color })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN SHADOW CONTROL COMPONENT
// ============================================================================

/**
 * Shadow control for managing drop shadows and inner shadows.
 * Shows a compact list with add button that opens a searchable command menu.
 */
export function ShadowControl({
  shadows,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: ShadowControlProps) {
  const [commandOpen, setCommandOpen] = useState(false)

  /**
   * Add a new shadow effect of the specified type.
   */
  const handleAddShadow = useCallback(
    (type: 'outer' | 'inner') => {
      const newShadow = type === 'outer' ? createDefaultDropShadow() : createDefaultInnerShadow()
      onChange([...shadows, newShadow])
      setCommandOpen(false)
    },
    [shadows, onChange]
  )

  /**
   * Update a shadow by ID with partial changes.
   */
  const handleUpdateShadow = useCallback(
    (shadowId: string, updates: Partial<Omit<ShadowEffect, 'id'>>) => {
      const updatedShadows = shadows.map((shadow) =>
        shadow.id === shadowId ? { ...shadow, ...updates } : shadow
      )
      onChange(updatedShadows)
    },
    [shadows, onChange]
  )

  /**
   * Remove a shadow by ID.
   */
  const handleRemoveShadow = useCallback(
    (shadowId: string) => {
      const filteredShadows = shadows.filter((shadow) => shadow.id !== shadowId)
      onChange(filteredShadows)
    },
    [shadows, onChange]
  )

  /**
   * Toggle a shadow's enabled state by ID.
   */
  const handleToggleShadow = useCallback(
    (shadowId: string) => {
      const updatedShadows = shadows.map((shadow) =>
        shadow.id === shadowId ? { ...shadow, enabled: !shadow.enabled } : shadow
      )
      onChange(updatedShadows)
    },
    [shadows, onChange]
  )

  return (
    <div className="space-y-2">
      {/* Header with count and add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">Shadows</Label>
          {shadows.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {shadows.length}
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
                  <CommandGroup heading="Shadow Effects">
                    <CommandItem onSelect={() => handleAddShadow('outer')}>
                      <Sun className="w-4 h-4 mr-2" />
                      Drop Shadow
                    </CommandItem>
                    <CommandItem onSelect={() => handleAddShadow('inner')}>
                      <CircleDot className="w-4 h-4 mr-2" />
                      Inner Shadow
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Shadow list - compact view */}
      {shadows.length > 0 && (
        <div className="space-y-1.5">
          {shadows.map((shadow) => (
            <ShadowItem
              key={shadow.id}
              shadow={shadow}
              onUpdate={(updates) => handleUpdateShadow(shadow.id, updates)}
              onRemove={() => handleRemoveShadow(shadow.id)}
              onToggle={() => handleToggleShadow(shadow.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
