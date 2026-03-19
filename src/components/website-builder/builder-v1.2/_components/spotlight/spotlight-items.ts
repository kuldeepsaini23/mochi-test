/**
 * SOURCE OF TRUTH — Spotlight Search Data Registry
 * Keywords: SpotlightItem, SpotlightAction, SpotlightCategory, spotlight-items, spotlight-registry
 *
 * This is the single source of truth for all searchable items in the website builder
 * spotlight search. It defines the types, static element/action items, dynamic component
 * builder, and the filtering logic used by the spotlight UI.
 */

import type { ElementType } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

/** The three buckets items are grouped into inside the spotlight dropdown. */
export type SpotlightCategory = 'elements' | 'actions' | 'components'

/**
 * Discriminated union describing what happens when a spotlight item is selected.
 * - insert-element: drops a new element onto the canvas
 * - insert-component: drops a local component instance onto the canvas
 * - execute: runs a one-shot action (undo, publish, etc.)
 * - navigate: opens a panel, dialog, or route inside the builder
 */
export type SpotlightAction =
  | {
      type: 'insert-element'
      elementType: ElementType
      variant?: string
      prebuiltType?: string
      variantId?: string
    }
  | { type: 'insert-component'; componentId: string }
  | { type: 'execute'; handler: string }
  | { type: 'navigate'; target: string }

/** A single searchable entry shown in the spotlight results list. */
export interface SpotlightItem {
  /** Unique identifier for this item (used as React key). */
  id: string
  /** Human-readable name shown as the primary label. */
  label: string
  /** Short helper text shown below the label. */
  description: string
  /** Which group this item belongs to in the results. */
  category: SpotlightCategory
  /** Lucide icon name rendered next to the label. */
  icon: string
  /** Extra terms that match during search but are not displayed. */
  keywords: string[]
  /** What to do when the user selects this item. */
  action: SpotlightAction
}

// ============================================================================
// CATEGORY PRIORITY — used to sort filtered results
// ============================================================================

const CATEGORY_PRIORITY: Record<SpotlightCategory, number> = {
  elements: 0,
  actions: 1,
  components: 2,
}

// ============================================================================
// STATIC ITEMS
// ============================================================================

/**
 * Returns every hardcoded spotlight item (elements + actions).
 * Components are dynamic and built separately via `buildComponentItems`.
 */
export function getStaticSpotlightItems(): SpotlightItem[] {
  return [...ELEMENT_ITEMS, ...ACTION_ITEMS]
}

