/**
 * ============================================================================
 * ICON PICKER - Command-based Icon Selection Component
 * ============================================================================
 *
 * A beautiful, searchable icon picker using the Command component pattern.
 * Allows users to browse and select icons from the icon library.
 *
 * FEATURES:
 * - Search by name, label, or keywords
 * - Category-based browsing
 * - Keyboard navigation support
 * - Beautiful grid layout
 * - Popover-based for inline selection
 * - Dialog-based for modal selection
 *
 * USAGE:
 * <IconPicker value="home" onValueChange={setIcon} />
 *
 * ============================================================================
 */

'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  searchIcons,
  iconCategories,
  getIconsByCategory,
  IconRenderer,
  type IconMeta,
  type IconCategory,
} from '@/lib/icons'
import { ChevronDownIcon } from '@/lib/icons'

// ============================================================================
// TYPES
// ============================================================================

interface IconPickerProps {
  /** Currently selected icon name */
  value?: string
  /** Callback when icon selection changes */
  onValueChange: (value: string) => void
  /** Placeholder text when no icon selected */
  placeholder?: string
  /** Whether the picker is disabled */
  disabled?: boolean
  /** Additional class names for the trigger */
  className?: string
  /** Size of icons in the picker grid */
  iconSize?: number
  /** Whether to show the search input */
  showSearch?: boolean
  /** Whether to show category tabs */
  showCategories?: boolean
}

interface IconGridItemProps {
  /** Icon metadata */
  icon: IconMeta
  /** Whether this icon is selected */
  isSelected: boolean
  /** Click handler */
  onSelect: () => void
  /** Icon size */
  size?: number
}

// ============================================================================
// CATEGORY LABELS - Human-readable category names
// ============================================================================

const CATEGORY_LABELS: Record<IconCategory, string> = {
  navigation: 'Navigation',
  actions: 'Actions',
  communication: 'Communication',
  media: 'Media',
  files: 'Files',
  commerce: 'Commerce',
  social: 'Social',
  arrows: 'Arrows',
  shapes: 'Shapes',
  weather: 'Weather',
  misc: 'Misc',
}

// ============================================================================
// ICON GRID ITEM - Single icon in the picker grid
// ============================================================================

/**
 * Renders a single icon item in the picker grid.
 * Shows the icon with a hover state and selected indicator.
 * Uses IconRenderer to avoid creating components during render.
 */
function IconGridItem({ icon, isSelected, onSelect, size = 18 }: IconGridItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={icon.label}
      className={cn(
        // Base styling
        'flex items-center justify-center p-2 rounded-md',
        'transition-all duration-150',
        // Default state
        'text-muted-foreground hover:text-foreground',
        'hover:bg-accent/50',
        // Selected state
        isSelected && 'bg-primary/10 text-primary ring-1 ring-primary/30',
        // Focus state
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
      )}
    >
      {/* Use IconRenderer to safely render icon by name */}
      <IconRenderer name={icon.name} size={size} />
    </button>
  )
}

// ============================================================================
// ICON PICKER COMPONENT
// ============================================================================

/**
 * A popover-based icon picker with search and category browsing.
 */
