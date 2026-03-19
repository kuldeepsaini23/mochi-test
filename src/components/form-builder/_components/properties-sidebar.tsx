/**
 * ============================================================================
 * PROPERTIES SIDEBAR
 * ============================================================================
 *
 * Right sidebar that shows:
 * - Form-wide styles/settings when NO element is selected
 * - Element-specific properties when an element IS selected
 *
 * DESIGN PHILOSOPHY:
 * - Users edit FORM-WIDE styles (all labels, all inputs at once)
 * - Element-specific properties: label, name, placeholder, validation, options
 * - No per-element style overrides - keeps forms consistent
 *
 * UX FLOW:
 * 1. User opens builder -> sees form-wide settings
 * 2. User clicks an element -> sees element properties
 * 3. User clicks canvas background -> back to form-wide settings
 */

'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ChevronRight,
  Trash2,
  Copy,
  Plus,
  GripVertical,
  Palette,
  Settings,
} from 'lucide-react'
import { useFormBuilder } from '../_lib/form-builder-context'
import { getElementEntry, isInputElement } from '../_lib/element-registry'
import type { SelectOption, FormStyles } from '../_lib/types'
import { v4 as uuid } from 'uuid'

// ============================================================================
// DESIGN TAB TOGGLE COMPONENT
// Pill-style tab buttons matching the chat widget editor pattern
// ============================================================================

type DesignTab = 'styles' | 'settings'

interface DesignTabToggleProps {
  selected: DesignTab
  onSelect: (tab: DesignTab) => void
}

const DESIGN_TABS: { id: DesignTab; label: string; icon: React.ReactNode }[] = [
  { id: 'styles', label: 'Styles', icon: <Palette className="h-3.5 w-3.5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-3.5 w-3.5" /> },
]

/**
 * Pill-style tab toggle for form design settings.
 * Matches the design pattern used in the chat widget editor.
 */
