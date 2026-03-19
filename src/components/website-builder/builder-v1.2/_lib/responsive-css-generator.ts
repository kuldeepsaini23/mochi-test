/**
 * ============================================================================
 * RESPONSIVE CSS GENERATOR - Container Query CSS for Published Sites
 * ============================================================================
 *
 * This module generates @container CSS rules for elements with responsive
 * style overrides. Used when publishing websites to ensure mobile styles
 * are properly applied via container queries.
 *
 * ============================================================================
 * WHY CONTAINER QUERIES (NOT MEDIA QUERIES)
 * ============================================================================
 *
 * We use @container queries instead of @media queries because:
 *
 * 1. COMPONENT-LEVEL RESPONSIVENESS:
 *    Container queries respond to the container's width, not the viewport.
 *    This allows a frame to be "mobile-sized" even on a desktop screen
 *    (useful for preview mode and embedded widgets).
 *
 * 2. CONSISTENT WITH CANVAS PREVIEW:
 *    The mobile breakpoint frame in the canvas uses container-type: inline-size.
 *    Published sites should behave identically.
 *
 * 3. FUTURE-PROOF:
 *    As components become more reusable, container queries ensure
 *    responsive behavior works regardless of where they're placed.
 *
 * ============================================================================
 * WHY !IMPORTANT ON ALL DECLARATIONS
 * ============================================================================
 *
 * All CSS declarations in container queries use `!important` because:
 *
 * 1. INLINE STYLE SPECIFICITY:
 *    The PageRenderer applies base/desktop styles as inline styles via
 *    React's `style={{ ... }}` prop. Inline styles have the HIGHEST
 *    CSS specificity and cannot be overridden by normal CSS rules.
 *
 * 2. CONTAINER QUERIES CAN'T WIN SPECIFICITY:
 *    Even with more specific selectors, CSS rules in @container cannot
 *    override inline styles without `!important`.
 *
 * 3. MOBILE OVERRIDES MUST WIN:
 *    When the container width is at mobile breakpoint, mobile styles
 *    MUST override desktop styles - that's the whole point. Using
 *    `!important` ensures our container query rules take precedence.
 *
 * ============================================================================
 * MOBILE BREAKPOINT THRESHOLD
 * ============================================================================
 *
 * Mobile styles apply when container width < 768px (767px and below).
 * This matches common tablet/mobile breakpoints and the builder's preview.
 *
 * ============================================================================
 * USAGE IN PAGE RENDERER
 * ============================================================================
 *
 * ```tsx
 * // In page-renderer.tsx
 * import { generatePageResponsiveCSS } from '../_lib/responsive-css-generator'
 *
 * function PageRenderer({ elements }) {
 *   const responsiveCSS = useMemo(
 *     () => generatePageResponsiveCSS(elements),
 *     [elements]
 *   )
 *
 *   return (
 *     <>
 *       {responsiveCSS && <style dangerouslySetInnerHTML={{ __html: responsiveCSS }} />}
 *       {content}
 *     </>
 *   )
 * }
 * ```
 *
 * ============================================================================
 */

import type { CanvasElement, ElementStyles, ResponsiveSettingsOverrides } from './types'

/**
 * Mobile breakpoint threshold in pixels.
 * Container queries will apply when container width is at or below this value.
 */
const MOBILE_BREAKPOINT = 767

/**
 * Converts a camelCase CSS property name to kebab-case.
 *
 * @example
 * camelToKebab('backgroundColor') // 'background-color'
 * camelToKebab('flexDirection') // 'flex-direction'
 * camelToKebab('borderRadius') // 'border-radius'
 */
function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase()
}

/**
 * Converts a style value to a valid CSS value string.
 *
 * Handles:
 * - Numbers: Adds 'px' suffix for most properties
 * - Strings: Returns as-is
 * - Special cases: lineHeight (no unit), opacity (no unit)
 *
 * @param property - The CSS property name (camelCase)
 * @param value - The style value
 * @returns CSS-compatible value string
 */
function formatStyleValue(property: string, value: unknown): string {
  // Null or undefined - skip
  if (value === null || value === undefined) return ''

  // Already a string - use as-is
  if (typeof value === 'string') return value

  // Numbers need unit handling
  if (typeof value === 'number') {
    // Properties that don't need units
    const unitlessProperties = [
      'opacity',
      'zIndex',
      'fontWeight',
      'lineHeight',
      'flexGrow',
      'flexShrink',
      'order',
    ]

    // Check if property needs 'px' suffix
    if (unitlessProperties.includes(property)) {
      return String(value)
    }

    return `${value}px`
  }

  // Fallback: convert to string
  return String(value)
}

