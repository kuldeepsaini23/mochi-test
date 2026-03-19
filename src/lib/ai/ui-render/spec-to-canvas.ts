/**
 * ============================================================================
 * SPEC-TO-CANVAS CONVERTER
 * ============================================================================
 *
 * Converts a json-render Spec (from the AI's ```ui-spec stream) into
 * CanvasElement objects compatible with the website builder's Redux store.
 *
 * This is the bridge between the AI spec (json-render components like
 * Card, Stack, Heading, Text, Button, Image) and the builder's native
 * element types (frame, text, image, button).
 *
 * MAPPING STRATEGY:
 * - Card, Stack, Grid, Alert → FrameElement (container with flex layout)
 * - Heading, Text, Badge      → TextElement (content text)
 * - Button                    → ButtonElement (CTA with label + variant)
 * - Image, Avatar             → ImageElement (visual content)
 * - Separator                 → FrameElement (thin horizontal line)
 * - Unknown types             → FrameElement (safe fallback)
 *
 * PARENTING: When pageElementId is provided, top-level spec elements become
 * children of the page element (flex column layout). This ensures elements
 * appear inside the canvas page, not floating independently.
 *
 * SOURCE OF TRUTH KEYWORDS: SpecToCanvas, SpecCanvasConverter,
 * UISpecToCanvasElements, JsonRenderToBuilder
 * ============================================================================
 */

import type { Spec } from '@json-render/core'
import { generateElementId } from '@/components/website-builder/builder-v1.2/_lib/canvas-slice'
import type {
  CanvasElement,
  FrameElement,
  TextElement,
  ImageElement,
  ButtonElement,
  ElementStyles,
  ResponsiveStyles,
} from '@/components/website-builder/builder-v1.2/_lib/types'
import {
  DEFAULT_FRAME_PROPS,
  DEFAULT_FRAME_STYLES,
  DEFAULT_TEXT_PROPS,
  DEFAULT_TEXT_STYLES,
  DEFAULT_IMAGE_PROPS,
  DEFAULT_IMAGE_STYLES,
  DEFAULT_BUTTON_PROPS,
  DEFAULT_BUTTON_STYLES,
} from '@/components/website-builder/builder-v1.2/_lib/types'
import { createDefaultDropShadow, createEmptyEffectsConfig } from '@/components/website-builder/builder-v1.2/_lib/effect-utils'
import {
  CARD_BG,
  CARD_BORDER_COLOR,
  CARD_SHADOW_COLOR,
  CARD_BORDER_RADIUS,
  CARD_PADDING,
  CARD_INNER_PADDING,
  CARD_INNER_BORDER_RADIUS,
  ALERT_BG,
  ALERT_BORDER_COLOR,
  ALERT_PADDING,
  ALERT_BORDER_RADIUS,
  HEADING_COLOR,
  BODY_TEXT_COLOR,
  BADGE_TEXT_COLOR,
  BADGE_FONT_SIZE,
  BADGE_FONT_WEIGHT,
  BODY_FONT_SIZE,
  BODY_LETTER_SPACING,
  HEADING_FONT_SIZES,
  CARD_GAP,
  GRID_GAP,
  STACK_GAP,
  SECTION_MARGIN,
  IMAGE_BORDER_RADIUS,
  getAIControllableStyleKeys,
  AI_COMPONENT_TO_ELEMENT_TYPE,
} from './style-defaults'
import { isCustomAIElement, createCustomCanvasElement } from './ai-element-registry'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for the spec-to-canvas conversion.
 *
 * SOURCE OF TRUTH KEYWORDS: SpecToCanvasOptions
 */
export interface SpecToCanvasOptions {
  /**
   * Page element ID to parent root elements under.
   * When provided, top-level spec elements become children of this page
   * element instead of floating independently on the canvas.
   */
  pageElementId?: string

  /**
   * Number of existing children on the page element.
   * Used to compute the `order` for new root elements so they're
   * placed after existing content rather than overlapping.
   */
  existingChildCount?: number
}

/**
 * Result of the spec-to-canvas conversion.
 *
 * SOURCE OF TRUTH KEYWORDS: SpecToCanvasResult
 */
export interface SpecToCanvasResult {
  /** All generated CanvasElements in insertion order (parent before children) */
  elements: CanvasElement[]
  /** IDs of root-level elements (children of the page, or floating if no page) */
  rootIds: string[]
}

/**
 * A single element node extracted from the json-render spec.
 * Intermediate representation before converting to CanvasElement.
 */
interface SpecNode {
  /** json-render element key (e.g., 'hero-section', 'card-1') */
  specKey: string
  /** Component type from json-render (e.g., 'Card', 'Stack', 'Text') */
  componentType: string
  /** Component props from the spec */
  props: Record<string, unknown>
  /** Child spec keys in order */
  childKeys: string[]
}

