/**
 * ============================================================================
 * SMARTCMS LIST SETTINGS SECTION - CMS Configuration Panel
 * ============================================================================
 *
 * This component provides the settings UI for configuring a SmartCMS List element.
 * It allows users to:
 *
 * 1. SELECT A CMS TABLE - Connect the list to a data source
 * 2. SET THE SOURCE COMPONENT - Define which component to repeat for each row
 * 3. MAP PROPERTIES - Connect component props to CMS columns
 * 4. CONFIGURE PAGINATION - Set items per page
 *
 * ============================================================================
 * SLOT SYSTEM
 * ============================================================================
 *
 * The SmartCMS List uses a "slot" pattern:
 * - Users drop a component instance into the slot
 * - This instance becomes the template for list items
 * - Only component instances are allowed (they have exposed properties)
 * - The component's exposed props can be mapped to CMS columns
 *
 * ============================================================================
 * WORKFLOW
 * ============================================================================
 *
 * 1. User drags CMS List element to canvas
 * 2. User opens Settings panel
 * 3. User selects a CMS table from dropdown
 * 4. User drops a component instance into the slot (on canvas)
 * 5. Settings panel shows property mapping UI
 * 6. User maps each exposed prop to a CMS column
 * 7. Preview updates to show repeated items
 *
 * ============================================================================
 */

'use client'

import { useMemo } from 'react'
import { Database, Layers, ChevronDown, AlertCircle, Check, Info, FileText, Link2, ExternalLink } from 'lucide-react'
import type { SmartCmsListElement } from '../../_lib/types'
import {
  useAppDispatch,
  useAppSelector,
  selectLocalComponents,
  updateElement,
  useBuilderContext,
} from '../../_lib'
import { selectPageInfos } from '../../_lib/canvas-slice'
import { PropertySection } from './controls'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

// Import CMS hooks/data (using tRPC react provider)
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// TYPES
// ============================================================================