/**
 * Converts an ElementStyles object to CSS declarations string.
 *
 * IMPORTANT: All declarations include `!important` to override inline styles.
 * See file header for detailed explanation of why this is necessary.
 *
 * @param styles - Partial ElementStyles object (mobile overrides)
 * @returns CSS declarations string (property: value !important; pairs)
 *
 * @example
 * stylesToCSS({ padding: 16, flexDirection: 'column' })
 * // Returns: "padding: 16px !important; flex-direction: column !important;"
 */
function stylesToCSS(styles: Partial<ElementStyles>): string {
  const declarations: string[] = []

  for (const [property, value] of Object.entries(styles)) {
    // Skip undefined/null values
    if (value === undefined || value === null) continue

    const cssProperty = camelToKebab(property)
    const cssValue = formatStyleValue(property, value)

    if (cssValue) {
      // Add !important to override inline styles from JavaScript renderers
      declarations.push(`${cssProperty}: ${cssValue} !important`)
    }
  }

  return declarations.join('; ')
}

/**
 * Converts ResponsiveSettingsOverrides to CSS declarations.
 *
 * These are element settings (like width, height, autoWidth) that need to be
 * converted to their CSS equivalents for container queries.
 *
 * IMPORTANT: All declarations include `!important` to override inline styles.
 * See file header for detailed explanation of why this is necessary.
 *
 * ============================================================================
 * MIGRATION NOTE
 * ============================================================================
 *
 * Typography properties (fontSize, fontFamily, fontWeight, lineHeight,
 * letterSpacing, textAlign) have been MOVED from settings to styles.
 *
 * - New location: element.responsiveStyles.mobile (CSS style properties)
 * - Legacy location: element.responsiveProperties.mobile (deprecated)
 *
 * The typography cases below are kept for BACKWARDS COMPATIBILITY with
 * existing data that has typography in responsiveProperties.
 *
 * ============================================================================
 * SETTING MAPPINGS
 * ============================================================================
 *
 * - width, height: Direct conversion (add 'px' suffix)
 * - objectFit: Direct conversion (object-fit)
 * - autoWidth: Special case - converts to 'width: 100%'
 * - visible: Special case - converts to 'display: none' when false
 *
 * DEPRECATED (kept for backwards compatibility):
 * - fontSize, lineHeight, letterSpacing: Direct conversion (font-* properties)
 * - fontFamily: Direct conversion
 * - fontWeight: Direct conversion
 * - textAlign: Direct conversion (text-align)
 *
 * Properties NOT converted (handled by JS renderers):
 * - variant, label: Button-specific rendering logic
 * - responsive, sticky, stickyPosition, container: Behavioral flags
 * - locked: Editor-only state
 *
 * @param settings - Responsive setting overrides
 * @returns CSS declarations string (all with !important)
 */
function settingsToCSS(settings: Partial<ResponsiveSettingsOverrides>): string {
  const declarations: string[] = []

  for (const [property, value] of Object.entries(settings)) {
    // Skip undefined/null values
    if (value === undefined || value === null) continue

    // Handle special cases - all declarations include !important to override inline styles
    switch (property) {
      // Width and height - add 'px' suffix for numbers
      case 'width':
      case 'height':
        if (typeof value === 'number') {
          declarations.push(`${property}: ${value}px !important`)
        }
        break

      // autoWidth - converts to width: 100%
      case 'autoWidth':
        if (value === true) {
          declarations.push('width: 100% !important')
        }
        break

      // visible - converts to display: none when false
      case 'visible':
        if (value === false) {
          declarations.push('display: none !important')
        }
        break

      // Typography properties - direct conversion with unit handling
      case 'fontSize':
        if (typeof value === 'number') {
          declarations.push(`font-size: ${value}px !important`)
        }
        break

      case 'fontFamily':
        if (typeof value === 'string' && value) {
          // Wrap font family in quotes if it contains spaces
          const formattedFont = value.includes(' ') ? `"${value}"` : value
          declarations.push(`font-family: ${formattedFont}, sans-serif !important`)
        }
        break

      case 'fontWeight':
        if (value !== undefined) {
          declarations.push(`font-weight: ${value} !important`)
        }
        break

      case 'lineHeight':
        if (typeof value === 'number') {
          declarations.push(`line-height: ${value} !important`)
        }
        break

      case 'letterSpacing':
        if (typeof value === 'number') {
          declarations.push(`letter-spacing: ${value}px !important`)
        }
        break

      case 'textAlign':
        if (typeof value === 'string') {
          declarations.push(`text-align: ${value} !important`)
        }
        break

      // Image objectFit - direct conversion
      case 'objectFit':
        if (typeof value === 'string') {
          declarations.push(`object-fit: ${value} !important`)
        }
        break

      // Skip properties that don't have CSS equivalents
      case 'responsive':
      case 'sticky':
      case 'stickyPosition':
      case 'container':
      case 'locked':
      case 'variant':
      case 'label':
        // These are behavioral flags handled by JS renderers
        break

      default:
        // Unknown property - skip
        break
    }
  }

  return declarations.join('; ')
}