// ============================================================================
// DARK BACKGROUND AUTO-DETECTION — Smart color defaults for dark sections
// ============================================================================
//
// When the AI forgets to set light colors for elements inside dark sections,
// these functions auto-detect the ancestor background color and inject
// appropriate light defaults. The AI's explicit choices always win (they're
// already in props) — this only fills in MISSING color props.
//
// SOURCE OF TRUTH KEYWORDS: DarkModeAutoDetect, AutoColorDefaults
// ============================================================================

/**
 * Determines if a hex color is "dark" based on relative luminance.
 * Colors with luminance < 0.4 are considered dark and need light text.
 */
function isDarkColor(hex: string): boolean {
  const clean = hex.replace('#', '')
  if (clean.length < 6) return false
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  return (0.299 * r + 0.587 * g + 0.114 * b) < 0.4
}

/**
 * Walks up the spec tree to find the nearest ancestor Card's backgroundColor.
 * Returns the color string or null if no Card with explicit bg is found.
 */
function findAncestorBackground(
  elements: Record<string, unknown>,
  childKey: string,
): string | null {
  for (const [key, el] of Object.entries(elements)) {
    if (key === childKey) continue
    const element = el as Record<string, unknown>
    const children = Array.isArray(element.children) ? (element.children as string[]) : []
    if (children.includes(childKey)) {
      const type = typeof element.type === 'string' ? element.type : ''
      const props = (typeof element.props === 'object' && element.props !== null
        ? element.props : {}) as Record<string, unknown>
      if (type === 'Card' && typeof props.backgroundColor === 'string') {
        return props.backgroundColor
      }
      return findAncestorBackground(elements, key)
    }
  }
  return null
}

/**
 * Auto-injects light color defaults for elements inside dark sections.
 * Only fills in MISSING props — the AI's explicit color choices always win.
 *
 * This makes the system "intelligent" about contrast:
 * - Timer digits become white on dark backgrounds
 * - BulletList text becomes light gray
 * - FAQ questions become readable
 * - Payment/Checkout switch to dark theme
 * - Headings become white, body text becomes muted light
 */
function applyDarkModeDefaults(
  spec: Spec,
  specKey: string,
  node: SpecNode,
): SpecNode {
  const elements = spec.elements as Record<string, unknown> | undefined
  if (!elements) return node

  const ancestorBg = findAncestorBackground(elements, specKey)
  if (!ancestorBg || !isDarkColor(ancestorBg)) return node

  /** Dark background detected — create augmented props with light defaults */
  const props = { ...node.props }

  switch (node.componentType) {
    case 'Heading':
      if (!props.color) props.color = '#ffffff'
      break
    case 'Text':
      if (!props.color) props.color = '#cbd5e1'
      break
    case 'Badge':
      if (!props.color) props.color = '#818cf8'
      break
    case 'CountdownTimer':
      if (!props.color) props.color = '#e2e8f0'
      if (!props.labelColor) props.labelColor = '#94a3b8'
      if (!props.separatorColor) props.separatorColor = '#64748b'
      break
    case 'BulletList':
      if (!props.color) props.color = '#e2e8f0'
      if (!props.iconColor) props.iconColor = '#10b981'
      break
    case 'Accordion':
      if (!props.color) props.color = '#e2e8f0'
      if (!props.answerColor) props.answerColor = '#94a3b8'
      break
    case 'Payment':
    case 'Checkout':
      if (!props.theme) props.theme = 'dark'
      break
  }

  return { ...node, props }
}

// ============================================================================
// COMPONENT STYLE PRESETS — Extensible visual defaults per component type
// ============================================================================

/**
 * Visual style presets for frame-type components (Card, Alert, etc.).
 * Each preset defines ONLY the styles that differ from DEFAULT_FRAME_STYLES.
 *
 * WHY A PRESET MAP:
 * - Eliminates nested ternaries (isCard ? X : isAlert ? Y : Z)
 * - Adding a new component type = adding one entry here
 * - All properties use the SAME format the properties panel expects:
 *   - Standard CSS (padding, backgroundColor, borderRadius) → panel reads directly
 *   - Structured configs (__borderConfig, __effects) → panel uses specialized editors
 *   - NEVER use raw CSS strings for border/boxShadow — they bypass the panel
 *
 * PROPERTY FORMAT GUIDE (for future additions):
 * - padding, margin: number (px) or string ('8px 16px') — SpacingControl parses both
 * - backgroundColor: string (hex/rgb) — GradientControl reads directly
 * - borderRadius: number (px) or string ('8px 12px 4px 6px') — BorderRadiusControl
 * - __borderConfig: BorderConfig object — BorderControl structured editor
 * - __effects: EffectsConfig object — EffectsControl structured editor
 * - __backgroundGradient: GradientConfig object — GradientControl structured editor
 *
 * SOURCE OF TRUTH KEYWORDS: FrameStylePresets, ComponentStylePresets
 */
