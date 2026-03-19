/**
 * ============================================================================
 * TIMER SETTINGS - Countdown timer configuration panel
 * ============================================================================
 *
 * SOURCE OF TRUTH: TimerElement settings in the Properties Panel, timer-settings
 *
 * Renders the Settings tab content for Timer elements, allowing users to
 * configure countdown mode, display segments, and expiry behavior.
 *
 * ============================================================================
 * SECTIONS
 * ============================================================================
 *
 * 1. TIMER MODE
 *    - Toggle between "Date" (target date/time) and "Duration" (fixed seconds)
 *    - Date mode: datetime-local input for target date
 *    - Duration mode: hours / minutes / seconds numeric inputs
 *
 * 2. DISPLAY
 *    - Segment visibility toggles (days, hours, minutes, seconds)
 *    - Show Labels toggle + label style (Full / Short)
 *    - Separator style (Colon / None)
 *
 * 3. ON EXPIRY
 *    - Hide Timer on expiry toggle
 *    - Element picker for hiding elements on expiry
 *    - Element picker for revealing elements on expiry
 *
 * ============================================================================
 */

'use client'

import React, { useMemo, useCallback } from 'react'
import type {
  TimerElement as TimerElementType,
  TimerSegments,
  TimerExpiryConfig,
} from '../../_lib/types'
import {
  useAppDispatch,
  useAppSelector,
  selectActivePage,
  updateElement,
} from '../../_lib'
import {
  PropertySection,
  ToggleControl,
  InputGroupControl,
  ButtonGroupControl,
} from './controls'

// ============================================================================
// TYPES
// ============================================================================

export interface TimerSettingsSectionProps {
  element: TimerElementType
}

/**
 * Represents a selectable element option in the expiry element pickers.
 * Each option corresponds to a canvas element on the active page.
 */
interface ElementOption {
  /** The element ID stored in hideElementIds / revealElementIds */
  value: string
  /** Display label: element name or fallback to type + truncated ID */
  label: string
}

// ============================================================================
// ELEMENT PICKER - Inline multi-select checkbox list
// ============================================================================

interface ElementPickerProps {
  /** Label displayed above the checkbox list */
  label: string
  /** Currently selected element IDs */
  selectedIds: string[]
  /** All available element options (excluding the timer itself) */
  options: ElementOption[]
  /** Called with the updated array of selected IDs when a checkbox changes */
  onChange: (ids: string[]) => void
}

/**
 * Renders a scrollable checkbox list for selecting page elements.
 *
 * Used by the "On Expiry" section to let users pick which elements
 * to hide or reveal when the countdown reaches zero. Each row shows
 * a checkbox + element name/type label. Selected IDs are stored in
 * the timer's expiry.hideElementIds or expiry.revealElementIds arrays.
 */
