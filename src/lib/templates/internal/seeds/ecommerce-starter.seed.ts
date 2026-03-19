/**
 * ============================================================================
 * E-COMMERCE STARTER SEED TEMPLATE
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: EcommerceStarterTemplate, InternalTemplate,
 * EcommerceStarterSeed, EcommerceSeedCanvasData, EcommerceClothingBrand
 *
 * WHY: Provides a fully-designed e-commerce clothing store with 10 real products,
 * a storefront page with CMS-driven product grid, checkout with order bump,
 * order confirmation with receipt, and a dynamic product details page.
 * This seed is installed when a user enables e-commerce on their website
 * via the internal template system.
 *
 * WHAT IT INSTALLS:
 * 1. 10 clothing products (crewnecks, hoodies, utility vests, t-shirts) with
 *    one-time pricing — so the store is immediately populated
 * 2. A website with enableEcommerce=true containing:
 *    - /shop — storefront with navbar, hero banner, CMS product grid, footer
 *    - /checkout — checkout page with order bump (Tan Utility Vest) + cart summary
 *    - /order-confirmation — receipt display with confirmation messaging
 *    - /details — dynamic CMS-bound product detail page with gallery + FAQ
 * 3. 4 local components: Global Navigation, Ecom Product Card, Product Details, Checkout Navbar
 * 4. 4 saved colors: gradient backgrounds, border gradient, text gradient, light text
 *
 * DATA SOURCE:
 * All canvas data, component trees, and styles are exported from a real
 * fully-designed website (previewId: zCeXjfsz). Element IDs are preserved
 * from the original build for cross-reference integrity.
 *
 * INSTALL ORDER:
 * 1. Products (order: 0) — no dependencies, created first
 * 2. Website (order: 10) — pages reference components + CMS by ID, remapped in second pass
 */

import type { InternalTemplate } from '../types'
import type { WebsiteSnapshot } from '../../types'

/** Product snapshots and their stable source IDs for the remap table */
import {
  ECOM_PRODUCT_SNAPSHOTS,
  ECOM_PRODUCT_SOURCE_IDS,
} from './data/ecom-products'

/** Local component definitions (navbar, product card, product details, checkout navbar) */
import { ECOM_LOCAL_COMPONENTS } from './data/ecom-components'

/** Full canvas data for each page — exported from the real designed website */
import {
  STORE_PAGE_CANVAS_DATA,
  CHECKOUT_PAGE_CANVAS_DATA,
  ORDER_CONFIRMATION_CANVAS_DATA,
  PRODUCT_DETAILS_CANVAS_DATA,
} from './data/ecom-pages'

// ============================================================================
// SOURCE IDS — Stable IDs for pages and the website itself
// ============================================================================

/**
 * Source IDs for pages — these are the original page IDs from the source website.
 * They're used in the remap table so cross-references (e.g., navbar links pointing
 * to page IDs, checkout redirect to confirmation page) get remapped correctly.
 */
const PAGE_SOURCE_IDS = {
  /** Store/shop listing page */
  STORE: 'page_1772828808957_raun56i',
  /** Checkout page with cart + payment */
  CHECKOUT: 'cmmoai4sb008p8obe7ugridpe',
  /** Order confirmation page with receipt */
  ORDER_CONFIRMATION: 'cmmoai4t7008r8obeqls8wboe',
  /** Dynamic product details page (CMS-bound) */
  PRODUCT_DETAILS: 'page_1773376043300_6elrkms',
} as const

/**
 * Source ID for the CMS table — the product catalog table that backs the
 * SmartCMS list on the store page and the dynamic product details page.
 * This ID appears in cmsTableId fields and gets remapped during installation.
 */
const CMS_TABLE_SOURCE_ID = 'cmmo6za0b00548obep205xvlu'

// ============================================================================
// SAVED COLORS — Brand palette from the source website
// ============================================================================

/**
 * Saved color palette entries from the original e-commerce website.
 * These colors are referenced by elements in the canvas data — without them,
 * installed templates would show broken color references.
 */
const ECOM_SAVED_COLORS: WebsiteSnapshot['savedColors'] = [
  {
    name: 'Gradient Card Background',
    color: '{"type":"gradient","gradient":{"type":"linear","angle":180,"stops":[{"id":"stop_1772683080498_y1ih44a","color":"#090a0f","position":0},{"id":"stop_1772683080498_3ujshbr","color":"#1a1c21","position":100}]}}',
    sortOrder: 1,
  },
  {
    name: 'Border gradient',
    color: '{"type":"gradient","gradient":{"type":"linear","angle":320,"stops":[{"id":"stop_1772678014055_ahtuetf","color":"#202426","position":74},{"id":"stop_1772678014055_19s0ofh","color":"#797b80","position":100}]}}',
    sortOrder: 2,
  },
  {
    name: 'Title gradient text',
    color: '{"type":"gradient","gradient":{"type":"linear","angle":316,"stops":[{"id":"stop_1772692808575_cs38p8o","color":"#050a0d","position":6},{"id":"stop_1772692860102_rlker63","color":"#dbe7ff","position":72},{"id":"stop_1772692869305_zx865am","color":"#dbe7ff","position":72},{"id":"stop_1772692855870_xdaniyr","color":"#e8f0ff","position":88},{"id":"stop_1772692808575_1i9bfk6","color":"#dbe7ff","position":100}]}}',
    sortOrder: 3,
  },
  {
    name: 'Light text',
    color: '#555555',
    sortOrder: 4,
  },
]

