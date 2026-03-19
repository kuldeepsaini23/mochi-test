'use client'

/**
 * VARIABLE PICKER — Global Shared Component
 *
 * THE single source of truth for variable selection across the entire app.
 * Used by email builder, automation builder, contract builder, and any future
 * feature that needs template variable insertion.
 *
 * FEATURES:
 * - Nested category navigation with smooth slide animations
 * - Command/search input to filter variables across all categories
 * - Fixed height with scrollable content
 * - Built-in system variables (Lead, Organization, Transaction, Date/Time)
 * - Dynamic custom data set fields from the database
 * - Server-side search for custom data variables with pagination
 * - Debounced search (400ms) to reduce API calls
 * - Infinite scroll for search results
 * - Variables inserted as {{variable}} syntax
 * - Accepts optional `categories` prop for context-aware filtering
 *   (e.g., automation builder passes trigger-specific categories)
 * - Accepts optional `organizationId` prop to avoid coupling to any
 *   specific context provider
 *
 * SOURCE OF TRUTH KEYWORDS: VariablePicker, VariableInserter, CustomDataVariables, GLOBAL_VARIABLE_PICKER
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Braces,
  ChevronRight,
  ChevronLeft,
  Database,
  Loader2,
  FolderOpen,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { AnimatePresence, motion } from 'framer-motion'
import {
  SHARED_CATEGORIES,
  type VariableOption,
  type VariableCategory,
} from '@/lib/variables/variable-categories'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Custom data field shape from tRPC query.
 * SOURCE OF TRUTH: Avoids tRPC deep type instantiation errors.
 */
interface CustomDataField {
  id: string
  slug: string
  label: string
  [key: string]: unknown
}

/**
 * Custom data category shape from tRPC query.
 */
interface CustomDataCategory {
  id: string
  name: string
  slug: string
}

/** Navigation state for tracking which view is active */
type NavigationView =
  | { type: 'categories' }
  | { type: 'category'; categoryId: string }
  | { type: 'customDataSets' }
  | { type: 'customDataCategory'; categoryId: string; categoryName: string }

// ============================================================================
// ANIMATION VARIANTS
// Direction-aware slide + fade using custom prop
// ============================================================================

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 20 : -20,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -20 : 20,
    opacity: 0,
  }),
}

// ============================================================================
// DEBOUNCE HOOK
// ============================================================================

/**
 * Custom hook for debounced value.
 * Returns the debounced value after the specified delay.
 * Uses 400ms delay matching the app's search pattern.
 */
function useDebounce<T>(value: T, delay = 400): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

// ============================================================================
// VARIABLE PICKER COMPONENT
// ============================================================================

export interface VariablePickerProps {
  /** Callback when a variable is selected. Receives the full {{variable}} string. */
  onInsert: (variable: string) => void
  /** Optional className for the trigger button */
  className?: string
  /**
   * Organization ID for custom data queries.
   * When provided, uses this directly instead of calling useActiveOrganization().
   * Pass this when rendering inside a context that already has the org ID
   * (e.g., automation builder passes it from useAutomationBuilder()).
   */
  organizationId?: string
  /**
   * Override which built-in variable categories to display.
   * Defaults to SHARED_CATEGORIES (all categories).
   * Pass filtered categories for context-aware display
   * (e.g., automation builder passes trigger-specific categories via TRIGGER_CATEGORY_MAP).
   */
  categories?: VariableCategory[]
}

/**
 * Variable Picker Component — Global source of truth.
 *
 * Multi-level variable browser with search, category navigation,
 * and smooth page transitions. Supports built-in and custom variables.
 * Includes debounced server-side search for custom data fields.
 */
