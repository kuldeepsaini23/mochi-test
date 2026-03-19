/**
 * ============================================================================
 * FONT FAMILY PICKER — Shared Google Fonts Selector Dropdown
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: FontFamilyPicker, SharedFontPicker, GoogleFontsPicker
 *
 * WHY: Shared dropdown for selecting Google Fonts. Used by both the properties
 * sidebar (FontFamilyControl wrapper) and the floating toolbar inline font picker.
 * Single source of truth ensures zero code drift when Google Fonts integration
 * is updated — both contexts automatically get the same font list, search,
 * preview, and loading behavior.
 *
 * HOW: Popover + Command (cmdk) with searchable font list, popular fonts group,
 * real-time font preview via actual typeface, and automatic font loading via
 * GoogleFontsService.
 *
 * VARIANTS:
 * - 'sidebar' (default): Wide trigger button matching properties panel style
 * - 'toolbar': Compact trigger for the floating toolbar context
 */

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Check, ChevronsUpDown, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  GoogleFontsService,
  type FontItem,
} from '../../../_lib/google-fonts-service'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the shared font family picker.
 *
 * SOURCE OF TRUTH KEYWORDS: FontFamilyPickerProps
 */
export interface FontFamilyPickerProps {
  /** Currently selected font family */
  value: string
  /** Called when user selects a font */
  onChange: (fontFamily: string) => void
  /** Disabled state */
  disabled?: boolean
  /**
   * Visual variant:
   * - 'sidebar' (default): Wide button with chevron, matches properties panel
   * - 'toolbar': Compact button for floating toolbar context
   */
  variant?: 'sidebar' | 'toolbar'
  /** Popover horizontal alignment (default: 'start') */
  align?: 'start' | 'center' | 'end'
  /** Popover side placement (default: 'bottom') */
  side?: 'top' | 'bottom'
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Shared font family picker used by both the properties sidebar and the
 * floating toolbar. Contains all font logic: fetching, searching, previewing,
 * selecting, and loading via GoogleFontsService.
 *
 * When Google Fonts API integration changes, updating this ONE component
 * updates all font selection UIs across the app — zero code drift.
 */
export function FontFamilyPicker({
  value,
  onChange,
  disabled,
  variant = 'sidebar',
  align = 'start',
  side = 'bottom',
}: FontFamilyPickerProps) {
  const [open, setOpen] = useState(false)
  const [fonts, setFonts] = useState<FontItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // ==========================================================================
  // FETCH FONTS ON MOUNT
  // ==========================================================================

  useEffect(() => {
    let mounted = true

    async function fetchFonts() {
      try {
        const fontList = await GoogleFontsService.getFontList()
        if (mounted) {
          setFonts(fontList)
          setIsLoading(false)
        }
      } catch (error) {
        console.error('[FontFamilyPicker] Failed to fetch fonts:', error)
        if (mounted) setIsLoading(false)
      }
    }

    fetchFonts()
    return () => { mounted = false }
  }, [])

  // ==========================================================================
  // LOAD CURRENT FONT FOR PREVIEW
  // ==========================================================================

  useEffect(() => {
    if (value) GoogleFontsService.loadFont(value)
  }, [value])

  // ==========================================================================
  // FILTERED & GROUPED FONTS
  // ==========================================================================

  /** Popular fonts shown in a separate group at the top for quick access */
  const popularFonts = useMemo(
    () => GoogleFontsService.getPopularFonts(fonts),
    [fonts]
  )

  /** Filtered fonts based on search query — all fonts when query is empty */
  const filteredFonts = useMemo(() => {
    if (!searchQuery.trim()) return fonts
    return GoogleFontsService.searchFonts(fonts, searchQuery)
  }, [fonts, searchQuery])

  /** Non-popular fonts for the "All Fonts" section */
  const otherFonts = useMemo(() => {
    const popularFamilies = new Set(popularFonts.map((f) => f.family))
    return filteredFonts.filter((f) => !popularFamilies.has(f.family))
  }, [filteredFonts, popularFonts])

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  /** Load the font, notify parent, close popover, clear search */
  const handleSelect = useCallback(
    (fontFamily: string) => {
      GoogleFontsService.loadFont(fontFamily)
      onChange(fontFamily)
      setOpen(false)
      setSearchQuery('')
    },
    [onChange]
  )

  /** Preload all curated fonts when dropdown opens for instant preview */
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) GoogleFontsService.preloadAllCuratedFonts()
  }, [])

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {variant === 'toolbar' ? (
          /**
           * Toolbar variant — compact trigger for the floating toolbar.
           * Shows a Type icon + truncated font name. Styled to match
           * the toolbar's button aesthetic.
           */
          <button
            type="button"
            disabled={disabled || isLoading}
            className={cn(
              'flex items-center gap-1 px-1.5 py-1.5 rounded hover:bg-accent transition-colors text-xs max-w-[120px]',
              open && 'bg-accent'
            )}
            title={value || 'Font Family'}
            style={{ fontFamily: value || undefined }}
          >
            <Type className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {isLoading ? '...' : value || 'Font'}
            </span>
          </button>
        ) : (
          /**
           * Sidebar variant — wide button matching the properties panel style.
           * Shows the full font name with a chevron indicator.
           */
          <Button
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || isLoading}
            className="w-full h-7 justify-between px-2 bg-muted hover:bg-muted/80 border-none text-sm font-normal"
            style={{ fontFamily: value }}
          >
            <span className="truncate">
              {isLoading ? 'Loading...' : value || 'Select font...'}
            </span>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent
        className="w-[280px] p-0"
        align={align}
        side={side}
        sideOffset={4}
        /**
         * Prevent the popover from stealing focus away from the Lexical editor.
         * Without this, opening the font picker in the floating toolbar would
         * blur the editor, collapse the selection, and hide the toolbar.
         */
        onOpenAutoFocus={(e) => {
          if (variant === 'toolbar') e.preventDefault()
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search fonts..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />

          <CommandList>
            <CommandEmpty>No fonts found.</CommandEmpty>

            {/* Popular Fonts — only shown when not searching */}
            {!searchQuery.trim() && popularFonts.length > 0 && (
              <>
                <CommandGroup heading="Popular">
                  {popularFonts.map((font) => (
                    <CommandItem
                      key={font.family}
                      value={font.family}
                      onSelect={() => handleSelect(font.family)}
                      className="flex items-center justify-between"
                    >
                      <span
                        className="truncate"
                        style={{ fontFamily: font.family }}
                      >
                        {font.family}
                      </span>
                      {value === font.family && (
                        <Check className="h-4 w-4 shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* All Fonts / Search Results */}
            <CommandGroup
              heading={searchQuery.trim() ? 'Results' : 'All Fonts'}
            >
              {(searchQuery.trim() ? filteredFonts : otherFonts)
                .slice(0, 100)
                .map((font) => (
                  <CommandItem
                    key={font.family}
                    value={font.family}
                    onSelect={() => handleSelect(font.family)}
                    className="flex items-center justify-between"
                  >
                    <span
                      className="truncate"
                      style={{ fontFamily: font.family }}
                    >
                      {font.family}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {font.category}
                    </span>
                    {value === font.family && (
                      <Check className="h-4 w-4 shrink-0 ml-2" />
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
