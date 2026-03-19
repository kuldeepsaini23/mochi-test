/**
 * ============================================================================
 * AI STYLE DEFAULTS — Single Source of Truth for AI-Generated Element Styles
 * ============================================================================
 *
 * All default colors, padding, typography, and spacing values used by both:
 * - spec-to-canvas.ts (applies these defaults when converting AI output)
 * - prompts.ts (documents these defaults so the AI knows what it's working with)
 *
 * NO REACT DEPENDENCY — this file is pure TypeScript data so it can be safely
 * imported in server-side API routes (where prompts.ts runs).
 *
 * WHY THIS FILE EXISTS:
 * Before this, defaults were hardcoded in two places (prompt text AND converter
 * code). When a default changed in one place, the other went stale. Now both
 * reference this single source of truth.
 *
 * SOURCE OF TRUTH KEYWORDS: AIStyleDefaults, AIColorDefaults, AISpacingDefaults
 * ============================================================================
 */

// ============================================================================
// SECTION / CARD DEFAULTS
// ============================================================================

/** Root section Card background — the section's base color */
export const CARD_BG = '#ffffff'

/** Root section Card border color */
export const CARD_BORDER_COLOR = '#e5e7eb'

/** Root section Card shadow color */
export const CARD_SHADOW_COLOR = 'rgba(0, 0, 0, 0.1)'

/** Root section Card border radius */
export const CARD_BORDER_RADIUS = 12

/** Root section Card padding (px) — balanced: enough breathing room without feeling bloated */
export const CARD_PADDING = 24

/** Inner/nested Card padding (px) — tighter than root for visual hierarchy */
export const CARD_INNER_PADDING = 16

/** Inner/nested Card border radius */
export const CARD_INNER_BORDER_RADIUS = 8

/** Alert background color */
export const ALERT_BG = '#fef3c7'

/** Alert left accent border color */
export const ALERT_BORDER_COLOR = '#f59e0b'

/** Alert padding */
export const ALERT_PADDING = 16

/** Alert border radius */
export const ALERT_BORDER_RADIUS = 8

// ============================================================================
// TEXT DEFAULTS
// ============================================================================

/** Heading color — near-black for strong contrast */
export const HEADING_COLOR = '#111827'

/** Body text color — muted gray for visual hierarchy */
export const BODY_TEXT_COLOR = '#4b5563'

/** Badge text color — branded blue accent */
export const BADGE_TEXT_COLOR = '#3b82f6'

/** Badge background color — light blue pill */
export const BADGE_BG = '#eff6ff'

/** Badge font size */
export const BADGE_FONT_SIZE = 12

/** Badge font weight */
export const BADGE_FONT_WEIGHT = 600

/** Body text font size */
export const BODY_FONT_SIZE = 16

/** Body text letter spacing for readability */
export const BODY_LETTER_SPACING = 0.2

/** Heading font sizes per level */
export const HEADING_FONT_SIZES: Record<number, number> = {
  1: 40, 2: 32, 3: 24, 4: 20, 5: 16, 6: 14,
}

// ============================================================================
// BUTTON DEFAULTS
// ============================================================================

/** Primary button background color */
export const BUTTON_PRIMARY_BG = '#3b82f6'

/** Button text color */
export const BUTTON_TEXT_COLOR = '#ffffff'

/** Button border radius */
export const BUTTON_BORDER_RADIUS = 8

/** Button padding */
export const BUTTON_PADDING = '12px 24px'

/** Button font size */
export const BUTTON_FONT_SIZE = 14

// ============================================================================
// LAYOUT DEFAULTS
// ============================================================================

/** Default gap for Card containers (px) */
export const CARD_GAP = 16

/** Default gap for Grid containers (px) */
export const GRID_GAP = 24

/** Default gap for Stack containers (px) */
export const STACK_GAP = 16

/** Root section vertical margin — 0 for seamless dark/light section transitions */
export const SECTION_MARGIN = '0px 0'

/** Image border radius default */
export const IMAGE_BORDER_RADIUS = 8

// ============================================================================
// REGISTRY-DRIVEN UTILITIES — Auto-generate AI docs & keys from PropertyRegistry
// ============================================================================
//
// These functions read the `aiControllable` flag from the PropertyRegistry
// to auto-generate:
// 1. The style props documentation for the AI prompt
// 2. The list of style keys spec-to-canvas should extract from AI output
//
// This means: add `aiControllable: true` to any registry property →
// AI prompt documents it + converter extracts it. One change, everything syncs.
//
// SERVER-SAFE: property-registry.ts only uses `import type` from types.ts,
// so no React dependency at runtime.
//
// SOURCE OF TRUTH KEYWORDS: AIRegistryUtils, AIAutoGenerate, RegistryDrivenAI
// ============================================================================