const FRAME_STYLE_PRESETS: Record<string, Partial<ElementStyles>> = {
  /**
   * Card — Root section wrapper with background, subtle border, and soft shadow.
   * Applied when Card is the outermost section (root) or an individual card
   * inside a row layout (Grid, horizontal Stack — e.g., feature cards, pricing cards).
   * Colors sourced from style-defaults.ts (single source of truth).
   */
  /**
   * Card preset — no default border. Borders look boxy on dark backgrounds
   * and add visual noise. The soft shadow provides enough separation.
   * Users can add borders via the properties panel if needed.
   */
  Card: {
    padding: CARD_PADDING,
    backgroundColor: CARD_BG,
    borderRadius: CARD_BORDER_RADIUS,
    __effects: {
      ...createEmptyEffectsConfig(),
      shadows: [{
        ...createDefaultDropShadow(),
        y: 1,
        blur: 3,
        spread: 0,
        color: CARD_SHADOW_COLOR,
      }],
    },
  } as Partial<ElementStyles>,

  /**
   * CardInner — Nested Card inside a column layout. Uses transparent bg so
   * only the parent section's background color applies. This fixes the bug
   * where every nested element has its own bg color, forcing users to change
   * each one individually when they want a consistent section background.
   */
  CardInner: {
    padding: CARD_INNER_PADDING,
    backgroundColor: 'transparent',
    borderRadius: CARD_INNER_BORDER_RADIUS,
  } as Partial<ElementStyles>,

  /**
   * Stack — Transparent layout container. Stacks are used for arranging
   * children in a row or column. They should NEVER have their own background
   * because they're layout wrappers, not visual sections.
   */
  Stack: {
    backgroundColor: 'transparent',
    padding: 0,
  } as Partial<ElementStyles>,

  /**
   * Grid — Transparent multi-column layout. Like Stack, Grids are layout
   * containers that rely on the parent Card's background color.
   */
  Grid: {
    backgroundColor: 'transparent',
    padding: 0,
  } as Partial<ElementStyles>,

  /** Alert — Notice banner with accent background and left border */
  Alert: {
    padding: ALERT_PADDING,
    backgroundColor: ALERT_BG,
    borderRadius: ALERT_BORDER_RADIUS,
    __borderConfig: {
      editMode: 'individual',
      top: { style: 'none', width: 0, color: 'transparent' },
      right: { style: 'none', width: 0, color: 'transparent' },
      bottom: { style: 'none', width: 0, color: 'transparent' },
      left: { style: 'solid', width: 4, color: ALERT_BORDER_COLOR },
    },
  } as Partial<ElementStyles>,
}

/**
 * Default gap values per component type (in px).
 * Card and Grid get generous spacing for section-level layouts.
 * Stack and others get tighter spacing for element-level layouts.
 */
const FRAME_DEFAULT_GAPS: Record<string, number> = {
  Card: CARD_GAP,
  Grid: GRID_GAP,
}
const DEFAULT_GAP = STACK_GAP

// ============================================================================
// AI STYLE OVERRIDES — Registry-driven prop extraction
// ============================================================================
//
// Which style props the AI can set is driven by the PropertyRegistry.
// Properties with `aiControllable: true` are automatically:
// 1. Documented in the AI prompt (via buildAIPropertyDocsFromRegistry)
// 2. Extracted here from AI output and applied to element styles
//
// To add a new AI-controllable property:
// → Just add `aiControllable: true, aiHint: '...'` in property-registry.ts
// → Everything else syncs automatically.
//
// SOURCE OF TRUTH KEYWORDS: AIStyleOverrides, AIStyleProps, AIControllableStyles
// ============================================================================

/**
 * Cached style key lists per element type — computed once from the registry.
 * Maps element type → array of style property names the AI can set.
 */
const _styleKeyCache = new Map<string, string[]>()

/**
 * Returns the AI-controllable style keys for a given AI component type.
 * Uses AI_COMPONENT_TO_ELEMENT_TYPE to map component → element type,
 * then reads the registry via getAIControllableStyleKeys().
 * Results are cached for performance (registry is static).
 */
function getStyleKeysForComponent(componentType: string): string[] {
  if (_styleKeyCache.has(componentType)) {
    return _styleKeyCache.get(componentType)!
  }
  const elementType = AI_COMPONENT_TO_ELEMENT_TYPE[componentType]
  if (!elementType) {
    _styleKeyCache.set(componentType, [])
    return []
  }
  const keys = getAIControllableStyleKeys(elementType)
  _styleKeyCache.set(componentType, keys)
  return keys
}

/**
 * Extracts style override values from AI component props.
 * Only pulls properties that exist in the registry's aiControllable list
 * and have non-null values. These overrides are spread LAST onto the
 * element's styles, giving the AI final control over the appearance.
 */
function extractStyleOverrides(
  props: Record<string, unknown>,
  allowedKeys: readonly string[],
): Partial<ElementStyles> {
  const overrides: Record<string, unknown> = {}
  for (const key of allowedKeys) {
    if (key in props && props[key] !== undefined && props[key] !== null) {
      overrides[key] = props[key]
    }
  }
  return overrides as Partial<ElementStyles>
}

// ============================================================================
// COMPONENT TYPE MAPPERS
// ============================================================================

