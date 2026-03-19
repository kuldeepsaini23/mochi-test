/**
 * ============================================================================
 * ELEMENT SIDEBAR
 * ============================================================================
 *
 * Left sidebar containing draggable form elements.
 * Elements are grouped by category for easy navigation.
 *
 * FEATURES:
 * - Pill-style tab toggle (Elements / Custom Fields)
 * - Categorized element grid (standard elements)
 * - Custom dataset fields section (from organization's custom data)
 * - Draggable elements using @dnd-kit
 * - Visual feedback on drag
 * - Collapsible sections
 */

'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { ChevronRight, LayoutGrid, Database, Search, X } from 'lucide-react'
import {
  ELEMENT_CATEGORIES,
  getElementsByCategory,
  ELEMENT_REGISTRY,
  type ElementRegistryEntry,
  type ElementCategory,
} from '../_lib/element-registry'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CustomFieldsSection } from './custom-fields-section'
import { useDebounce } from '@/hooks/use-debounce'

// ============================================================================
// SIDEBAR TAB TOGGLE
// Pill-style tab buttons matching the properties sidebar pattern
// ============================================================================

type SidebarTab = 'elements' | 'custom'

interface SidebarTabToggleProps {
  selected: SidebarTab
  onSelect: (tab: SidebarTab) => void
}

/**
 * Pill-style tab toggle for switching between Elements and Custom Fields.
 * Matches the design pattern used in the properties sidebar.
 */
function SidebarTabToggle({ selected, onSelect }: SidebarTabToggleProps) {
  const tabs: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
    { id: 'elements', label: 'Elements', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
    { id: 'custom', label: 'Custom Fields', icon: <Database className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="inline-flex rounded-lg bg-muted/50 p-1 gap-0.5">
      {tabs.map((tab) => {
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
// DRAGGABLE ELEMENT ITEM
// ============================================================================

interface DraggableElementProps {
  entry: ElementRegistryEntry
}

/**
 * Individual draggable element in the sidebar.
 * Uses @dnd-kit draggable for drag functionality.
 */
function DraggableElement({ entry }: DraggableElementProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `sidebar-${entry.type}`,
      data: {
        type: 'sidebar-element',
        elementType: entry.type,
      },
    })

  const Icon = entry.icon

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'flex flex-col items-center gap-1.5 p-3 rounded-lg',
        'bg-muted/50 hover:bg-muted border border-transparent',
        'cursor-grab active:cursor-grabbing',
        'transition-all duration-150',
        'hover:border-border hover:shadow-sm',
        isDragging && 'opacity-50 shadow-lg border-primary/50'
      )}
      title={entry.description}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-md flex items-center justify-center',
          'bg-background text-muted-foreground'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-xs text-center font-medium text-muted-foreground">
        {entry.label}
      </span>
    </div>
  )
}

// ============================================================================
// ELEMENT CATEGORY SECTION
// ============================================================================

interface CategorySectionProps {
  category: ElementCategory
  label: string
  description: string
  defaultOpen?: boolean
}

/**
 * Collapsible section for a category of elements.
 */
function CategorySection({
  category,
  label,
  description,
  defaultOpen = true,
}: CategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const elements = getElementsByCategory(category)

  if (elements.length === 0) return null

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
          {label}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-3 gap-2 py-2">
          {elements.map((entry) => (
            <DraggableElement key={entry.type} entry={entry} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ElementSidebarProps {
  /** Organization ID for fetching custom dataset fields */
  organizationId: string
}

/**
 * Element sidebar component.
 * Displays all available form elements organized by category,
 * plus custom dataset fields from the organization.
 *
 * TABS:
 * - Elements: Standard form elements (text inputs, selects, etc.)
 * - Custom Fields: Organization-specific dataset fields
 *
 * SEARCH:
 * - Client-side filtering for standard elements
 * - Server-side filtering for custom fields (debounced)
 *
 * SCROLLING: Uses h-full and overflow-hidden on container,
 * with ScrollArea for the content area. This ensures proper
 * vertical scrolling when content exceeds viewport height.
 */
export function ElementSidebar({ organizationId }: ElementSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('elements')
  const [searchQuery, setSearchQuery] = useState('')

  // Debounce search query for server-side filtering (custom fields)
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  /**
   * Filter elements client-side based on search query.
   * Matches against label and description.
   */
  const filteredElementsByCategory = useMemo(() => {
    if (!searchQuery.trim()) return null // Return null to use default categories

    const query = searchQuery.toLowerCase().trim()
    const filtered = ELEMENT_REGISTRY.filter(
      (entry) =>
        entry.label.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query)
    )

    // Group filtered results by category
    const grouped = new Map<ElementCategory, ElementRegistryEntry[]>()
    filtered.forEach((entry) => {
      const existing = grouped.get(entry.category) || []
      grouped.set(entry.category, [...existing, entry])
    })

    return grouped
  }, [searchQuery])

  /** Clear search input */
  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  return (
    <div
      className={cn(
        'w-72 border-r border-border bg-background/50',
        'flex flex-col shrink-0 h-full overflow-hidden'
      )}
    >
      {/* Header with tab toggle */}
      <div className="px-4 py-3 border-b border-border shrink-0 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Form Elements</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drag elements to the canvas
          </p>
        </div>
        <SidebarTabToggle selected={activeTab} onSelect={setActiveTab} />

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder={activeTab === 'elements' ? 'Search elements...' : 'Search custom fields...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-8 text-xs border-none bg-muted"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-sm hover:bg-muted flex items-center justify-center"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Tab content - scrollable */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {activeTab === 'elements' && (
            <>
              {filteredElementsByCategory ? (
                // Show filtered results
                filteredElementsByCategory.size > 0 ? (
                  ELEMENT_CATEGORIES.map((cat) => {
                    const elements = filteredElementsByCategory.get(cat.id)
                    if (!elements || elements.length === 0) return null
                    return (
                      <FilteredCategorySection
                        key={cat.id}
                        label={cat.label}
                        elements={elements}
                      />
                    )
                  })
                ) : (
                  <div className="text-center py-8">
                    <p className="text-xs text-muted-foreground">
                      No elements match &quot;{searchQuery}&quot;
                    </p>
                  </div>
                )
              ) : (
                // Show all categories (no search)
                ELEMENT_CATEGORIES.map((cat) => (
                  <CategorySection
                    key={cat.id}
                    category={cat.id}
                    label={cat.label}
                    description={cat.description}
                    defaultOpen={cat.id === 'input' || cat.id === 'selection'}
                  />
                ))
              )}
            </>
          )}

          {activeTab === 'custom' && (
            /* Custom dataset fields - fetched from organization with search */
            <CustomFieldsSection
              organizationId={organizationId}
              searchQuery={debouncedSearchQuery}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ============================================================================
// FILTERED CATEGORY SECTION (for search results)
// ============================================================================

interface FilteredCategorySectionProps {
  label: string
  elements: ElementRegistryEntry[]
}

/**
 * Displays filtered elements in a category (always expanded).
 * Used when search is active to show matching results.
 */
function FilteredCategorySection({ label, elements }: FilteredCategorySectionProps) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
        {label}
      </span>
      <div className="grid grid-cols-3 gap-2">
        {elements.map((entry) => (
          <DraggableElement key={entry.type} entry={entry} />
        ))}
      </div>
    </div>
  )
}
