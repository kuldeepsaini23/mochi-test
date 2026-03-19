/**
 * ============================================================================
 * AI CUSTOM ELEMENT REGISTRY — Dynamic Mapping for Builder-Specific Elements
 * ============================================================================
 *
 * Central registry that maps AI component names to website builder element types.
 * Adding a new AI-generatable custom element requires ONLY adding one entry here —
 * the prompt docs, catalog definitions, and spec-to-canvas converters all auto-update.
 *
 * WHY THIS EXISTS:
 * The shadcn catalog covers generic UI components (Card, Stack, Text, etc.), but
 * the website builder has specialized element types (FAQ, List, Timer, Video) that
 * need custom conversion logic. This registry bridges that gap without hardcoding
 * each element type throughout the codebase.
 *
 * SERVER-SAFE: No React imports — uses `import type` for builder types.
 * This file can be safely imported in API routes and server components.
 *
 * SOURCE OF TRUTH KEYWORDS: AIElementRegistry, CustomAIElements, AICustomRegistry
 * ============================================================================
 */

import type {
  CanvasElement,
  ElementStyles,
  FrameElement,
  FaqElement,
  FaqItem,
  FormElement,
  PaymentElement,
  AddToCartButtonElement,
  CheckoutElement,
  CartElement,
  EcommerceCarouselElement,
  LinkElement,
  SmartCmsListElement,
  StickyNoteElement,
  ReceiptElement,
  ListElement,
  ListItem,
  RichTextElement,
  TimerElement,
  TimerSegments,
  TimerExpiryConfig,
  VideoElement,
} from '@/components/website-builder/builder-v1.2/_lib/types'
import type {
  PreBuiltElementType,
  PreBuiltDefinition,
} from '@/components/website-builder/builder-v1.2/_lib/prebuilt'
import {
  getAllPreBuiltDefinitions,
  getPreBuiltDefinition,
  getPreBuiltVariant,
} from '@/components/website-builder/builder-v1.2/_lib/prebuilt'
import {
  DEFAULT_VIDEO_PROPS,
  DEFAULT_VIDEO_STYLES,
  DEFAULT_FRAME_STYLES,
  DEFAULT_TEXT_STYLES,
  DEFAULT_LINK_STYLES,
  DEFAULT_RICH_TEXT_PROPS,
  DEFAULT_RICH_TEXT_STYLES,
  DEFAULT_FORM_PROPS,
  DEFAULT_FORM_STYLES,
  DEFAULT_PAYMENT_PROPS,
  DEFAULT_PAYMENT_STYLES,
  DEFAULT_ADD_TO_CART_BUTTON_PROPS,
  DEFAULT_ADD_TO_CART_BUTTON_STYLES,
  DEFAULT_CHECKOUT_PROPS,
  DEFAULT_CART_PROPS,
  DEFAULT_CART_STYLES,
  DEFAULT_ECOMMERCE_CAROUSEL_PROPS,
  DEFAULT_ECOMMERCE_CAROUSEL_STYLES,
  DEFAULT_SMARTCMS_LIST_PROPS,
  DEFAULT_SMARTCMS_LIST_STYLES,
  DEFAULT_STICKY_NOTE_PROPS,
  DEFAULT_STICKY_NOTE_STYLES,
  DEFAULT_RECEIPT_PROPS,
  DEFAULT_RECEIPT_STYLES,
} from '@/components/website-builder/builder-v1.2/_lib/types'
import { getAIControllableStyleKeys } from './style-defaults'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Intermediate node representation passed to element factories.
 * Mirrors the SpecNode shape from spec-to-canvas.ts without coupling.
 *
 * SOURCE OF TRUTH KEYWORDS: CustomSpecNode
 */
interface CustomSpecNode {
  specKey: string
  componentType: string
  props: Record<string, unknown>
  childKeys: string[]
}

/**
 * A single registry entry — everything needed to support one custom AI element.
 *
 * SOURCE OF TRUTH KEYWORDS: AIElementRegistryEntry, CustomElementEntry
 */
interface AIElementRegistryEntry {
  /** The AI component name used in ui-spec (e.g., "Accordion", "Video") */
  componentName: string
  /** The builder element type this maps to (e.g., "faq", "video") */
  elementType: string
  /** Whether this element can contain children in the spec */
  hasChildren: boolean
  /**
   * Whether this element already exists in the shadcn catalog.
   * If true, getCustomCatalogDefinitions() skips it to avoid duplicates.
   */
  inShadcnCatalog: boolean
  /** Zod-compatible catalog definition for json-render (null if inShadcnCatalog) */
  catalogDefinition: Record<string, unknown> | null
  /** One-line prompt documentation the AI sees in the system prompt */
  promptDoc: string
  /**
   * Factory that creates CanvasElement(s) from AI spec props.
   * Returns a single element OR an array of elements (for compound components
   * like SidebarLayout which needs a sidebar + inset frame).
   * When returning an array, the FIRST element is the primary element.
   */
  createCanvasElement: (
    node: CustomSpecNode,
    id: string,
    parentId: string | null,
    order: number,
  ) => CanvasElement | CanvasElement[]
}

// ============================================================================
// ID GENERATOR — Same pattern as generateElementId in canvas-slice.ts
// ============================================================================

/**
 * Generates a unique element ID matching the builder's ID format.
 * Inlined here to avoid importing from canvas-slice.ts (which pulls Redux).
 */
function genId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================================================
// ELEMENT FACTORIES — One per custom element type
// ============================================================================

/**
 * Creates a FaqElement from an Accordion AI spec node.
 * Maps title→question, content→answer, generates unique IDs per item.
 */
function createFaqElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): FaqElement {
  const rawItems = Array.isArray(node.props.items) ? node.props.items : []
  const items: FaqItem[] = rawItems.map((item) => {
    const raw = item as Record<string, unknown>
    return {
      id: genId(),
      question: typeof raw.title === 'string' ? raw.title : 'Question',
      answer: typeof raw.content === 'string' ? raw.content : 'Answer',
    }
  })

  /** Determine if multiple items can be open simultaneously */
  const allowMultipleOpen = node.props.type === 'multiple'

  /**
   * FAQ color overrides — the AI must set these on dark backgrounds.
   * - color: question text color (default #111111 — invisible on dark bg)
   * - answerColor → __answerColor: answer text color (default #6b7280)
   * - itemBackgroundColor → __itemBackgroundColor: per-item bg color
   */
  const questionColor = typeof node.props.color === 'string' ? node.props.color : undefined
  const answerColor = typeof node.props.answerColor === 'string' ? node.props.answerColor : undefined
  const itemBgColor = typeof node.props.itemBackgroundColor === 'string' ? node.props.itemBackgroundColor : undefined

  return {
    id,
    type: 'faq',
    name: 'FAQ',
    x: 0,
    y: 0,
    /**
     * Width set to 800 (not 0) so the FAQ's internal maxWidth calculation
     * doesn't collapse to 0px. autoWidth: true makes the outer wrapper 100%,
     * but the inner content uses element.width for maxWidth.
     */
    width: parentId ? 800 : 1200,
    height: 0,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    items,
    allowMultipleOpen,
    autoWidth: !!parentId,
    autoHeight: true,
    separatorStyle: 'line',
    iconStyle: 'chevron',
    styles: {
      ...DEFAULT_FRAME_STYLES,
      padding: 0,
      backgroundColor: 'transparent',
      ...(questionColor ? { color: questionColor } : {}),
      ...(answerColor ? { __answerColor: answerColor } : {}),
      ...(itemBgColor ? { __itemBackgroundColor: itemBgColor } : {}),
    } as ElementStyles,
  }
}

/**
 * Creates a VideoElement from a Video AI spec node.
 * Creates an empty video placeholder — user fills in the source later.
 */
function createVideoElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): VideoElement {
  const alt = typeof node.props.alt === 'string' ? node.props.alt : 'Video'

  return {
    id,
    type: 'video',
    name: alt,
    x: 0,
    y: 0,
    width: DEFAULT_VIDEO_PROPS.width,
    height: DEFAULT_VIDEO_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    sourceType: 'storage',
    src: '',
    poster: '',
    loomUrl: '',
    alt,
    objectFit: 'contain',
    posterFit: 'cover',
    autoWidth: !!parentId,
    controls: true,
    autoplay: false,
    loop: false,
    muted: false,
    styles: { ...DEFAULT_VIDEO_STYLES },
  }
}

/**
 * Creates a ListElement from a BulletList AI spec node.
 * Converts string[] items to ListItem[] with generated IDs.
 */
function createListElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): ListElement {
  const rawItems = Array.isArray(node.props.items) ? node.props.items : []
  const items: ListItem[] = rawItems.map((item) => ({
    id: genId(),
    text: typeof item === 'string' ? item : 'Item',
  }))

  const icon = typeof node.props.icon === 'string' ? node.props.icon : 'check'
  const iconColor = typeof node.props.iconColor === 'string' ? node.props.iconColor : undefined
  /**
   * Text color for list items — MUST be set explicitly on dark backgrounds
   * otherwise defaults to #111111 (dark) which is invisible on dark sections.
   */
  const textColor = typeof node.props.color === 'string' ? node.props.color : undefined

  return {
    id,
    type: 'list',
    name: 'List',
    x: 0,
    y: 0,
    /**
     * Width set to 600 (not 0) so the list's internal maxWidth calculation
     * doesn't collapse to 0px. autoWidth: true makes the outer wrapper 100%,
     * but the inner content uses element.width for maxWidth.
     */
    width: 600,
    height: 0,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    items,
    icon,
    iconSize: 16,
    ...(iconColor ? { iconColor } : {}),
    autoWidth: !!parentId,
    autoHeight: true,
    itemGap: 8,
    styles: {
      ...DEFAULT_TEXT_STYLES,
      ...(textColor ? { color: textColor } : {}),
    },
  }
}

/**
 * Creates a TimerElement from a CountdownTimer AI spec node.
 * Sets up segments, labels, and sensible defaults for countdown display.
 */
function createTimerElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): TimerElement {
  const timerMode = node.props.timerMode === 'duration' ? 'duration' : 'date' as const

  /** Default target date: 7 days from now for "date" mode */
  const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const targetDate = typeof node.props.targetDate === 'string'
    ? node.props.targetDate
    : defaultDate

  const durationSeconds = typeof node.props.durationSeconds === 'number'
    ? node.props.durationSeconds
    : 3600

  /** Show all timer segments by default */
  const segments: TimerSegments = {
    showDays: true,
    showHours: true,
    showMinutes: true,
    showSeconds: true,
  }

  /** Default expiry config — no special actions on expiry */
  const expiry: TimerExpiryConfig = {
    hideTimerOnExpiry: false,
    hideElementIds: [],
    revealElementIds: [],
  }

  /**
   * Extract AI color overrides for timer digits, labels, and separators.
   * The AI should set these based on the section's background color:
   * - color: digit text color (default #111111 — dark, BAD on dark backgrounds)
   * - labelColor → __labelColor: segment label text (D, H, M, S)
   * - separatorColor → __separatorColor: colon separator color
   */
  const digitColor = typeof node.props.color === 'string' ? node.props.color : undefined
  const labelColor = typeof node.props.labelColor === 'string' ? node.props.labelColor : undefined
  const separatorColor = typeof node.props.separatorColor === 'string' ? node.props.separatorColor : undefined

  return {
    id,
    type: 'timer',
    name: 'Countdown',
    x: 0,
    y: 0,
    width: parentId ? 0 : 600,
    height: 80,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    timerMode,
    targetDate,
    durationSeconds,
    segments,
    showLabels: true,
    labelStyle: 'short',
    separatorStyle: 'colon',
    expiry,
    autoWidth: !!parentId,
    autoHeight: true,
    styles: {
      ...DEFAULT_FRAME_STYLES,
      padding: 0,
      backgroundColor: 'transparent',
      /** Apply AI color overrides for proper contrast on dark/light backgrounds */
      ...(digitColor ? { color: digitColor } : {}),
      ...(labelColor ? { __labelColor: labelColor } : {}),
      ...(separatorColor ? { __separatorColor: separatorColor } : {}),
    } as ElementStyles,
  }
}

/**
 * Creates a FormElement placeholder from an AI spec node.
 * The form is created empty — user selects which form to connect in the
 * properties panel. AI tells user: "Select your form in the settings."
 */
function createFormElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): FormElement {
  const formName = typeof node.props.formName === 'string' ? node.props.formName : ''
  /**
   * If the AI knows which form to connect (from listing forms + user selection),
   * it passes formId and formSlug directly — pre-connecting the form.
   * No manual Settings tab step needed.
   */
  const formId = typeof node.props.formId === 'string' ? node.props.formId : ''
  const formSlug = typeof node.props.formSlug === 'string' ? node.props.formSlug : ''

  return {
    id,
    type: 'form',
    name: formName || 'Form',
    x: 0,
    y: 0,
    width: DEFAULT_FORM_PROPS.width,
    height: DEFAULT_FORM_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    formId,
    formName,
    formSlug,
    autoWidth: !!parentId,
    autoHeight: true,
    styles: { ...DEFAULT_FORM_STYLES },
  }
}

/**
 * Creates a PaymentElement placeholder from an AI spec node.
 * Payment element is created empty — user selects the product/price
 * in the properties panel. AI tells user what to configure.
 */
function createPaymentElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): PaymentElement {
  const theme = node.props.theme === 'light' ? 'light' : 'dark' as const
  /**
   * If the AI knows which product/price to connect (from listing products + user selection),
   * it passes productId, priceId, productName, priceName directly — pre-connecting the payment.
   * No manual Settings tab step needed.
   */
  const productId = typeof node.props.productId === 'string' ? node.props.productId : ''
  const priceId = typeof node.props.priceId === 'string' ? node.props.priceId : ''
  const productName = typeof node.props.productName === 'string' ? node.props.productName : ''
  const priceName = typeof node.props.priceName === 'string' ? node.props.priceName : ''

  return {
    id,
    type: 'payment',
    name: productName || 'Payment',
    x: 0,
    y: 0,
    width: DEFAULT_PAYMENT_PROPS.width,
    height: DEFAULT_PAYMENT_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    productId,
    priceId,
    productName,
    priceName,
    autoWidth: !!parentId,
    autoHeight: true,
    theme,
    styles: { ...DEFAULT_PAYMENT_STYLES },
  }
}

/**
 * Creates an AddToCartButtonElement from an AI spec node.
 * Button is created with label/variant — user configures the product
 * in the properties panel for standalone mode, or places it inside
 * a CMS list for auto-binding.
 */
function createAddToCartButtonElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): AddToCartButtonElement {
  const label = typeof node.props.label === 'string' ? node.props.label : 'Add to Cart'
  const variantMap: Record<string, AddToCartButtonElement['variant']> = {
    primary: 'primary',
    secondary: 'secondary',
    outline: 'outline',
    ghost: 'ghost',
  }
  const variant = variantMap[String(node.props.variant)] ?? 'primary'

  return {
    id,
    type: 'add-to-cart-button',
    name: label,
    x: 0,
    y: 0,
    width: DEFAULT_ADD_TO_CART_BUTTON_PROPS.width,
    height: DEFAULT_ADD_TO_CART_BUTTON_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    label,
    variant,
    autoWidth: true,
    autoHeight: true,
    styles: { ...DEFAULT_ADD_TO_CART_BUTTON_STYLES },
  }
}

/**
 * Creates a CheckoutElement from an AI spec node.
 * Checkout is created with customizable headings/labels. Connects to
 * the site's Stripe account automatically — user just needs to configure
 * theme and redirect settings.
 */
function createCheckoutElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): CheckoutElement {
  const theme = node.props.theme === 'light' ? 'light' : 'dark' as const
  const payButtonText = typeof node.props.payButtonText === 'string'
    ? node.props.payButtonText
    : DEFAULT_CHECKOUT_PROPS.payButtonText

  return {
    id,
    type: 'checkout',
    name: 'Checkout',
    x: 0,
    y: 0,
    width: DEFAULT_CHECKOUT_PROPS.width,
    height: DEFAULT_CHECKOUT_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    showCartSummary: true,
    allowQuantityChange: true,
    cartHeading: DEFAULT_CHECKOUT_PROPS.cartHeading,
    paymentHeading: DEFAULT_CHECKOUT_PROPS.paymentHeading,
    payButtonText,
    emptyCartMessage: DEFAULT_CHECKOUT_PROPS.emptyCartMessage,
    theme,
    autoWidth: !!parentId,
    autoHeight: true,
    styles: { ...DEFAULT_FRAME_STYLES, backgroundColor: 'transparent', padding: 0, overflow: 'hidden', borderRadius: 8 },
  }
}

/**
 * Creates a CartElement (shopping cart button) from an AI spec node.
 * Typically placed in headers/navbars. Opens the cart sheet on click.
 */
function createCartElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): CartElement {
  const label = typeof node.props.label === 'string' ? node.props.label : ''
  const variantMap: Record<string, CartElement['variant']> = {
    primary: 'primary',
    secondary: 'secondary',
    outline: 'outline',
    ghost: 'ghost',
  }
  const variant = variantMap[String(node.props.variant)] ?? 'ghost'

  return {
    id,
    type: 'cart',
    name: 'Cart',
    x: 0,
    y: 0,
    width: DEFAULT_CART_PROPS.width,
    height: DEFAULT_CART_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    label,
    variant,
    icon: 'shopping-bag',
    iconPosition: 'before',
    iconSize: 20,
    autoWidth: true,
    autoHeight: true,
    styles: { ...DEFAULT_CART_STYLES },
  }
}

/**
 * Creates an EcommerceCarouselElement from an AI spec node.
 * Carousel is created empty — user adds product images in the
 * properties panel. Great for product detail pages.
 */
function createEcommerceCarouselElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): EcommerceCarouselElement {
  return {
    id,
    type: 'ecommerce-carousel',
    name: 'Product Carousel',
    x: 0,
    y: 0,
    width: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.width,
    height: DEFAULT_ECOMMERCE_CAROUSEL_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    images: [],
    featuredIndex: 0,
    objectFit: 'cover',
    navigationStyle: 'thumbnails',
    thumbnailGap: 8,
    thumbnailSize: 64,
    showMore: false,
    imageBorderRadius: 8,
    autoWidth: !!parentId,
    styles: { ...DEFAULT_ECOMMERCE_CAROUSEL_STYLES },
  }
}

/**
 * Creates a SmartCmsListElement from an AI spec node.
 * List is created empty — user connects a CMS table and drops a
 * component instance into the slot. AI tells user what to configure.
 */
function createSmartCmsListElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): SmartCmsListElement {
  const pageSize = typeof node.props.pageSize === 'number' ? node.props.pageSize : 10

  return {
    id,
    type: 'smartcms-list',
    name: 'CMS List',
    x: 0,
    y: 0,
    width: parentId ? 0 : 1200,
    height: 0,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    pageSize,
    showPagination: true,
    infiniteScroll: true,
    autoWidth: !!parentId,
    autoHeight: true,
    emptyStateMessage: DEFAULT_SMARTCMS_LIST_PROPS.emptyStateMessage,
    styles: { ...DEFAULT_SMARTCMS_LIST_STYLES },
  }
}

/**
 * Creates a StickyNoteElement from an AI spec node.
 * Useful for design annotations and developer notes on the canvas.
 */
function createStickyNoteElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): StickyNoteElement {
  const content = typeof node.props.content === 'string' ? node.props.content : 'Note'
  const noteColor = typeof node.props.noteColor === 'string' ? node.props.noteColor : '#fef08a'
  const textColor = typeof node.props.textColor === 'string' ? node.props.textColor : '#1a1a1a'

  return {
    id,
    type: 'sticky-note',
    name: 'Note',
    x: 0,
    y: 0,
    width: DEFAULT_STICKY_NOTE_PROPS.width,
    height: DEFAULT_STICKY_NOTE_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    content,
    noteColor,
    textColor,
    autoHeight: false,
    autoWidth: false,
    styles: { ...DEFAULT_STICKY_NOTE_STYLES },
  }
}

/**
 * Creates a ReceiptElement from an AI spec node.
 * Receipt element displays order confirmation after payment.
 * Pairs with Payment or Checkout elements on success pages.
 */
function createReceiptElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): ReceiptElement {
  const theme = node.props.theme === 'light' ? 'light' : 'dark' as const

  return {
    id,
    type: 'receipt',
    name: 'Receipt',
    x: 0,
    y: 0,
    width: DEFAULT_RECEIPT_PROPS.width,
    height: DEFAULT_RECEIPT_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    autoWidth: !!parentId,
    theme,
    styles: { ...DEFAULT_RECEIPT_STYLES },
  }
}

/**
 * Creates a LinkElement from a Link AI spec node.
 * Wraps content as a clickable container — children are rendered inside.
 * Link is a container element (hasChildren: true) so child spec nodes
 * are parented under it in the spec tree.
 */
function createLinkElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): LinkElement {
  const href = typeof node.props.href === 'string' ? node.props.href : ''
  const label = typeof node.props.label === 'string' ? node.props.label : 'Link'
  const openInNewTab = node.props.openInNewTab === true

  return {
    id,
    type: 'link',
    name: label || 'Link',
    x: 0,
    y: 0,
    width: parentId ? 0 : 600,
    height: 0,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    linkType: 'static',
    href,
    openInNewTab,
    autoWidth: !!parentId,
    autoHeight: true,
    styles: { ...DEFAULT_LINK_STYLES },
  }
}

/**
 * Creates a RichTextElement from a RichText AI spec node.
 * Stores plain text as initial content — user can format it later
 * with the Lexical rich text editor in the builder.
 */
function createRichTextElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): RichTextElement {
  /** Extract plain text content — stored as-is, user formats in the editor */
  const content = typeof node.props.content === 'string' ? node.props.content : ''
  const editorVariant = (
    node.props.editorVariant === 'minimal' || node.props.editorVariant === 'full'
      ? node.props.editorVariant
      : 'standard'
  ) as 'minimal' | 'standard' | 'full'

  return {
    id,
    type: 'rich-text',
    name: 'Rich Text',
    x: 0,
    y: 0,
    width: DEFAULT_RICH_TEXT_PROPS.width,
    height: DEFAULT_RICH_TEXT_PROPS.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: false,
    content,
    editorVariant,
    autoWidth: !!parentId,
    autoHeight: true,
    styles: { ...DEFAULT_RICH_TEXT_STYLES },
  }
}

// ============================================================================
// AUTO-DISCOVERED PREBUILT COMPONENTS
// ============================================================================
// PreBuilt components (Navbar, Sidebar, TotalMembers, LogoCarousel, etc.)
// are auto-discovered from PREBUILT_REGISTRY. Adding a new prebuilt type
// to the registry automatically makes it available to the AI — NO factory
// functions or manual entries needed here.
//
// HOW IT WORKS:
// 1. PREBUILT_REGISTRY (builder-v1.2/_lib/prebuilt/registry.ts) is the SOURCE OF TRUTH
// 2. buildPrebuiltRegistryEntries() iterates ALL definitions and auto-generates:
//    - AI component name (PascalCase from label, e.g. "Navigation Bar" → "NavigationBar")
//    - Prompt documentation (from description + available settings props)
//    - Catalog definition (from settings structure)
//    - Generic factory function (reads defaults from registry)
// 3. AI props like logoText, links, message, textColor are applied generically
//    by checking if the settings object has matching keys.
//
// TO ADD A NEW PREBUILT TO THE AI:
// Just add it to PREBUILT_REGISTRY in registry.ts — done. Zero code here.
//
// SOURCE OF TRUTH KEYWORDS: AutoPrebuilt, PrebuiltAIBridge, GenericPrebuiltFactory
// ============================================================================

/**
 * Generates a unique prebuilt element ID matching the builder's format.
 * Format: prebuilt_[timestamp]_[random]
 */
