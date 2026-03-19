/**
 * ============================================================================
 * EXPOSED PROPS EDITOR - Edit exposed property values on component instances
 * ============================================================================
 *
 * This component renders the "Custom Component Fields" section in the Settings
 * tab for component instances. It allows users to:
 *
 * 1. View all exposed properties from the component definition
 * 2. Edit property values (overrides) for this specific instance
 * 3. Reset values back to component defaults
 *
 * ============================================================================
 * ARCHITECTURE - DYNAMIC PROPERTY RENDERING
 * ============================================================================
 *
 * The key insight here is that we DON'T duplicate property control designs.
 * Instead, we:
 *
 * 1. Get the PropertySchema from the registry for each exposed prop
 * 2. Use PropertyRenderer to render the EXACT same control as the Design tab
 * 3. Values come from instance.propValues (overrides) or component defaults
 *
 * This ensures:
 * - Consistent UX between editing master elements and editing instance props
 * - No code duplication for different control types
 * - Automatic support for new property types
 *
 * ============================================================================
 * DATA FLOW
 * ============================================================================
 *
 * ExposedProp (from LocalComponent)
 *   ├── propertyId → Look up PropertySchema from PROPERTY_REGISTRY
 *   ├── propertyPath → Where to read/write the value
 *   ├── defaultValue → Fallback when instance doesn't override
 *   └── elementId → Which element in sourceTree this prop targets
 *
 * Instance.propValues
 *   └── [prop.id] → Override value for this prop on this instance
 *
 * ============================================================================
 * NESTED INSTANCE SUPPORT
 * ============================================================================
 *
 * When editing a NESTED component instance (within a composed component),
 * the instance ID has a scoped format: `${parentInstanceId}::${nestedElementId}`
 *
 * For nested instances:
 * - Prop values are stored on the PARENT instance's `nestedPropValues`
 * - This allows each parent instance to have independent nested props
 * - Uses `updateNestedInstancePropValue` action which handles scoped ID parsing
 *
 * Example: Two carousel instances, each with 3 card nested instances
 * - Carousel A's cards: stored in carouselA.nestedPropValues[card1Id], etc.
 * - Carousel B's cards: stored in carouselB.nestedPropValues[card1Id], etc.
 *
 * This is what makes nested instances within composed components INDEPENDENT.
 *
 * ============================================================================
 */

'use client'

import { useCallback, useMemo, useState } from 'react'
import { RotateCcw, ChevronDown, ChevronRight, Info } from 'lucide-react'
import {
  useAppDispatch,
  updateComponentInstancePropValue,
  updateNestedInstancePropValue,
} from '../../_lib'
import {
  getPropertyById,
  getValueByPath,
  type PropertySchema,
} from '../../_lib/property-registry'
import type {
  ComponentInstanceElement,
  LocalComponent,
  ExposedProp,
  CanvasElement,
  GradientConfig,
} from '../../_lib/types'
import { PropertySection } from './controls'
import { PropertyRenderer, getPropertyDisplayValue } from './controls/property-renderer'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ============================================================================
// TYPES
// ============================================================================

interface ExposedPropsEditorProps {
  /**
   * The component instance element being edited.
   */
  instanceElement: ComponentInstanceElement

  /**
   * The component definition (LocalComponent).
   */
  component: LocalComponent
}

interface ExposedPropRowProps {
  /**
   * The exposed prop definition from the component.
   */
  exposedProp: ExposedProp

  /**
   * The property schema from the registry.
   */
  schema: PropertySchema | null

  /**
   * Current value (from instance overrides or default).
   */
  value: unknown

  /**
   * Default value from the component definition.
   */
  defaultValue: unknown

  /**
   * Whether this prop has been overridden from default.
   */
  hasOverride: boolean

  /**
   * Called when value changes.
   */
  onChange: (value: unknown) => void

  /**
   * Called to reset to default.
   */
  onReset: () => void

  /**
   * The element this prop targets (for context in rendering).
   */
  targetElement: CanvasElement | null
}

// ============================================================================
// EXPOSED PROP ROW - Single property control with reset
// ============================================================================