interface SmartCmsListSettingsSectionProps {
  element: SmartCmsListElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Settings section for SmartCMS List elements.
 *
 * Provides UI for:
 * - CMS table selection
 * - Source component configuration (read-only, shows current slot state)
 * - Property-to-column mapping
 * - Pagination settings
 */
export function SmartCmsListSettingsSection({
  element,
}: SmartCmsListSettingsSectionProps) {
  const dispatch = useAppDispatch()
  const localComponents = useAppSelector(selectLocalComponents)
  const { organizationId } = useBuilderContext()

  // Fetch CMS tables using tRPC (paginated response with { tables, nextCursor })
  const { data: cmsTablesData, isLoading: isLoadingTables } = trpc.cms.listTables.useQuery(
    { organizationId, limit: 100 },
    { enabled: !!organizationId }
  )

  // Extract tables array from paginated response
  const cmsTables = cmsTablesData?.tables ?? []

  // Fetch columns for selected table
  const { data: cmsColumns, isLoading: isLoadingColumns } = trpc.cms.listColumns.useQuery(
    { organizationId, tableId: element.cmsTableId ?? '' },
    { enabled: !!organizationId && Boolean(element.cmsTableId) }
  )

  // Get the source component if set
  const sourceComponent = element.sourceComponentId
    ? localComponents[element.sourceComponentId]
    : null

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Handle CMS table selection.
   * When a table is selected, clear any existing property bindings
   * since the columns may be different.
   */
  const handleTableChange = (tableId: string) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          cmsTableId: tableId || undefined,
          // Clear bindings when table changes
          propBindings: {},
        },
      })
    )
  }

  /**
   * Handle property binding change.
   * Maps a component's exposed property to a CMS column.
   */
  const handleBindingChange = (propId: string, columnSlug: string) => {
    const currentBindings = element.propBindings ?? {}

    // Build new bindings, filtering out empty values
    const newBindings: Record<string, string> = {}
    Object.entries(currentBindings).forEach(([key, value]) => {
      if (value && key !== propId) {
        newBindings[key] = value
      }
    })

    // Add the new binding if it has a value
    if (columnSlug) {
      newBindings[propId] = columnSlug
    }

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          propBindings: newBindings,
        },
      })
    )
  }

  /**
   * Handle page size change.
   * Accepts number | string to match InputGroupControl onChange signature.
   */
  const handlePageSizeChange = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseInt(value, 10) : value
    if (isNaN(numValue)) return

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          pageSize: Math.max(1, Math.min(100, numValue)),
        },
      })
    )
  }

  /**
   * Handle infinite scroll toggle.
   */
  const handleInfiniteScrollChange = (enabled: boolean) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          infiniteScroll: enabled,
        },
      })
    )
  }

  /**
   * Handle range start change.
   * Empty/0 values clear the range start (no lower limit).
   */
  const handleRangeStartChange = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseInt(value, 10) : value

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          // Use undefined for empty/0 values (no limit)
          rangeStart: isNaN(numValue) || numValue <= 0 ? undefined : numValue,
        },
      })
    )
  }

  /**
   * Handle range end change.
   * Empty/0 values clear the range end (no upper limit).
   */
  const handleRangeEndChange = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseInt(value, 10) : value

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          // Use undefined for empty/0 values (no limit)
          rangeEnd: isNaN(numValue) || numValue <= 0 ? undefined : numValue,
        },
      })
    )
  }

  // ============================================================================
  // HANDLERS (continued)
  // ============================================================================

  /**
   * Handle source component selection.
   * When a component is selected from the dropdown, update the sourceComponentId.
   * This replaces the old drag-drop slot approach with a simpler dropdown selector.
   */
  const handleComponentChange = (componentId: string) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: {
          sourceComponentId: componentId || undefined,
          // Clear bindings when component changes since exposed props may differ
          propBindings: {},
        },
      })
    )
  }

  // ============================================================================
  // CLICK ACTION HANDLERS
  // ============================================================================

  /**
   * Strip leading slash from page slugs for URL construction.
   * PageInfo slugs are stored as "/blog" in Redux, but dynamic link URLs
   * prepend their own "/" so we need the raw slug (e.g., "blog").
   */
  const normalizeSlug = (slug: string) =>
    slug.startsWith('/') ? slug.slice(1) : slug

  /** All pages in the website (for page selector dropdown) */
  const pageInfos = useAppSelector(selectPageInfos)

  /** Only pages connected to a CMS table qualify as dynamic pages */
  const dynamicPages = useMemo(
    () => pageInfos.filter((p) => p.cmsTableId),
    [pageInfos]
  )
  const hasDynamicPages = dynamicPages.length > 0

  /** Whether the current link mode is "page link" (vs custom URL) */
  const isPageLink = !!element.targetPageId

  /**
   * Toggle the click action on/off.
   * When enabling, auto-select the first dynamic page if available.
   */
  const handleToggleLinkAction = (enabled: boolean) => {
    if (enabled && hasDynamicPages) {
      const firstPage = dynamicPages[0]
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            linkToDynamicPage: true,
            targetPageId: firstPage.id,
            targetPageSlug: normalizeSlug(firstPage.slug),
            /** Cache the target page's slug column so preview/published mode can use it */
            targetPageSlugColumn: firstPage.cmsSlugColumnSlug ?? undefined,
          },
        })
      )
    } else {
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            linkToDynamicPage: enabled,
            // Clear page link data when disabling
            ...(!enabled && { targetPageId: undefined, targetPageSlug: undefined, targetPageSlugColumn: undefined, openInNewTab: undefined }),
          },
        })
      )
    }
  }

  /**
   * Switch between page link mode and custom URL mode.
   * Follows the same pattern as navbar link mode toggle.
   */
  const handleLinkModeToggle = () => {
    if (isPageLink) {
      // Switch to custom URL mode — clear pageId and slug column, keep slug as starting URL
      dispatch(
        updateElement({
          id: element.id,
          updates: { targetPageId: undefined, targetPageSlugColumn: undefined },
        })
      )
    } else {
      // Switch to page link mode — select first dynamic page
      if (hasDynamicPages) {
        const firstPage = dynamicPages[0]
        dispatch(
          updateElement({
            id: element.id,
            updates: {
              targetPageId: firstPage.id,
              targetPageSlug: normalizeSlug(firstPage.slug),
              targetPageSlugColumn: firstPage.cmsSlugColumnSlug ?? undefined,
            },
          })
        )
      }
    }
  }

  /** Handle dynamic page selection from dropdown */
  const handleTargetPageChange = (pageId: string) => {
    const page = dynamicPages.find((p) => p.id === pageId)
    if (page) {
      dispatch(
        updateElement({
          id: element.id,
          updates: {
            targetPageId: page.id,
            targetPageSlug: normalizeSlug(page.slug),
            /** Cache the target page's slug column for URL construction in preview */
            targetPageSlugColumn: page.cmsSlugColumnSlug ?? undefined,
          },
        })
      )
    }
  }

  /** Handle custom URL input */
  const handleCustomUrlChange = (url: string) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { targetPageSlug: url },
      })
    )
  }

  /** Toggle open in new tab */
  const handleOpenInNewTabToggle = (enabled: boolean) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { openInNewTab: enabled },
      })
    )
  }

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  // Determine configuration state - now uses sourceComponentId instead of sourceInstanceId
  const hasSource = Boolean(element.sourceComponentId)
  const hasTable = Boolean(element.cmsTableId)
  const isConfigured = hasSource && hasTable

  // Get exposed props from source component
  const exposedProps = sourceComponent?.exposedProps ?? []

  // Get selected table info
  const selectedTable = cmsTables.find((t) => t.id === element.cmsTableId)

  // Convert local components object to array for dropdown
  const localComponentsList = useMemo(() => {
    return Object.values(localComponents).filter(
      // Only show components that have exposed props (can be bound to CMS data)
      (comp) => comp.exposedProps && comp.exposedProps.length > 0
    )
  }, [localComponents])

  // Get all components (including ones without exposed props) for informational display
  const allLocalComponents = useMemo(() => {
    return Object.values(localComponents)
  }, [localComponents])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex flex-col gap-4 py-3">
      {/* ================================================================
          CMS TABLE SELECTION
          ================================================================ */}
      <PropertySection title="CMS Data Source" defaultOpen>
        <div className="flex flex-col gap-3">
          {/* Table selector dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">CMS Table</label>
            <div className="relative">
              <select
                value={element.cmsTableId ?? ''}
                onChange={(e) => handleTableChange(e.target.value)}
                disabled={isLoadingTables}
                className={cn(
                  'w-full h-9 px-3 pr-8 rounded-md text-sm',
                  'bg-muted/50 border border-border',
                  'appearance-none cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <option value="">Select a table...</option>
                {cmsTables?.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Table info */}
          {selectedTable && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border border-border/50">
              <Database className="w-4 h-4 text-cyan-500" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{selectedTable.name}</p>
                {selectedTable.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedTable.description}
                  </p>
                )}
              </div>
              <Check className="w-4 h-4 text-green-500 shrink-0" />
            </div>
          )}

          {/* No tables warning */}
          {!isLoadingTables && cmsTables.length === 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-500">
                No CMS tables found. Create a table in the CMS panel first.
              </p>
            </div>
          )}
        </div>
      </PropertySection>

      {/* ================================================================
          SOURCE COMPONENT SELECTOR
          Users select a reusable component from a dropdown to use as
          the item template. Only components with exposed props are shown.
          ================================================================ */}
      <PropertySection title="Item Template" defaultOpen>
        <div className="flex flex-col gap-3">
          {/* Component selector dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Source Component</label>
            <div className="relative">
              <select
                value={element.sourceComponentId ?? ''}
                onChange={(e) => handleComponentChange(e.target.value)}
                className={cn(
                  'w-full h-9 px-3 pr-8 rounded-md text-sm',
                  'bg-muted/50 border border-border',
                  'appearance-none cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20'
                )}
              >
                <option value="">Select a component...</option>
                {localComponentsList.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.name} ({component.exposedProps?.length || 0} props)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Selected component info */}
          {hasSource && sourceComponent && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border border-border/50">
              <Layers className="w-4 h-4 text-purple-500" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{sourceComponent.name}</p>
                <p className="text-xs text-muted-foreground">
                  {exposedProps.length} exposed prop{exposedProps.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Check className="w-4 h-4 text-green-500 shrink-0" />
            </div>
          )}

          {/* No components available warning */}
          {localComponentsList.length === 0 && allLocalComponents.length === 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-500">
                No reusable components found. Create a component first by selecting elements and clicking &quot;Create Component&quot;.
              </p>
            </div>
          )}

          {/* Components exist but none have exposed props */}
          {localComponentsList.length === 0 && allLocalComponents.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-500">
                Your components don&apos;t have any exposed properties. Edit a component and expose properties to bind them to CMS data.
              </p>
            </div>
          )}

          {/* Selected component has no exposed props warning */}
          {hasSource && sourceComponent && exposedProps.length === 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-500">
                This component has no exposed properties. Edit the component to expose properties that can be bound to CMS data.
              </p>
            </div>
          )}

          {/* Help text */}
          {!hasSource && localComponentsList.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Select a reusable component to use as the template for each CMS item.
              Only components with exposed properties are shown.
            </p>
          )}
        </div>
      </PropertySection>

      {/* ================================================================
          PROPERTY BINDINGS - Map exposed props to CMS columns
          ================================================================ */}
      {hasSource && hasTable && exposedProps.length > 0 && (
        <PropertySection title="Data Bindings" defaultOpen>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground mb-2">
              Map component properties to CMS columns:
            </p>

            {exposedProps.map((prop) => {
              const currentBinding = element.propBindings?.[prop.id]
              return (
                <div key={prop.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-24 truncate shrink-0">
                    {prop.name}
                  </span>
                  <div className="flex-1 relative">
                    <select
                      value={currentBinding ?? ''}
                      onChange={(e) => handleBindingChange(prop.id, e.target.value)}
                      disabled={isLoadingColumns}
                      className={cn(
                        'w-full h-8 px-2 pr-7 rounded text-xs',
                        'bg-muted/50 border border-border',
                        'appearance-none cursor-pointer',
                        'focus:outline-none focus:ring-2 focus:ring-primary/20',
                        currentBinding ? 'text-green-500' : 'text-muted-foreground'
                      )}
                    >
                      <option value="">Not bound</option>
                      {/**
                       * Filter out internal columns (e.g., stripe_price_id, inventory flags).
                       * Columns marked with options.internal in createStoreTable() are hidden.
                       * New user-facing columns auto-appear since they won't have this flag.
                       */}
                      {(cmsColumns ?? [])
                        .filter((col) => {
                          const opts = col.options as Record<string, unknown> | null
                          return !opts?.internal
                        })
                        .map((column) => (
                        <option key={column.id} value={column.slug}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              )
            })}

            {/* Binding status */}
            {(() => {
              const boundCount = Object.keys(element.propBindings ?? {}).length
              const totalCount = exposedProps.length
              return (
                <p className="text-xs text-muted-foreground mt-2">
                  {boundCount} of {totalCount} properties bound
                </p>
              )
            })()}
          </div>
        </PropertySection>
      )}

      {/* ================================================================
          PAGINATION SETTINGS - Infinite scroll and range configuration
          ================================================================ */}
      <PropertySection title="Pagination" defaultOpen={false}>
        <div className="flex flex-col gap-4">
          {/* ============================================================
              INFINITE SCROLL TOGGLE
              ============================================================ */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-foreground">Infinite Scroll</label>
              <span className="text-xs text-muted-foreground">
                Load more items as you scroll
              </span>
            </div>
            <Switch
              checked={element.infiniteScroll ?? true}
              onCheckedChange={handleInfiniteScrollChange}
            />
          </div>

          {/* ============================================================
              ITEMS PER BATCH (page size)
              ============================================================ */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground shrink-0">Items per batch</label>
            <input
              type="number"
              value={element.pageSize}
              onChange={(e) => handlePageSizeChange(e.target.value)}
              min={1}
              max={100}
              step={1}
              className={cn(
                'flex-1 h-8 px-2 rounded text-sm text-right',
                'bg-muted/50 border border-border',
                'focus:outline-none focus:ring-2 focus:ring-primary/20'
              )}
            />
          </div>

          <p className="text-xs text-muted-foreground -mt-2">
            {(element.infiniteScroll ?? true)
              ? 'How many items load each time you scroll to the edge.'
              : 'Maximum items to display (no scroll loading).'}
          </p>

          {/* ============================================================
              RANGE CONFIGURATION
              Allows users to limit which rows can be fetched
              ============================================================ */}
          <div className="border-t border-border/50 pt-3 mt-1">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Range limits (optional)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Range Start */}
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">From row</label>
                <input
                  type="number"
                  value={element.rangeStart ?? ''}
                  onChange={(e) => handleRangeStartChange(e.target.value)}
                  placeholder="1"
                  min={1}
                  className={cn(
                    'w-full h-8 px-2 rounded text-sm text-center',
                    'bg-muted/50 border border-border',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20',
                    'placeholder:text-muted-foreground/50'
                  )}
                />
              </div>

              <span className="text-xs text-muted-foreground mt-5">to</span>

              {/* Range End */}
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">To row</label>
                <input
                  type="number"
                  value={element.rangeEnd ?? ''}
                  onChange={(e) => handleRangeEndChange(e.target.value)}
                  placeholder="∞"
                  min={1}
                  className={cn(
                    'w-full h-8 px-2 rounded text-sm text-center',
                    'bg-muted/50 border border-border',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20',
                    'placeholder:text-muted-foreground/50'
                  )}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-2">
              {element.rangeStart || element.rangeEnd ? (
                <>
                  Showing rows {element.rangeStart ?? 1} to {element.rangeEnd ?? '∞'}.
                  {(element.infiniteScroll ?? true) && element.rangeEnd && (
                    <> Pagination stops at row {element.rangeEnd}.</>
                  )}
                </>
              ) : (
                'Leave empty to fetch all available rows.'
              )}
            </p>
          </div>
        </div>
      </PropertySection>

      {/* ================================================================
          CLICK ACTION — Navigate to dynamic page or custom URL
          Only shown when the list is fully configured (has table + component)
          ================================================================ */}
      {isConfigured && (
        <PropertySection title="Click Action" defaultOpen>
          <div className="flex flex-col gap-3">
            {/* Info message when no dynamic pages exist and feature is off */}
            {!hasDynamicPages && !element.linkToDynamicPage && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-400">
                  To link items to a detail page, create a page and connect it to a CMS table to make it dynamic.
                </p>
              </div>
            )}

            {/* Toggle: Enable click action */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Enable click action</label>
              <Switch
                checked={element.linkToDynamicPage ?? false}
                onCheckedChange={handleToggleLinkAction}
              />
            </div>

            {/* Link configuration — visible when click action is enabled */}
            {element.linkToDynamicPage && (
              <div className="flex flex-col gap-3">
                {/* Mode toggle + page selector / URL input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Link destination</label>
                  <div className="flex items-center gap-1.5">
                    {/* Mode toggle: page link ↔ custom URL */}
                    <button
                      type="button"
                      onClick={handleLinkModeToggle}
                      className={cn(
                        'shrink-0 p-1.5 rounded transition-colors',
                        isPageLink
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                      title={isPageLink ? 'Linked to page (click for custom URL)' : 'Custom URL (click for page link)'}
                    >
                      {isPageLink ? (
                        <FileText className="h-3 w-3" />
                      ) : (
                        <Link2 className="h-3 w-3" />
                      )}
                    </button>

                    {/* Page selector or custom URL input */}
                    {isPageLink ? (
                      <div className="relative flex-1 min-w-0">
                        <select
                          value={element.targetPageId || ''}
                          onChange={(e) => handleTargetPageChange(e.target.value)}
                          className={cn(
                            'w-full h-8 px-2 pr-7 rounded text-xs',
                            'bg-background border border-border',
                            'appearance-none cursor-pointer',
                            'focus:outline-none focus:ring-1 focus:ring-primary truncate'
                          )}
                        >
                          {dynamicPages.length === 0 && (
                            <option value="">No dynamic pages available</option>
                          )}
                          {dynamicPages.map((page) => (
                            <option key={page.id} value={page.id}>
                              {page.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={element.targetPageSlug || ''}
                        onChange={(e) => handleCustomUrlChange(e.target.value)}
                        placeholder="/url or https://..."
                        className={cn(
                          'flex-1 min-w-0 px-2 py-1.5 text-xs',
                          'bg-background border border-border rounded',
                          'focus:outline-none focus:ring-1 focus:ring-primary font-mono'
                        )}
                      />
                    )}
                  </div>
                </div>

                {/* Open in new tab toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    <label className="text-xs text-muted-foreground">Open in new tab</label>
                  </div>
                  <Switch
                    checked={element.openInNewTab ?? false}
                    onCheckedChange={handleOpenInNewTabToggle}
                  />
                </div>

                {/* URL preview — shows what the link will look like */}
                {element.targetPageSlug && (
                  <div className="px-3 py-2 rounded-md bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {isPageLink
                        ? `/${element.targetPageSlug}/[${element.targetPageSlugColumn || 'row-id'}]`
                        : element.targetPageSlug}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </PropertySection>
      )}

      {/* ================================================================
          ANIMATION — Auto-scroll marquee animation settings
          ================================================================ */}
      <PropertySection title="Animation" defaultOpen={false}>
        <div className="flex flex-col gap-4">
          {/* Auto-scroll toggle */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-foreground">Auto Scroll</label>
              <span className="text-xs text-muted-foreground">
                Infinite marquee animation
              </span>
            </div>
            <Switch
              checked={element.autoScroll ?? false}
              onCheckedChange={(checked) =>
                dispatch(updateElement({
                  id: element.id,
                  updates: { autoScroll: checked },
                }))
              }
            />
          </div>

          {/* Speed and direction — only visible when auto-scroll is ON */}
          {element.autoScroll && (
            <>
              {/* Scroll speed slider */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground shrink-0">Speed</label>
                <input
                  type="number"
                  value={element.autoScrollSpeed ?? 50}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (!isNaN(val) && val >= 10 && val <= 200) {
                      dispatch(updateElement({
                        id: element.id,
                        updates: { autoScrollSpeed: val },
                      }))
                    }
                  }}
                  min={10}
                  max={200}
                  step={10}
                  className={cn(
                    'flex-1 h-8 px-2 rounded text-sm text-right',
                    'bg-muted/50 border border-border',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20'
                  )}
                />
                <span className="text-xs text-muted-foreground">px/s</span>
              </div>

              {/* Scroll direction selector */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground shrink-0">Direction</label>
                <select
                  value={element.autoScrollDirection ?? 'left'}
                  onChange={(e) =>
                    dispatch(updateElement({
                      id: element.id,
                      updates: { autoScrollDirection: e.target.value as 'left' | 'right' | 'up' | 'down' },
                    }))
                  }
                  className={cn(
                    'flex-1 h-8 px-2 rounded text-sm',
                    'bg-muted/50 border border-border',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20'
                  )}
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="up">Up</option>
                  <option value="down">Down</option>
                </select>
              </div>

              <p className="text-xs text-muted-foreground -mt-2">
                Items scroll infinitely with seamless looping. Pauses on hover.
              </p>
            </>
          )}
        </div>
      </PropertySection>

      {/* ================================================================
          CONFIGURATION STATUS
          Shows helpful guidance based on what's still needed
          ================================================================ */}
      {!isConfigured && (
        <div className="mx-3 px-3 py-3 rounded-md bg-muted/20 border border-border/50">
          <p className="text-xs text-muted-foreground text-center">
            {!hasTable && !hasSource
              ? 'Select a CMS table and a component template to configure this list.'
              : !hasTable
                ? 'Select a CMS table to continue.'
                : 'Select a component template above to use for each item.'}
          </p>
        </div>
      )}
    </div>
  )
}