/**
 * Creates a FrameElement from a container-type spec node (Card, Stack, Grid, Alert).
 * Frames are the builder's container element — they use flexbox layout.
 *
 * All frames use autoHeight so they expand to fit their content.
 * Child frames (inside other containers) use 100% width via autoWidth.
 *
 * Visual styling comes from FRAME_STYLE_PRESETS — not hardcoded ternaries.
 * This makes adding new component types trivial (add one preset entry).
 *
 * @param isRootSection - Whether this is a top-level section on the page.
 *   Root sections get vertical margin for breathing room between sections.
 * @param parentIsRowDirection - Whether the parent frame is a row container.
 *   Cards inside row parents get fixed desktop width + mobile fill for responsive.
 */
function createFrameElement(
  node: SpecNode,
  id: string,
  parentId: string | null,
  order: number,
  isRootSection = false,
  parentIsRowDirection = false,
): FrameElement {
  /** Derive flex direction from component type and props */
  const direction = node.componentType === 'Grid'
    ? 'row' as const
    : (node.props.direction === 'horizontal' ? 'row' as const : 'column' as const)

  /** Extract gap from props, falling back to component-specific defaults */
  const defaultGap = FRAME_DEFAULT_GAPS[node.componentType] ?? DEFAULT_GAP
  const gap = typeof node.props.gap === 'number' ? node.props.gap * 4 : defaultGap

  /**
   * CRITICAL: Always use 'wrap' — the builder's computeFrameSizing()
   * (style-utils.ts:1928) returns height: 'auto' ONLY when flexWrap === 'wrap'.
   * With 'nowrap', frames get fixed height: 0px and become invisible.
   */
  const flexWrap = 'wrap' as const

  const isCard = node.componentType === 'Card'

  /**
   * PRESET SELECTION — Context-aware Card styling:
   *
   * 1. Root section Card OR Card in a row parent (Grid, horizontal Stack):
   *    → Full Card preset (white bg, border, shadow). These are visually distinct
   *      sections or individual cards in a card layout (features, pricing, etc.)
   *
   * 2. Nested Card in a column parent (not root, not in a row):
   *    → CardInner preset (transparent bg, no border/shadow). Only the parent
   *      section's background applies, fixing the bug where users have to change
   *      every element's bg color individually to get a consistent look.
   *
   * 3. Stack, Grid, other containers:
   *    → Their own preset (transparent bg) since they're layout wrappers.
   */
  let presetKey: string
  if (isCard) {
    presetKey = (isRootSection || parentIsRowDirection) ? 'Card' : 'CardInner'
  } else {
    presetKey = node.componentType
  }
  const preset = FRAME_STYLE_PRESETS[presetKey] ?? {}

  /**
   * Extract AI style overrides — props the AI explicitly set to control
   * colors, padding, border radius, and alignment. These override defaults
   * so the AI can create dark sections, custom padding, etc.
   */
  const styleOverrides = extractStyleOverrides(node.props, getStyleKeysForComponent(node.componentType))

  /**
   * Horizontal Stacks (button rows, icon rows) need justifyContent: 'center'
   * to center children on the main axis. Without this, buttons cluster to
   * the left even when the parent section is centered.
   * Grids are excluded — their children should distribute evenly, not center.
   */
  const isHorizontalStack = node.componentType === 'Stack' && direction === 'row'

  const styles: ElementStyles = {
    ...DEFAULT_FRAME_STYLES,
    flexDirection: direction,
    gap,
    flexWrap,
    /**
     * alignItems: 'center' for both row and column frames.
     * Column: centers children horizontally (hero sections, CTAs look centered).
     * Row: centers children vertically (text + image side-by-side align properly).
     * Children with autoWidth: true still fill 100% width regardless.
     */
    alignItems: 'center',
    /**
     * justifyContent: 'center' for horizontal Stacks only.
     * This centers buttons/elements horizontally within a row.
     * Column frames don't need this — autoHeight makes them shrink to content.
     */
    ...(isHorizontalStack ? { justifyContent: 'center' } : {}),
    /** Spread component-specific visual preset (padding, bg, border, shadow, etc.) */
    ...preset,
    /**
     * Root-level sections get vertical margin for breathing room between sections.
     * Child frames skip this — their parent's gap handles spacing.
     */
    ...(isRootSection ? { margin: SECTION_MARGIN } : {}),
    /**
     * AI style overrides — spread LAST so they take priority over presets.
     * This lets the AI control backgroundColor, padding, borderRadius, etc.
     */
    ...styleOverrides,
  }

  /**
   * RESPONSIVE CARD LAYOUT — Row-direction containers (Grid, horizontal Stack)
   * switch to column on mobile so child cards stack vertically instead of
   * getting squashed into tiny widths on narrow viewports.
   */
  const isRowDirection = direction === 'row'
  const responsiveStyles: ResponsiveStyles | undefined = isRowDirection
    ? { mobile: { flexDirection: 'column' } }
    : undefined

  return {
    id,
    type: 'frame',
    name: node.componentType === 'Card'
      ? (typeof node.props.title === 'string' && node.props.title ? node.props.title : 'Section')
      : node.componentType,
    x: 0,
    y: 0,
    /**
     * Width logic:
     * - Root frames: fixed 1200px page width
     * - All child frames (including cards in row containers): 0
     *   autoWidth: true → width: 100% for column parents
     *   autoWidth: true → flex: 1 1 0% for row parents (even distribution)
     */
    width: parentId ? 0 : 1200,
    height: 0,
    parentId,
    order,
    ...DEFAULT_FRAME_PROPS,
    /**
     * AutoWidth logic:
     * - Root frames: false (use fixed 1200px width)
     * - ALL child frames (including cards in row containers): true
     *   In column parents: width: 100% (fill parent)
     *   In row parents: flex: 1 1 0% (share space evenly)
     */
    autoWidth: !!parentId,
    styles,
    ...(responsiveStyles ? { responsiveStyles } : {}),
  }
}