/**
 * Generates container query CSS for a single element's mobile overrides.
 *
 * Creates an @container rule that applies mobile styles when the
 * container width is at or below the mobile breakpoint (767px).
 *
 * ============================================================================
 * TWO SOURCES OF MOBILE OVERRIDES
 * ============================================================================
 *
 * 1. responsiveStyles.mobile - CSS style properties (padding, color, etc.)
 * 2. responsiveProperties.mobile - Non-CSS properties (width, fontSize, etc.)
 *
 * Both are converted to CSS declarations and combined in a single rule.
 *
 * ============================================================================
 * TWO TARGET SELECTORS FOR FRAMES
 * ============================================================================
 *
 * Frame elements have a two-div structure:
 * 1. Wrapper div [data-element-id]: Controls position, width, height
 * 2. Content div [data-element-content]: Controls flex styles (justifyContent, alignItems, etc.)
 *
 * Setting overrides (width, height, visibility) target the wrapper.
 * Style overrides (flexbox, padding, colors) target the content div.
 *
 * @param element - The canvas element with potential responsive overrides
 * @returns CSS string with @container rule, or empty string if no overrides
 *
 * @example
 * // Element with mobile justifyContent and width override
 * generateElementResponsiveCSS({
 *   id: 'el_123',
 *   type: 'frame',
 *   responsiveStyles: { mobile: { justifyContent: 'center' } },
 *   responsiveProperties: { mobile: { width: 300 } }
 * })
 *
 * // Returns:
 * // @container (max-width: 767px) {
 * //   [data-element-id="el_123"] {
 * //     width: 300px !important;
 * //   }
 * //   [data-element-content="el_123"] {
 * //     justify-content: center !important;
 * //   }
 * // }
 */
export function generateElementResponsiveCSS(element: CanvasElement): string {
  const mobileStyles = element.responsiveStyles?.mobile
  // Check both responsiveSettings (new) and responsiveProperties (deprecated) for backwards compatibility
  const mobileSettings = element.responsiveSettings?.mobile ?? element.responsiveProperties?.mobile

  // Check if there are any mobile overrides from either source
  const hasStyleOverrides = mobileStyles && Object.keys(mobileStyles).length > 0
  const hasSettingOverrides = mobileSettings && Object.keys(mobileSettings).length > 0

  // No mobile overrides from either source - return empty
  if (!hasStyleOverrides && !hasSettingOverrides) {
    return ''
  }

  // Generate CSS declarations from both sources
  const styleDeclarations = hasStyleOverrides ? stylesToCSS(mobileStyles!) : ''
  const settingDeclarations = hasSettingOverrides ? settingsToCSS(mobileSettings!) : ''

  // Build the CSS rules
  const rules: string[] = []

  // Setting declarations go on the wrapper element [data-element-id]
  // These include: width, height, display (visibility), etc.
  if (settingDeclarations) {
    rules.push(`  [data-element-id="${element.id}"] {
    ${settingDeclarations};
  }`)
  }

  // ============================================================================
  // STYLE DECLARATIONS - Target the content element for typography/visual styles
  // ============================================================================
  //
  // Different element types have different DOM structures:
  // - Frames/Pages: Wrapper + Content div -> target [data-element-content]
  // - Text/Button: Wrapper + Content div -> target [data-element-content]
  // - Images: Wrapper + NextImage (img tag) -> target [data-element-id] for container
  //           styles and [data-element-id] img for image-specific styles
  //
  // This ensures CSS overrides target the correct DOM element where styles are applied.
  if (styleDeclarations) {
    // Elements with a content div (frames, pages, text, button, smartcms-list) use data-element-content
    const hasContentDiv = element.type === 'frame' || element.type === 'page' ||
                          element.type === 'text' || element.type === 'button' ||
                          element.type === 'smartcms-list'
    const selector = hasContentDiv
      ? `[data-element-content="${element.id}"]`
      : `[data-element-id="${element.id}"]`
    rules.push(`  ${selector} {
    ${styleDeclarations};
  }`)
  }

  // ============================================================================
  // IMAGE-SPECIFIC: objectFit needs to target the actual <img> element
  // ============================================================================
  // NextImage renders an <img> tag inside the wrapper, so we need to target it
  // specifically for object-fit overrides to work.
  if (element.type === 'image' && hasSettingOverrides && mobileSettings) {
    const objectFit = mobileSettings.objectFit
    if (objectFit && typeof objectFit === 'string') {
      rules.push(`  [data-element-id="${element.id}"] img {
    object-fit: ${objectFit} !important;
  }`)
    }
  }

  // No valid rules - return empty
  if (rules.length === 0) {
    return ''
  }

  return `
@container (max-width: ${MOBILE_BREAKPOINT}px) {
${rules.join('\n')}
}`
}