import {
  PROPERTY_REGISTRY,
  type PropertySchema,
} from '@/components/website-builder/builder-v1.2/_lib/property-registry'
import type { ElementType } from '@/components/website-builder/builder-v1.2/_lib/types'
import { getAllPreBuiltDefinitions } from '@/components/website-builder/builder-v1.2/_lib/prebuilt'

/**
 * Maps json-render component types to builder element types.
 * Used to look up which registry properties apply to each AI component.
 *
 * Container types (Card, Stack, Grid, Alert) → 'frame'
 * Text types (Heading, Text, Badge) → 'text'
 * Button → 'button'
 * Image, Avatar → 'image'
 */
const AI_COMPONENT_TO_ELEMENT_TYPE: Record<string, ElementType> = {
  Card: 'frame',
  Stack: 'frame',
  Grid: 'frame',
  Alert: 'frame',
  Heading: 'text',
  Text: 'text',
  Badge: 'text',
  Button: 'button',
  Image: 'image',
  Avatar: 'image',
  /** Custom builder elements — mapped for future AI style override support */
  Accordion: 'frame',
  Video: 'image',
  BulletList: 'text',
  CountdownTimer: 'frame',
  Link: 'frame',
  RichText: 'text',
  Form: 'frame',
  Payment: 'frame',
  AddToCartButton: 'button',
  Checkout: 'frame',
  CartButton: 'button',
  ProductCarousel: 'image',
  CmsList: 'frame',
  StickyNote: 'text',
  Receipt: 'frame',

  /**
   * Pre-built components — mapped to 'frame' because they support the same
   * visual style properties (backgroundColor, padding, borderRadius, borders,
   * shadows, etc.) via their ElementStyles field. Auto-populated from
   * PREBUILT_REGISTRY so new prebuilt types get style support automatically.
   *
   * SOURCE OF TRUTH KEYWORDS: PrebuiltStyleMapping, AIPrebuiltStyles
   */
  ...Object.fromEntries(
    getAllPreBuiltDefinitions().map((def) => [
      def.label.replace(/\s+/g, ''),
      'frame' as ElementType,
    ])
  ),
}

/**
 * Grouping of AI component types for prompt documentation.
 * Each group gets a section in the "Style Props" prompt output.
 */
/**
 * Auto-generates the list of prebuilt component names from PREBUILT_REGISTRY.
 * Used in AI_COMPONENT_GROUPS so the AI prompt documents their style properties.
 * E.g., ["NavigationBar", "SidebarLayout", "TotalMembers", "LogoCarousel"]
 */
const _prebuiltAINames = getAllPreBuiltDefinitions().map((def) => def.label.replace(/\s+/g, ''))

const AI_COMPONENT_GROUPS: { label: string; components: string[]; elementType: ElementType }[] = [
  { label: 'Container types', components: ['Card', 'Stack', 'Grid', 'Alert'], elementType: 'frame' },
  { label: 'Text types', components: ['Heading', 'Text', 'Badge'], elementType: 'text' },
  { label: 'Button', components: ['Button'], elementType: 'button' },
  { label: 'Image', components: ['Image'], elementType: 'image' },
  /**
   * Pre-built components support frame-like styling: backgroundColor, padding,
   * borderRadius, gap, etc. Auto-populated from PREBUILT_REGISTRY — adding a
   * new prebuilt type automatically documents its style props in the AI prompt.
   */
  { label: 'Pre-built components', components: _prebuiltAINames, elementType: 'frame' },
]

/**
 * Returns the list of AI-controllable style property KEYS for a given
 * builder element type. These are the property names that spec-to-canvas
 * should extract from AI component props and apply to element styles.
 *
 * Reads from the PropertyRegistry, filtering for `aiControllable: true`.
 * Returns the LAST segment of the path (e.g. 'styles.backgroundColor' → 'backgroundColor').
 *
 * @param elementType - Builder element type ('frame', 'text', 'button', 'image')
 * @returns Array of style property names the AI can set
 *
 * SOURCE OF TRUTH KEYWORDS: getAIControllableStyleKeys, AIStyleKeys
 */
export function getAIControllableStyleKeys(elementType: ElementType): string[] {
  const schema = PROPERTY_REGISTRY[elementType]
  if (!schema) return []

  const keys: string[] = []
  for (const prop of schema.properties) {
    if (prop.aiControllable) {
      /**
       * Extract the style key from the path:
       * - 'styles.backgroundColor' → 'backgroundColor'
       * - 'styles.padding' → 'padding'
       * - 'objectFit' → 'objectFit' (non-style path, still extractable)
       */
      const parts = prop.path.split('.')
      keys.push(parts[parts.length - 1])
    }
    /** Also check group children (e.g. action group) */
    if (prop.children) {
      for (const child of prop.children) {
        if (child.aiControllable) {
          const parts = child.path.split('.')
          keys.push(parts[parts.length - 1])
        }
      }
    }
  }
  return keys
}

