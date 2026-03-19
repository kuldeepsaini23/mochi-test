/**
 * ============================================================================
 * TEMPLATE BROWSE — URL-SYNCED CONTEXT & STATE MANAGEMENT
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateBrowseState, TemplateBrowseActions,
 * useTemplateBrowse, TemplateBrowseProvider, TemplateBrowseURLSync
 *
 * WHY: Lightweight context for the browse experience that syncs filter state
 * (category, search, sort, page) to URL search params. This makes every
 * filter combination shareable via URL. Decoupled from TemplateLibraryContext
 * (which drives the dashboard wizard).
 *
 * HOW: State is derived from useSearchParams(). Setter functions update the URL
 * via router.replace() with { scroll: false } so filter changes don't create
 * browser history entries (back/forward navigates between pages, not filters).
 * Search input uses local state with debounced URL sync (300ms) for instant
 * feedback without URL churn on every keystroke.
 *
 * URL PARAM MAPPING:
 * - category → ?category=WEBSITE (omitted when 'all')
 * - search   → ?search=landing (omitted when empty)
 * - sortBy   → ?sort=popular (omitted when 'newest' — the default)
 * - page     → ?page=2 (omitted when 1)
 */

'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ReactNode,
} from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

import type { TemplateCategory, TemplateSortOption } from '@/lib/templates/types'
import { TEMPLATE_CATEGORIES } from '@/lib/templates/constants'

// ============================================================================
// VALID PARAM VALUES — For safe parsing of URL search params
// ============================================================================

const VALID_CATEGORIES = new Set<string>(TEMPLATE_CATEGORIES)
const VALID_SORT_OPTIONS = new Set<string>(['newest', 'popular', 'name'])

// ============================================================================
// STATE & ACTIONS — Shape of the browse context value
// ============================================================================

/** Browsing filters + pagination state derived from URL search params */
interface TemplateBrowseState {
  /** Active category filter — 'all' shows every published template */
  category: TemplateCategory | 'all'
  /** Free-text search query (local state for instant input feedback) */
  search: string
  /** Current sort order */
  sortBy: TemplateSortOption
  /** Current page (1-indexed) */
  page: number
}

/** Dispatch functions for updating browse state (writes to URL) */
interface TemplateBrowseActions {
  /** Switch to a category (resets page to 1) */
  setCategory: (category: TemplateCategory | 'all') => void
  /** Update the search query (resets page to 1, debounced URL sync) */
  setSearch: (search: string) => void
  /** Change the sort order (resets page to 1) */
  setSortBy: (sortBy: TemplateSortOption) => void
  /** Jump to a specific page */
  setPage: (page: number) => void
  /** Reset everything back to defaults */
  reset: () => void
}

/** Combined context value — state + actions */
type TemplateBrowseContextValue = TemplateBrowseState & TemplateBrowseActions

// ============================================================================
// CONTEXT + HOOK
// ============================================================================

const TemplateBrowseContext = createContext<TemplateBrowseContextValue | null>(null)

/**
 * Access browse state and actions from any child of TemplateBrowseProvider.
 * Throws if used outside the provider — ensures components are always wired up.
 */
export function useTemplateBrowse(): TemplateBrowseContextValue {
  const ctx = useContext(TemplateBrowseContext)
  if (!ctx) {
    throw new Error('useTemplateBrowse must be used within a TemplateBrowseProvider')
  }
  return ctx
}

// ============================================================================
// PROVIDER PROPS
// ============================================================================

interface TemplateBrowseProviderProps {
  children: ReactNode
  /** Optional pre-filter to a specific category on mount */
  defaultCategory?: TemplateCategory
}

// ============================================================================
// PROVIDER — Wraps content in Suspense for useSearchParams compatibility
// ============================================================================

/**
 * Wraps the browse UI and provides URL-synced filtering state.
 * Uses a Suspense boundary internally because useSearchParams()
 * requires one in Next.js 14+.
 */
export function TemplateBrowseProvider({
  children,
  defaultCategory,
}: TemplateBrowseProviderProps) {
  return (
    <Suspense fallback={null}>
      <TemplateBrowseProviderInner defaultCategory={defaultCategory}>
        {children}
      </TemplateBrowseProviderInner>
    </Suspense>
  )
}

