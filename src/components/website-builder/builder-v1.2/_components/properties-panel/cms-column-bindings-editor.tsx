/**
 * ============================================================================
 * CMS COLUMN BINDINGS EDITOR - Bind exposed props to CMS columns on dynamic pages
 * ============================================================================
 *
 * This component renders in the Settings tab for component instances when the
 * current page is a dynamic page (has a cmsTableId). It allows users to bind
 * the component's exposed properties to CMS columns so the values are
 * dynamically injected at render time.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * This is complementary to ExposedPropsEditor:
 *
 * - ExposedPropsEditor: Edit STATIC values for exposed props (propValues)
 * - CmsColumnBindingsEditor: Bind exposed props to DYNAMIC CMS data (cmsColumnBindings)
 *
 * When both are set, CMS bindings take precedence over static values at render time.
 * This allows users to set fallback values in propValues while binding to CMS data.
 *
 * ============================================================================
 * WORKFLOW
 * ============================================================================
 *
 * 1. User creates a dynamic page (page with cmsTableId)
 * 2. User drops a component instance on the page
 * 3. In Settings tab, this editor appears showing exposed props
 * 4. User selects which CMS column each prop should pull data from
 * 5. At render time, ComponentInstanceRenderer resolves bindings from CMS row context
 *
 * ============================================================================
 * DATA FLOW (SOURCE OF TRUTH)
 * ============================================================================
 *
 * PAGE: selectActivePage -> page.cmsTableId (determines which CMS table)
 * COLUMNS: trpc.cms.listColumns.useQuery -> available columns
 * EXPOSED PROPS: component.exposedProps -> properties that can be bound
 * BINDINGS: instanceElement.cmsColumnBindings -> current prop-to-column mappings
 * DISPATCH: updateComponentInstanceCmsBindings -> saves new bindings to Redux
 *
 * ============================================================================
 */

'use client'

import { useMemo, useCallback } from 'react'
import { Database, ChevronDown, Check, Link2, X } from 'lucide-react'
import type { ComponentInstanceElement, LocalComponent } from '../../_lib/types'
import {
  useAppDispatch,
  useAppSelector,
  selectActivePage,
  updateComponentInstanceCmsBindings,
  useBuilderContext,
} from '../../_lib'
import { PropertySection } from './controls'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// TYPES
// ============================================================================

interface CmsColumnBindingsEditorProps {
  /**
   * The component instance element being configured.
   */
  instanceElement: ComponentInstanceElement