function ExposedPropRow({
  exposedProp,
  schema,
  value,
  defaultValue: _defaultValue, // Reserved for future fallback display
  hasOverride,
  onChange,
  onReset,
  targetElement,
}: ExposedPropRowProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // If no schema found, show a fallback text input
  if (!schema) {
    return (
      <div className="px-3 py-2 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{exposedProp.name}</span>
            {exposedProp.description && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">{exposedProp.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {hasOverride && (
            <button
              onClick={onReset}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Reset to default"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-8 px-2 rounded bg-muted border-none text-sm"
          placeholder="Enter value..."
        />
      </div>
    )
  }

  // Create a mock element for PropertyRenderer context
  // (some controls need element context for conditional logic)
  const mockElement = targetElement || ({
    id: 'mock',
    type: schema.type === 'string' ? 'text' : 'frame',
    name: exposedProp.name,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    parentId: null,
    order: 0,
    visible: true,
    locked: false,
    container: false,
    styles: {},
  } as CanvasElement)

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      {/* Header with label, info, and reset */}
      <div
        className={`
          flex items-center gap-2 px-3 py-2 cursor-pointer
          ${hasOverride ? 'bg-purple-500/5' : 'bg-muted/30'}
          hover:bg-muted/50 transition-colors
        `}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse chevron */}
        <button className="p-0.5 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Label and category */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{exposedProp.name}</span>
            {hasOverride && (
              <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium rounded bg-purple-500/20 text-purple-400 uppercase tracking-wide">
                Modified
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {schema.category} • {getPropertyDisplayValue(value, schema)}
          </p>
        </div>

        {/* Info tooltip */}
        {exposedProp.description && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1 text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="max-w-xs text-xs">{exposedProp.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Reset button */}
        {hasOverride && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onReset()
            }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Reset to default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Property control (expanded) */}
      {isExpanded && (
        <div className="px-3 py-3 border-t border-border/50 bg-background/50">
          <PropertyRenderer
            schema={schema}
            value={value}
            onChange={onChange}
            element={mockElement}
            labelOverride={exposedProp.name}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ExposedPropsEditor({
  instanceElement,
  component,
}: ExposedPropsEditorProps) {
  const dispatch = useAppDispatch()

  // Build a map of target elements from the component's sourceTree
  // This lets us get the element context for each exposed prop
  const targetElementsMap = useMemo(() => {
    const map = new Map<string, CanvasElement>()

    // Add root element
    map.set(component.sourceTree.rootElement.id, component.sourceTree.rootElement)

    // Add all child elements
    for (const child of component.sourceTree.childElements) {
      map.set(child.id, child)
    }

    return map
  }, [component.sourceTree])

  // Get property schemas for all exposed props
  // ============================================================================
  // BACKGROUND COLOR: Backward Compatibility for Gradient Support
  // ============================================================================
  // For backgroundColor properties, the defaultValue might be:
  // - Old format: just a string (e.g., "transparent", "#ffffff")
  // - New format: { color: string, gradient?: GradientConfig }
  //
  // For backward compatibility with existing exposed props, we check the
  // sourceTree element for the gradient config if the defaultValue is just
  // a string. This ensures gradient backgrounds work even for props that
  // were exposed before the gradient support was added.
  const exposedPropsWithSchemas = useMemo(() => {
    return component.exposedProps.map((prop) => {
      // Find the target element to determine its type
      const targetElement = targetElementsMap.get(prop.elementId) || null
      const elementType = targetElement?.type || 'frame'

      // Get the property schema from the registry
      // Note: getPropertyById returns undefined if not found, convert to null
      const schema = getPropertyById(elementType, prop.propertyId) ?? null

      // Get current value (from instance overrides or default)
      const hasOverride = prop.id in (instanceElement.propValues || {})
      let value = hasOverride
        ? instanceElement.propValues[prop.id]
        : prop.defaultValue

      // ========================================================================
      // BACKGROUND COLOR: Ensure gradient config is included
      // ========================================================================
      // If this is a backgroundColor property and the value is a simple string
      // (not the combined format), check the sourceTree element for the gradient.
      // This handles both:
      // 1. Existing exposed props that were created before gradient support
      // 2. Default values that need to include the gradient from sourceTree
      if (
        prop.propertyPath === 'styles.backgroundColor' &&
        schema?.type === 'color' &&
        targetElement
      ) {
        const isSimpleString = typeof value === 'string'
        const isEmptyObject = typeof value === 'object' && value !== null && !('color' in value)

        if (isSimpleString || isEmptyObject || value === undefined || value === null) {
          // Get the gradient config from the sourceTree element
          const gradient = getValueByPath(
            targetElement as unknown as Record<string, unknown>,
            'styles.__backgroundGradient'
          ) as GradientConfig | undefined

          // Create combined format for GradientControl
          value = {
            color: (isSimpleString ? value : prop.defaultValue as string) ?? 'transparent',
            gradient: gradient,
          }
        }
      }

      return {
        exposedProp: prop,
        schema,
        targetElement,
        value,
        hasOverride,
        defaultValue: prop.defaultValue,
      }
    })
  }, [component.exposedProps, instanceElement.propValues, targetElementsMap])

  // ============================================================================
  // DETECT NESTED INSTANCE (SCOPED ID)
  // ============================================================================
  // Scoped IDs have format: `${parentInstanceId}::${nestedElementId}`
  // This indicates a nested instance within a composed component.
  const scopeDelimiter = '::'
  const isNestedInstance = instanceElement.id.includes(scopeDelimiter)

  /**
   * Handle changing a prop value.
   *
   * For REGULAR instances: Updates instance.propValues directly
   * For NESTED instances: Updates parent.nestedPropValues[nestedId]
   *
   * The action automatically handles the scoped ID parsing.
   */
  const handlePropChange = useCallback(
    (propId: string, value: unknown) => {
      // Use the appropriate action based on whether this is a nested instance
      // The nested action handles scoped ID parsing internally
      if (isNestedInstance) {
        dispatch(
          updateNestedInstancePropValue({
            instanceId: instanceElement.id, // Scoped ID: parentId::nestedId
            propId,
            value,
          })
        )
      } else {
        dispatch(
          updateComponentInstancePropValue({
            instanceId: instanceElement.id,
            propId,
            value,
          })
        )
      }
    },
    [dispatch, instanceElement.id, isNestedInstance]
  )

  /**
   * Handle resetting a prop to default.
   * Removes the override from propValues.
   *
   * For REGULAR instances: Removes from instance.propValues
   * For NESTED instances: Removes from parent.nestedPropValues[nestedId]
   */
  const handlePropReset = useCallback(
    (propId: string) => {
      if (isNestedInstance) {
        dispatch(
          updateNestedInstancePropValue({
            instanceId: instanceElement.id, // Scoped ID: parentId::nestedId
            propId,
            value: undefined, // undefined = remove override
          })
        )
      } else {
        dispatch(
          updateComponentInstancePropValue({
            instanceId: instanceElement.id,
            propId,
            value: undefined, // undefined = remove override
          })
        )
      }
    },
    [dispatch, instanceElement.id, isNestedInstance]
  )

  // Group exposed props by the element they target
  const groupedProps = useMemo(() => {
    const groups: Record<string, typeof exposedPropsWithSchemas> = {}

    for (const item of exposedPropsWithSchemas) {
      const elementName = item.targetElement?.name || 'Unknown Element'
      if (!groups[elementName]) {
        groups[elementName] = []
      }
      groups[elementName].push(item)
    }

    return groups
  }, [exposedPropsWithSchemas])

  // If no exposed props, show empty state
  if (component.exposedProps.length === 0) {
    return null
  }

  return (
    <PropertySection
      title={`Custom Fields (${component.exposedProps.length})`}
      defaultOpen={true}
    >
      <div className="px-2 space-y-4">
        {/* Info banner - shows different message for nested instances */}
        <div className="px-2 py-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <p className="text-xs text-purple-300/80 leading-relaxed">
            {isNestedInstance
              ? 'Editing nested instance. Changes are independent per parent instance.'
              : 'Customize this instance by editing the exposed properties below. Changes only affect this instance.'}
          </p>
        </div>

        {/* Grouped by target element */}
        {Object.entries(groupedProps).map(([elementName, props]) => (
          <div key={elementName} className="space-y-2">
            {/* Element group header (only if multiple groups) */}
            {Object.keys(groupedProps).length > 1 && (
              <p className="text-xs font-medium text-muted-foreground px-1 uppercase tracking-wide">
                {elementName}
              </p>
            )}

            {/* Property rows */}
            <div className="space-y-2">
              {props.map((item) => (
                <ExposedPropRow
                  key={item.exposedProp.id}
                  exposedProp={item.exposedProp}
                  schema={item.schema}
                  value={item.value}
                  defaultValue={item.defaultValue}
                  hasOverride={item.hasOverride}
                  targetElement={item.targetElement}
                  onChange={(value) => handlePropChange(item.exposedProp.id, value)}
                  onReset={() => handlePropReset(item.exposedProp.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PropertySection>
  )
}
