/**
 * ============================================================================
 * PROPERTY RENDERER - Dynamic Property Control Renderer
 * ============================================================================
 *
 * This component is the SINGLE source of truth for rendering property controls.
 * It takes a PropertySchema and renders the appropriate control type dynamically.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * The problem: We have multiple places that need to render property controls:
 * 1. Properties Panel (Design/Settings tabs)
 * 2. Exposed Props in Custom Component Fields (for instances)
 * 3. Future: CMS field mapping UI
 *
 * Without this: Each place duplicates the control rendering logic, and when we
 * add new element types with custom controls, we'd need to update multiple files.
 *
 * With this: One component that knows how to render ANY property from the registry.
 * All places use PropertyRenderer, ensuring consistent UI and behavior.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * <PropertyRenderer
 *   schema={propertySchema}
 *   value={currentValue}
 *   onChange={handleChange}
 *   element={selectedElement}
 *   // Optional: for master component expose button
 *   showExposeButton={isMasterComponent}
 *   onExpose={handleExposeProperty}
 *   isExposed={isPropertyExposed}
 * />
 * ```
 *
 * ============================================================================
 */

'use client'

import { Plus } from 'lucide-react'
import type { PropertySchema } from '../../../_lib/property-registry'
import type { CanvasElement, GradientConfig } from '../../../_lib/types'
import { InputGroupControl } from './input-group-control'
import { GradientControl } from './gradient-control'
import { ToggleControl } from './toggle-control'
import { DropdownControl } from './dropdown-control'
import { SpacingControl, parseSpacingValue, formatSpacingValue } from './index'
import { BorderRadiusControl, parseBorderRadiusValue, formatBorderRadiusValue } from './index'
import { MobileOverrideIndicator } from './mobile-override-indicator'
import { ImageSourceControl } from './image-source-control'
import { VideoSourceControl } from './video-source-control'

// ============================================================================
// TYPES
// ============================================================================

interface PropertyRendererProps {
  /**
   * The property schema from the registry.
   * Contains all metadata needed to render the control.
   */
  schema: PropertySchema

  /**
   * Current value of the property.
   */
  value: unknown

  /**
   * Called when the value changes.
   */
  onChange: (value: unknown) => void

  /**
   * The element this property belongs to (for context).
   */
  element: CanvasElement

  /**
   * Whether this property has a mobile override.
   * Shows blue indicator when true.
   */
  hasMobileOverride?: boolean

  /**
   * Called to reset the mobile override.
   */
  onResetMobileOverride?: () => void

  /**
   * Whether to show the purple expose button.
   * Only for master component elements.
   */
  showExposeButton?: boolean

  /**
   * Called when user clicks the expose button.
   */
  onExpose?: () => void

  /**
   * Whether this property is already exposed.
   * Shows solid purple instead of outline.
   */
  isExposed?: boolean

  /**
   * Whether the control is disabled.
   */
  disabled?: boolean

  /**
   * Custom label override (for exposed props with custom names).
   */
  labelOverride?: string
}

// ============================================================================
// EXPOSE BUTTON - Purple + button for master components
// ============================================================================

interface ExposeButtonProps {
  onClick: () => void
  isExposed: boolean
}

/**
 * Small purple button shown next to property labels in master components.
 * Clicking it opens a modal to expose the property as a component prop.
 */
function ExposeButton({ onClick, isExposed }: ExposeButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`
        w-4 h-4 rounded-full flex items-center justify-center
        transition-all duration-200 shrink-0
        ${isExposed
          ? 'bg-purple-500 text-white'
          : 'border border-purple-400/50 text-purple-400 hover:bg-purple-500/10 hover:border-purple-400'
        }
      `}
      title={isExposed ? 'Property is exposed' : 'Expose as component prop'}
    >
      <Plus className="w-2.5 h-2.5" />
    </button>
  )
}

// ============================================================================
// PROPERTY LABEL - Consistent label with optional expose button
// ============================================================================

interface PropertyLabelProps {
  label: string
  showExposeButton?: boolean
  onExpose?: () => void
  isExposed?: boolean
  hasMobileOverride?: boolean
  onResetMobileOverride?: () => void
}