/**
 * Creates a TextElement from a text-type spec node (Heading, Text, Badge).
 * Text elements display content and auto-size to fit.
 */
function createTextElement(
  node: SpecNode,
  id: string,
  parentId: string | null,
  order: number,
): TextElement {
  /** Extract text content from various prop shapes */
  const content = typeof node.props.text === 'string'
    ? node.props.text
    : typeof node.props.children === 'string'
      ? node.props.children
      : 'Text'

  /** Heading-specific styles */
  const isHeading = node.componentType === 'Heading'
  const isBadge = node.componentType === 'Badge'
  /**
   * Resolve heading level from AI props.
   * Handles both numeric (level:1) and catalog string format (level:"h1").
   */
  const rawLevel = node.props.level
  const headingLevel = typeof rawLevel === 'number'
    ? rawLevel
    : typeof rawLevel === 'string' && rawLevel.startsWith('h')
      ? parseInt(rawLevel.slice(1), 10) || 2
      : 2

  /** Map heading level to font size — sourced from style-defaults.ts */
  const headingFontSizes = HEADING_FONT_SIZES

  /**
   * Extract AI style overrides — the AI can specify color, fontSize,
   * fontWeight, textAlign, and lineHeight to customize text appearance.
   * This lets the AI create light text for dark sections, larger/smaller
   * text, centered headings, etc.
   */
  const textOverrides = extractStyleOverrides(node.props, getStyleKeysForComponent(node.componentType))

  /**
   * Visual hierarchy: headings get near-black for strong emphasis,
   * body text gets muted gray to create clear contrast with headings.
   * Badge keeps its branded blue accent color.
   */
  const styles: ElementStyles = {
    ...DEFAULT_TEXT_STYLES,
    fontSize: isHeading
      ? (headingFontSizes[headingLevel] ?? 32)
      : isBadge ? BADGE_FONT_SIZE : BODY_FONT_SIZE,
    fontWeight: isHeading ? 700 : isBadge ? BADGE_FONT_WEIGHT : 400,
    lineHeight: isHeading ? 1.2 : 1.6,
    color: isHeading ? HEADING_COLOR : isBadge ? BADGE_TEXT_COLOR : BODY_TEXT_COLOR,
    /**
     * Body text gets slight letter spacing for readability.
     * Uses number (px) format so the properties panel slider can read/edit it.
     */
    ...(!isHeading && !isBadge ? { letterSpacing: BODY_LETTER_SPACING } : {}),
    /**
     * Badge styling: just colored uppercase text by default (no pill background).
     * The AI can explicitly set backgroundColor in its props if it wants a pill.
     * This prevents the pill background from stretching full width (since text
     * elements always get width: 100% via autoWidth) and avoids light-pill-on-
     * dark-background clashes when the AI creates dark sections.
     *
     * textAlign: 'center' — since all text elements have autoWidth: true (width: 100%),
     * alignItems on the parent frame has NO effect on text positioning.
     * We must set textAlign: 'center' directly on the text element to center it
     * within its full-width container. This applies to badges and headings.
     */
    ...(isBadge || isHeading ? { textAlign: 'center' as const } : {}),
    /** AI overrides last — let AI control color, fontSize, textAlign, etc. */
    ...textOverrides,
  }

  return {
    id,
    type: 'text',
    name: isHeading ? `H${headingLevel}` : isBadge ? 'Badge' : 'Text',
    x: 0,
    y: 0,
    width: parentId ? 0 : 600,
    height: 0,
    parentId,
    order,
    ...DEFAULT_TEXT_PROPS,
    content,
    autoWidth: !!parentId,
    autoHeight: true,
    styles,
  }
}

/**
 * Creates a ButtonElement from a Button spec node.
 */
