/**
 * ============================================================================
 * EXPOSE AS PROP SECTION - UI for exposing element properties as component props
 * ============================================================================
 *
 * This component is shown in the Settings tab when:
 * 1. The user is in Component Edit Mode (editingComponentId is set)
 * 2. An element inside the component is selected
 *
 * It allows users to:
 * - See which properties of the selected element can be exposed
 * - Toggle which properties are exposed as component props
 * - Rename exposed props
 * - See which props are already exposed
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Components need customization without breaking the component structure.
 * By exposing specific properties as "props", users can:
 * - Customize text content per instance
 * - Change images per instance
 * - Adjust colors/styles per instance
 * - All while maintaining the component's layout and structure
 *
 * Future CMS integration will allow mapping CMS fields to these exposed props.
 *
 * ============================================================================
 */

'use client'

import { useState, useCallback, useMemo } from 'react'
import { Link2, Unlink2, Pencil, Check, X } from 'lucide-react'
import {
  useAppDispatch,
  useAppSelector,
  selectEditingComponent,
  addExposedProp,
  removeExposedProp,
  updateExposedProp,
} from '../../_lib'
import {
  getExposableProperties,
  getValueByPath,
  type PropertySchema,
} from '../../_lib/property-registry'
import { generatePropId } from '../../_lib/component-utils'
import type { CanvasElement, ExposedProp, GradientConfig } from '../../_lib/types'
import { PropertySection } from './controls'
import { Input } from '@/components/ui/input'

// ============================================================================
// TYPES
// ============================================================================

interface ExposeAsPropSectionProps {
  /** The currently selected element inside the component */
  selectedElement: CanvasElement
}

interface ExposablePropertyRowProps {
  property: PropertySchema
  element: CanvasElement
  existingProp: ExposedProp | undefined
  onExpose: (property: PropertySchema, name: string) => void
  onUnexpose: (propId: string) => void
  onRename: (propId: string, newName: string) => void
}

// ============================================================================
// EXPOSABLE PROPERTY ROW - Single property that can be exposed
// ============================================================================

