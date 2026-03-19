/**
 * ============================================================================
 * STICKY NOTE SETTINGS - Color presets and text configuration
 * ============================================================================
 *
 * SOURCE OF TRUTH: StickyNoteElement settings in Properties Panel, sticky-note-settings
 *
 * Renders the Settings tab content for sticky note elements.
 * Provides quick color preset swatches and a text content editor.
 *
 * ============================================================================
 * SECTIONS
 * ============================================================================
 *
 * 1. COLOR PRESETS
 *    - Row of preset color swatches for quick one-click note color changes
 *    - Each swatch updates both noteColor and textColor for good contrast
 *
 * 2. CONTENT
 *    - Text area for editing the note content
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { PropertySection } from './controls'
import { useAppDispatch, updateElement } from '../../_lib'
import type { StickyNoteElement } from '../../_lib/types'

// ============================================================================
// PRESET COLOR OPTIONS
// ============================================================================

/**
 * Sticky note color presets — each includes a note background color
 * and a contrasting text color for readability.
 *
 * These are the most common real-world sticky note colors.
 */
const STICKY_NOTE_PRESETS = [
  { noteColor: '#fef08a', textColor: '#1a1a1a', label: 'Yellow' },
  { noteColor: '#fdba74', textColor: '#1a1a1a', label: 'Orange' },
  { noteColor: '#fca5a5', textColor: '#1a1a1a', label: 'Red' },
  { noteColor: '#f0abfc', textColor: '#1a1a1a', label: 'Pink' },
  { noteColor: '#93c5fd', textColor: '#1a1a1a', label: 'Blue' },
  { noteColor: '#86efac', textColor: '#1a1a1a', label: 'Green' },
  { noteColor: '#e2e8f0', textColor: '#1a1a1a', label: 'Gray' },
  { noteColor: '#1e293b', textColor: '#f8fafc', label: 'Dark' },
] as const

// ============================================================================
// TYPES
// ============================================================================

interface StickyNoteSettingsSectionProps {
  element: StickyNoteElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders the Settings tab for sticky note elements.
 * Shows color presets for quick styling and a content text area.
 */
export function StickyNoteSettingsSection({ element }: StickyNoteSettingsSectionProps) {
  const dispatch = useAppDispatch()

  /** The currently active note color */
  const currentNoteColor = element.noteColor ?? '#fef08a'

  /**
   * Apply a color preset — updates both noteColor and textColor
   * so the text always has good contrast against the background.
   */
  const handlePresetClick = (preset: typeof STICKY_NOTE_PRESETS[number]) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          noteColor: preset.noteColor,
          textColor: preset.textColor,
        },
      })
    )
  }

  /**
   * Update the text content of the sticky note from the textarea.
   */
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { content: e.target.value },
      })
    )
  }

  return (
    <div className="space-y-0">
      {/* ================================================================
          COLOR PRESETS - Quick note color selection
          ================================================================ */}
      <PropertySection title="Note Color" defaultOpen>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
          {STICKY_NOTE_PRESETS.map((preset) => {
            const isActive = currentNoteColor.toLowerCase() === preset.noteColor.toLowerCase()

            return (
              <button
                key={preset.noteColor}
                title={preset.label}
                onClick={() => handlePresetClick(preset)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  backgroundColor: preset.noteColor,
                  border: isActive
                    ? '2px solid hsl(var(--primary))'
                    : '1px solid rgba(0, 0, 0, 0.1)',
                  cursor: 'pointer',
                  transition: 'transform 0.1s ease, border-color 0.1s ease',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  outline: 'none',
                  padding: 0,
                  flexShrink: 0,
                }}
              />
            )
          })}
        </div>
      </PropertySection>

      {/* ================================================================
          CONTENT - Editable text area for the note body
          ================================================================ */}
      <PropertySection title="Content" defaultOpen>
        <textarea
          value={element.content ?? ''}
          onChange={handleContentChange}
          placeholder="Write your note..."
          rows={4}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: 13,
            lineHeight: 1.5,
            borderRadius: 6,
            border: '1px solid hsl(var(--border))',
            backgroundColor: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      </PropertySection>
    </div>
  )
}