// ============================================================================
// WEBSITE SNAPSHOT — Full e-commerce store with 4 pages + 4 components
// ============================================================================

/**
 * Complete website snapshot for the e-commerce clothing store.
 * Includes all 4 pages, 4 local components, and the saved color palette.
 *
 * Pages:
 * - /shop — storefront with CMS-driven product grid using Ecom Product Card component
 * - /checkout — checkout with order bump referencing the Tan Utility Vest
 * - /order-confirmation — payment success page with receipt element
 * - /details — dynamic product page bound to CMS table columns
 *
 * Local Components:
 * - Global Navigation — sticky navbar with logo, links, cart button
 * - Ecom Product Card — reusable card with image, title, price, add-to-cart
 * - Product Details Component — full PDP with carousel, title, price, description, FAQ
 * - Checkout Navbar — simplified navigation for checkout/confirmation flow
 */
const ECOMMERCE_WEBSITE_SNAPSHOT: WebsiteSnapshot = {
  name: 'E-Commerce Store',
  description: null,
  enableEcommerce: true,
  chatWidgetId: null,
  savedColors: ECOM_SAVED_COLORS,
  localComponents: ECOM_LOCAL_COMPONENTS,
  pages: [
    {
      sourceId: PAGE_SOURCE_IDS.STORE,
      name: 'Shop',
      slug: 'shop',
      canvasData: STORE_PAGE_CANVAS_DATA,
      cmsTableId: null,
      cmsSlugColumnSlug: null,
      order: 0,
      isEcommercePage: false,
    },
    {
      sourceId: PAGE_SOURCE_IDS.CHECKOUT,
      name: 'Checkout',
      slug: 'checkout',
      canvasData: CHECKOUT_PAGE_CANVAS_DATA,
      cmsTableId: null,
      cmsSlugColumnSlug: null,
      order: 1,
      isEcommercePage: true,
    },
    {
      sourceId: PAGE_SOURCE_IDS.ORDER_CONFIRMATION,
      name: 'Order Confirmation',
      slug: 'order-confirmation',
      canvasData: ORDER_CONFIRMATION_CANVAS_DATA,
      cmsTableId: null,
      cmsSlugColumnSlug: null,
      order: 2,
      isEcommercePage: true,
    },
    {
      sourceId: PAGE_SOURCE_IDS.PRODUCT_DETAILS,
      name: 'Product Details',
      slug: 'details',
      canvasData: PRODUCT_DETAILS_CANVAS_DATA,
      /** CMS table ID — gets remapped during install to the new org's table */
      cmsTableId: CMS_TABLE_SOURCE_ID,
      cmsSlugColumnSlug: 'product_name',
      order: 3,
      isEcommercePage: false,
    },
  ],
}

// ============================================================================
// EXPORTED TEMPLATE — The complete e-commerce starter bundle
// ============================================================================

/**
 * E-Commerce Starter internal template.
 *
 * Installs 10 clothing products and a fully-designed e-commerce website with
 * storefront, checkout, order confirmation, and dynamic product detail pages.
 * This is the default template installed when a user enables e-commerce.
 *
 * INSTALL ORDER:
 * 1. Products (order: 0) — 10 clothing items, no dependencies, created first
 * 2. Website (order: 10) — pages + components + colors, merged into existing website
 *
 * WHY no dependency between products and website:
 * The checkout page uses a generic CheckoutElement that reads from the cart
 * at runtime — not a hardcoded product reference. The storefront page uses
 * a SmartCMS list that reads from the CMS table (auto-synced from the store).
 * Products just ensure the store isn't empty on first load.
 */
export const ECOMMERCE_STARTER_TEMPLATE: InternalTemplate = {
  id: 'ecommerce-starter',
  name: 'E-Commerce Starter',
  description:
    'A fully-designed e-commerce clothing store with 10 products, storefront, checkout with order bump, order confirmation, and dynamic product details page.',
  category: 'WEBSITE',
  items: [
    /**
     * Product items — one per clothing product.
     * All created at order: 0 (no dependencies between them).
     * Each gets a stable source ID for remap table lookups.
     */
    ...ECOM_PRODUCT_SNAPSHOTS.map((snapshot, index) => ({
      id: `__ecom_product_${index + 1}__`,
      featureType: 'PRODUCT' as const,
      sourceName: snapshot.name,
      sourceId: ECOM_PRODUCT_SOURCE_IDS[index],
      snapshot,
      dependsOn: [] as string[],
      order: 0,
    })),

    /**
     * Website item — the complete store with all pages and components.
     * Installed at order: 10 (after products, though no hard dependency).
     * When installed into an existing website, pages are merged via
     * installWebsitePagesIntoExisting() with slug collision handling.
     */
    {
      id: '__ecom_website__',
      featureType: 'WEBSITE',
      sourceName: 'E-Commerce Store',
      sourceId: '__ecom_website_src__',
      snapshot: ECOMMERCE_WEBSITE_SNAPSHOT,
      dependsOn: [],
      order: 10,
    },
  ],
}