// ============================================================================
// INNER PROVIDER — Actual state management with URL sync
// ============================================================================

/**
 * Reads filter state from URL search params and writes back on changes.
 * Search input maintains local state with 300ms debounced URL sync
 * to avoid a router.replace() on every keystroke.
 */
function TemplateBrowseProviderInner({
  children,
  defaultCategory,
}: TemplateBrowseProviderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // ------------------------------------------------------------------
  // Derive state from URL search params with safe parsing/fallbacks
  // ------------------------------------------------------------------

  const categoryParam = searchParams.get('category')
  const category: TemplateCategory | 'all' =
    categoryParam && VALID_CATEGORIES.has(categoryParam)
      ? (categoryParam as TemplateCategory)
      : (defaultCategory ?? 'all')

  const sortParam = searchParams.get('sort')
  const sortBy: TemplateSortOption =
    sortParam && VALID_SORT_OPTIONS.has(sortParam)
      ? (sortParam as TemplateSortOption)
      : 'newest'

  const pageParam = searchParams.get('page')
  const page = Math.max(1, Number(pageParam) || 1)

  /** URL-level search value (used for data fetching) */
  const urlSearch = searchParams.get('search') ?? ''

  // ------------------------------------------------------------------
  // Local search state — instant input feedback, debounced URL sync
  // ------------------------------------------------------------------

  const [localSearch, setLocalSearch] = useState(urlSearch)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Keep local search in sync when URL changes externally
   * (e.g., browser back/forward or direct URL paste)
   */
  useEffect(() => {
    setLocalSearch(urlSearch)
  }, [urlSearch])

  // ------------------------------------------------------------------
  // URL update helper — builds new search params and replaces URL
  // ------------------------------------------------------------------

  /**
   * Updates URL search params without creating a browser history entry.
   * Strips default values to keep URLs clean:
   * - category=all → omitted
   * - sort=newest → omitted
   * - page=1 → omitted
   * - search="" → omitted
   */
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }

      /* Strip default values so URLs stay clean */
      if (params.get('sort') === 'newest') params.delete('sort')
      if (params.get('page') === '1') params.delete('page')
      if (params.get('category') === 'all') params.delete('category')

      const qs = params.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [searchParams, router, pathname]
  )

  // ------------------------------------------------------------------
  // Setter functions — each writes to URL via updateParams
  // ------------------------------------------------------------------

  /** Switch category and reset page to 1 */
  const setCategory = useCallback(
    (next: TemplateCategory | 'all') => {
      updateParams({
        category: next === 'all' ? null : next,
        page: null,
      })
    },
    [updateParams]
  )

  /**
   * Update search — sets local state immediately for instant input feedback,
   * then debounces the URL update by 300ms to avoid churn on every keystroke
   */
  const setSearch = useCallback(
    (next: string) => {
      setLocalSearch(next)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateParams({
          search: next || null,
          page: null,
        })
      }, 300)
    },
    [updateParams]
  )

  /** Switch sort order and reset page to 1 */
  const setSortBy = useCallback(
    (next: TemplateSortOption) => {
      updateParams({
        sort: next === 'newest' ? null : next,
        page: null,
      })
    },
    [updateParams]
  )

  /** Jump to a specific page */
  const setPage = useCallback(
    (next: number) => {
      updateParams({ page: next <= 1 ? null : String(next) })
    },
    [updateParams]
  )

  /** Reset all filters back to defaults */
  const reset = useCallback(() => {
    setLocalSearch('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    router.replace(pathname, { scroll: false })
  }, [router, pathname])

  /** Cleanup debounce timer on unmount */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // ------------------------------------------------------------------
  // Memoized context value
  // ------------------------------------------------------------------

  const value = useMemo<TemplateBrowseContextValue>(
    () => ({
      category,
      search: localSearch,
      sortBy,
      page,
      setCategory,
      setSearch,
      setSortBy,
      setPage,
      reset,
    }),
    [category, localSearch, sortBy, page, setCategory, setSearch, setSortBy, setPage, reset]
  )

  return (
    <TemplateBrowseContext.Provider value={value}>
      {children}
    </TemplateBrowseContext.Provider>
  )
}