function PropertyLabel({
  label,
  showExposeButton,
  onExpose,
  isExposed,
  hasMobileOverride,
  onResetMobileOverride,
}: PropertyLabelProps) {
  return (
    <div className="col-span-1 flex items-center gap-1.5">
      {/* Expose button - shown first for visual hierarchy */}
      {showExposeButton && onExpose && (
        <ExposeButton onClick={onExpose} isExposed={isExposed ?? false} />
      )}

      {/* Label text */}
      <p className="text-sm text-muted-foreground truncate">{label}</p>

      {/* Mobile override indicator */}
      <MobileOverrideIndicator
        hasOverride={hasMobileOverride ?? false}
        onReset={onResetMobileOverride}
      />
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PropertyRenderer({
  schema,
  value,
  onChange,
  element: _element,
  hasMobileOverride,
  onResetMobileOverride,
  showExposeButton,
  onExpose,
  isExposed,
  disabled,
  labelOverride,
}: PropertyRendererProps) {
  const label = labelOverride ?? schema.label

  // ========================================================================
  // TYPE-SPECIFIC RENDERING
  // ========================================================================

  switch (schema.type) {
    case 'string':
      return (
        <InputGroupControl
          label={label}
          value={(value as string) ?? ''}
          onChange={(v) => onChange(v)}
          type="text"
          disabled={disabled}
          hasMobileOverride={hasMobileOverride}
          onResetMobileOverride={onResetMobileOverride}
        />
      )

    case 'number':
      return (
        <InputGroupControl
          label={label}
          value={(value as number) ?? schema.defaultValue ?? 0}
          onChange={(v) => onChange(v)}
          type="number"
          disabled={disabled}
          hasMobileOverride={hasMobileOverride}
          onResetMobileOverride={onResetMobileOverride}
        />
      )

    case 'boolean':
      return (
        <ToggleControl
          label={label}
          checked={(value as boolean) ?? false}
          onChange={(v) => onChange(v)}
          hasMobileOverride={hasMobileOverride}
          onResetMobileOverride={onResetMobileOverride}
        />
      )

    case 'select':
      return (
        <DropdownControl
          label={label}
          value={(value as string) ?? ''}
          onChange={(v) => onChange(v)}
          options={(schema.options ?? []).map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))}
          hasMobileOverride={hasMobileOverride}
          onResetMobileOverride={onResetMobileOverride}
        />
      )

    case 'color':
      // ========================================================================
      // UNIFIED COLOR CONTROL - Single source of truth for all color properties
      // ========================================================================
      // Uses GradientControl which supports BOTH solid colors AND gradients.
      // This is the same component used for background colors in the main panel.
      //
      // Value format: { color: string, gradient?: GradientConfig }
      // - Backwards compatible with simple string values
      // - Stores gradient config when user enables gradient mode
      {
        const fillValue = value as { color?: string; gradient?: GradientConfig } | string | undefined
        const solidColor = typeof fillValue === 'string'
          ? fillValue
          : fillValue?.color ?? 'transparent'
        const gradient = typeof fillValue === 'object' ? fillValue?.gradient : undefined

        return (
          <GradientControl
            label={label}
            solidColor={solidColor}
            gradient={gradient}
            onSolidColorChange={(color) => {
              // Store as complex object to maintain structure
              onChange({ color, gradient })
            }}
            onGradientChange={(newGradient) => {
              onChange({ color: solidColor, gradient: newGradient })
            }}
            hasMobileOverride={hasMobileOverride}
            onResetMobileOverride={onResetMobileOverride}
          />
        )
      }

    case 'spacing':
      // Spacing control handles its own layout
      // Parse string value to SpacingValues, then format back on change
      return (
        <SpacingControl
          label={label}
          values={parseSpacingValue(value as string | number | undefined)}
          onChange={(v) => onChange(formatSpacingValue(v))}
          hasMobileOverride={hasMobileOverride}
          onResetMobileOverride={onResetMobileOverride}
        />
      )

    case 'corners':
      // Border radius control handles its own layout
      // Parse string value to BorderRadiusValues, then format back on change
      return (
        <BorderRadiusControl
          label={label}
          values={parseBorderRadiusValue(value as string | number | undefined)}
          onChange={(v) => onChange(formatBorderRadiusValue(v))}
          hasMobileOverride={hasMobileOverride}
          onResetMobileOverride={onResetMobileOverride}
        />
      )

    case 'image':
      // Image control - uses storage browser or URL input
      return (
        <ImageSourceControl
          label={label}
          value={(value as string) ?? ''}
          onChange={(v) => onChange(v)}
          hasMobileOverride={hasMobileOverride}
          onResetMobileOverride={onResetMobileOverride}
        />
      )

    case 'video':
      // Video control - uses storage browser with video filter
      return (
        <VideoSourceControl
          label={label}
          value={(value as string) ?? ''}
          onChange={(v) => onChange(v)}
          hasMobileOverride={hasMobileOverride}
          onResetMobileOverride={onResetMobileOverride}
        />
      )

    case 'group':
      // Groups are containers - render children
      // This should be handled at the section level, not here
      return null

    default:
      // Fallback to text input
      return (
        <InputGroupControl
          label={label}
          value={String(value ?? '')}
          onChange={(v) => onChange(v)}
          type="text"
          disabled={disabled}
          hasMobileOverride={hasMobileOverride}
          onResetMobileOverride={onResetMobileOverride}
        />
      )
  }
}

// ============================================================================
// HELPER - Get display value for a property (used in summaries)
// ============================================================================

export function getPropertyDisplayValue(value: unknown, schema: PropertySchema): string {
  if (value === undefined || value === null) return 'Not set'

  switch (schema.type) {
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'select':
      const option = schema.options?.find((opt) => opt.value === value)
      return option?.label ?? String(value)
    case 'color':
      return String(value) === 'transparent' ? 'Transparent' : String(value)
    default:
      const str = String(value)
      return str.length > 30 ? str.slice(0, 30) + '...' : str
  }
}