export function VariablePicker({
  onInsert,
  className,
  organizationId: organizationIdProp,
  categories: categoriesProp,
}: VariablePickerProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [navigation, setNavigation] = useState<NavigationView>({ type: 'categories' })
  const [direction, setDirection] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  /** Debounced search query for server-side search (400ms delay) */
  const debouncedSearchQuery = useDebounce(searchQuery, 400)

  /**
   * Resolve organizationId: use prop if provided, otherwise fall back to hook.
   * WHY: Callers in different contexts (automation builder, email builder, contract builder)
   * may get the org ID from different sources. The prop avoids coupling to any single provider.
   */
  const { activeOrganization } = useActiveOrganization()
  const organizationId = organizationIdProp ?? activeOrganization?.id

  /**
   * Resolve categories: use prop if provided, otherwise show all shared categories.
   * WHY: Automation builder filters by trigger type, email/contract builders show all.
   */
  const builtInCategories = categoriesProp ?? SHARED_CATEGORIES

  /** Fetch custom data categories for this organization */
  const { data: customCategories, isLoading: isLoadingCategories } =
    trpc.customData.listCategories.useQuery(
      { organizationId: organizationId ?? '' },
      { enabled: !!organizationId }
    )

  /** Reset state when popover closes */
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setNavigation({ type: 'categories' })
    }
  }, [open])

  /** Focus search input when popover opens */
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [open])

  /** Handle variable selection — wraps key in {{ }} and closes popover */
  const handleSelect = useCallback(
    (variableKey: string) => {
      onInsert(`{{${variableKey}}}`)
      setOpen(false)
    },
    [onInsert]
  )

  /** Navigate to a category detail view (forward direction) */
  const navigateToCategory = useCallback((categoryId: string) => {
    setDirection(1)
    setNavigation({ type: 'category', categoryId })
  }, [])

  /** Navigate to custom data sets view (forward direction) */
  const navigateToCustomDataSets = useCallback(() => {
    setDirection(1)
    setNavigation({ type: 'customDataSets' })
  }, [])

  /** Navigate to a custom data category (forward direction) */
  const navigateToCustomDataCategory = useCallback(
    (categoryId: string, categoryName: string) => {
      setDirection(1)
      setNavigation({ type: 'customDataCategory', categoryId, categoryName })
    },
    []
  )

  /** Navigate back to previous view (backward direction) */
  const navigateBack = useCallback(() => {
    setDirection(-1)
    if (navigation.type === 'category') {
      setNavigation({ type: 'categories' })
    } else if (navigation.type === 'customDataCategory') {
      setNavigation({ type: 'customDataSets' })
    } else if (navigation.type === 'customDataSets') {
      setNavigation({ type: 'categories' })
    }
  }, [navigation])

  /** Filter all built-in variables by search query */
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null

    const query = searchQuery.toLowerCase()
    const results: Array<{ category: string; variable: VariableOption }> = []

    builtInCategories.forEach((category) => {
      category.variables.forEach((variable) => {
        if (
          variable.label.toLowerCase().includes(query) ||
          variable.key.toLowerCase().includes(query)
        ) {
          results.push({ category: category.label, variable })
        }
      })
    })

    return results
  }, [searchQuery, builtInCategories])

  /** Get the current category for detail view */
  const currentCategory = useMemo(() => {
    if (navigation.type === 'category') {
      return builtInCategories.find((c) => c.id === navigation.categoryId)
    }
    return null
  }, [navigation, builtInCategories])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-7 text-xs gap-1', className)}
        >
          <Braces className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-0 overflow-hidden"
        sideOffset={4}
      >
        {/* Search Header — always visible */}
        <div className="p-1.5 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search variables..."
              className="h-7 pl-7 pr-7 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Content Area — fixed height with scroll */}
        <div className="h-[240px] overflow-hidden relative">
          {searchQuery.trim() ? (
            <SearchResultsView
              builtInResults={searchResults ?? []}
              query={searchQuery}
              debouncedQuery={debouncedSearchQuery}
              organizationId={organizationId}
              onSelect={handleSelect}
            />
          ) : (
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              {navigation.type === 'categories' && (
                <motion.div
                  key="categories"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute inset-0 overflow-y-auto bg-popover"
                >
                  <CategoriesView
                    categories={builtInCategories}
                    onSelectCategory={navigateToCategory}
                    onSelectCustomData={navigateToCustomDataSets}
                    hasCustomData={!!organizationId}
                    isLoadingCustomData={isLoadingCategories}
                  />
                </motion.div>
              )}

              {navigation.type === 'category' && currentCategory && (
                <motion.div
                  key={`category-${navigation.categoryId}`}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute inset-0 overflow-y-auto bg-popover"
                >
                  <CategoryDetailView
                    category={currentCategory}
                    onBack={navigateBack}
                    onSelect={handleSelect}
                  />
                </motion.div>
              )}

              {navigation.type === 'customDataSets' && (
                <motion.div
                  key="customDataSets"
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute inset-0 overflow-y-auto bg-popover"
                >
                  <CustomDataSetsView
                    categories={customCategories as CustomDataCategory[] | undefined}
                    isLoading={isLoadingCategories}
                    onBack={navigateBack}
                    onSelectCategory={navigateToCustomDataCategory}
                  />
                </motion.div>
              )}

              {navigation.type === 'customDataCategory' && (
                <motion.div
                  key={`customData-${navigation.categoryId}`}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute inset-0 overflow-y-auto bg-popover"
                >
                  <CustomDataCategoryDetailView
                    categoryId={navigation.categoryId}
                    categoryName={navigation.categoryName}
                    organizationId={organizationId}
                    onBack={navigateBack}
                    onSelect={handleSelect}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// CATEGORIES VIEW
// Main view showing all available variable categories
// ============================================================================

interface CategoriesViewProps {
  categories: VariableCategory[]
  onSelectCategory: (categoryId: string) => void
  onSelectCustomData: () => void
  hasCustomData: boolean
  isLoadingCustomData: boolean
}

function CategoriesView({
  categories,
  onSelectCategory,
  onSelectCustomData,
  hasCustomData,
  isLoadingCustomData,
}: CategoriesViewProps) {
  return (
    <div className="py-1">
      {/* Built-in Categories */}
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelectCategory(category.id)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-1.5',
            'hover:bg-muted transition-colors text-left',
            'group'
          )}
        >
          <category.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 text-sm">{category.label}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {category.variables.length}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        </button>
      ))}

      {/* Custom Data Sets */}
      {hasCustomData && (
        <>
          <div className="h-px bg-border my-1 mx-3" />
          <button
            type="button"
            onClick={onSelectCustomData}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-1.5',
              'hover:bg-muted transition-colors text-left',
              'group'
            )}
          >
            <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm">Custom Data</span>
            {isLoadingCustomData ? (
              <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            )}
          </button>
        </>
      )}
    </div>
  )
}