  /**
   * The component definition (LocalComponent) containing exposed props.
   */
  component: LocalComponent
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Editor for binding component instance exposed props to CMS columns.
 *
 * Only renders when:
 * 1. The current page has cmsTableId (is a dynamic page)
 * 2. The component has exposed properties to bind
 *
 * Provides dropdown selectors for each exposed prop to select a CMS column.
 */
export function CmsColumnBindingsEditor({
  instanceElement,
  component,
}: CmsColumnBindingsEditorProps) {
  const dispatch = useAppDispatch()
  const { organizationId } = useBuilderContext()

  // Get the active page to check if it's a dynamic page (has cmsTableId)
  // cmsTableId is stored in page.info, not directly on PageState
  const activePage = useAppSelector(selectActivePage)
  const cmsTableId = activePage?.info?.cmsTableId

  // Fetch CMS columns for the page's connected table
  const { data: cmsColumns, isLoading: isLoadingColumns } = trpc.cms.listColumns.useQuery(
    { organizationId, tableId: cmsTableId ?? '' },
    { enabled: !!organizationId && Boolean(cmsTableId) }
  )

  // Get the exposed props from the component
  const exposedProps = component.exposedProps ?? []

  // Current bindings from the instance element
  const currentBindings = instanceElement.cmsColumnBindings ?? {}

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Handle binding change for a specific exposed prop.
   * Updates the cmsColumnBindings on the instance element.
   *
   * @param propId - The ID of the exposed prop being bound
   * @param columnSlug - The CMS column slug to bind to (empty string to unbind)
   */
  const handleBindingChange = useCallback(
    (propId: string, columnSlug: string) => {
      // Build new bindings map
      const newBindings: Record<string, string> = { ...currentBindings }

      if (columnSlug) {
        // Add or update the binding
        newBindings[propId] = columnSlug
      } else {
        // Remove the binding if empty
        delete newBindings[propId]
      }

      // Dispatch the update action
      dispatch(
        updateComponentInstanceCmsBindings({
          instanceId: instanceElement.id,
          bindings: newBindings,
        })
      )
    },
    [dispatch, instanceElement.id, currentBindings]
  )

  /**
   * Clear all bindings for this instance.
   */
  const handleClearAll = useCallback(() => {
    dispatch(
      updateComponentInstanceCmsBindings({
        instanceId: instanceElement.id,
        bindings: {},
      })
    )
  }, [dispatch, instanceElement.id])

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  // Count how many props are currently bound
  const boundCount = useMemo(() => {
    return Object.keys(currentBindings).length
  }, [currentBindings])

  /**
   * Get column options for binding dropdowns — filters out internal columns.
   * Columns marked with options.internal (e.g., stripe_price_id, inventory flags)
   * are hidden. New user-facing columns auto-appear since they won't have this flag.
   */
  const columnOptions = useMemo(() => {
    return (cmsColumns ?? [])
      .filter((col) => {
        const opts = col.options as Record<string, unknown> | null
        return !opts?.internal
      })
      .map((col) => ({
        value: col.slug,
        label: col.name,
      }))
  }, [cmsColumns])

  // ============================================================================
  // RENDER CONDITIONS
  // ============================================================================

  // Don't render if the page is not a dynamic page (no cmsTableId)
  if (!cmsTableId) {
    return null
  }

  // Don't render if the component has no exposed props to bind
  if (exposedProps.length === 0) {
    return null
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <PropertySection
      title={`CMS Data Bindings (${boundCount}/${exposedProps.length})`}
      defaultOpen={boundCount > 0}
    >
      <div className="px-2 space-y-3">
        {/* Info banner explaining the feature */}
        <div className="px-2 py-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
          <div className="flex items-start gap-2">
            <Database className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
            <p className="text-xs text-cyan-300/80 leading-relaxed">
              This page displays dynamic CMS data. Bind component properties to CMS columns
              to show row-specific content.
            </p>
          </div>
        </div>

        {/* Column loading state */}
        {isLoadingColumns && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">Loading columns...</p>
          </div>
        )}

        {/* No columns available */}
        {!isLoadingColumns && columnOptions.length === 0 && (
          <div className="px-2 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-500">
              No columns found in the connected CMS table.
            </p>
          </div>
        )}

        {/* Binding rows for each exposed prop */}
        {!isLoadingColumns && columnOptions.length > 0 && (
          <div className="flex flex-col gap-2">
            {exposedProps.map((prop) => {
              const currentBinding = currentBindings[prop.id]
              const isBound = Boolean(currentBinding)

              return (
                <div key={prop.id} className="flex items-center gap-2">
                  {/* Property name label */}
                  <span
                    className={cn(
                      'text-xs w-28 truncate shrink-0',
                      isBound ? 'text-cyan-400' : 'text-muted-foreground'
                    )}
                    title={prop.name}
                  >
                    {prop.name}
                  </span>

                  {/* Binding indicator */}
                  <Link2
                    className={cn(
                      'w-3.5 h-3.5 shrink-0',
                      isBound ? 'text-cyan-500' : 'text-muted-foreground/30'
                    )}
                  />

                  {/* Column selector dropdown */}
                  <div className="flex-1 relative">
                    <select
                      value={currentBinding ?? ''}
                      onChange={(e) => handleBindingChange(prop.id, e.target.value)}
                      className={cn(
                        'w-full h-8 px-2 pr-7 rounded text-xs',
                        'bg-muted/50 border border-border',
                        'appearance-none cursor-pointer',
                        'focus:outline-none focus:ring-2 focus:ring-cyan-500/20',
                        isBound ? 'text-cyan-400 border-cyan-500/30' : 'text-muted-foreground'
                      )}
                    >
                      <option value="">Not bound</option>
                      {columnOptions.map((col) => (
                        <option key={col.value} value={col.value}>
                          {col.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>

                  {/* Bound indicator */}
                  {isBound && (
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer with status and clear button */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            {boundCount} of {exposedProps.length} properties bound
          </p>

          {boundCount > 0 && (
            <button
              onClick={handleClearAll}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-muted/50 transition-colors'
              )}
            >
              <X className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>

        {/* Help text */}
        <p className="text-xs text-muted-foreground/60">
          Bindings take precedence over static values. Use static values as fallbacks.
        </p>
      </div>
    </PropertySection>
  )
}
