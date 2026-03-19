/**
 * ============================================================================
 * LIST SETTINGS - Bulleted list configuration panel
 * ============================================================================
 *
 * SOURCE OF TRUTH: ListElement settings in the Properties Panel, list-settings
 *
 * Renders the Settings tab content for List elements, allowing users to
 * manage list items, configure the bullet icon, and adjust spacing.
 *
 * ============================================================================
 * SECTIONS
 * ============================================================================
 *
 * 1. ICON SETTINGS
 *    - Icon picker (same icon library as buttons)
 *    - Icon size slider
 *    - Icon color picker
 *
 * 2. LIST ITEMS MANAGER
 *    - Add new items via "Add Item" button
 *    - Each item row: text input, move up/down, delete
 *    - Items array stored as { id, text }[]
 *
 * 3. LAYOUT
 *    - Item gap (vertical spacing between items)
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, List } from 'lucide-react'
import { PropertySection, SliderInputControl, ColorPickerControl } from './controls'
import { useAppDispatch, updateElement } from '../../_lib'
import type { ListElement, ListItem } from '../../_lib/types'
import { IconPicker } from '@/components/ui/icon-picker'
import { IconRenderer } from '@/lib/icons'

// ============================================================================
// TYPES
// ============================================================================

interface ListSettingsSectionProps {
  element: ListElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders the Settings tab for List elements.
 * Manages the list items, icon configuration, and layout spacing.
 */
export function ListSettingsSection({ element }: ListSettingsSectionProps) {
  const dispatch = useAppDispatch()

  /** Current items array from the element (defaults to empty) */
  const items: ListItem[] = element.items ?? []

  // ==========================================================================
  // ITEM MANAGEMENT HELPERS
  // ==========================================================================

  /**
   * Add a new blank list item to the end of the list.
   * Generates a unique ID using timestamp + random suffix.
   */
  const handleAddItem = () => {
    const newItem: ListItem = {
      id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      text: 'New item',
    }

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          items: [...items, newItem],
        },
      })
    )
  }

  /** Remove an item from the list by index */
  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index)
    dispatch(
      updateElement({
        id: element.id,
        updates: { items: updated },
      })
    )
  }

  /** Update a single item's text */
  const handleUpdateItem = (index: number, text: string) => {
    const updated = items.map((item, i) =>
      i === index ? { ...item, text } : item
    )
    dispatch(
      updateElement({
        id: element.id,
        updates: { items: updated },
      })
    )
  }

  /** Move an item up in the list */
  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const updated = [...items]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    dispatch(
      updateElement({
        id: element.id,
        updates: { items: updated },
      })
    )
  }

  /** Move an item down in the list */
  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return
    const updated = [...items]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    dispatch(
      updateElement({
        id: element.id,
        updates: { items: updated },
      })
    )
  }

  /** Update a direct element property (icon, iconSize, iconColor, itemGap) */
  const handlePropertyChange = (key: string, value: unknown) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { [key]: value },
      })
    )
  }

  return (
    <>
      {/* ================================================================
          ICON SETTINGS — Bullet icon configuration (same library as buttons)
          ================================================================ */}
      <PropertySection title="Bullet Icon" defaultOpen>
        {/* Icon Picker — same component used by button elements */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">
            Icon
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <IconPicker
                value={element.icon || undefined}
                onValueChange={(val) => handlePropertyChange('icon', val)}
                placeholder="Select icon..."
                className="w-full h-8 text-xs"
              />
            </div>
            {/* Clear icon button — resets to default Check */}
            {element.icon && element.icon !== 'Check' && (
              <button
                type="button"
                onClick={() => handlePropertyChange('icon', 'Check')}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent"
                title="Reset to default"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Icon Size — pixel size of the bullet icon */}
        <SliderInputControl
          label="Icon Size"
          value={element.iconSize ?? 16}
          onChange={(val) => handlePropertyChange('iconSize', val)}
          min={8}
          max={48}
          step={1}
        />

        {/* Icon Color — uses the same color swatch as background fill */}
        <ColorPickerControl
          label="Icon Color"
          value={element.iconColor ?? '#111111'}
          onChange={(val) => handlePropertyChange('iconColor', val)}
        />
      </PropertySection>

      {/* ================================================================
          COLORS — Text color control
          ================================================================ */}
      <PropertySection title="Colors" defaultOpen>
        {/* Text Color — color of the list item text */}
        <ColorPickerControl
          label="Text Color"
          value={(element.styles?.color as string) ?? '#111111'}
          onChange={(val) => {
            dispatch(
              updateElement({
                id: element.id,
                updates: {
                  styles: { ...element.styles, color: val },
                },
              })
            )
          }}
        />
      </PropertySection>

      {/* ================================================================
          LAYOUT — Item gap spacing
          ================================================================ */}
      <PropertySection title="Layout" defaultOpen>
        <SliderInputControl
          label="Item Gap"
          value={element.itemGap ?? 8}
          onChange={(val) => handlePropertyChange('itemGap', val)}
          min={0}
          max={48}
          step={1}
        />
      </PropertySection>

      {/* ================================================================
          LIST ITEMS — Add, edit, reorder, and delete list items
          ================================================================ */}
      <PropertySection title="List Items" defaultOpen>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-1.5 group"
            >
              {/* Bullet icon preview */}
              <div className="flex-shrink-0 opacity-40">
                <IconRenderer
                  name={element.icon || 'Check'}
                  style={{ width: 12, height: 12 }}
                />
              </div>

              {/* Text input */}
              <input
                type="text"
                value={item.text}
                onChange={(e) => handleUpdateItem(index, e.target.value)}
                className="flex-1 h-7 px-2 text-xs border border-border rounded-md bg-background"
                placeholder="Item text..."
              />

              {/* Move up/down and delete — visible on hover */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index >= items.length - 1}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className="p-0.5 text-muted-foreground hover:text-destructive"
                  title="Remove item"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {/* Add Item button */}
          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center gap-1.5 w-full h-7 px-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:bg-accent/50 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Item
          </button>
        </div>
      </PropertySection>
    </>
  )
}