/** All drag-droppable element items that mirror the sidebar insert panel. */
const ELEMENT_ITEMS: SpotlightItem[] = [
  // -- Layout --
  {
    id: 'el-frame',
    label: 'Frame',
    description: 'Container that holds and arranges child elements',
    category: 'elements',
    icon: 'LayoutGrid',
    keywords: ['container', 'div', 'section', 'wrapper', 'layout', 'group'],
    action: { type: 'insert-element', elementType: 'frame', variant: 'frame' },
  },
  {
    id: 'el-circle-frame',
    label: 'Circle Frame',
    description: 'Circular container for elements',
    category: 'elements',
    icon: 'Circle',
    keywords: ['round', 'oval', 'container', 'layout'],
    action: { type: 'insert-element', elementType: 'frame', variant: 'circle-frame' },
  },

  // -- Basic --
  {
    id: 'el-text',
    label: 'Text',
    description: 'Single-line or paragraph text element',
    category: 'elements',
    icon: 'Type',
    keywords: ['paragraph', 'heading', 'label', 'copy', 'string', 'typography'],
    action: { type: 'insert-element', elementType: 'text' },
  },
  {
    id: 'el-rich-text',
    label: 'Rich Text',
    description: 'Multi-format text block with inline styling',
    category: 'elements',
    icon: 'FileText',
    keywords: ['formatted', 'markdown', 'wysiwyg', 'editor', 'content'],
    action: { type: 'insert-element', elementType: 'rich-text' },
  },
  {
    id: 'el-image',
    label: 'Image',
    description: 'Static image element from URL or upload',
    category: 'elements',
    icon: 'Image',
    keywords: ['photo', 'picture', 'img', 'media', 'upload'],
    action: { type: 'insert-element', elementType: 'image' },
  },
  {
    id: 'el-video',
    label: 'Video',
    description: 'Embedded video player',
    category: 'elements',
    icon: 'Video',
    keywords: ['movie', 'clip', 'youtube', 'vimeo', 'media', 'embed'],
    action: { type: 'insert-element', elementType: 'video' },
  },
  {
    id: 'el-button',
    label: 'Button',
    description: 'Clickable button with customisable text and style',
    category: 'elements',
    icon: 'RectangleHorizontal',
    keywords: ['cta', 'click', 'submit', 'action', 'link'],
    action: { type: 'insert-element', elementType: 'button' },
  },
  {
    id: 'el-form',
    label: 'Form',
    description: 'Data collection form with configurable fields',
    category: 'elements',
    icon: 'FormInput',
    keywords: ['input', 'field', 'contact', 'lead', 'survey', 'submit'],
    action: { type: 'insert-element', elementType: 'form' },
  },
  {
    id: 'el-icon',
    label: 'Icon',
    description: 'SVG icon from the built-in library',
    category: 'elements',
    icon: 'Smile',
    keywords: ['svg', 'symbol', 'glyph', 'emoji', 'graphic'],
    action: { type: 'insert-element', elementType: 'pencil' },
  },
  {
    id: 'el-smartcms-list',
    label: 'CMS List',
    description: 'Dynamic list powered by CMS collections',
    category: 'elements',
    icon: 'Database',
    keywords: ['cms', 'collection', 'data', 'dynamic', 'repeater', 'list'],
    action: { type: 'insert-element', elementType: 'smartcms-list' },
  },
  {
    id: 'el-ecommerce-carousel',
    label: 'Product Gallery',
    description: 'Scrollable product showcase carousel',
    category: 'elements',
    icon: 'ShoppingBag',
    keywords: ['shop', 'store', 'product', 'carousel', 'slider', 'ecommerce'],
    action: { type: 'insert-element', elementType: 'ecommerce-carousel' },
  },
  {
    id: 'el-faq',
    label: 'FAQ',
    description: 'Expandable frequently asked questions block',
    category: 'elements',
    icon: 'HelpCircle',
    keywords: ['accordion', 'question', 'answer', 'toggle', 'collapse'],
    action: { type: 'insert-element', elementType: 'faq' },
  },
  {
    id: 'el-list',
    label: 'List',
    description: 'Ordered or unordered list of items',
    category: 'elements',
    icon: 'List',
    keywords: ['bullet', 'numbered', 'items', 'ol', 'ul'],
    action: { type: 'insert-element', elementType: 'list' },
  },
  {
    id: 'el-sticky-note',
    label: 'Sticky Note',
    description: 'Canvas-only annotation note (hidden in preview)',
    category: 'elements',
    icon: 'StickyNote',
    keywords: ['note', 'annotation', 'comment', 'memo', 'reminder'],
    action: { type: 'insert-element', elementType: 'sticky-note' },
  },
  {
    id: 'el-timer',
    label: 'Timer',
    description: 'Countdown or stopwatch timer element',
    category: 'elements',
    icon: 'Timer',
    keywords: ['countdown', 'clock', 'deadline', 'stopwatch', 'urgency'],
    action: { type: 'insert-element', elementType: 'timer' },
  },

  // -- Ecommerce --
  {
    id: 'el-cart',
    label: 'Cart',
    description: 'Shopping cart summary widget',
    category: 'elements',
    icon: 'ShoppingCart',
    keywords: ['basket', 'bag', 'shopping', 'ecommerce', 'order'],
    action: { type: 'insert-element', elementType: 'cart' },
  },
  {
    id: 'el-add-to-cart',
    label: 'Add to Cart',
    description: 'Button that adds a product to the cart',
    category: 'elements',
    icon: 'Plus',
    keywords: ['buy', 'purchase', 'shop', 'ecommerce', 'product'],
    action: { type: 'insert-element', elementType: 'add-to-cart-button' },
  },
  {
    id: 'el-checkout',
    label: 'Checkout',
    description: 'Embedded checkout form for completing purchases',
    category: 'elements',
    icon: 'CreditCard',
    keywords: ['pay', 'purchase', 'stripe', 'order', 'ecommerce'],
    action: { type: 'insert-element', elementType: 'checkout' },
  },

  // -- Payment --
  {
    id: 'el-payment',
    label: 'Payment Form',
    description: 'Stripe-powered payment collection form',
    category: 'elements',
    icon: 'CreditCard',
    keywords: ['stripe', 'charge', 'pay', 'billing', 'subscription'],
    action: { type: 'insert-element', elementType: 'payment' },
  },
  {
    id: 'el-receipt',
    label: 'Receipt',
    description: 'Post-payment receipt / confirmation element',
    category: 'elements',
    icon: 'Receipt',
    keywords: ['invoice', 'confirmation', 'summary', 'thank you'],
    action: { type: 'insert-element', elementType: 'receipt' },
  },
]

