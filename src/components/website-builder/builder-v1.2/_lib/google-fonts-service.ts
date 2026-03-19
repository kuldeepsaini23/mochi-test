/**
 * ============================================================================
 * GOOGLE FONTS SERVICE - Font Loading and Management
 * ============================================================================
 *
 * Provides a curated list of Google Fonts and handles loading them dynamically.
 * Uses a static font list for reliability (no API calls that can fail).
 *
 * ============================================================================
 * FEATURES
 * ============================================================================
 *
 * 1. CURATED FONT LIST
 *    - 50+ carefully selected fonts across all categories
 *    - No API calls - instant and reliable
 *    - Search/filter functionality
 *
 * 2. FONT LOADING
 *    - Dynamically loads fonts into the document via Google Fonts CSS
 *    - Tracks which fonts are already loaded (prevents duplicates)
 *    - Supports loading specific weights
 *
 * 3. FONT METADATA
 *    - Provides available weights for each font
 *    - Includes font category (serif, sans-serif, display, handwriting, monospace)
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * ```tsx
 * // Get font list for dropdown
 * const fonts = await GoogleFontsService.getFontList()
 *
 * // Search fonts by name
 * const results = GoogleFontsService.searchFonts(fonts, 'rob') // Returns "Roboto", "Roboto Mono"
 *
 * // Load a font into the document
 * GoogleFontsService.loadFont('Roboto', [400, 700])
 *
 * // Get available weights for a font
 * const weights = GoogleFontsService.getFontWeights(fonts, 'Roboto')
 * ```
 *
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Font item for UI display and font loading
 */
