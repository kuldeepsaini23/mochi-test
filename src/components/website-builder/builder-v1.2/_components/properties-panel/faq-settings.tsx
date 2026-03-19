/**
 * ============================================================================
 * FAQ SETTINGS - Accordion Q&A configuration panel
 * ============================================================================
 *
 * SOURCE OF TRUTH: FaqElement settings in the Properties Panel, faq-settings
 *
 * Renders the Settings tab content for FAQ elements, allowing users to
 * manage question/answer items and configure accordion behavior.
 *
 * ============================================================================
 * SECTIONS
 * ============================================================================
 *
 * 1. FAQ ITEMS MANAGER
 *    - Add new Q&A pairs via "Add Item" button
 *    - Each item row: question input, answer textarea, move up/down, delete
 *    - Items array stored as { id, question, answer }[]
 *
 * 2. BEHAVIOR
 *    - Allow Multiple Open: toggle for multi-expand vs single-expand
 *    - Separator Style: line / card / none
 *    - Icon Style: chevron / plus / none
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, HelpCircle } from 'lucide-react'
import { PropertySection, ToggleControl, DropdownControl, ColorPickerControl, SliderInputControl, FontFamilyControl } from './controls'
import { useAppDispatch, updateElement } from '../../_lib'
import type { FaqElement, FaqItem } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface FaqSettingsSectionProps {
  element: FaqElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders the Settings tab for FAQ elements.
 * Manages the FAQ items list, behavior toggles, and display options.
 */