export function IconPicker({
  value,
  onValueChange,
  placeholder = 'Select icon...',
  disabled = false,
  className,
  iconSize = 18,
  showSearch = true,
  showCategories = true,
}: IconPickerProps) {
  // Track popover open state
  const [open, setOpen] = useState(false)
  // Search query
  const [search, setSearch] = useState('')
  // Selected category filter (null = show all)
  const [selectedCategory, setSelectedCategory] = useState<IconCategory | null>(null)

  /**
   * Filter icons based on search query and category.
   */
  const filteredIcons = useMemo(() => {
    let icons: IconMeta[]

    // If search is active, search across all icons
    if (search.trim()) {
      icons = searchIcons(search)
    }
    // If category is selected, filter by category
    else if (selectedCategory) {
      icons = getIconsByCategory(selectedCategory)
    }
    // Otherwise, show all icons
    else {
      icons = searchIcons('')
    }

    return icons
  }, [search, selectedCategory])

  /**
   * Handle icon selection.
   */
  const handleSelect = useCallback(
    (iconName: string) => {
      onValueChange(iconName)
      setOpen(false)
      setSearch('')
    },
    [onValueChange]
  )

  /**
   * Handle search input change.
   * Clear category filter when searching.
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (value.trim()) {
      setSelectedCategory(null)
    }
  }, [])

  /**
   * Handle category selection.
   * Clear search when selecting a category.
   */
  const handleCategorySelect = useCallback((category: IconCategory | null) => {
    setSelectedCategory(category)
    setSearch('')
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Trigger Button */}
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex items-center gap-2">
            {value ? (
              <>
                {/* Use IconRenderer to safely render the selected icon */}
                <IconRenderer name={value} size={16} className="shrink-0" />
                <span className="truncate capitalize">
                  {value.replace(/-/g, ' ')}
                </span>
              </>
            ) : (
              <span>{placeholder}</span>
            )}
          </div>
          <ChevronDownIcon size={14} className="shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      {/* Popover Content */}
      <PopoverContent
        className="w-[320px] p-0"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          {/* Search Input */}
          {showSearch && (
            <CommandInput
              placeholder="Search icons..."
              value={search}
              onValueChange={handleSearchChange}
            />
          )}

          {/* Category Tabs */}
          {showCategories && !search.trim() && (
            <div className="flex flex-wrap gap-1 p-2 border-b border-border">
              {/* All button */}
              <button
                type="button"
                onClick={() => handleCategorySelect(null)}
                className={cn(
                  'px-2 py-1 text-[10px] font-medium rounded-md transition-colors',
                  selectedCategory === null
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                All
              </button>
              {/* Category buttons */}
              {iconCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategorySelect(cat)}
                  className={cn(
                    'px-2 py-1 text-[10px] font-medium rounded-md transition-colors',
                    selectedCategory === cat
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}

          {/* Icon Grid */}
          <CommandList>
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              No icons found.
            </CommandEmpty>

            <ScrollArea className="h-[240px]">
              <CommandGroup className="p-2">
                <div className="grid grid-cols-8 gap-1">
                  {filteredIcons.map((icon) => (
                    <CommandItem
                      key={icon.name}
                      value={icon.name}
                      onSelect={() => handleSelect(icon.name)}
                      className="p-0 aria-selected:bg-transparent"
                    >
                      <IconGridItem
                        icon={icon}
                        isSelected={value === icon.name}
                        onSelect={() => handleSelect(icon.name)}
                        size={iconSize}
                      />
                    </CommandItem>
                  ))}
                </div>
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// ICON PICKER INLINE - Variant without popover for embedding
// ============================================================================

interface IconPickerInlineProps {
  /** Currently selected icon name */
  value?: string
  /** Callback when icon selection changes */
  onValueChange: (value: string) => void
  /** Size of icons in the picker grid */
  iconSize?: number
  /** Maximum height of the icon grid */
  maxHeight?: number
  /** Additional class names */
  className?: string
}

/**
 * Inline icon picker for embedding directly in forms/panels.
 * Shows the full icon grid without a popover wrapper.
 */
export function IconPickerInline({
  value,
  onValueChange,
  iconSize = 18,
  maxHeight = 200,
  className,
}: IconPickerInlineProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<IconCategory | null>(null)

  /**
   * Filter icons based on search and category.
   */
  const filteredIcons = useMemo(() => {
    if (search.trim()) {
      return searchIcons(search)
    }
    if (selectedCategory) {
      return getIconsByCategory(selectedCategory)
    }
    return searchIcons('')
  }, [search, selectedCategory])

  /**
   * Handle search change - clear category when searching.
   */
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    if (e.target.value.trim()) {
      setSelectedCategory(null)
    }
  }, [])

  return (
    <div className={cn('border border-border rounded-lg overflow-hidden', className)}>
      {/* Search Input */}
      <div className="p-2 border-b border-border">
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search icons..."
          className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Category Pills */}
      {!search.trim() && (
        <div className="flex flex-wrap gap-1 p-2 border-b border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
              !selectedCategory
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            All
          </button>
          {iconCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}

      {/* Icon Grid */}
      <ScrollArea style={{ height: maxHeight }}>
        <div className="grid grid-cols-8 gap-1 p-2">
          {filteredIcons.length === 0 ? (
            <div className="col-span-8 py-4 text-center text-sm text-muted-foreground">
              No icons found.
            </div>
          ) : (
            filteredIcons.map((icon) => (
              <IconGridItem
                key={icon.name}
                icon={icon}
                isSelected={value === icon.name}
                onSelect={() => onValueChange(icon.name)}
                size={iconSize}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { IconPickerProps, IconPickerInlineProps }