export interface FontItem {
  /** Font family name */
  family: string
  /** Font category for grouping (sans-serif, serif, display, handwriting, monospace) */
  category: string
  /** Available numeric weights */
  weights: number[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Curated list of fonts available in the builder.
 * Using a static list instead of API calls for reliability and performance.
 * These fonts cover most design needs across different categories.
 */
export const CURATED_FONTS: FontItem[] = [
  // Sans-serif - Modern & Clean
  { family: 'Inter', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Roboto', category: 'sans-serif', weights: [100, 300, 400, 500, 700, 900] },
  { family: 'Open Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Lato', category: 'sans-serif', weights: [100, 300, 400, 700, 900] },
  { family: 'Montserrat', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Poppins', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Raleway', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Nunito', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Work Sans', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { family: 'Source Sans Pro', category: 'sans-serif', weights: [200, 300, 400, 600, 700, 900] },
  { family: 'Ubuntu', category: 'sans-serif', weights: [300, 400, 500, 700] },
  { family: 'Nunito Sans', category: 'sans-serif', weights: [200, 300, 400, 600, 700, 800, 900] },
  { family: 'Rubik', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Karla', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Manrope', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Space Grotesk', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Outfit', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Figtree', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },

  // Serif - Elegant & Traditional
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Merriweather', category: 'serif', weights: [300, 400, 700, 900] },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'PT Serif', category: 'serif', weights: [400, 700] },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700] },
  { family: 'Crimson Text', category: 'serif', weights: [400, 600, 700] },
  { family: 'Source Serif Pro', category: 'serif', weights: [200, 300, 400, 600, 700, 900] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [300, 400, 500, 600, 700] },
  { family: 'DM Serif Display', category: 'serif', weights: [400] },
  { family: 'Fraunces', category: 'serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },

  // Display - Headlines & Impact
  { family: 'Oswald', category: 'display', weights: [200, 300, 400, 500, 600, 700] },
  { family: 'Bebas Neue', category: 'display', weights: [400] },
  { family: 'Anton', category: 'display', weights: [400] },
  { family: 'Archivo Black', category: 'display', weights: [400] },
  { family: 'Righteous', category: 'display', weights: [400] },
  { family: 'Passion One', category: 'display', weights: [400, 700, 900] },
  { family: 'Alfa Slab One', category: 'display', weights: [400] },
  { family: 'Secular One', category: 'display', weights: [400] },

  // Handwriting & Script
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700] },
  { family: 'Pacifico', category: 'handwriting', weights: [400] },
  { family: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700] },
  { family: 'Satisfy', category: 'handwriting', weights: [400] },
  { family: 'Great Vibes', category: 'handwriting', weights: [400] },
  { family: 'Lobster', category: 'display', weights: [400] },

  // Monospace - Code & Technical
  { family: 'Roboto Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700] },
  { family: 'Source Code Pro', category: 'monospace', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Fira Code', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { family: 'JetBrains Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700, 800] },
  { family: 'Space Mono', category: 'monospace', weights: [400, 700] },
  { family: 'IBM Plex Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700] },
]

/**
 * Popular fonts to show at the top of the list.
 * Subset of curated fonts that users most commonly want quick access to.
 */
export const POPULAR_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Raleway',
  'Oswald',
  'Playfair Display',
  'Merriweather',
  'Source Sans Pro',
  'Ubuntu',
  'Nunito',
  'Work Sans',
  'DM Sans',
]

/**
 * Default font weights to load when a font is used
 * Covers common use cases (regular, medium, semibold, bold)
 */
const DEFAULT_WEIGHTS_TO_LOAD = [400, 500, 600, 700]

// ============================================================================
// STATE
// ============================================================================

/** Set of fonts that have been loaded into the document */
const loadedFonts = new Set<string>()

/** Whether all curated fonts have been preloaded in a single batch request */
let allFontsPreloaded = false

// ============================================================================
// FONT LIST FUNCTIONS
// ============================================================================

/**
 * Get the list of available fonts.
 *
 * Returns the curated list of fonts immediately (no API call).
 * This is more reliable and performant than fetching from Google Fonts API.
 *
 * @returns Promise resolving to array of FontItem objects
 */
export async function getFontList(): Promise<FontItem[]> {
  // Return the curated list directly - no API call needed
  return CURATED_FONTS
}

/**
 * Search fonts by name (case-insensitive partial match).
 *
 * @param fonts - Array of FontItem to search
 * @param query - Search query string
 * @returns Filtered array of matching fonts
 */
export function searchFonts(fonts: FontItem[], query: string): FontItem[] {
  if (!query.trim()) {
    return fonts
  }

  const normalizedQuery = query.toLowerCase().trim()

  return fonts.filter((font) =>
    font.family.toLowerCase().includes(normalizedQuery)
  )
}

/**
 * Get popular fonts from the font list.
 * Returns fonts in the POPULAR_FONTS order.
 *
 * @param fonts - Full font list
 * @returns Array of popular fonts
 */
export function getPopularFonts(fonts: FontItem[]): FontItem[] {
  const fontMap = new Map(fonts.map((f) => [f.family, f]))

  return POPULAR_FONTS
    .map((family) => fontMap.get(family))
    .filter((f): f is FontItem => f !== undefined)
}

/**
 * Get available weights for a specific font.
 *
 * @param fonts - Full font list
 * @param family - Font family name
 * @returns Array of available weights, or default weights if not found
 */
export function getFontWeights(fonts: FontItem[], family: string): number[] {
  const font = fonts.find((f) => f.family === family)
  return font?.weights ?? [400, 700]
}

// ============================================================================
// FONT LOADING FUNCTIONS
// ============================================================================

/**
 * Load a Google Font into the document.
 *
 * DEDUPLICATION: If the font is already loaded, this function returns
 * immediately without making additional requests.
 *
 * HOW IT WORKS:
 * 1. Check if font is already loaded
 * 2. Create a link element with Google Fonts CSS URL
 * 3. Append to document head
 * 4. Mark font as loaded
 *
 * @param family - Font family name to load
 * @param weights - Optional array of weights to load (defaults to common weights)
 */
export function loadFont(family: string, weights?: number[]): void {
  // Create cache key for this font+weights combination
  const weightsToLoad = weights ?? DEFAULT_WEIGHTS_TO_LOAD
  const cacheKey = `${family}:${weightsToLoad.join(',')}`

  // Skip if already loaded
  if (loadedFonts.has(cacheKey)) {
    return
  }

  // Mark as loading (prevents duplicate loads)
  loadedFonts.add(cacheKey)

  // Build Google Fonts URL
  // Format: https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=block
  // Uses display=block to prevent layout shift (brief invisible period instead of font swap)
  const weightsParam = weightsToLoad.join(';')
  const familyParam = encodeURIComponent(family)
  const url = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weightsParam}&display=block`

  // Create and append link element
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  link.crossOrigin = 'anonymous'
  document.head.appendChild(link)
}

/**
 * Preload ALL curated fonts in a single <link> request.
 *
 * Called when the font picker dropdown opens so every font option
 * renders with its actual typeface instead of a system fallback.
 *
 * WHY THIS WORKS:
 * - The single <link> downloads a small CSS file with @font-face declarations
 * - The browser only fetches actual .woff2 files for fonts referenced by visible elements
 * - So loading 50+ font declarations is cheap — only visible dropdown items trigger downloads
 *
 * Uses display=swap so font names are immediately visible with a fallback,
 * then swap to the real typeface once loaded (no invisible text period).
 */
export function preloadAllCuratedFonts(): void {
  if (allFontsPreloaded) return
  allFontsPreloaded = true

  const familyParams = CURATED_FONTS.map((font) => {
    const encoded = encodeURIComponent(font.family)
    const weights = DEFAULT_WEIGHTS_TO_LOAD.join(';')
    return `family=${encoded}:wght@${weights}`
  })

  const url = `https://fonts.googleapis.com/css2?${familyParams.join('&')}&display=swap`

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  link.crossOrigin = 'anonymous'
  document.head.appendChild(link)

  /** Mark all fonts as loaded so individual loadFont() calls become no-ops */
  for (const font of CURATED_FONTS) {
    const cacheKey = `${font.family}:${DEFAULT_WEIGHTS_TO_LOAD.join(',')}`
    loadedFonts.add(cacheKey)
  }
}

/**
 * Load multiple fonts at once.
 *
 * Useful for loading all fonts used on a page when it first renders.
 *
 * @param fontFamilies - Array of font family names to load
 */
export function loadFonts(fontFamilies: string[]): void {
  // Deduplicate families
  const uniqueFamilies = [...new Set(fontFamilies)]

  for (const family of uniqueFamilies) {
    loadFont(family)
  }
}

/**
 * Check if a font has been loaded.
 *
 * @param family - Font family name
 * @returns true if the font has been loaded
 */
export function isFontLoaded(family: string): boolean {
  // Check if any version of this font is loaded
  for (const key of loadedFonts) {
    if (key.startsWith(`${family}:`)) {
      return true
    }
  }
  return false
}

/**
 * Generate a Google Fonts CSS URL for multiple fonts.
 *
 * Useful for generating a single CSS URL that loads all fonts
 * needed for a published website.
 *
 * FONT DISPLAY STRATEGY:
 * Uses `display=block` instead of `display=swap` to prevent layout shift (CLS).
 *
 * - display=swap: Shows fallback font immediately, then swaps to custom font
 *   (causes visible layout shift when fonts load)
 *
 * - display=block: Hides text briefly (up to 3s) while font loads, then shows
 *   custom font. No layout shift, but brief invisible text period.
 *
 * For a polished user experience, `display=block` is preferred because:
 * 1. No jarring font swap mid-view
 * 2. With preload hints, fonts load fast enough that invisible period is minimal
 * 3. Page appears "finished" immediately rather than shifting around
 *
 * @param fontFamilies - Array of font family names
 * @returns Google Fonts CSS URL
 */
export function generateFontUrl(fontFamilies: string[]): string {
  if (fontFamilies.length === 0) {
    return ''
  }

  // Deduplicate and encode families
  const uniqueFamilies = [...new Set(fontFamilies)]
  const familyParams = uniqueFamilies.map((family) => {
    const encoded = encodeURIComponent(family)
    const weights = DEFAULT_WEIGHTS_TO_LOAD.join(';')
    return `${encoded}:wght@${weights}`
  })

  // Use display=block to prevent layout shift (brief invisible period instead of font swap)
  return `https://fonts.googleapis.com/css2?${familyParams.map((f) => `family=${f}`).join('&')}&display=block`
}

// ============================================================================
// SERVER-SIDE FONT EXTRACTION
// ============================================================================

/**
 * Element shape for font extraction (minimal interface).
 * Works with any object that may have fontFamily in various locations.
 * This allows the function to work server-side without importing full types.
 */
interface FontExtractableElement {
  type: string
  /** Deprecated location - older elements may have font here */
  fontFamily?: string
  /** Rich text content — Lexical JSON string that may contain inline font-family styles */
  content?: string
  /** Current location - fonts are now stored in styles object */
  styles?: {
    fontFamily?: string
  }
  /** Mobile responsive overrides may also have font */
  responsiveStyles?: {
    mobile?: {
      fontFamily?: string
    }
  }
}

/**
 * Extract all unique font families from an array of elements.
 *
 * SERVER-COMPATIBLE: This function works in both server and client contexts
 * because it doesn't access the DOM. Use it to determine which fonts to preload.
 *
 * EXTRACTION LOCATIONS (checks all for comprehensive coverage):
 * 1. element.fontFamily - deprecated but may exist on older elements
 * 2. element.styles.fontFamily - current storage location
 * 3. element.responsiveStyles.mobile.fontFamily - mobile-specific fonts
 * 4. element.content (Lexical JSON) - inline font-family styles from rich text toolbar
 *
 * SUPPORTED ELEMENT TYPES:
 * - text: Typography elements with custom fonts
 * - button: Buttons with custom fonts
 * - Any element that may have inherited font styles
 *
 * @param elements - Array of canvas elements (or any objects with font properties)
 * @returns Array of unique font family names (excludes system fonts like 'inherit')
 *
 * @example
 * // In a server component:
 * const fonts = extractFontsFromElements(elements)
 * const fontUrl = generateFontUrl(fonts)
 * // Use fontUrl in <link rel="preload"> or metadata
 */
export function extractFontsFromElements(elements: FontExtractableElement[]): string[] {
  const fontFamilies = new Set<string>()

  /**
   * Helper to add a font if it's a valid custom font.
   * Filters out system fonts and empty values.
   */
  const addFont = (font: string | undefined) => {
    if (!font) return
    // Skip system/generic fonts that don't need loading
    const systemFonts = ['inherit', 'initial', 'unset', 'system-ui', 'sans-serif', 'serif', 'monospace']
    if (systemFonts.includes(font.toLowerCase())) return
    fontFamilies.add(font)
  }

  for (const element of elements) {
    // Check deprecated location (element.fontFamily)
    addFont(element.fontFamily)

    // Check current location (element.styles.fontFamily)
    addFont(element.styles?.fontFamily)

    // Check mobile responsive override (element.responsiveStyles.mobile.fontFamily)
    addFont(element.responsiveStyles?.mobile?.fontFamily)

    /**
     * Check Lexical rich text content for inline font-family styles.
     * Rich text elements store Lexical JSON in element.content. Users can apply
     * font-family to selected text via the floating toolbar, which stores it as
     * an inline CSS style on Lexical TextNodes (e.g., "font-family: Pacifico").
     * Without extracting these, published pages won't load the Google Fonts CSS.
     */
    const content = element.content
    if (content && content.includes('font-family')) {
      const fontFamilyRegex = /font-family:\s*([^;"]+)/g
      let match: RegExpExecArray | null
      while ((match = fontFamilyRegex.exec(content)) !== null) {
        const fontName = match[1].trim()
        addFont(fontName)
      }
    }
  }

  return Array.from(fontFamilies)
}

// ============================================================================
// EXPORT AS NAMESPACE
// ============================================================================

/**
 * Google Fonts Service - centralized font management
 */
export const GoogleFontsService = {
  getFontList,
  searchFonts,
  getPopularFonts,
  getFontWeights,
  loadFont,
  loadFonts,
  preloadAllCuratedFonts,
  isFontLoaded,
  generateFontUrl,
  extractFontsFromElements,
  POPULAR_FONTS,
}