/**
 * Returns the AI-controllable properties with their full metadata.
 * Used by buildAIPropertyDocsFromRegistry() to generate prompt text.
 */
function getAIControllableProperties(elementType: ElementType): PropertySchema[] {
  const schema = PROPERTY_REGISTRY[elementType]
  if (!schema) return []

  const result: PropertySchema[] = []
  for (const prop of schema.properties) {
    if (prop.aiControllable) {
      result.push(prop)
    }
    if (prop.children) {
      for (const child of prop.children) {
        if (child.aiControllable) {
          result.push(child)
        }
      }
    }
  }
  return result
}

/**
 * Auto-generates the "Style Props" section for the AI prompt by reading
 * aiControllable properties from the PropertyRegistry.
 *
 * Output format per group:
 * **Container types** (Card, Stack, Grid, Alert):
 * - `backgroundColor` (color) — hex color e.g. '#1a1a2e', '#ffffff', or 'transparent'
 * - `padding` (spacing) — inner spacing in px, e.g. 48 for hero, 32 for standard
 *
 * This replaces the manual Style Props listing in prompts.ts.
 * Add `aiControllable: true` + `aiHint` to a registry property →
 * it appears here automatically.
 *
 * SOURCE OF TRUTH KEYWORDS: buildAIPropertyDocsFromRegistry, AIPropertyDocs
 */
export function buildAIPropertyDocsFromRegistry(): string {
  const sections: string[] = []

  for (const group of AI_COMPONENT_GROUPS) {
    const props = getAIControllableProperties(group.elementType)
    if (props.length === 0) continue

    const componentList = group.components.join(', ')
    const lines: string[] = [`**${group.label}** (${componentList}):`]

    for (const prop of props) {
      /** Extract the prop name the AI uses (last segment of path) */
      const parts = prop.path.split('.')
      const propName = parts[parts.length - 1]

      /** Use aiHint if available, otherwise fall back to description or type */
      const hint = prop.aiHint || prop.description || prop.type
      lines.push(`- \`${propName}\` (${prop.type}) — ${hint}`)
    }

    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}

/**
 * Builds the complete style defaults + rules section for the AI prompt.
 * Combines:
 * 1. Dynamic style defaults (colors, padding from constants)
 * 2. Background color inheritance rules
 * 3. Padding rules
 *
 * @returns A formatted string documenting default styles for the AI
 */
export function buildStyleDefaultsPrompt(): string {
  return `**How The System Styles Your Output (automatic defaults you can override with style props):**
- Root section Cards: background ${CARD_BG}, subtle border (${CARD_BORDER_COLOR}), rounded corners (${CARD_BORDER_RADIUS}px), soft shadow, padding ${CARD_PADDING}px.
- Nested Cards inside a column parent: transparent background — they inherit the parent section's bg.
- Cards inside Grid or horizontal Stack (feature cards, pricing cards): individual card styling with ${CARD_BG} bg.
- Stack and Grid containers: always transparent — they're layout wrappers, NOT visual sections.
- Alerts: ${ALERT_BG} background with left accent border (${ALERT_BORDER_COLOR}).
- Badges: ${BADGE_TEXT_COLOR} text on ${BADGE_BG} pill-shaped background.
- Body text: muted gray (${BODY_TEXT_COLOR}) for contrast with bold headings (${HEADING_COLOR}).
- Buttons: primary variant = ${BUTTON_PRIMARY_BG} filled, outline = bordered, etc.

**IMPORTANT — Background Color Inheritance:**
Only the root section Card controls the section's background color. Inner Stacks, Grids, and nested Cards are transparent — so changing the root Card's bg changes the entire section's look.
- For a dark section: set \`backgroundColor\` on the root Card + \`color\` on ALL text/headings inside it.
- For a themed section: set \`backgroundColor\` on the root Card. Inner elements inherit the bg.
- Cards inside a Grid (feature cards, pricing) get their OWN bg — these are independent visual cards.
- NEVER set backgroundColor on Stack or Grid — they should always be transparent.

**Padding Rules (CRITICAL — prevents bloated padding):**
- Root section Card: \`padding: 32\` for hero/CTA sections, \`padding: ${CARD_PADDING}\` for standard sections. Do NOT go above 32 — higher values look bloated.
- Cards inside Grid (feature cards, pricing cards): \`padding: ${CARD_INNER_PADDING}\`.
- Stack containers: NEVER set padding on Stacks. The parent Card's padding handles the outer spacing.
- Grid containers: NEVER set padding on Grids. Use the parent Card's padding instead.
- ONLY Cards should have padding. Stacks and Grids handle spacing via \`gap\`, not padding.`
}

/** Export the component-to-element-type mapping for use by spec-to-canvas */
export { AI_COMPONENT_TO_ELEMENT_TYPE }