function genPrebuiltId(): string {
  return `prebuilt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/** Generates a unique link ID for navbar/sidebar links */
function genLinkId(): string {
  return `link_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Converts a prebuilt label to an AI component name (PascalCase, no spaces).
 * "Navigation Bar" → "NavigationBar"
 * "Logo Carousel" → "LogoCarousel"
 * "Total Members" → "TotalMembers"
 */
function labelToAIName(label: string): string {
  return label.replace(/\s+/g, '')
}

/**
 * Applies well-known AI shorthand props to a prebuilt settings object.
 * This is a GENERIC function — it checks if the settings structure has
 * matching keys before applying, so it works for ANY prebuilt type.
 *
 * Supported shorthands:
 * - logoText → settings.logo.text (if settings has a logo object)
 * - ctaLabel → settings.ctaButton.label (if settings has ctaButton)
 * - message → settings.message (direct key)
 * - textColor → settings.textColor (direct key)
 * - links → settings.links (array with auto-generated IDs)
 */
function applyAIShorthandProps(
  settings: Record<string, unknown>,
  props: Record<string, unknown>,
): void {
  /** Logo text: settings.logo.text */
  if (typeof props.logoText === 'string' && settings.logo && typeof settings.logo === 'object') {
    (settings.logo as Record<string, unknown>).text = props.logoText
  }

  /** CTA button label: settings.ctaButton.label */
  if (typeof props.ctaLabel === 'string' && settings.ctaButton && typeof settings.ctaButton === 'object') {
    (settings.ctaButton as Record<string, unknown>).label = props.ctaLabel
  }

  /** Direct message key */
  if (typeof props.message === 'string' && 'message' in settings) {
    settings.message = props.message
  }

  /** Direct textColor key */
  if (typeof props.textColor === 'string' && 'textColor' in settings) {
    settings.textColor = props.textColor
  }

  /**
   * Links array — generates unique IDs for each link.
   * Supports both simple {label, href} and extended {label, href, icon} shapes.
   */
  if (Array.isArray(props.links) && 'links' in settings) {
    const defaultIcons = ['home', 'folder', 'users', 'bar-chart', 'settings']
    settings.links = (props.links as Record<string, unknown>[]).map((link, i) => ({
      id: genLinkId(),
      label: typeof link.label === 'string' ? link.label : 'Link',
      href: typeof link.href === 'string' ? link.href : '/',
      ...(typeof link.icon === 'string' ? { icon: link.icon } : {}),
      /** Auto-assign icons if settings already had icon-bearing links */
      ...(!link.icon && Array.isArray(settings.links) && (settings.links as Record<string, unknown>[])[0]?.icon
        ? { icon: defaultIcons[i % defaultIcons.length] }
        : {}),
    }))
  }
}

/**
 * Picks the best variant for a prebuilt element based on AI props.
 * - If AI passes `variant` prop, use that ID directly.
 * - If AI passes `theme: "dark"`, find a variant with "dark" in the ID.
 * - Otherwise, use the first variant.
 */
function pickVariant(
  def: PreBuiltDefinition,
  props: Record<string, unknown>,
): string {
  if (typeof props.variant === 'string') {
    /** Verify the variant exists, fall back to first if not */
    const match = def.variants.find((v) => v.id === props.variant)
    if (match) return match.id
  }

  /** Theme-based variant selection: "dark" → find a dark variant */
  if (props.theme === 'dark') {
    const dark = def.variants.find((v) => v.id.includes('dark'))
    if (dark) return dark.id
  }

  return def.variants[0].id
}

/**
 * Auto-generates AI prompt documentation from a PreBuilt definition.
 * Introspects the settings structure to list available AI props.
 */
function generatePrebuiltPromptDoc(def: PreBuiltDefinition, aiName: string): string {
  const settings = def.defaultSettings as unknown as Record<string, unknown>
  const props: string[] = []

  /** Introspect settings to determine which AI shorthand props are supported */
  if (settings.logo) props.push('`logoText` (string, brand/logo text)')
  if (settings.ctaButton) props.push('`ctaLabel` (string, CTA button text)')
  if (settings.links) {
    const hasIcons = Array.isArray(settings.links) &&
      (settings.links as Record<string, unknown>[])[0]?.icon !== undefined
    props.push(hasIcons
      ? '`links` (array of `{label, href, icon}` — icon is a lucide icon name)'
      : '`links` (array of `{label, href}` for nav items)')
  }
  if ('message' in settings) props.push('`message` (string, display text)')
  if ('textColor' in settings) props.push('`textColor` (hex, text color — MUST be light on dark bg)')

  /** Add variant prop if multiple variants exist */
  if (def.variants.length > 1) {
    const variantList = def.variants.map((v) => `"${v.id}"`).join(', ')
    props.push(`\`variant\` (${variantList})`)
  }
  /** Add theme prop if dark variant exists */
  if (def.variants.some((v) => v.id.includes('dark'))) {
    props.push('`theme` ("light" | "dark")')
  }

  const propsStr = props.length > 0 ? ` Props: ${props.join(', ')}.` : ' No required props.'

  return `**${aiName}** — Pre-built: ${def.description}${propsStr} ` +
    `ALWAYS use this instead of manually building it from basic elements. ` +
    `User can customize all details in the Settings panel.`
}

/**
 * Auto-generates a catalog definition from a PreBuilt definition.
 * Creates a minimal json-render schema so the AI can output valid JSONL.
 */
function generatePrebuiltCatalogDef(def: PreBuiltDefinition): Record<string, unknown> {
  const settings = def.defaultSettings as unknown as Record<string, unknown>
  const props: Record<string, unknown> = {}

  if (settings.logo) props.logoText = { type: 'string', nullable: true, description: 'Logo/brand text' }
  if (settings.ctaButton) props.ctaLabel = { type: 'string', nullable: true, description: 'CTA button text' }
  if (settings.links) props.links = { type: 'array', nullable: true, description: 'Navigation links' }
  if ('message' in settings) props.message = { type: 'string', nullable: true, description: 'Display text' }
  if ('textColor' in settings) props.textColor = { type: 'string', nullable: true, description: 'Text color hex' }
  if (def.variants.length > 1 || def.variants.some((v) => v.id.includes('dark'))) {
    props.variant = { type: 'string', nullable: true, description: 'Variant ID' }
    props.theme = { type: 'string', nullable: true, description: '"light" or "dark"' }
  }

  return { props, description: def.description }
}

/**
 * Generic factory that creates ANY prebuilt element from PREBUILT_REGISTRY data.
 * Reads defaults (dimensions, styles, settings) from the registry definition
 * and applies AI shorthand props generically.
 *
 * Special case: Sidebar elements also create a companion inset FrameElement
 * (detected by checking if the element type has an 'insetFrameId' requirement
 * via the 'inset' key in settings).
 */
function createGenericPrebuiltElement(
  prebuiltType: PreBuiltElementType,
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): CanvasElement | CanvasElement[] {
  const def = getPreBuiltDefinition(prebuiltType)
  if (!def) throw new Error(`[ai-element-registry] PreBuilt definition not found: ${prebuiltType}`)

  /** Pick variant based on AI props (variant ID or theme) */
  const variantId = pickVariant(def, node.props)
  const variant = getPreBuiltVariant(prebuiltType, variantId) ?? def.variants[0]

  /** Deep-merge settings: definition defaults → variant overrides → AI props */
  const mergedSettings = {
    ...structuredClone(def.defaultSettings),
    ...structuredClone(variant.defaultSettings ?? {}),
  } as Record<string, unknown>

  /** Apply AI shorthand props (logoText, links, message, etc.) */
  applyAIShorthandProps(mergedSettings, node.props)

  /**
   * Use the converter-provided ID so specKeyToCanvasId mapping stays consistent.
   * This ensures the converter can track this element if anything references it.
   */
  const prebuiltId = id

  /**
   * Extract AI style overrides — the AI can set backgroundColor, padding,
   * borderRadius, gap, and other frame-like style properties on prebuilt
   * components. We read the AI-controllable keys for 'frame' (since prebuilts
   * support frame-like styling) and pull matching values from the AI's props.
   *
   * Example: AI outputs {"type":"NavigationBar","props":{"logoText":"Acme","backgroundColor":"#0f172a","borderRadius":0}}
   * → "logoText" is handled by applyAIShorthandProps (settings)
   * → "backgroundColor" and "borderRadius" are extracted here (styles)
   */
  const aiStyleKeys = getAIControllableStyleKeys('frame')
  const styleOverrides: Record<string, unknown> = {}
  for (const key of aiStyleKeys) {
    if (key in node.props && node.props[key] !== undefined && node.props[key] !== null) {
      styleOverrides[key] = node.props[key]
    }
  }

  /** Base element shape — same fields as the canvas drag handler creates */
  const baseElement = {
    id: prebuiltId,
    type: 'prebuilt' as const,
    prebuiltType,
    variant: variantId,
    name: variant.label || def.label,
    x: 0,
    y: 0,
    width: variant.defaultWidth,
    height: variant.defaultHeight,
    parentId,
    order,
    visible: true,
    locked: false,
    autoWidth: !!parentId,
    /** Merge: variant defaults → AI style overrides (AI has final say) */
    styles: { ...variant.defaultStyles, ...styleOverrides } as ElementStyles,
    settings: mergedSettings,
  }

  /**
   * Sidebar special case: needs a companion inset FrameElement.
   * Detected by checking if the settings have an 'inset' configuration
   * (which contains the inset area's background color).
   */
  if (mergedSettings.inset && typeof mergedSettings.inset === 'object') {
    const insetFrameId = `inset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const insetSettings = mergedSettings.inset as Record<string, unknown>
    const insetBg = typeof insetSettings.backgroundColor === 'string'
      ? insetSettings.backgroundColor
      : '#f5f5f5'

    /** Attach insetFrameId to the sidebar element */
    const sidebarElement = { ...baseElement, insetFrameId } as unknown as CanvasElement

    /**
     * Create the inset content frame — a real FrameElement parented under
     * the sidebar. Users can select it, style it, and drop content into it.
     */
    const insetFrame: FrameElement = {
      id: insetFrameId,
      type: 'frame',
      name: 'Sidebar Content',
      x: 0,
      y: 0,
      width: 0,
      height: variant.defaultHeight,
      parentId: prebuiltId,
      order: 0,
      visible: true,
      locked: false,
      container: true,
      autoWidth: true,
      styles: {
        ...DEFAULT_FRAME_STYLES,
        backgroundColor: insetBg,
        padding: 24,
        flex: 1,
        alignSelf: 'stretch',
        flexDirection: 'column',
        flexWrap: 'wrap',
        overflow: 'hidden',
      } as ElementStyles,
    }

    return [sidebarElement, insetFrame]
  }

  return baseElement as unknown as CanvasElement
}

/**
 * Auto-generates AIElementRegistryEntry entries for ALL prebuilt components
 * in PREBUILT_REGISTRY. Called once at module load — entries are merged
 * into CUSTOM_ELEMENT_REGISTRY alongside manual element entries.
 *
 * This is the bridge that makes "add to PREBUILT_REGISTRY → AI knows it"
 * work with zero additional code. Each prebuilt gets:
 * - componentName: PascalCase from label (e.g. "NavigationBar")
 * - promptDoc: auto-generated from description + settings introspection
 * - catalogDefinition: auto-generated from settings structure
 * - createCanvasElement: generic factory that reads from the registry
 */
function buildPrebuiltRegistryEntries(): AIElementRegistryEntry[] {
  return getAllPreBuiltDefinitions().map((def) => {
    const aiName = labelToAIName(def.label)
    return {
      componentName: aiName,
      elementType: 'prebuilt',
      hasChildren: false,
      inShadcnCatalog: false,
      catalogDefinition: generatePrebuiltCatalogDef(def),
      promptDoc: generatePrebuiltPromptDoc(def, aiName),
      createCanvasElement: (
        node: CustomSpecNode,
        id: string,
        parentId: string | null,
        order: number,
      ) => createGenericPrebuiltElement(def.type, node, id, parentId, order),
    }
  })
}

// ============================================================================
// REGISTRY — Add new custom elements here
// ============================================================================

/**
 * The custom element registry. Each entry fully describes how to:
 * 1. Document the element in the AI prompt
 * 2. Register it in the json-render catalog (if not already in shadcn)
 * 3. Convert it from AI spec → CanvasElement
 *
 * To add a new AI-generatable element, add ONE entry here.
 * Everything else (prompt, catalog, converter) auto-updates.
 *
 * SOURCE OF TRUTH KEYWORDS: CUSTOM_ELEMENT_REGISTRY, AIElementEntries
 */
const CUSTOM_ELEMENT_REGISTRY: AIElementRegistryEntry[] = [
  {
    componentName: 'Accordion',
    elementType: 'faq',
    hasChildren: false,
    inShadcnCatalog: true,
    catalogDefinition: null,
    promptDoc: '**Accordion** — Expandable FAQ section. Props: `items` (array of `{title, content}`), `type` ("single" | "multiple"), `color` (hex — question text color, MUST be light on dark bg), `answerColor` (hex — answer text color), `itemBackgroundColor` (hex — per-item bg). Converts to FAQ element on canvas with collapsible question/answer pairs.',
    createCanvasElement: createFaqElement,
  },
  {
    componentName: 'Video',
    elementType: 'video',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        alt: { type: 'string', description: 'Descriptive alt text for the video' },
      },
      description: 'Video placeholder — user adds the source in the builder.',
    },
    promptDoc: '**Video** — Video placeholder element. Props: `alt` (string, description). Creates an empty video container — the user uploads or links the video source in the builder properties panel.',
    createCanvasElement: createVideoElement,
  },
  {
    componentName: 'BulletList',
    elementType: 'list',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        items: { type: 'array', items: { type: 'string' }, description: 'List item texts' },
        icon: { type: 'string', nullable: true, description: 'Icon name (default: "check")' },
        iconColor: { type: 'string', nullable: true, description: 'Icon color hex' },
      },
      description: 'Styled bullet list with optional icons.',
    },
    promptDoc: '**BulletList** — Styled list with icons. Props: `items` (string[]), `icon` (string, default "check"), `iconColor` (hex color), `color` (hex — text color, MUST set to light color on dark backgrounds). Great for feature lists, benefits, requirements.',
    createCanvasElement: createListElement,
  },
  {
    componentName: 'CountdownTimer',
    elementType: 'timer',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        timerMode: { type: 'enum', values: ['date', 'duration'], description: 'Countdown to a date or a fixed duration' },
        targetDate: { type: 'string', nullable: true, description: 'ISO date string for "date" mode' },
        durationSeconds: { type: 'number', nullable: true, description: 'Duration in seconds for "duration" mode' },
      },
      description: 'Countdown timer — counts down to a date or for a duration.',
    },
    promptDoc: '**CountdownTimer** — Countdown display. Props: `timerMode` ("date" | "duration"), `targetDate` (ISO date for date mode), `durationSeconds` (number for duration mode), `color` (hex — digit text color, MUST set to light color on dark backgrounds), `labelColor` (hex — D/H/M/S label color), `separatorColor` (hex — colon separator color). Shows days/hours/minutes/seconds segments.',
    createCanvasElement: createTimerElement,
  },
  {
    componentName: 'Link',
    elementType: 'link',
    hasChildren: true,
    inShadcnCatalog: true,
    catalogDefinition: null,
    promptDoc: '**Link** — Clickable wrapper. Props: `label` (string), `href` (string URL). Wraps children as a navigable link. User can set the URL in the builder properties panel.',
    createCanvasElement: createLinkElement,
  },
  {
    componentName: 'RichText',
    elementType: 'rich-text',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        content: { type: 'string', description: 'Initial plain text content' },
        editorVariant: { type: 'string', nullable: true, description: 'Editor mode: "minimal", "standard", or "full"' },
      },
      description: 'Rich text block with formatting — user customizes in the Lexical editor.',
    },
    promptDoc: '**RichText** — Formatted text block. Props: `content` (string, initial text), `editorVariant` ("minimal" | "standard" | "full"). Creates a rich text editor element — user can add formatting, headings, lists, and links in the builder.',
    createCanvasElement: createRichTextElement,
  },
  {
    componentName: 'Form',
    elementType: 'form',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        formName: { type: 'string', nullable: true, description: 'Display name for the form placeholder' },
      },
      description: 'Form element — user selects which form to connect in the builder.',
    },
    promptDoc: '**Form** — Embeds a form from the Form Builder. Props: `formName` (string, label), `formId` (string, connects the form automatically if provided), `formSlug` (string, form slug). If you know the form ID (from listing forms), pass `formId` to pre-connect it. Otherwise creates a placeholder.',
    createCanvasElement: createFormElement,
  },
  {
    componentName: 'Payment',
    elementType: 'payment',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        theme: { type: 'string', nullable: true, description: '"dark" or "light" theme' },
      },
      description: 'Payment/checkout form — user selects product in the builder.',
    },
    promptDoc: '**Payment** — Stripe payment form. Props: `theme` ("dark" | "light"), `productId` (string, connects product automatically if provided), `priceId` (string), `productName` (string), `priceName` (string). If you know the product/price IDs (from listing products), pass them to pre-connect. Otherwise creates a placeholder.',
    createCanvasElement: createPaymentElement,
  },
  {
    componentName: 'AddToCartButton',
    elementType: 'add-to-cart-button',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        label: { type: 'string', description: 'Button label text' },
        variant: { type: 'string', nullable: true, description: '"primary", "secondary", "outline", or "ghost"' },
      },
      description: 'Add-to-cart button for ecommerce — user configures product in builder.',
    },
    promptDoc: '**AddToCartButton** — Ecommerce add-to-cart button. Props: `label` (string, default "Add to Cart"), `variant` ("primary" | "secondary" | "outline" | "ghost"). Tell user to select the product in Settings, or place inside a CMS list for auto-binding.',
    createCanvasElement: createAddToCartButtonElement,
  },
  {
    componentName: 'Checkout',
    elementType: 'checkout',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        theme: { type: 'string', nullable: true, description: '"dark" or "light" theme' },
        payButtonText: { type: 'string', nullable: true, description: 'Custom pay button text' },
      },
      description: 'Full checkout form with cart summary + Stripe payment.',
    },
    promptDoc: '**Checkout** — Full checkout page with cart summary and Stripe payment. Props: `theme` ("dark" | "light"), `payButtonText` (string, default "Complete Purchase"). Works with AddToCartButton and Cart elements for a complete ecommerce flow.',
    createCanvasElement: createCheckoutElement,
  },
  {
    componentName: 'CartButton',
    elementType: 'cart',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        label: { type: 'string', nullable: true, description: 'Optional button label (icon-only by default)' },
        variant: { type: 'string', nullable: true, description: '"primary", "secondary", "outline", or "ghost"' },
      },
      description: 'Shopping cart icon button — opens cart sheet on click.',
    },
    promptDoc: '**CartButton** — Shopping cart icon button for headers/navbars. Props: `label` (string, empty = icon-only), `variant` ("ghost" default). Shows cart item count badge. Place in your site header for ecommerce.',
    createCanvasElement: createCartElement,
  },
  {
    componentName: 'ProductCarousel',
    elementType: 'ecommerce-carousel',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {},
      description: 'Product image carousel with thumbnails — user adds images in builder.',
    },
    promptDoc: '**ProductCarousel** — Image carousel with thumbnail navigation. No required props. Creates an empty carousel — tell user to add product images in the Settings tab. Great for product detail pages.',
    createCanvasElement: createEcommerceCarouselElement,
  },
  {
    componentName: 'CmsList',
    elementType: 'smartcms-list',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        pageSize: { type: 'number', nullable: true, description: 'Items per page (default 10)' },
      },
      description: 'Dynamic CMS list — user connects a CMS table and drops a component template.',
    },
    promptDoc: '**CmsList** — Dynamic list that repeats a component for each CMS row. Props: `pageSize` (number, default 10). Creates a CMS list — tell user to: 1) connect a CMS table in Settings, 2) drop a component instance as the template. Supports infinite scroll and pagination.',
    createCanvasElement: createSmartCmsListElement,
  },
  {
    componentName: 'StickyNote',
    elementType: 'sticky-note',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        content: { type: 'string', description: 'Note text content' },
        noteColor: { type: 'string', nullable: true, description: 'Background color (default yellow #fef08a)' },
      },
      description: 'Design annotation — sticky note for developer/designer notes.',
    },
    promptDoc: '**StickyNote** — Canvas annotation note. Props: `content` (string), `noteColor` (hex, default "#fef08a"). Not visible on published site — use for design notes, TODOs, or instructions for the team.',
    createCanvasElement: createStickyNoteElement,
  },
  {
    componentName: 'Receipt',
    elementType: 'receipt',
    hasChildren: false,
    inShadcnCatalog: false,
    catalogDefinition: {
      props: {
        theme: { type: 'string', nullable: true, description: '"dark" or "light" theme' },
      },
      description: 'Order receipt/confirmation display — shows after successful payment.',
    },
    promptDoc: '**Receipt** — Order confirmation display. Props: `theme` ("dark" | "light"). Shows payment receipt after successful checkout. Place on a success/thank-you page that Payment or Checkout redirects to.',
    createCanvasElement: createReceiptElement,
  },

  // ========================================================================
  // PREBUILT COMPONENTS — Auto-discovered from PREBUILT_REGISTRY.
  // Adding a new prebuilt type to the registry AUTOMATICALLY adds it here.
  // No manual entries, no factory functions needed.
  // ========================================================================
  ...buildPrebuiltRegistryEntries(),
]

// ============================================================================
// PUBLIC API — Used by catalog.ts, spec-to-canvas.ts, prompts.ts
// ============================================================================

/** Fast lookup set for isCustomAIElement checks */
const _registeredNames = new Set(CUSTOM_ELEMENT_REGISTRY.map((e) => e.componentName))

/**
 * Checks if a component type is a registered custom AI element.
 * Used in spec-to-canvas.ts to intercept before the unknown-type fallback.
 */
export function isCustomAIElement(componentType: string): boolean {
  return _registeredNames.has(componentType)
}

/**
 * Creates CanvasElement(s) for a custom AI element by delegating to its
 * registered factory function. Call this ONLY after isCustomAIElement() returns true.
 *
 * Returns an array of elements — most entries return a single element wrapped
 * in an array, but compound components (e.g., SidebarLayout) may return multiple
 * elements (sidebar + inset frame). The FIRST element is always the primary one.
 *
 * @param node - The spec node with componentType, props, and childKeys
 * @param id - Pre-generated canvas element ID
 * @param parentId - Parent canvas element ID (null for root)
 * @param order - Child ordering index
 */
export function createCustomCanvasElement(
  node: CustomSpecNode,
  id: string,
  parentId: string | null,
  order: number,
): CanvasElement[] {
  const entry = CUSTOM_ELEMENT_REGISTRY.find((e) => e.componentName === node.componentType)
  if (!entry) {
    /** Fallback should never happen if isCustomAIElement was checked first */
    throw new Error(`[ai-element-registry] No entry for component: ${node.componentType}`)
  }
  const result = entry.createCanvasElement(node, id, parentId, order)
  /** Normalize to array — most factories return a single element */
  return Array.isArray(result) ? result : [result]
}

/**
 * Returns catalog definitions for custom elements NOT already in the shadcn catalog.
 * Spread these into defineCatalog's components alongside shadcnComponentDefinitions.
 *
 * Accordion is excluded because it already exists in shadcnComponentDefinitions.
 */
export function getCustomCatalogDefinitions(): Record<string, Record<string, unknown>> {
  const defs: Record<string, Record<string, unknown>> = {}
  for (const entry of CUSTOM_ELEMENT_REGISTRY) {
    if (!entry.inShadcnCatalog && entry.catalogDefinition) {
      defs[entry.componentName] = entry.catalogDefinition
    }
  }
  return defs
}

/**
 * Auto-generates the prompt documentation section for custom AI elements.
 * SEPARATES prebuilt components from regular custom elements so the AI
 * clearly understands prebuilts are SINGLE self-contained components
 * (one JSONL line, NO children), not multi-element compositions.
 *
 * SOURCE OF TRUTH KEYWORDS: buildCustomElementDocs, AIElementDocs
 */
export function buildCustomElementDocs(): string {
  /** Split entries: regular custom elements vs prebuilt components */
  const regularEntries = CUSTOM_ELEMENT_REGISTRY.filter((e) => e.elementType !== 'prebuilt')
  const prebuiltEntries = CUSTOM_ELEMENT_REGISTRY.filter((e) => e.elementType === 'prebuilt')

  const regularLines = regularEntries.map((entry) => `- ${entry.promptDoc}`)
  const prebuiltLines = prebuiltEntries.map((entry) => `- ${entry.promptDoc}`)

  const sections: string[] = []

  if (regularLines.length > 0) {
    sections.push(`**Custom builder elements** (map to specialized canvas element types):\n${regularLines.join('\n')}`)
  }

  if (prebuiltLines.length > 0) {
    sections.push(
      `**Pre-built components** (SINGLE self-contained elements — use ONE JSONL line, NO children):\n` +
      `These are COMPLETE, production-ready components. Each one is a SINGLE element in the ui-spec — ` +
      `do NOT add children to them. They render their own internal UI from settings/props.\n` +
      `When the user asks for a navbar, sidebar, logo carousel, or social proof — output ONE line:\n` +
      `\`{"op":"add","path":"/elements/nav","value":{"type":"NavigationBar","props":{"logoText":"Brand"}}}\`\n` +
      `Do NOT build these manually from Card/Stack/Text/Button — the prebuilt versions have ` +
      `mobile responsiveness, animations, and polish that basic elements cannot replicate.\n` +
      `${prebuiltLines.join('\n')}`
    )
  }

  return sections.join('\n\n')
}