// ============================================================================
// CATEGORY DETAIL VIEW
// Shows variables for a specific built-in category
// ============================================================================

interface CategoryDetailViewProps {
  category: VariableCategory
  onBack: () => void
  onSelect: (variableKey: string) => void
}

function CategoryDetailView({ category, onBack, onSelect }: CategoryDetailViewProps) {
  return (
    <div>
      {/* Header with back button */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <button
          type="button"
          onClick={onBack}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          <category.icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{category.label}</span>
        </button>
      </div>

      {/* Variables list */}
      <div className="py-1">
        {category.variables.map((variable) => (
          <button
            key={variable.key}
            type="button"
            onClick={() => onSelect(variable.key)}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-3 py-1.5',
              'hover:bg-muted transition-colors text-left'
            )}
          >
            <span className="text-sm">{variable.label}</span>
            <code className="text-[10px] text-muted-foreground font-mono">
              {variable.key.split('.').pop()}
            </code>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// CUSTOM DATA SETS VIEW
// Shows all custom data categories
// ============================================================================

interface CustomDataSetsViewProps {
  categories: CustomDataCategory[] | undefined
  isLoading: boolean
  onBack: () => void
  onSelectCategory: (categoryId: string, categoryName: string) => void
}

function CustomDataSetsView({
  categories,
  isLoading,
  onBack,
  onSelectCategory,
}: CustomDataSetsViewProps) {
  return (
    <div>
      {/* Header with back button */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <button
          type="button"
          onClick={onBack}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">Custom Data</span>
        </button>
      </div>

      {/* Content */}
      <div className="py-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-6">
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            <span className="mt-2 text-xs text-muted-foreground">Loading...</span>
          </div>
        ) : !categories || categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6">
            <FolderOpen className="h-6 w-6 text-muted-foreground/40" />
            <p className="mt-1.5 text-xs text-muted-foreground">No custom data sets</p>
          </div>
        ) : (
          categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelectCategory(category.id, category.name)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-1.5',
                'hover:bg-muted transition-colors text-left'
              )}
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm truncate">{category.name}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CUSTOM DATA CATEGORY DETAIL VIEW
// Shows fields for a specific custom data category
// ============================================================================

interface CustomDataCategoryDetailViewProps {
  categoryId: string
  categoryName: string
  /** Organization ID passed down from the parent VariablePicker */
  organizationId: string | undefined
  onBack: () => void
  onSelect: (variableKey: string) => void
}

function CustomDataCategoryDetailView({
  categoryId,
  categoryName,
  organizationId,
  onBack,
  onSelect,
}: CustomDataCategoryDetailViewProps) {
  /** Fetch fields for this custom data category */
  const fieldsQuery = trpc.customData.listFields.useQuery(
    { organizationId: organizationId ?? '', categoryId },
    { enabled: !!organizationId }
  ) as { data: CustomDataField[] | undefined; isLoading: boolean }
  const { data: fields, isLoading } = fieldsQuery

  return (
    <div>
      {/* Header with back button */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <button
          type="button"
          onClick={onBack}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{categoryName}</span>
        </button>
      </div>

      {/* Content */}
      <div className="py-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-6">
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            <span className="mt-2 text-xs text-muted-foreground">Loading...</span>
          </div>
        ) : !fields || fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6">
            <FolderOpen className="h-6 w-6 text-muted-foreground/40" />
            <p className="mt-1.5 text-xs text-muted-foreground">No fields</p>
          </div>
        ) : (
          fields.map((field) => {
            /**
             * Build the variable key using flat access pattern.
             * SOURCE OF TRUTH: @/lib/variables/types.ts - LeadVariableContext.customData
             */
            const variableKey = `lead.customData.${field.slug}`
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => onSelect(variableKey)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-1.5',
                  'hover:bg-muted transition-colors text-left'
                )}
              >
                <span className="text-sm truncate">{field.label}</span>
                <code className="text-[10px] text-muted-foreground font-mono">
                  {field.slug}
                </code>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SEARCH RESULTS VIEW
// Shows filtered variables matching search query
// Combines built-in results with paginated server-side custom data results
// SOURCE OF TRUTH KEYWORDS: SearchResultsView, VariableSearchResults
// ============================================================================

/**
 * Custom data search result type from server.
 * SOURCE OF TRUTH: Matches VariableSearchResult from custom-data.service.ts
 */
interface CustomDataSearchResult {
  id: string
  fieldSlug: string
  fieldLabel: string
  categoryId: string
  categoryName: string
  categorySlug: string
  variableKey: string
}

interface SearchResultsViewProps {
  builtInResults: Array<{ category: string; variable: VariableOption }>
  query: string
  debouncedQuery: string
  organizationId: string | undefined
  onSelect: (variableKey: string) => void
}

/**
 * Search Results View Component
 *
 * Displays combined search results from built-in variables and server-side
 * custom data search. Implements infinite scroll for custom data results.
 */
function SearchResultsView({
  builtInResults,
  query,
  debouncedQuery,
  organizationId,
  onSelect,
}: SearchResultsViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  /**
   * Server-side search for custom data variables.
   * Uses useInfiniteQuery for cursor-based pagination.
   */
  const {
    data: customDataResults,
    isLoading: isSearching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.customData.searchVariables.useInfiniteQuery(
    {
      organizationId: organizationId ?? '',
      query: debouncedQuery,
      limit: 15,
    },
    {
      enabled: !!organizationId && debouncedQuery.length >= 2,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
    }
  )

  /** Flatten paginated custom data results */
  const customDataItems = useMemo(() => {
    if (!customDataResults?.pages) return []
    return customDataResults.pages.flatMap((page) => page.items)
  }, [customDataResults])

  /**
   * Intersection Observer for infinite scroll.
   * Triggers fetchNextPage when load more element is visible.
   */
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage()
        }
      },
      { root: scrollContainerRef.current, rootMargin: '100px' }
    )

    observer.observe(loadMoreRef.current)

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  /** Group built-in results by category for cleaner display */
  const groupedBuiltIn = builtInResults.reduce(
    (acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = []
      }
      acc[item.category].push(item.variable)
      return acc
    },
    {} as Record<string, VariableOption[]>
  )

  /** Group custom data results by category */
  const groupedCustomData = customDataItems.reduce(
    (acc, item) => {
      const categoryKey = `Custom: ${item.categoryName}`
      if (!acc[categoryKey]) {
        acc[categoryKey] = []
      }
      acc[categoryKey].push(item)
      return acc
    },
    {} as Record<string, CustomDataSearchResult[]>
  )

  const totalBuiltIn = builtInResults.length
  const totalCustom = customDataItems.length
  const totalResults = totalBuiltIn + totalCustom
  const showSearchingIndicator = isSearching && debouncedQuery.length >= 2

  /** No results state */
  if (totalResults === 0 && !showSearchingIndicator) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-6">
        <Search className="h-5 w-5 text-muted-foreground/40" />
        <p className="mt-1.5 text-xs text-muted-foreground">No results for &quot;{query}&quot;</p>
      </div>
    )
  }

  return (
    <div ref={scrollContainerRef} className="overflow-y-auto h-full">
      {/* Results count header */}
      <div className="px-3 py-1 text-[10px] text-muted-foreground border-b flex items-center justify-between">
        <span>
          {totalResults} result{totalResults !== 1 ? 's' : ''}
          {hasNextPage && '+'}
        </span>
        {showSearchingIndicator && (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
      </div>

      {/* Built-in variable results */}
      {Object.entries(groupedBuiltIn).map(([category, variables]) => (
        <div key={category} className="py-1">
          <div className="px-3 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {category}
          </div>
          {variables.map((variable) => (
            <button
              key={variable.key}
              type="button"
              onClick={() => onSelect(variable.key)}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-3 py-1.5',
                'hover:bg-muted transition-colors text-left'
              )}
            >
              <span className="text-sm">{variable.label}</span>
              <code className="text-[10px] text-muted-foreground font-mono">
                {variable.key.split('.').pop()}
              </code>
            </button>
          ))}
        </div>
      ))}

      {/* Custom data results */}
      {Object.entries(groupedCustomData).map(([category, fields]) => (
        <div key={category} className="py-1">
          <div className="px-3 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {category}
          </div>
          {fields.map((field) => (
            <button
              key={field.id}
              type="button"
              onClick={() => onSelect(field.variableKey)}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-3 py-1.5',
                'hover:bg-muted transition-colors text-left'
              )}
            >
              <span className="text-sm">{field.fieldLabel}</span>
              <code className="text-[10px] text-muted-foreground font-mono">
                {field.fieldSlug}
              </code>
            </button>
          ))}
        </div>
      ))}

      {/* Infinite scroll trigger / loading indicator */}
      {(hasNextPage || isFetchingNextPage) && (
        <div ref={loadMoreRef} className="py-2 flex justify-center">
          {isFetchingNextPage ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground">Load more...</span>
          )}
        </div>
      )}
    </div>
  )
}