function createButtonElement(
  node: SpecNode,
  id: string,
  parentId: string | null,
  order: number,
): ButtonElement {
  const label = typeof node.props.label === 'string' ? node.props.label : 'Button'

  /**
   * Map json-render variant to builder variant.
   * Catalog defines: primary, secondary, danger.
   * Also handles legacy variants (default, outline, ghost) for backwards compat.
   */
  const variantMap: Record<string, ButtonElement['variant']> = {
    primary: 'primary',
    secondary: 'secondary',
    danger: 'primary',
    default: 'primary',
    outline: 'outline',
    ghost: 'ghost',
    destructive: 'primary',
  }
  const variant = variantMap[String(node.props.variant)] ?? 'primary'

  /**
   * Extract AI style overrides for button — backgroundColor, color,
   * fontSize, borderRadius let the AI create branded or themed buttons.
   */
  const buttonOverrides = extractStyleOverrides(node.props, getStyleKeysForComponent(node.componentType))

  /**
   * Button width is computed from label length so it hugs content.
   * autoWidth: false prevents stretching in row parents (flex: 1 1 0%).
   * Approximation: ~9px per character at 14px font + 48px horizontal padding.
   * autoHeight: true lets the button grow vertically if needed.
   */
  const computedWidth = Math.max(100, label.length * 9 + 48)

  return {
    id,
    type: 'button',
    name: label,
    x: 0,
    y: 0,
    width: computedWidth,
    height: DEFAULT_BUTTON_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    autoWidth: false,
    autoHeight: true,
    label,
    variant,
    styles: { ...DEFAULT_BUTTON_STYLES, ...buttonOverrides },
  }
}

/**
 * Creates an ImageElement from an Image or Avatar spec node.
 */
function createImageElement(
  node: SpecNode,
  id: string,
  parentId: string | null,
  order: number,
): ImageElement {
  const src = typeof node.props.src === 'string' && node.props.src
    ? node.props.src
    : DEFAULT_IMAGE_PROPS.src
  const alt = typeof node.props.alt === 'string'
    ? node.props.alt
    : 'Image'

  /**
   * Extract AI style overrides for images — borderRadius lets the AI
   * create rounded images, circular avatars, etc.
   */
  const imageOverrides = extractStyleOverrides(node.props, getStyleKeysForComponent(node.componentType))

  /** AI can override objectFit via props */
  const resolvedObjectFit = (typeof node.props.objectFit === 'string'
    ? node.props.objectFit
    : 'cover') as 'cover' | 'contain' | 'fill'

  return {
    id,
    type: 'image',
    name: alt || 'Image',
    x: 0,
    y: 0,
    width: DEFAULT_IMAGE_PROPS.width,
    height: DEFAULT_IMAGE_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    src,
    alt,
    objectFit: resolvedObjectFit,
    /**
     * Nested images (inside a frame) use autoWidth to fill their parent
     * container instead of being stuck at a fixed 300px. When autoWidth
     * is true, unified-image renders width: 100%.
     */
    autoWidth: !!parentId,
    styles: { ...DEFAULT_IMAGE_STYLES, ...imageOverrides },
  }
}

/**
 * Creates a thin separator FrameElement (horizontal line).
 */
function createSeparatorElement(
  id: string,
  parentId: string | null,
  order: number,
): FrameElement {
  return {
    id,
    type: 'frame',
    name: 'Separator',
    x: 0,
    y: 0,
    width: parentId ? 0 : 1200,
    height: 1,
    parentId,
    order,
    ...DEFAULT_FRAME_PROPS,
    autoWidth: !!parentId,
    styles: {
      ...DEFAULT_FRAME_STYLES,
      /** Consistent flexWrap for auto-height compatibility */
      flexWrap: 'wrap',
      backgroundColor: CARD_BORDER_COLOR,
      padding: 0,
      /** More generous vertical margin for visual breathing room */
      margin: '16px 0',
    },
  }
}

// ============================================================================
// MAIN CONVERTER
// ============================================================================

/**
 * Converts a json-render Spec to an array of CanvasElements for the builder.
 *
 * Walks the spec's element tree depth-first, converting each json-render
 * component to the appropriate CanvasElement type. Preserves the full
 * parent-child hierarchy using parentId references.
 *
 * When pageElementId is provided, root spec elements become children of
 * the page element. This ensures they appear inside the canvas page area
 * with proper flex layout stacking, not floating independently.
 *
 * @param spec - The finalized json-render Spec from the AI stream
 * @param options - Optional page element ID for parenting and child ordering
 * @returns SpecToCanvasResult with elements in insertion order and rootIds
 */
