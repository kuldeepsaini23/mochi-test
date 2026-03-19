/**
 * ============================================================================
 * TEMPLATE BROWSE — SELF-CONTAINED BROWSE VIEW
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateBrowseView, TemplateBrowseContainer
 *
 * WHY: Single, self-contained component that handles the entire template
 * browse experience — category sidebar (desktop) / dropdown (mobile),
 * search, and template grid. Clicking a template card navigates to its
 * detail page via URL (${basePath}/${templateId}), making every template
 * shareable and bookmarkable.
 *
 * HOW: Wraps content in TemplateBrowseProvider (URL-synced state), then
 * renders the browse grid. On desktop (lg+), categories show as a left
 * sidebar. On mobile/tablet, categories collapse into a dropdown select.
 * Filter state (category, search, sort, page) syncs to URL search params
 * so every filter combination is shareable.
 */

'use client'

import { Search, Filter } from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { TemplateCategory, TemplateSortOption } from '@/lib/templates/types'
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_META,
  TEMPLATE_SORT_OPTIONS,
} from '@/lib/templates/constants'
import { TemplateBrowseProvider, useTemplateBrowse } from './template-browse-context'
import { TemplateGridView } from './template-grid-view'
import { cn } from '@/lib/utils'

// ============================================================================
// PROPS
// ============================================================================

interface TemplateBrowseViewProps {
  /** Base URL path for template links — '/marketplace' in dashboard, '/templates' in public */
  basePath: string
  /** Whether the current user is authenticated */
  isAuthenticated?: boolean
  /** Current organization ID for install checks */
  organizationId?: string
  /** Optional pre-filter to a specific category */
  defaultCategory?: TemplateCategory
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Self-contained browse experience — sidebar + grid.
 * Template cards link to ${basePath}/${templateId} for URL-based navigation.
 * Filter state syncs to URL search params for shareability.
 */
export function TemplateBrowseView({
  basePath,
  defaultCategory,
}: TemplateBrowseViewProps) {
  return (
    <TemplateBrowseProvider defaultCategory={defaultCategory}>
      <BrowseGrid basePath={basePath} />
    </TemplateBrowseProvider>
  )
}

// ============================================================================
// BROWSE GRID — Sidebar (desktop) + dropdown (mobile) + content area
// ============================================================================

/**
 * Responsive layout:
 * - Desktop (lg+): left sidebar with categories, right content with grid
 * - Mobile/Tablet: stacked layout with dropdown category filter + search
 */
function BrowseGrid({ basePath }: { basePath: string }) {
  const { category, search, sortBy, setCategory, setSearch, setSortBy } =
    useTemplateBrowse()

  /** Resolve active category metadata for header/breadcrumb */
  const activeMeta =
    category !== 'all' ? TEMPLATE_CATEGORY_META[category] : null
  const title = activeMeta
    ? `${activeMeta.label} Templates`
    : 'All Templates'
  const description = activeMeta
    ? activeMeta.description
    : 'Browse all available templates for your organization.'

  return (
    <div className="flex flex-col lg:flex-row min-h-[400px]">
      {/* ------------------------------------------------------------------ */}
      {/* DESKTOP SIDEBAR — Hidden on mobile, shown on lg+                   */}
      {/* ------------------------------------------------------------------ */}
      <aside className="hidden lg:block w-52 shrink-0 pr-6 space-y-5">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates"
            className="h-8 pl-8 text-sm bg-transparent"
          />
        </div>

        {/* "All" top-level item */}
        <nav className="space-y-0.5">
          <SidebarItem
            label="All"
            isActive={category === 'all'}
            onClick={() => setCategory('all')}
          />
        </nav>

        {/* Subtle visual break between "All" and categories */}
        <div className="h-px bg-muted/60" />

        {/* Category list — compact text, no icons */}
        <nav className="space-y-0.5">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <SidebarItem
              key={cat}
              label={TEMPLATE_CATEGORY_META[cat].label}
              isActive={category === cat}
              onClick={() => setCategory(cat)}
            />
          ))}
        </nav>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* MOBILE FILTER BAR — Shown on mobile/tablet, hidden on lg+          */}
      {/* ------------------------------------------------------------------ */}
      <div className="lg:hidden mb-5 space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates"
            className="h-9 pl-8 text-sm bg-transparent"
          />
        </div>

        {/* Category dropdown + Sort — side by side on mobile */}
        <div className="flex gap-2">
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as TemplateCategory | 'all')}
          >
            <SelectTrigger className="h-9 flex-1 text-sm">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {TEMPLATE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {TEMPLATE_CATEGORY_META[cat].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as TemplateSortOption)}
          >
            <SelectTrigger className="h-9 w-28 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CONTENT AREA — Breadcrumb, title, sort, grid                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 min-w-0 lg:pl-6">
        {/* Breadcrumb — desktop only */}
        <nav className="hidden lg:block text-sm text-muted-foreground mb-1.5">
          <span>Templates</span>
          {category !== 'all' && activeMeta && (
            <>
              <span className="mx-1.5">&rsaquo;</span>
              <span className="text-foreground">{activeMeta.label}</span>
            </>
          )}
        </nav>

        {/* Category title + description */}
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight mb-1.5">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground mb-5 lg:mb-6">
          {description}
        </p>

        {/* Sort control — desktop only (mobile sort is in the filter bar) */}
        <div className="hidden lg:flex justify-end mb-5">
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as TemplateSortOption)}
          >
            <SelectTrigger className="h-8 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Template grid + pagination */}
        <TemplateGridView basePath={basePath} />
      </div>
    </div>
  )
}

// ============================================================================
// SIDEBAR ITEM — Simple text-only category link
// ============================================================================

/**
 * Compact text-only sidebar link.
 * Active: primary color with medium weight. Inactive: muted text with hover.
 */
function SidebarItem({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full text-left px-2 py-1 text-sm rounded transition-colors',
        isActive
          ? 'text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}