function DesignTabToggle({ selected, onSelect }: DesignTabToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-muted/50 p-1 gap-0.5">
      {DESIGN_TABS.map((tab) => {
        const isSelected = selected === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border-t border-transparent',
              isSelected
                ? 'bg-muted border-t border-accent ring-1 ring-background text-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// PROPERTY SECTION (Collapsible group)
// ============================================================================

interface PropertySectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

/**
 * Collapsible section for grouping related properties.
 */
function PropertySection({
  title,
  defaultOpen = true,
  children,
}: PropertySectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 px-1 hover:bg-muted/50 rounded-md transition-colors">
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-90'
          )}
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 py-2 px-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ============================================================================
// PROPERTY FIELD
// ============================================================================

interface PropertyFieldProps {
  label: string
  children: React.ReactNode
  description?: string
}

/**
 * Single property field with label and optional description.
 */
function PropertyField({ label, children, description }: PropertyFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

// ============================================================================
// FORM COLOR PICKER — Uses the shared AdvancedColorPicker (same as website builder)
// ============================================================================

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { AdvancedColorPicker } from '@/components/ui/advanced-color-picker'

/**
 * Quick preset colors matching the website builder's palette.
 * Includes transparent as first option for clearing a color.
 */
const QUICK_COLORS = [
  'transparent',
  '#FFFFFF',
  '#000000',
  '#6B7280',
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
]

interface FormColorPickerProps {
  /** Label displayed next to the swatch */
  label: string
  /** Current color value (hex, rgba, or 'transparent') */
  value: string
  /** Called when color changes */
  onChange: (color: string) => void
}

/**
 * Returns a display string for the color value.
 * Handles hex, rgba, transparent, and undefined gracefully.
 */
function getColorDisplayText(color: string | undefined | null): string {
  if (!color || color === 'transparent' || color === 'rgba(0,0,0,0)' || color === '') {
    return 'None'
  }
  if (color.startsWith('#')) return color.toUpperCase()
  return color
}

/**
 * Whether the color represents a transparent/empty value.
 */
function isColorTransparent(color: string | undefined | null): boolean {
  return !color || color === 'transparent' || color === 'rgba(0,0,0,0)' || color === ''
}

/**
 * FormColorPicker Component
 *
 * Uses the same AdvancedColorPicker (canvas-based HSV picker) as the
 * website builder. Provides a consistent color picking experience
 * with saturation/brightness canvas, hue slider, opacity slider,
 * hex input, and eyedropper support.
 *
 * SOURCE OF TRUTH KEYWORDS: FormColorPicker, FormBuilderColorPicker
 */
function FormColorPicker({
  label,
  value,
  onChange,
}: FormColorPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <div className="flex items-center justify-between gap-2">
      {/* Label */}
      <span className="text-xs text-muted-foreground">{label}</span>

      {/* Swatch + Popover */}
      <div className="flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            {isColorTransparent(value) ? (
              <button
                type="button"
                className="w-7 h-7 rounded border border-border hover:border-muted-foreground transition-colors shrink-0 overflow-hidden bg-white relative"
                title="Click to edit color"
              >
                {/* Transparent indicator - white with red diagonal */}
                <div
                  className="absolute bg-destructive"
                  style={{
                    width: '141%',
                    height: '2px',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%) rotate(45deg)',
                  }}
                />
              </button>
            ) : (
              <button
                type="button"
                className="w-7 h-7 rounded border border-border hover:border-muted-foreground transition-colors shrink-0"
                style={{ backgroundColor: value }}
                title="Click to edit color"
              />
            )}
          </PopoverTrigger>

          <PopoverContent className="w-[300px] p-3" side="left" align="start">
            {/* AdvancedColorPicker — same HSV canvas picker used in the website builder */}
            <AdvancedColorPicker
              value={value || '#000000'}
              onChange={onChange}
              showOpacity
              quickColors={QUICK_COLORS}
            />
          </PopoverContent>
        </Popover>

        {/* Color value text display */}
        <span className="text-xs text-muted-foreground font-mono w-16 truncate">
          {getColorDisplayText(value)}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// SPACING CONTROL - Visual box model style control
// ============================================================================

interface SpacingControlProps {
  /** Label for the control */
  label: string
  /** Current value (e.g., "16px", "24px") */
  value: string
  /** Called when value changes */
  onChange: (value: string) => void
  /** Preset options */
  presets?: { label: string; value: string }[]
}

/**
 * Spacing control with visual presets.
 * Shows common spacing values as clickable chips.
 */
function SpacingControl({
  label,
  value,
  onChange,
  presets = [
    { label: 'XS', value: '8px' },
    { label: 'S', value: '12px' },
    { label: 'M', value: '16px' },
    { label: 'L', value: '24px' },
    { label: 'XL', value: '32px' },
  ],
}: SpacingControlProps) {
  // Extract numeric value from px string
  const numericValue = parseInt(value) || 16

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
      </div>

      {/* Preset chips */}
      <div className="flex gap-1">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className={cn(
              'flex-1 py-1.5 px-2 text-xs rounded-md transition-all border',
              value === preset.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Slider for fine-tuning */}
      <input
        type="range"
        min="0"
        max="64"
        value={numericValue}
        onChange={(e) => onChange(`${e.target.value}px`)}
        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  )
}

// ============================================================================
// BORDER RADIUS CONTROL - Visual control for rounded corners
// ============================================================================

interface BorderRadiusControlProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Border radius control with visual presets.
 */
function BorderRadiusControl({ value, onChange }: BorderRadiusControlProps) {
  const presets = [
    { label: 'None', value: '0px', preview: 'rounded-none' },
    { label: 'SM', value: '4px', preview: 'rounded-sm' },
    { label: 'MD', value: '8px', preview: 'rounded-md' },
    { label: 'LG', value: '12px', preview: 'rounded-lg' },
    { label: 'Full', value: '9999px', preview: 'rounded-full' },
  ]

  const numericValue = parseInt(value) || 8

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Border Radius</span>
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
      </div>

      {/* Visual preset buttons */}
      <div className="flex gap-1">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className={cn(
              'flex-1 py-2 flex items-center justify-center transition-all border',
              value === preset.value
                ? 'bg-primary/10 border-primary'
                : 'bg-muted/50 border-transparent hover:bg-muted'
            )}
            style={{ borderRadius: preset.value === '9999px' ? '8px' : preset.value }}
            title={preset.label}
          >
            <div
              className="w-4 h-4 bg-muted-foreground/30"
              style={{ borderRadius: preset.value }}
            />
          </button>
        ))}
      </div>

      {/* Slider for custom values */}
      <input
        type="range"
        min="0"
        max="24"
        value={numericValue > 24 ? 24 : numericValue}
        onChange={(e) => onChange(`${e.target.value}px`)}
        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  )
}