export function FaqSettingsSection({ element }: FaqSettingsSectionProps) {
  const dispatch = useAppDispatch()

  /** Current items array from the element (defaults to empty) */
  const items: FaqItem[] = element.items ?? []

  /**
   * Update a style property on the element.
   * Merges with existing styles to avoid overwriting other style values.
   */
  const handleStyleChange = (key: string | keyof React.CSSProperties, value: unknown) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          styles: { ...element.styles, [key]: value },
        },
      })
    )
  }

  // ==========================================================================
  // ITEM MANAGEMENT HELPERS
  // ==========================================================================

  /**
   * Add a new blank FAQ item to the end of the list.
   * Generates a unique ID using timestamp + random suffix.
   */
  const handleAddItem = () => {
    const newItem: FaqItem = {
      id: `faq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      question: 'New question',
      answer: 'Answer goes here.',
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

  /**
   * Remove an FAQ item by its unique ID.
   */
  const handleRemoveItem = (itemId: string) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          items: items.filter((item) => item.id !== itemId),
        },
      })
    )
  }

  /**
   * Update the question text for a specific FAQ item.
   */
  const handleQuestionChange = (itemId: string, newQuestion: string) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          items: items.map((item) =>
            item.id === itemId ? { ...item, question: newQuestion } : item
          ),
        },
      })
    )
  }

  /**
   * Update the answer text for a specific FAQ item.
   */
  const handleAnswerChange = (itemId: string, newAnswer: string) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          items: items.map((item) =>
            item.id === itemId ? { ...item, answer: newAnswer } : item
          ),
        },
      })
    )
  }

  /**
   * Swap an item with the one above it (move up).
   * No-op if already at position 0.
   */
  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const newItems = [...items]
    const temp = newItems[index - 1]
    newItems[index - 1] = newItems[index]
    newItems[index] = temp

    dispatch(
      updateElement({
        id: element.id,
        updates: { items: newItems },
      })
    )
  }

  /**
   * Swap an item with the one below it (move down).
   * No-op if already at the last position.
   */
  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return
    const newItems = [...items]
    const temp = newItems[index + 1]
    newItems[index + 1] = newItems[index]
    newItems[index] = temp

    dispatch(
      updateElement({
        id: element.id,
        updates: { items: newItems },
      })
    )
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <>
      {/* ================================================================
          FAQ ITEMS SECTION — Manage question/answer pairs
          ================================================================ */}
      <PropertySection title="FAQ Items" defaultOpen>
        <div className="flex flex-col gap-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-lg border border-border/50 bg-muted/30 p-3"
            >
              {/* Item header: number badge + action buttons */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-medium text-primary">
                      {index + 1}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">Item {index + 1}</span>
                </div>

                <div className="flex items-center gap-0.5">
                  {/* Move up button */}
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>

                  {/* Move down button */}
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index >= items.length - 1}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Question input */}
              <div className="mb-2">
                <label className="text-[11px] text-muted-foreground mb-1 block">
                  Question
                </label>
                <input
                  type="text"
                  value={item.question}
                  onChange={(e) => handleQuestionChange(item.id, e.target.value)}
                  className="w-full text-xs bg-background border border-border/50 rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="Enter question..."
                />
              </div>

              {/* Answer textarea */}
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">
                  Answer
                </label>
                <textarea
                  value={item.answer}
                  onChange={(e) => handleAnswerChange(item.id, e.target.value)}
                  rows={3}
                  className="w-full text-xs bg-background border border-border/50 rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 resize-y"
                  placeholder="Enter answer..."
                />
              </div>
            </div>
          ))}

          {/* Add item button */}
          <button
            onClick={handleAddItem}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add FAQ Item
          </button>

          {/* Empty state */}
          {items.length === 0 && (
            <div className="py-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <HelpCircle className="w-5 h-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">
                No FAQ items yet. Click &ldquo;Add FAQ Item&rdquo; to get started.
              </p>
            </div>
          )}
        </div>
      </PropertySection>

      {/* ================================================================
          STYLING — Font, colors, background, sizes
          ================================================================ */}
      <PropertySection title="Typography" defaultOpen>
        {/* Font Family */}
        <FontFamilyControl
          label="Font"
          value={(element.styles?.fontFamily as string) ?? 'Inter'}
          onChange={(val) => handleStyleChange('fontFamily', val)}
        />

        {/* Question Font Size */}
        <SliderInputControl
          label="Question Size"
          value={parseInt(String((element.styles?.fontSize as string) ?? '18'), 10)}
          onChange={(val) => handleStyleChange('fontSize', `${val}px`)}
          min={10}
          max={48}
          step={1}
        />

        {/* Answer Font Size */}
        <SliderInputControl
          label="Answer Size"
          value={parseInt(String(((element.styles as Record<string, unknown>)?.__answerFontSize as string) ?? '16'), 10)}
          onChange={(val) => handleStyleChange('__answerFontSize' as keyof React.CSSProperties, `${val}px`)}
          min={10}
          max={36}
          step={1}
        />
      </PropertySection>

      {/* ================================================================
          COLORS — Question, answer, divider, backgrounds
          ================================================================ */}
      <PropertySection title="Colors" defaultOpen>
        {/* Question Color */}
        <ColorPickerControl
          label="Question"
          value={(element.styles?.color as string) ?? '#111111'}
          onChange={(val) => handleStyleChange('color', val)}
        />

        {/* Answer Color */}
        <ColorPickerControl
          label="Answer"
          value={((element.styles as Record<string, unknown>)?.__answerColor as string) ?? '#6b7280'}
          onChange={(val) => handleStyleChange('__answerColor' as keyof React.CSSProperties, val)}
        />

        {/* Divider Color */}
        <ColorPickerControl
          label="Divider"
          value={(element.styles?.borderColor as string) ?? '#e5e7eb'}
          onChange={(val) => handleStyleChange('borderColor', val)}
        />

        {/* Item Background — applies to each individual accordion item */}
        <ColorPickerControl
          label="Item Background"
          value={((element.styles as Record<string, unknown>)?.__itemBackgroundColor as string) ?? 'transparent'}
          onChange={(val) => handleStyleChange('__itemBackgroundColor' as keyof React.CSSProperties, val)}
        />

        {/* Container Background — the outer wrapper behind all items */}
        <ColorPickerControl
          label="Container BG"
          value={(element.styles?.backgroundColor as string) ?? 'transparent'}
          onChange={(val) => handleStyleChange('backgroundColor', val)}
        />
      </PropertySection>

      {/* ================================================================
          SPACING — Gap, padding, margin
          ================================================================ */}
      <PropertySection title="Spacing" defaultOpen>
        {/* Gap — vertical space between accordion items */}
        <SliderInputControl
          label="Item Gap"
          value={Number((element.styles?.gap as number) ?? 0)}
          onChange={(val) => handleStyleChange('gap', val)}
          min={0}
          max={48}
          step={2}
        />

        {/* Padding — inner spacing of the FAQ container */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Padding</label>
          <input
            type="text"
            value={(element.styles?.padding as string) ?? '0'}
            onChange={(e) => handleStyleChange('padding', e.target.value)}
            placeholder="e.g. 16px or 16px 24px"
            className="w-full h-7 px-2 text-xs border border-border rounded-md bg-background"
          />
        </div>

        {/* Margin — outer spacing around the FAQ container */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Margin</label>
          <input
            type="text"
            value={(element.styles?.margin as string) ?? '0'}
            onChange={(e) => handleStyleChange('margin', e.target.value)}
            placeholder="e.g. 16px or 0 auto"
            className="w-full h-7 px-2 text-xs border border-border rounded-md bg-background"
          />
        </div>
      </PropertySection>

      {/* ================================================================
          BEHAVIOR SECTION — Accordion behavior controls
          ================================================================ */}
      <PropertySection title="Behavior" defaultOpen>
        {/* Allow Multiple Open toggle */}
        <ToggleControl
          label="Allow Multiple Open"
          checked={element.allowMultipleOpen ?? false}
          onChange={(value) =>
            dispatch(
              updateElement({
                id: element.id,
                updates: { allowMultipleOpen: value },
              })
            )
          }
        />

        {/* Separator Style dropdown */}
        <DropdownControl
          label="Separator"
          value={element.separatorStyle ?? 'line'}
          options={[
            { value: 'line', label: 'Line' },
            { value: 'card', label: 'Card' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(value) =>
            dispatch(
              updateElement({
                id: element.id,
                updates: { separatorStyle: value as 'line' | 'card' | 'none' },
              })
            )
          }
        />

        {/* Icon Style dropdown */}
        <DropdownControl
          label="Icon"
          value={element.iconStyle ?? 'chevron'}
          options={[
            { value: 'chevron', label: 'Chevron' },
            { value: 'plus', label: 'Plus / Minus' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(value) =>
            dispatch(
              updateElement({
                id: element.id,
                updates: { iconStyle: value as 'chevron' | 'plus' | 'none' },
              })
            )
          }
        />
      </PropertySection>
    </>
  )
}