/**
 * Recursively collects all elements from a nested structure.
 *
 * @param elements - Array of canvas elements (may have children in tree)
 * @returns Flat array of all elements
 */
function flattenElements(elements: CanvasElement[]): CanvasElement[] {
  // For our flat array structure, elements are already flat
  // This function exists for potential future nested structures
  return elements
}

/**
 * Generates all responsive CSS for a complete page.
 *
 * Processes all elements and generates @container rules for those
 * with mobile style overrides. Returns a combined CSS string that
 * can be injected into a <style> tag.
 *
 * @param elements - Array of all canvas elements for the page
 * @returns Combined CSS string with all @container rules
 *
 * @example
 * // In page-renderer.tsx
 * const responsiveCSS = generatePageResponsiveCSS(elements)
 *
 * // Inject into page
 * {responsiveCSS && (
 *   <style dangerouslySetInnerHTML={{ __html: responsiveCSS }} />
 * )}
 */
export function generatePageResponsiveCSS(elements: CanvasElement[]): string {
  // Flatten elements (for potential nested structures)
  const allElements = flattenElements(elements)

  // Generate CSS for each element with mobile overrides
  const cssRules: string[] = []

  for (const element of allElements) {
    const elementCSS = generateElementResponsiveCSS(element)
    if (elementCSS) {
      cssRules.push(elementCSS)
    }
  }

  // No rules - return empty string
  if (cssRules.length === 0) {
    return ''
  }

  // Combine all rules with a header comment
  return `/* Responsive Styles - Generated by Mochi Builder */
${cssRules.join('\n')}`
}

/**
 * Checks if any elements in the array have responsive overrides.
 * Useful for conditional rendering of the <style> tag.
 *
 * Checks both:
 * - responsiveStyles.mobile (CSS properties like padding, color, typography)
 * - responsiveSettings.mobile (behavioral settings like width, height, autoWidth)
 * - responsiveProperties.mobile (deprecated, kept for backwards compatibility)
 *
 * @param elements - Array of canvas elements
 * @returns true if at least one element has mobile overrides
 */
export function hasAnyResponsiveStyles(elements: CanvasElement[]): boolean {
  return elements.some((element) => {
    // Check for CSS style overrides (includes typography since migration)
    const hasStyleOverrides =
      element.responsiveStyles?.mobile &&
      Object.keys(element.responsiveStyles.mobile).length > 0

    // Check for setting overrides (width, height, autoWidth, etc.)
    // Check both new (responsiveSettings) and deprecated (responsiveProperties) locations
    const hasSettingOverrides =
      (element.responsiveSettings?.mobile &&
        Object.keys(element.responsiveSettings.mobile).length > 0) ||
      (element.responsiveProperties?.mobile &&
        Object.keys(element.responsiveProperties.mobile).length > 0)

    return hasStyleOverrides || hasSettingOverrides
  })
}