// ============================================================================
// FONT WEIGHT CONTROL - Visual control for font weights
// ============================================================================

interface FontWeightControlProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Font weight control with visual preview.
 */
function FontWeightControl({ value, onChange }: FontWeightControlProps) {
  const weights = [
    { label: 'Light', value: '300' },
    { label: 'Normal', value: '400' },
    { label: 'Medium', value: '500' },
    { label: 'Semibold', value: '600' },
    { label: 'Bold', value: '700' },
  ]

  return (
    <div className="space-y-2">
      <span className="text-xs text-muted-foreground">Font Weight</span>
      <div className="flex gap-1">
        {weights.map((weight) => (
          <button
            key={weight.value}
            type="button"
            onClick={() => onChange(weight.value)}
            className={cn(
              'flex-1 py-1.5 text-xs transition-all border rounded-md',
              value === weight.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
            )}
            style={{ fontWeight: weight.value }}
          >
            Aa
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// OPTIONS EDITOR (for select, radio, checkbox group)
// ============================================================================

interface OptionsEditorProps {
  options: SelectOption[]
  onChange: (options: SelectOption[]) => void
}

/**
 * Editor for managing options in select, radio, and checkbox elements.
 */
function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  const addOption = () => {
    const newOption: SelectOption = {
      id: uuid(),
      label: `Option ${options.length + 1}`,
      value: `option_${options.length + 1}`,
      isDefault: false,
    }
    onChange([...options, newOption])
  }

  const updateOption = (id: string, updates: Partial<SelectOption>) => {
    onChange(
      options.map((opt) => (opt.id === id ? { ...opt, ...updates } : opt))
    )
  }

  const removeOption = (id: string) => {
    onChange(options.filter((opt) => opt.id !== id))
  }

  return (
    <div className="space-y-2">
      {options.map((option) => (
        <div
          key={option.id}
          className="flex items-center gap-2 p-2 bg-muted/50 rounded-md"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
          <Input
            value={option.label}
            onChange={(e) => updateOption(option.id, { label: e.target.value })}
            placeholder="Label"
            className="h-8 text-sm"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeOption(option.id)}
            className="h-8 w-8 shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={addOption}
        className="w-full gap-2"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Option
      </Button>
    </div>
  )
}

// ============================================================================
// FORM-WIDE STYLES CONTENT
// ============================================================================

/**
 * Form-wide style settings.
 * Shown when NO element is selected.
 * Uses visual controls for better UX:
 * - FormColorPicker (AdvancedColorPicker) for all color values
 * - SpacingControl for padding/margins
 * - BorderRadiusControl for rounded corners
 * - FontWeightControl for typography weights
 */
function FormStylesContent() {
  const { state, actions } = useFormBuilder()
  const styles = state.schema.styles

  /**
   * Update form styles with history tracking.
   * Note: Action runs first, then history saves the new state.
   */
  const handleStyleUpdate = (updates: Partial<FormStyles>) => {
    actions.updateFormStyles(updates)
    actions.saveHistory('Update form styles')
  }

  return (
    <div className="space-y-4">
      {/* Canvas/Page Background */}
      <PropertySection title="Canvas">
        <FormColorPicker
          label="Background"
          value={styles.canvasColor}
          onChange={(v) => handleStyleUpdate({ canvasColor: v })}
        />
      </PropertySection>

      {/* Form Container */}
      <PropertySection title="Form">
        <FormColorPicker
          label="Background"
          value={styles.backgroundColor}
          onChange={(v) => handleStyleUpdate({ backgroundColor: v })}
        />
        <SpacingControl
          label="Padding"
          value={styles.padding}
          onChange={(v) => handleStyleUpdate({ padding: v })}
          presets={[
            { label: 'S', value: '16px' },
            { label: 'M', value: '24px' },
            { label: 'L', value: '32px' },
            { label: 'XL', value: '48px' },
          ]}
        />
        <BorderRadiusControl
          value={styles.borderRadius}
          onChange={(v) => handleStyleUpdate({ borderRadius: v })}
        />
        <PropertyField label="Max Width">
          <Select
            value={styles.maxWidth}
            onValueChange={(v) => handleStyleUpdate({ maxWidth: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="400px">Small (400px)</SelectItem>
              <SelectItem value="500px">Medium (500px)</SelectItem>
              <SelectItem value="600px">Large (600px)</SelectItem>
              <SelectItem value="720px">X-Large (720px)</SelectItem>
              <SelectItem value="100%">Full Width</SelectItem>
            </SelectContent>
          </Select>
        </PropertyField>
      </PropertySection>

      {/* Labels */}
      <PropertySection title="Labels">
        <FormColorPicker
          label="Color"
          value={styles.labelColor}
          onChange={(v) => handleStyleUpdate({ labelColor: v })}
        />
        <PropertyField label="Font Size">
          <Select
            value={styles.labelFontSize}
            onValueChange={(v) => handleStyleUpdate({ labelFontSize: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12px">Small (12px)</SelectItem>
              <SelectItem value="13px">Medium (13px)</SelectItem>
              <SelectItem value="14px">Default (14px)</SelectItem>
              <SelectItem value="16px">Large (16px)</SelectItem>
            </SelectContent>
          </Select>
        </PropertyField>
        <FontWeightControl
          value={styles.labelFontWeight}
          onChange={(v) => handleStyleUpdate({ labelFontWeight: v })}
        />
      </PropertySection>

      {/* Inputs */}
      <PropertySection title="Inputs">
        <FormColorPicker
          label="Background"
          value={styles.inputBackgroundColor}
          onChange={(v) => handleStyleUpdate({ inputBackgroundColor: v })}
        />
        <FormColorPicker
          label="Border Color"
          value={styles.inputBorderColor}
          onChange={(v) => handleStyleUpdate({ inputBorderColor: v })}
        />
        <FormColorPicker
          label="Focus Border"
          value={styles.inputFocusBorderColor}
          onChange={(v) => handleStyleUpdate({ inputFocusBorderColor: v })}
        />
        <FormColorPicker
          label="Text Color"
          value={styles.inputTextColor}
          onChange={(v) => handleStyleUpdate({ inputTextColor: v })}
        />
        <FormColorPicker
          label="Placeholder"
          value={styles.inputPlaceholderColor}
          onChange={(v) => handleStyleUpdate({ inputPlaceholderColor: v })}
        />
        <BorderRadiusControl
          value={styles.inputBorderRadius}
          onChange={(v) => handleStyleUpdate({ inputBorderRadius: v })}
        />
      </PropertySection>

      {/* Button */}
      <PropertySection title="Submit Button" defaultOpen={false}>
        <FormColorPicker
          label="Background"
          value={styles.buttonBackgroundColor}
          onChange={(v) => handleStyleUpdate({ buttonBackgroundColor: v })}
        />
        <FormColorPicker
          label="Text Color"
          value={styles.buttonTextColor}
          onChange={(v) => handleStyleUpdate({ buttonTextColor: v })}
        />
        <FormColorPicker
          label="Hover Background"
          value={styles.buttonHoverBackgroundColor}
          onChange={(v) => handleStyleUpdate({ buttonHoverBackgroundColor: v })}
        />
        <BorderRadiusControl
          value={styles.buttonBorderRadius}
          onChange={(v) => handleStyleUpdate({ buttonBorderRadius: v })}
        />
      </PropertySection>

      {/* Spacing & Typography */}
      <PropertySection title="Spacing" defaultOpen={false}>
        <SpacingControl
          label="Element Spacing"
          value={styles.elementSpacing}
          onChange={(v) => handleStyleUpdate({ elementSpacing: v })}
          presets={[
            { label: 'Tight', value: '16px' },
            { label: 'Normal', value: '20px' },
            { label: 'Relaxed', value: '24px' },
            { label: 'Loose', value: '32px' },
          ]}
        />
        <PropertyField label="Font Family">
          <Select
            value={styles.fontFamily}
            onValueChange={(v) => handleStyleUpdate({ fontFamily: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Inter, system-ui, sans-serif">Inter</SelectItem>
              <SelectItem value="system-ui, sans-serif">System UI</SelectItem>
              <SelectItem value="'SF Pro Display', system-ui, sans-serif">SF Pro</SelectItem>
              <SelectItem value="'Roboto', sans-serif">Roboto</SelectItem>
              <SelectItem value="'Open Sans', sans-serif">Open Sans</SelectItem>
              <SelectItem value="Georgia, serif">Georgia (Serif)</SelectItem>
            </SelectContent>
          </Select>
        </PropertyField>
      </PropertySection>

      {/* Error & Help Text */}
      <PropertySection title="Feedback Text" defaultOpen={false}>
        <FormColorPicker
          label="Error Color"
          value={styles.errorColor}
          onChange={(v) => handleStyleUpdate({ errorColor: v })}
        />
        <FormColorPicker
          label="Help Text"
          value={styles.helpTextColor}
          onChange={(v) => handleStyleUpdate({ helpTextColor: v })}
        />
      </PropertySection>
    </div>
  )
}

// ============================================================================
// FORM SETTINGS CONTENT
// ============================================================================

/**
 * Form behavior settings.
 * Shown when NO element is selected.
 */
function FormSettingsContent() {
  const { state, actions } = useFormBuilder()
  const settings = state.schema.settings

  /**
   * Update form settings with history tracking.
   * Note: Action runs first, then history saves the new state.
   */
  const handleSettingsUpdate = (updates: Partial<typeof settings>) => {
    actions.updateSettings(updates)
    actions.saveHistory('Update form settings')
  }

  return (
    <div className="space-y-4">
      <PropertySection title="Submission">
        <PropertyField label="Submit Button Text">
          <Input
            value={settings.submitButtonText}
            onChange={(e) =>
              handleSettingsUpdate({ submitButtonText: e.target.value })
            }
            placeholder="Submit"
            className="h-9"
          />
        </PropertyField>
        <PropertyField label="Success Message">
          <Textarea
            value={settings.successMessage}
            onChange={(e) =>
              handleSettingsUpdate({ successMessage: e.target.value })
            }
            placeholder="Thank you for your submission!"
            rows={3}
            className="text-sm resize-none"
          />
        </PropertyField>
        <PropertyField label="Redirect URL" description="Optional URL to redirect after submission">
          <Input
            value={settings.redirectUrl || ''}
            onChange={(e) =>
              handleSettingsUpdate({ redirectUrl: e.target.value || undefined })
            }
            placeholder="https://example.com/thank-you"
            className="h-9"
          />
        </PropertyField>
      </PropertySection>
    </div>
  )
}

// ============================================================================
// ELEMENT PROPERTIES CONTENT
// ============================================================================

/**
 * Content shown when an element is selected.
 * Displays only element-specific properties.
 */
function ElementPropertiesContent() {
  const { selectedElement, actions } = useFormBuilder()

  if (!selectedElement) return null

  const isInput = isInputElement(selectedElement.type)

  /**
   * Update element properties with history tracking.
   * Note: Action runs first, then history saves the new state.
   */
  const handleUpdate = (updates: Record<string, unknown>) => {
    actions.updateElement(selectedElement.id, updates)
    actions.saveHistory('Update element')
  }

  return (
    <div className="space-y-4">
      {/* Basic Properties */}
      <PropertySection title="Basic">
        <PropertyField label="Label">
          <Input
            value={selectedElement.label}
            onChange={(e) => handleUpdate({ label: e.target.value })}
            placeholder="Field label"
            className="h-9"
          />
        </PropertyField>

        {isInput && (
          <PropertyField
            label="Field Name"
            description="Used in form submission data"
          >
            <Input
              value={selectedElement.name}
              onChange={(e) => handleUpdate({ name: e.target.value })}
              placeholder="field_name"
              className="h-9 font-mono text-sm"
            />
          </PropertyField>
        )}

        {['text', 'email', 'phone', 'number', 'password', 'url', 'textarea'].includes(
          selectedElement.type
        ) && (
          <PropertyField label="Placeholder">
            <Input
              value={selectedElement.placeholder || ''}
              onChange={(e) => handleUpdate({ placeholder: e.target.value })}
              placeholder="Placeholder text"
              className="h-9"
            />
          </PropertyField>
        )}

        {isInput && (
          <PropertyField label="Help Text" description="Shown below the field">
            <Textarea
              value={selectedElement.helpText || ''}
              onChange={(e) => handleUpdate({ helpText: e.target.value })}
              placeholder="Optional help text"
              rows={2}
              className="text-sm resize-none"
            />
          </PropertyField>
        )}
      </PropertySection>

      {/* Options */}
      {['select', 'multiselect', 'radio', 'checkboxGroup'].includes(
        selectedElement.type
      ) && (
        <PropertySection title="Options">
          <OptionsEditor
            options={selectedElement.options || []}
            onChange={(options) => handleUpdate({ options })}
          />
        </PropertySection>
      )}

      {/* Element-specific settings */}
      {selectedElement.type === 'heading' && (
        <PropertySection title="Heading">
          <PropertyField label="Level">
            <Select
              value={selectedElement.props.headingLevel || 'h2'}
              onValueChange={(value) =>
                handleUpdate({
                  props: { ...selectedElement.props, headingLevel: value },
                })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="h1">Heading 1</SelectItem>
                <SelectItem value="h2">Heading 2</SelectItem>
                <SelectItem value="h3">Heading 3</SelectItem>
                <SelectItem value="h4">Heading 4</SelectItem>
                <SelectItem value="h5">Heading 5</SelectItem>
                <SelectItem value="h6">Heading 6</SelectItem>
              </SelectContent>
            </Select>
          </PropertyField>
        </PropertySection>
      )}

      {selectedElement.type === 'textarea' && (
        <PropertySection title="Textarea">
          <PropertyField label="Rows">
            <Input
              type="number"
              value={selectedElement.props.rows || 4}
              onChange={(e) =>
                handleUpdate({
                  props: { ...selectedElement.props, rows: parseInt(e.target.value) || 4 },
                })
              }
              min={2}
              max={20}
              className="h-9"
            />
          </PropertyField>
        </PropertySection>
      )}

      {selectedElement.type === 'slider' && (
        <PropertySection title="Slider">
          <div className="grid grid-cols-3 gap-2">
            <PropertyField label="Min">
              <Input
                type="number"
                value={selectedElement.props.sliderMin || 0}
                onChange={(e) =>
                  handleUpdate({
                    props: { ...selectedElement.props, sliderMin: parseInt(e.target.value) || 0 },
                  })
                }
                className="h-9"
              />
            </PropertyField>
            <PropertyField label="Max">
              <Input
                type="number"
                value={selectedElement.props.sliderMax || 100}
                onChange={(e) =>
                  handleUpdate({
                    props: { ...selectedElement.props, sliderMax: parseInt(e.target.value) || 100 },
                  })
                }
                className="h-9"
              />
            </PropertyField>
            <PropertyField label="Step">
              <Input
                type="number"
                value={selectedElement.props.sliderStep || 1}
                onChange={(e) =>
                  handleUpdate({
                    props: { ...selectedElement.props, sliderStep: parseInt(e.target.value) || 1 },
                  })
                }
                className="h-9"
              />
            </PropertyField>
          </div>
        </PropertySection>
      )}

      {selectedElement.type === 'rating' && (
        <PropertySection title="Rating">
          <PropertyField label="Max Stars">
            <Input
              type="number"
              value={selectedElement.props.maxRating || 5}
              onChange={(e) =>
                handleUpdate({
                  props: { ...selectedElement.props, maxRating: parseInt(e.target.value) || 5 },
                })
              }
              min={1}
              max={10}
              className="h-9"
            />
          </PropertyField>
        </PropertySection>
      )}

      {selectedElement.type === 'submit' && (
        <PropertySection title="Button">
          <PropertyField label="Button Text">
            <Input
              value={selectedElement.props.buttonText || 'Submit'}
              onChange={(e) =>
                handleUpdate({
                  props: { ...selectedElement.props, buttonText: e.target.value },
                })
              }
              placeholder="Submit"
              className="h-9"
            />
          </PropertyField>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Full Width</Label>
            <Switch
              checked={selectedElement.props.buttonFullWidth || false}
              onCheckedChange={(checked) =>
                handleUpdate({
                  props: { ...selectedElement.props, buttonFullWidth: checked },
                })
              }
            />
          </div>
        </PropertySection>
      )}

      {/* Validation */}
      {isInput && (
        <PropertySection title="Validation" defaultOpen={false}>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Required</Label>
            <Switch
              checked={selectedElement.required}
              onCheckedChange={(checked) => handleUpdate({ required: checked })}
            />
          </div>
        </PropertySection>
      )}

      {/* Actions */}
      <PropertySection title="Actions" defaultOpen={false}>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Duplicate first, then save history (new model: save AFTER action)
              actions.duplicateElement(selectedElement.id)
              actions.saveHistory('Duplicate element')
            }}
            className="flex-1 gap-2"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              // Delete first, then save history (new model: save AFTER action)
              actions.deleteElement(selectedElement.id)
              actions.saveHistory('Delete element')
            }}
            className="flex-1 gap-2"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </PropertySection>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Properties sidebar component.
 *
 * Shows different content based on selection state:
 * - No element selected: Form-wide styles and settings (with tabs)
 * - Element selected: Element-specific properties
 *
 * SCROLLING: Uses h-full and overflow-hidden on container,
 * with ScrollArea for the content area. This ensures proper
 * vertical scrolling when content exceeds viewport height.
 */
export function PropertiesSidebar() {
  const { selectedElement } = useFormBuilder()
  const entry = selectedElement ? getElementEntry(selectedElement.type) : null
  const [activeTab, setActiveTab] = React.useState<DesignTab>('styles')

  return (
    <div
      className={cn(
        'w-72 border-l border-border bg-background/50',
        'flex flex-col shrink-0 h-full overflow-hidden'
      )}
    >
      {/* Header - fixed at top */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        {selectedElement && entry ? (
          // Element selected - show element info
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center">
              <entry.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">{entry.label}</h2>
              <p className="text-xs text-muted-foreground">{entry.description}</p>
            </div>
          </div>
        ) : (
          // No element selected - show form design header with pill tabs
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Form Design</h2>
              <p className="text-xs text-muted-foreground">
                Customize styles and settings
              </p>
            </div>
            <DesignTabToggle selected={activeTab} onSelect={setActiveTab} />
          </div>
        )}
      </div>

      {/* Content - scrollable area */}
      {selectedElement ? (
        // Element selected - show element properties
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3">
            <ElementPropertiesContent />
          </div>
        </ScrollArea>
      ) : (
        // No element selected - show form-wide styles/settings based on active tab
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3">
            {activeTab === 'styles' && <FormStylesContent />}
            {activeTab === 'settings' && <FormSettingsContent />}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