export function specToCanvas(spec: Spec, options?: SpecToCanvasOptions): SpecToCanvasResult {
  const elements: CanvasElement[] = []
  const rootIds: string[] = []

  /** Safety check — spec must have elements and a root */
  if (!spec.elements || !spec.root) {
    return { elements: [], rootIds: [] }
  }

  /**
   * If a page element ID is provided, root spec elements become its children.
   * The order offset ensures new elements are placed after existing page content.
   */
  const rootParentId = options?.pageElementId ?? null
  const orderOffset = options?.existingChildCount ?? 0

  /**
   * Build a lookup of SpecNodes from the raw spec data.
   * Each element in the spec has: type (component name), props, children array.
   */
  const specNodes = new Map<string, SpecNode>()
  for (const [key, rawElement] of Object.entries(spec.elements)) {
    const el = rawElement as unknown as Record<string, unknown>
    specNodes.set(key, {
      specKey: key,
      componentType: typeof el.type === 'string' ? el.type : 'Card',
      props: (typeof el.props === 'object' && el.props !== null ? el.props : {}) as Record<string, unknown>,
      childKeys: Array.isArray(el.children) ? (el.children as string[]) : [],
    })
  }

  /**
   * Recursively convert a spec node and all its children to CanvasElements.
   * Processes depth-first so parents are added before children.
   */
  function convertNode(specKey: string, parentCanvasId: string | null, order: number, isRootSection = false, parentIsRowDirection = false): void {
    let node = specNodes.get(specKey)
    if (!node) return

    /** Auto-detect dark backgrounds and inject light color defaults */
    node = applyDarkModeDefaults(spec, specKey, node)

    const canvasId = generateElementId()

    /** Determine which CanvasElement type to create based on component type */
    const containerTypes = new Set(['Card', 'Stack', 'Grid', 'Alert', 'Tabs'])
    const textTypes = new Set(['Heading', 'Text', 'Badge'])

    let element: CanvasElement

    if (textTypes.has(node.componentType)) {
      element = createTextElement(node, canvasId, parentCanvasId, order)
    } else if (node.componentType === 'Button') {
      element = createButtonElement(node, canvasId, parentCanvasId, order)
    } else if (node.componentType === 'Image' || node.componentType === 'Avatar') {
      element = createImageElement(node, canvasId, parentCanvasId, order)
    } else if (node.componentType === 'Separator') {
      element = createSeparatorElement(canvasId, parentCanvasId, order)
    } else if (isCustomAIElement(node.componentType)) {
      /**
       * Custom builder element (FAQ, Video, List, Timer, PreBuilt components).
       * Returns an array — compound elements like SidebarLayout produce
       * multiple CanvasElements (sidebar + inset frame). First is primary.
       */
      const customElements = createCustomCanvasElement(node, canvasId, parentCanvasId, order)
      element = customElements[0]
      /** Push any companion elements (e.g., sidebar's inset frame) */
      for (let i = 1; i < customElements.length; i++) {
        elements.push(customElements[i])
      }
    } else if (containerTypes.has(node.componentType) || node.childKeys.length > 0) {
      /** Any node with children becomes a frame, even if not explicitly a container type */
      element = createFrameElement(node, canvasId, parentCanvasId, order, isRootSection, parentIsRowDirection)
    } else {
      /** Unknown leaf node — render as text with the component type as content */
      element = createTextElement(
        { ...node, props: { ...node.props, text: node.props.text ?? node.componentType } },
        canvasId,
        parentCanvasId,
        order,
      )
    }

    elements.push(element)
    rootIds.push(canvasId)

    /**
     * Determine if this node is a row-direction container so children know
     * whether they're inside a horizontal layout (for responsive card sizing).
     */
    const thisIsRowDirection = node.componentType === 'Grid'
      || node.props.direction === 'horizontal'

    /** Recursively convert children (never root sections) */
    node.childKeys.forEach((childKey, childOrder) => {
      convertNode(childKey, canvasId, childOrder, false, thisIsRowDirection)
    })
  }

  /**
   * Start conversion from the root.
   * Root spec elements become children of the page element (if provided).
   * The order offset ensures they're placed after any existing page content.
   * Root elements are marked as root sections for margin spacing.
   */
  const rootKeys = Array.isArray(spec.root) ? spec.root as string[] : [spec.root as string]
  rootKeys.forEach((rootKey, idx) => {
    convertNode(rootKey, rootParentId, orderOffset + idx, true)
  })

  return { elements, rootIds }
}

// ============================================================================
// INCREMENTAL CONVERTER — Live Streaming One Patch at a Time
// ============================================================================

/**
 * Converts individual JSONL patches into CanvasElements as they arrive,
 * enabling elements to appear on the canvas LIVE during streaming rather
 * than waiting for the full spec to complete.
 *
 * Maintains an internal map from spec element keys → canvas element IDs
 * so child elements can reference their parent's canvas ID correctly.
 *
 * Usage:
 * 1. Create a new instance when a ```ui-spec stream starts
 * 2. After each applySpecPatch(), call convertPatch(accumulatedSpec, patch)
 * 3. If non-null, push the returned CanvasElement to the canvas bridge
 *
 * SOURCE OF TRUTH KEYWORDS: IncrementalSpecConverter, LiveStreamConverter
 */
export class IncrementalSpecConverter {
  /** Maps spec element keys (e.g., 'hero-section') → generated canvas element IDs */
  private specKeyToCanvasId = new Map<string, string>()

  /** Page element ID for parenting root elements inside the page */
  private rootParentId: string | null

  /** Running order counter for root elements (increments with each root added) */
  private rootOrderCounter: number

  constructor(options?: SpecToCanvasOptions) {
    this.rootParentId = options?.pageElementId ?? null
    this.rootOrderCounter = options?.existingChildCount ?? 0
  }