/** Project-level actions (non-element operations). */
const ACTION_ITEMS: SpotlightItem[] = [
  {
    id: 'act-create-page',
    label: 'Create Page',
    description: 'Add a new page to this website',
    category: 'actions',
    icon: 'FilePlus',
    keywords: ['new', 'page', 'add', 'route'],
    action: { type: 'execute', handler: 'createPage' },
  },
  {
    id: 'act-publish',
    label: 'Publish Page',
    description: 'Push current changes live',
    category: 'actions',
    icon: 'Globe',
    keywords: ['deploy', 'live', 'ship', 'launch', 'release'],
    action: { type: 'execute', handler: 'publishPage' },
  },
  {
    id: 'act-undo',
    label: 'Undo',
    description: 'Revert the last change',
    category: 'actions',
    icon: 'Undo2',
    keywords: ['revert', 'back', 'ctrl+z'],
    action: { type: 'execute', handler: 'undo' },
  },
  {
    id: 'act-redo',
    label: 'Redo',
    description: 'Re-apply the last undone change',
    category: 'actions',
    icon: 'Redo2',
    keywords: ['forward', 'ctrl+y'],
    action: { type: 'execute', handler: 'redo' },
  },
  {
    id: 'act-settings',
    label: 'Open Website Settings',
    description: 'Global settings for SEO, favicon, and domain',
    category: 'actions',
    icon: 'Settings',
    keywords: ['seo', 'favicon', 'domain', 'meta', 'config', 'global'],
    action: { type: 'navigate', target: 'settings' },
  },
  {
    id: 'act-page-settings',
    label: 'Open Page Settings',
    description: 'Settings for the current page (slug, meta, OG image)',
    category: 'actions',
    icon: 'FileText',
    keywords: ['slug', 'meta', 'og', 'page', 'seo', 'title'],
    action: { type: 'navigate', target: 'settings-page' },
  },
  {
    id: 'act-cms',
    label: 'Open CMS',
    description: 'Manage CMS collections and content',
    category: 'actions',
    icon: 'Database',
    keywords: ['content', 'collection', 'data', 'dynamic', 'model'],
    action: { type: 'navigate', target: 'cms' },
  },
  {
    id: 'act-storage',
    label: 'Open Storage',
    description: 'Browse and manage uploaded media files',
    category: 'actions',
    icon: 'HardDrive',
    keywords: ['media', 'files', 'uploads', 'assets', 'images'],
    action: { type: 'navigate', target: 'storage' },
  },
  {
    id: 'act-dynamic-page',
    label: 'Convert to Dynamic Page',
    description: 'Turn this page into a CMS-driven dynamic template',
    category: 'actions',
    icon: 'RefreshCw',
    keywords: ['dynamic', 'cms', 'data', 'template', 'collection'],
    action: { type: 'navigate', target: 'settings-page' },
  },
]

// ============================================================================
// DYNAMIC COMPONENT BUILDER
// ============================================================================

/**
 * Builds spotlight items for user-created local components.
 * Called whenever the component list changes so search results stay fresh.
 */
export function buildComponentItems(
  components: { id: string; name: string }[],
): SpotlightItem[] {
  return components.map((comp) => ({
    id: `comp-${comp.id}`,
    label: comp.name,
    description: 'Insert local component instance',
    category: 'components' as const,
    icon: 'Component',
    keywords: ['component', 'reusable', 'instance', comp.name.toLowerCase()],
    action: { type: 'insert-component' as const, componentId: comp.id },
  }))
}

// ============================================================================
// SEARCH / FILTER
// ============================================================================

/**
 * Filters spotlight items by matching `query` against label, description,
 * and keywords (case-insensitive substring match). Results are sorted by
 * category priority: elements first, then actions, then components.
 */
export function filterSpotlightItems(
  items: SpotlightItem[],
  query: string,
): SpotlightItem[] {
  const lowerQuery = query.toLowerCase().trim()

  /* Empty query returns everything, still sorted by category. */
  if (!lowerQuery) {
    return [...items].sort(
      (a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category],
    )
  }

  return items
    .filter((item) => {
      const haystack = [
        item.label,
        item.description,
        ...item.keywords,
      ]
        .join(' ')
        .toLowerCase()

      return lowerQuery.split(/\s+/).every((token) => haystack.includes(token))
    })
    .sort(
      (a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category],
    )
}