function ExposablePropertyRow({
  property,
  element,
  existingProp,
  onExpose,
  onUnexpose,
  onRename,
}: ExposablePropertyRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')

  const isExposed = !!existingProp

  // Get current value for display
  // ========================================================================
  // SPECIAL HANDLING: backgroundColor with Gradient Support
  // ========================================================================
  // For backgroundColor properties, we display a combined value that includes
  // gradient info if present. This shows the user what they're actually exposing.
  const currentValue = useMemo(() => {
    let val = getValueByPath(
      element as unknown as Record<string, unknown>,
      property.path
    )

    // For backgroundColor, also check for gradient and show combined display
    if (property.path === 'styles.backgroundColor' && property.type === 'color') {
      const gradient = getValueByPath(
        element as unknown as Record<string, unknown>,
        'styles.__backgroundGradient'
      ) as GradientConfig | undefined

      // If there's a gradient, show "Gradient" or the type
      if (gradient) {
        return `Gradient (${gradient.type || 'linear'})`
      }
    }

    if (val === undefined || val === null) return 'Not set'
    if (typeof val === 'boolean') return val ? 'Yes' : 'No'
    if (typeof val === 'string' && val.length > 20) return val.slice(0, 20) + '...'
    return String(val)
  }, [element, property.path, property.type])

  /**
   * Handle clicking the expose/unexpose button
   */
  const handleToggle = useCallback(() => {
    if (isExposed) {
      onUnexpose(existingProp!.id)
    } else {
      // Use property label as default name
      onExpose(property, property.label)
    }
  }, [isExposed, existingProp, onExpose, onUnexpose, property])

  /**
   * Start editing the prop name
   */
  const handleStartEdit = useCallback(() => {
    if (existingProp) {
      setEditName(existingProp.name)
      setIsEditing(true)
    }
  }, [existingProp])

  /**
   * Save the new name
   */
  const handleSaveEdit = useCallback(() => {
    if (existingProp && editName.trim()) {
      onRename(existingProp.id, editName.trim())
    }
    setIsEditing(false)
  }, [existingProp, editName, onRename])

  /**
   * Cancel editing
   */
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setEditName('')
  }, [])

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
        isExposed ? 'bg-primary/5' : 'hover:bg-muted/50'
      }`}
    >
      {/* Property Info */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit()
                if (e.key === 'Escape') handleCancelEdit()
              }}
            />
            <button
              onClick={handleSaveEdit}
              className="p-1 rounded hover:bg-muted text-primary"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCancelEdit}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">
                {isExposed ? existingProp!.name : property.label}
              </span>
              {isExposed && (
                <button
                  onClick={handleStartEdit}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Rename prop"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {property.category} • {currentValue}
            </p>
          </>
        )}
      </div>

      {/* Expose/Unexpose Button */}
      {!isEditing && (
        <button
          onClick={handleToggle}
          className={`p-1.5 rounded transition-colors ${
            isExposed
              ? 'bg-primary/10 text-primary hover:bg-primary/20'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
          }`}
          title={isExposed ? 'Unexpose prop' : 'Expose as prop'}
        >
          {isExposed ? (
            <Link2 className="w-4 h-4" />
          ) : (
            <Unlink2 className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ExposeAsPropSection({ selectedElement }: ExposeAsPropSectionProps) {
  const dispatch = useAppDispatch()

  // Get the component we're editing
  const editingComponent = useAppSelector(selectEditingComponent)

  // Get exposable properties for this element type
  const exposableProperties = useMemo(() => {
    return getExposableProperties(selectedElement.type)
  }, [selectedElement.type])

  // Map of exposed props for this element (by property path)
  const exposedPropsMap = useMemo(() => {
    if (!editingComponent) return new Map<string, ExposedProp>()

    const map = new Map<string, ExposedProp>()
    for (const prop of editingComponent.exposedProps) {
      if (prop.elementId === selectedElement.id) {
        map.set(prop.propertyPath, prop)
      }
    }
    return map
  }, [editingComponent, selectedElement.id])

  /**
   * Expose a property as a component prop.
   *
   * ============================================================================
   * SPECIAL HANDLING: backgroundColor with Gradient Support
   * ============================================================================
   *
   * When exposing 'styles.backgroundColor', we need to also capture the
   * companion '__backgroundGradient' config to support gradient backgrounds.
   *
   * The value is stored as a combined format: { color: string, gradient?: GradientConfig }
   * This matches what PropertyRenderer's 'color' case expects, and is split back
   * to separate properties when applied to instances via cloneAndApplyProps.
   */
  const handleExpose = useCallback(
    (property: PropertySchema, name: string) => {
      if (!editingComponent) return

      // Get the raw value from the element
      let defaultValue = getValueByPath(
        selectedElement as unknown as Record<string, unknown>,
        property.path
      )

      // ========================================================================
      // BACKGROUND COLOR: Combine with gradient config for complete value
      // ========================================================================
      // If this is a backgroundColor property, also capture __backgroundGradient
      // to support gradient backgrounds in exposed props. The combined format
      // { color, gradient } is what GradientControl expects.
      if (property.path === 'styles.backgroundColor' && property.type === 'color') {
        const gradient = getValueByPath(
          selectedElement as unknown as Record<string, unknown>,
          'styles.__backgroundGradient'
        ) as GradientConfig | undefined

        // Create combined value format for GradientControl
        // This ensures gradient backgrounds show correctly in exposed props UI
        defaultValue = {
          color: (defaultValue as string) ?? 'transparent',
          gradient: gradient,
        }
      }

      const exposedProp: ExposedProp = {
        id: generatePropId(),
        name,
        description: property.description || '',
        elementId: selectedElement.id,
        propertyId: property.id,
        propertyPath: property.path,
        defaultValue,
      }

      dispatch(
        addExposedProp({
          componentId: editingComponent.id,
          prop: exposedProp,
        })
      )
    },
    [editingComponent, selectedElement, dispatch]
  )

  /**
   * Unexpose a property
   */
  const handleUnexpose = useCallback(
    (propId: string) => {
      if (!editingComponent) return

      dispatch(
        removeExposedProp({
          componentId: editingComponent.id,
          propId,
        })
      )
    },
    [editingComponent, dispatch]
  )

  /**
   * Rename an exposed prop
   */
  const handleRename = useCallback(
    (propId: string, newName: string) => {
      if (!editingComponent) return

      dispatch(
        updateExposedProp({
          componentId: editingComponent.id,
          propId,
          updates: { name: newName },
        })
      )
    },
    [editingComponent, dispatch]
  )

  // Don't render if not editing a component
  if (!editingComponent) return null

  // Group properties by category
  const groupedProperties = useMemo(() => {
    const groups: Record<string, PropertySchema[]> = {}
    for (const prop of exposableProperties) {
      const category = prop.category || 'Other'
      if (!groups[category]) groups[category] = []
      groups[category].push(prop)
    }
    return groups
  }, [exposableProperties])

  const exposedCount = exposedPropsMap.size
  const totalCount = exposableProperties.length

  return (
    <PropertySection
      title={`Component Props (${exposedCount}/${totalCount})`}
      defaultOpen={true}
    >
      <div className="px-1">
        {/* Info message */}
        <p className="text-xs text-muted-foreground mb-3 px-2">
          Expose properties to make them customizable per component instance.
        </p>

        {/* Properties grouped by category */}
        {Object.entries(groupedProperties).map(([category, properties]) => (
          <div key={category} className="mb-3">
            <p className="text-xs font-medium text-muted-foreground px-2 mb-1 uppercase tracking-wide">
              {category}
            </p>
            <div className="space-y-0.5">
              {properties.map((property) => (
                <ExposablePropertyRow
                  key={property.id}
                  property={property}
                  element={selectedElement}
                  existingProp={exposedPropsMap.get(property.path)}
                  onExpose={handleExpose}
                  onUnexpose={handleUnexpose}
                  onRename={handleRename}
                />
              ))}
            </div>
          </div>
        ))}

        {exposableProperties.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No exposable properties for this element type.
          </p>
        )}
      </div>
    </PropertySection>
  )
}