  /**
   * Convert a single applied patch into a CanvasElement for the builder.
   *
   * Only processes "add" operations on `/elements/{key}` paths — these are
   * the patches that create new UI components. Root assignment patches
   * (`/root`) and other operations return null (no canvas element to create).
   *
   * @param spec - The full accumulated Spec AFTER this patch was applied
   * @param patch - The JSON patch that was just applied
   * @returns CanvasElement(s) to push to the builder, or null.
   * Most patches return a single element in the array. Compound components
   * (e.g., SidebarLayout) may return multiple elements (sidebar + inset frame).
   */
  convertPatch(
    spec: Spec,
    patch: { op: string; path: string; value?: unknown },
  ): CanvasElement[] | null {
    /** Only handle "add" operations that create new elements */
    const match = patch.path.match(/^\/elements\/(.+)$/)
    if (!match || patch.op !== 'add') return null

    const specKey = match[1]
    const rawValue = patch.value
    if (!rawValue || typeof rawValue !== 'object') return null

    const raw = rawValue as Record<string, unknown>

    /** Build intermediate SpecNode from the raw patch value */
    let node: SpecNode = {
      specKey,
      componentType: typeof raw.type === 'string' ? raw.type : 'Card',
      props: (typeof raw.props === 'object' && raw.props !== null
        ? raw.props
        : {}) as Record<string, unknown>,
      childKeys: Array.isArray(raw.children)
        ? (raw.children as string[])
        : [],
    }

    /** Auto-detect dark backgrounds and inject light color defaults */
    node = applyDarkModeDefaults(spec, specKey, node)

    /**
     * Determine if this element is a root element by checking against
     * the spec's root key(s). Root elements are parented under the page.
     */
    const rootKeys = Array.isArray(spec.root)
      ? (spec.root as string[])
      : spec.root ? [spec.root as string] : []
    const isRoot = rootKeys.includes(specKey)

    /** Resolve parent canvas ID, child order, and parent direction for responsive sizing */
    let parentCanvasId: string | null
    let order: number
    let parentIsRowDirection = false

    if (isRoot) {
      parentCanvasId = this.rootParentId
      order = this.rootOrderCounter++
    } else {
      /**
       * Find the parent by scanning all spec elements for who lists
       * this key in their children array. The parent element was always
       * added before children in the JSONL stream, so it's already in our map.
       * Also determine if the parent is a row-direction container for
       * responsive card sizing.
       */
      parentCanvasId = null
      order = 0

      const elements = spec.elements as Record<string, unknown> | undefined
      if (elements) {
        for (const [key, el] of Object.entries(elements)) {
          if (key === specKey) continue
          const element = el as Record<string, unknown>
          const children = Array.isArray(element.children)
            ? (element.children as string[])
            : []
          const childIndex = children.indexOf(specKey)
          if (childIndex !== -1) {
            parentCanvasId = this.specKeyToCanvasId.get(key) ?? null
            order = childIndex
            /** Check if parent is a row-direction container (Grid or horizontal Stack) */
            const parentType = typeof element.type === 'string' ? element.type : ''
            const parentProps = (typeof element.props === 'object' && element.props !== null
              ? element.props : {}) as Record<string, unknown>
            parentIsRowDirection = parentType === 'Grid'
              || parentProps.direction === 'horizontal'
            break
          }
        }
      }
    }

    /** Generate a canvas element ID and store the mapping for future children */
    const canvasId = generateElementId()
    this.specKeyToCanvasId.set(specKey, canvasId)

    /** Create the appropriate CanvasElement based on component type */
    const containerTypes = new Set(['Card', 'Stack', 'Grid', 'Alert', 'Tabs'])
    const textTypes = new Set(['Heading', 'Text', 'Badge'])

    if (textTypes.has(node.componentType)) {
      return [createTextElement(node, canvasId, parentCanvasId, order)]
    } else if (node.componentType === 'Button') {
      return [createButtonElement(node, canvasId, parentCanvasId, order)]
    } else if (node.componentType === 'Image' || node.componentType === 'Avatar') {
      return [createImageElement(node, canvasId, parentCanvasId, order)]
    } else if (node.componentType === 'Separator') {
      return [createSeparatorElement(canvasId, parentCanvasId, order)]
    } else if (isCustomAIElement(node.componentType)) {
      /**
       * Custom builder element (FAQ, Video, List, Timer, PreBuilt components).
       * Already returns an array — compound elements like SidebarLayout
       * produce multiple CanvasElements (sidebar + inset frame).
       */
      return createCustomCanvasElement(node, canvasId, parentCanvasId, order)
    } else if (containerTypes.has(node.componentType) || node.childKeys.length > 0) {
      return [createFrameElement(node, canvasId, parentCanvasId, order, isRoot, parentIsRowDirection)]
    } else {
      /** Unknown leaf node — render as text with the component type as content */
      return [createTextElement(
        { ...node, props: { ...node.props, text: node.props.text ?? node.componentType } },
        canvasId,
        parentCanvasId,
        order,
      )]
    }
  }

  /** Reset converter state for a new spec stream */
  reset(): void {
    this.specKeyToCanvasId.clear()
    this.rootOrderCounter = 0
  }
}