function ElementPicker({
  label,
  selectedIds,
  options,
  onChange,
}: ElementPickerProps) {
  /**
   * Toggle a single element ID in/out of the selected array.
   * If already selected, remove it; otherwise, append it.
   */
  const handleToggle = useCallback(
    (id: string) => {
      const isSelected = selectedIds.includes(id)
      const updated = isSelected
        ? selectedIds.filter((sid) => sid !== id)
        : [...selectedIds, id]
      onChange(updated)
    },
    [selectedIds, onChange]
  )

  return (
    <div className="space-y-1.5">
      {/* Section label */}
      <p className="text-sm text-muted-foreground">{label}</p>

      {/* Scrollable checkbox list container */}
      <div className="max-h-[160px] overflow-y-auto rounded-md border border-border/50 bg-muted/20">
        {options.length === 0 ? (
          /* Empty state when no other elements exist on the page */
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              No other elements on this page.
            </p>
          </div>
        ) : (
          options.map((option) => {
            const isChecked = selectedIds.includes(option.value)
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                {/* Native checkbox styled to match the builder's dark UI */}
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggle(option.value)}
                  className="h-3.5 w-3.5 rounded border-border accent-primary shrink-0"
                />
                {/* Element display name */}
                <span className="text-xs text-foreground truncate">
                  {option.label}
                </span>
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders the Settings tab for Timer elements.
 *
 * Manages timer mode selection, segment visibility, label/separator
 * configuration, and expiry hide/reveal actions. Follows the same
 * Redux dispatch + updateElement pattern as other settings panels
 * (e.g., FaqSettingsSection).
 */
export function TimerSettingsSection({ element }: TimerSettingsSectionProps) {
  const dispatch = useAppDispatch()
  const activePage = useAppSelector(selectActivePage)

  // ==========================================================================
  // ELEMENT OPTIONS - All page elements except this timer, for expiry pickers
  // ==========================================================================

  /**
   * Build a flat list of selectable elements from the active page.
   * Excludes the timer itself so users can't select it in its own
   * hide/reveal lists. Falls back to type + truncated ID if unnamed.
   */
  const allElements: ElementOption[] = useMemo(() => {
    if (!activePage) return []
    return Object.values(activePage.canvas.elements)
      .filter((el) => el.id !== element.id)
      .map((el) => ({
        value: el.id,
        label: el.name || `${el.type} (${el.id.slice(-6)})`,
      }))
  }, [activePage, element.id])

  // ==========================================================================
  // CHANGE HANDLERS
  // ==========================================================================

  /**
   * Update a top-level property on the timer element.
   * Used for timerMode, targetDate, durationSeconds, showLabels,
   * labelStyle, separatorStyle, etc.
   */
  const handleChange = useCallback(
    <K extends keyof TimerElementType>(key: K, value: TimerElementType[K]) => {
      dispatch(
        updateElement({
          id: element.id,
          updates: { [key]: value },
        })
      )
    },
    [dispatch, element.id]
  )

  /**
   * Update a property inside the segments object.
   * Spreads the existing segments and overrides the specified key.
   */
  const handleSegmentChange = useCallback(
    (key: keyof TimerSegments, value: boolean) => {
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            segments: {
              ...element.segments,
              [key]: value,
            },
          },
        })
      )
    },
    [dispatch, element.id, element.segments]
  )

  /**
   * Update a property inside the expiry configuration object.
   * Spreads the existing expiry and overrides the specified key.
   */
  const handleExpiryChange = useCallback(
    <K extends keyof TimerExpiryConfig>(
      key: K,
      value: TimerExpiryConfig[K]
    ) => {
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            expiry: {
              ...element.expiry,
              [key]: value,
            },
          },
        })
      )
    },
    [dispatch, element.id, element.expiry]
  )

  // ==========================================================================
  // DURATION CONVERSION - Break durationSeconds into h/m/s fields
  // ==========================================================================

  /** Total seconds from the element, defaulting to 300 (5 minutes) */
  const totalSeconds = element.durationSeconds ?? 300

  /** Derived hours component from total seconds */
  const durationHours = Math.floor(totalSeconds / 3600)

  /** Derived minutes component (remainder after extracting hours) */
  const durationMinutes = Math.floor((totalSeconds % 3600) / 60)

  /** Derived seconds component (remainder after extracting hours and minutes) */
  const durationSecs = totalSeconds % 60

  /**
   * Recalculate total seconds from individual h/m/s values.
   * Called when any of the three duration inputs change.
   */
  const handleDurationChange = useCallback(
    (h: number, m: number, s: number) => {
      handleChange('durationSeconds', h * 3600 + m * 60 + s)
    },
    [handleChange]
  )

  // ==========================================================================
  // DATE CONVERSION - ISO string <-> datetime-local input format
  // ==========================================================================

  /**
   * Convert the stored ISO date string to the format expected by
   * <input type="datetime-local"> which requires "YYYY-MM-DDTHH:mm".
   */
  const dateTimeLocalValue = element.targetDate
    ? new Date(element.targetDate).toISOString().slice(0, 16)
    : ''

  /**
   * Convert the datetime-local input value back to a full ISO string
   * for storage in the element's targetDate property.
   */
  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleChange('targetDate', new Date(e.target.value).toISOString())
    },
    [handleChange]
  )

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <>
      {/* ================================================================
          TIMER MODE SECTION - Date vs Duration toggle + respective inputs
          ================================================================ */}
      <PropertySection title="Timer Mode" defaultOpen>
        {/* Mode toggle: switch between counting to a date or for a duration */}
        <ButtonGroupControl
          label="Mode"
          value={element.timerMode}
          options={[
            { value: 'date', label: 'Date' },
            { value: 'duration', label: 'Duration' },
          ]}
          onChange={(value) =>
            handleChange('timerMode', value as 'date' | 'duration')
          }
        />

        {/* DATE MODE: Show a datetime-local picker for the target date */}
        {element.timerMode === 'date' && (
          <div className="grid grid-cols-3 gap-2 items-center">
            <div className="col-span-1">
              <p className="text-sm text-muted-foreground">Target</p>
            </div>
            <div className="col-span-2">
              <input
                type="datetime-local"
                value={dateTimeLocalValue}
                onChange={handleDateChange}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              />
            </div>
          </div>
        )}

        {/* DURATION MODE: Three numeric inputs for hours, minutes, seconds */}
        {element.timerMode === 'duration' && (
          <>
            <InputGroupControl
              label="Hours"
              value={durationHours}
              onChange={(value) =>
                handleDurationChange(
                  Number(value),
                  durationMinutes,
                  durationSecs
                )
              }
              type="number"
              min={0}
              max={999}
              unit="h"
            />
            <InputGroupControl
              label="Minutes"
              value={durationMinutes}
              onChange={(value) =>
                handleDurationChange(
                  durationHours,
                  Number(value),
                  durationSecs
                )
              }
              type="number"
              min={0}
              max={59}
              unit="m"
            />
            <InputGroupControl
              label="Seconds"
              value={durationSecs}
              onChange={(value) =>
                handleDurationChange(
                  durationHours,
                  durationMinutes,
                  Number(value)
                )
              }
              type="number"
              min={0}
              max={59}
              unit="s"
            />
          </>
        )}
      </PropertySection>

      {/* ================================================================
          DISPLAY SECTION - Segment visibility, labels, and separator
          ================================================================ */}
      <PropertySection title="Display" defaultOpen>
        {/* Segment visibility toggles — control which time units are shown */}
        <ToggleControl
          label="Show Days"
          checked={element.segments.showDays}
          onChange={(value) => handleSegmentChange('showDays', value)}
        />
        <ToggleControl
          label="Show Hours"
          checked={element.segments.showHours}
          onChange={(value) => handleSegmentChange('showHours', value)}
        />
        <ToggleControl
          label="Show Minutes"
          checked={element.segments.showMinutes}
          onChange={(value) => handleSegmentChange('showMinutes', value)}
        />
        <ToggleControl
          label="Show Seconds"
          checked={element.segments.showSeconds}
          onChange={(value) => handleSegmentChange('showSeconds', value)}
        />

        {/* Show Labels toggle — enables text labels below each segment */}
        <ToggleControl
          label="Show Labels"
          checked={element.showLabels}
          onChange={(value) => handleChange('showLabels', value)}
        />

        {/* Label Style — only shown when labels are enabled */}
        {element.showLabels && (
          <ButtonGroupControl
            label="Label Style"
            value={element.labelStyle}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'short', label: 'Short' },
            ]}
            onChange={(value) =>
              handleChange('labelStyle', value as 'short' | 'full')
            }
          />
        )}

        {/* Separator style between segments */}
        <ButtonGroupControl
          label="Separator"
          value={element.separatorStyle}
          options={[
            { value: 'colon', label: 'Colon' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(value) =>
            handleChange('separatorStyle', value as 'colon' | 'none')
          }
        />
      </PropertySection>

      {/* ================================================================
          ON EXPIRY SECTION - What happens when the timer reaches zero
          ================================================================ */}
      <PropertySection title="On Expiry" defaultOpen>
        {/* Hide Timer toggle — hides the timer element itself on expiry */}
        <ToggleControl
          label="Hide Timer"
          checked={element.expiry.hideTimerOnExpiry}
          onChange={(value) => handleExpiryChange('hideTimerOnExpiry', value)}
        />

        {/* Element picker — select elements to HIDE when timer expires */}
        <ElementPicker
          label="Hide on Expiry"
          selectedIds={element.expiry.hideElementIds}
          options={allElements}
          onChange={(ids) => handleExpiryChange('hideElementIds', ids)}
        />

        {/* Element picker — select elements to REVEAL when timer expires */}
        <ElementPicker
          label="Reveal on Expiry"
          selectedIds={element.expiry.revealElementIds}
          options={allElements}
          onChange={(ids) => handleExpiryChange('revealElementIds', ids)}
        />
      </PropertySection>
    </>
  )
}
