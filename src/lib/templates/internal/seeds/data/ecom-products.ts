/**
 * ============================================================================
 * E-COMMERCE PRODUCT SEED DATA
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: EcomProductSnapshots, EcomProductSourceIds,
 * ECOM_PRODUCT_SNAPSHOTS, ECOM_PRODUCT_SOURCE_IDS
 *
 * WHY: Defines the product catalog for the e-commerce seed template.
 * These snapshots are installed into target organizations during template
 * installation, creating real Product + ProductPrice records (with Stripe
 * sync handled by the installer).
 *
 * All products are ONE_TIME billing in USD with no inventory tracking.
 * The product lineup covers a streetwear-inspired collection:
 * crewnecks, hoodies, utility vests, and oversized tees.
 */

import type { ProductSnapshot } from '../../../types'

// ============================================================================
// SOURCE IDs — Stable identifiers used in the ID remap table during install.
// Order matches ECOM_PRODUCT_SNAPSHOTS so they can be zipped together.
// ============================================================================

export const ECOM_PRODUCT_SOURCE_IDS = [
  '__ecom_product_1_src__',
  '__ecom_product_2_src__',
  '__ecom_product_3_src__',
  '__ecom_product_4_src__',
  '__ecom_product_5_src__',
  '__ecom_product_6_src__',
  '__ecom_product_7_src__',
  '__ecom_product_8_src__',
  '__ecom_product_9_src__',
  '__ecom_product_10_src__',
] as const

// ============================================================================
// PRODUCT SNAPSHOTS — 10 streetwear products with one-time pricing
// ============================================================================

export const ECOM_PRODUCT_SNAPSHOTS: ProductSnapshot[] = [
  // ---- 1. Black Crewneck Sweatshirt — $55.00 ----
  {
    name: 'Black Crewneck Sweatshirt',
    description:
      'Classic black crewneck sweatshirt featuring an oversized relaxed fit. Perfect for layering or wearing solo. Made from premium heavyweight cotton fleece for ultimate comfort and durability.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679768-8597bf-brave_screenshot_gemini.google.com.png',
    images: [
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679154-696wze-brave_screenshot_gemini.google.com__10_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353675192-q0pd05-brave_screenshot_gemini.google.com__2_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353674320-1qgdz1-brave_screenshot_gemini.google.com__1_.png',
    ],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        name: 'One-Time Purchase',
        amount: 5500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },

  // ---- 2. Charcoal Hoodie — $65.00 ----
  {
    name: 'Charcoal Hoodie',
    description:
      'Premium dark gray pullover hoodie with kangaroo front pocket. Features a relaxed oversized silhouette with ribbed cuffs and hem. Soft brushed interior for all-day comfort.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679154-696wze-brave_screenshot_gemini.google.com__10_.png',
    images: [
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353675192-q0pd05-brave_screenshot_gemini.google.com__2_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353678592-cylsmp-brave_screenshot_gemini.google.com__7_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677999-doc19q-brave_screenshot_gemini.google.com__6_.png',
    ],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        name: 'One-Time Purchase',
        amount: 6500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },

  // ---- 3. Tan Utility Vest — $75.00 ----
  // NOTE: This product is used as the checkout order bump. Its price sourceId
  // is referenced by the checkout element's orderBumpPriceId field so remapIds()
  // can swap it for the newly created price ID during installation.
  {
    name: 'Tan Utility Vest',
    description:
      'Functional tan/beige utility vest with multiple pockets for storage. Features a full front zipper closure and durable construction. Perfect for layering over hoodies or tees.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353678592-cylsmp-brave_screenshot_gemini.google.com__7_.png',
    images: [
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353675971-9e7krj-brave_screenshot_gemini.google.com__3_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679768-8597bf-brave_screenshot_gemini.google.com.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679154-696wze-brave_screenshot_gemini.google.com__10_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353675192-q0pd05-brave_screenshot_gemini.google.com__2_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353674320-1qgdz1-brave_screenshot_gemini.google.com__1_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353678592-cylsmp-brave_screenshot_gemini.google.com__7_.png',
    ],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        sourceId: '__ecom_price_vest_src__',
        name: 'One-Time Purchase',
        amount: 7500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },

  // ---- 4. Light Gray Oversized T-Shirt — $35.00 ----
  {
    name: 'Light Gray Oversized T-Shirt',
    description:
      'Heavyweight boxy fit t-shirt in heather gray. Features a relaxed oversized silhouette with dropped shoulders. Made from premium cotton for a structured drape that holds its shape.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677999-doc19q-brave_screenshot_gemini.google.com__6_.png',
    images: [
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/1772755217905-f5muhv-brave_screenshot_gemini.google.com__8_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677999-doc19q-brave_screenshot_gemini.google.com__6_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353678592-cylsmp-brave_screenshot_gemini.google.com__7_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679154-696wze-brave_screenshot_gemini.google.com__10_.png',
    ],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        name: 'One-Time Purchase',
        amount: 3500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },

  // ---- 5. Olive Brown Hoodie — $65.00 ----
  {
    name: 'Olive Brown Hoodie',
    description:
      'Earth-toned brown pullover hoodie with a minimalist aesthetic. Features a cozy kangaroo pocket and relaxed fit. Rich chocolate brown color pairs with everything in your wardrobe.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677284-uon4q0-brave_screenshot_gemini.google.com__5_.png',
    images: [
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679154-696wze-brave_screenshot_gemini.google.com__10_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353675971-9e7krj-brave_screenshot_gemini.google.com__3_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679768-8597bf-brave_screenshot_gemini.google.com.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/1772755217905-f5muhv-brave_screenshot_gemini.google.com__8_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677284-uon4q0-brave_screenshot_gemini.google.com__5_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677999-doc19q-brave_screenshot_gemini.google.com__6_.png',
    ],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        name: 'One-Time Purchase',
        amount: 6500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },

  // ---- 6. Off-White Utility Vest — $75.00 ----
  {
    name: 'Off-White Utility Vest',
    description:
      'Stylish cream/ivory utility vest featuring multiple pockets and a full front zipper. Clean minimalist design with functional storage. Perfect streetwear layering piece.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353676620-pjtx7d-brave_screenshot_gemini.google.com__4_.png',
    images: [
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353674320-1qgdz1-brave_screenshot_gemini.google.com__1_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679154-696wze-brave_screenshot_gemini.google.com__10_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353675971-9e7krj-brave_screenshot_gemini.google.com__3_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677999-doc19q-brave_screenshot_gemini.google.com__6_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677284-uon4q0-brave_screenshot_gemini.google.com__5_.png',
    ],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        name: 'One-Time Purchase',
        amount: 7500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },

  // ---- 7. Dark Brown Hoodie — $65.00 ----
  {
    name: 'Dark Brown Hoodie',
    description:
      'Rich dark brown pullover hoodie with a cozy kangaroo pocket. Features a relaxed oversized fit with soft brushed interior. Deep chocolate brown color for a sophisticated look.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353675192-q0pd05-brave_screenshot_gemini.google.com__2_.png',
    images: [],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        name: 'One-Time Purchase',
        amount: 6500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },

  // ---- 8. Black Utility Vest — $75.00 ----
  {
    name: 'Black Utility Vest',
    description:
      'Versatile black utility vest with multiple functional pockets and full front zipper. Sleek tactical-inspired design perfect for urban streetwear. Layer over hoodies or tees.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353674320-1qgdz1-brave_screenshot_gemini.google.com__1_.png',
    images: [
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677999-doc19q-brave_screenshot_gemini.google.com__6_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/1772755217905-f5muhv-brave_screenshot_gemini.google.com__8_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353676620-pjtx7d-brave_screenshot_gemini.google.com__4_.png',
    ],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        name: 'One-Time Purchase',
        amount: 7500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },

  // ---- 9. Sage Green Crewneck — $55.00 ----
  {
    name: 'Sage Green Crewneck',
    description:
      'Soft sage green crewneck sweatshirt with a relaxed oversized fit. Features ribbed neckline, cuffs, and hem. Earthy green tone adds a natural vibe to any outfit.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353675971-9e7krj-brave_screenshot_gemini.google.com__3_.png',
    images: [
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677999-doc19q-brave_screenshot_gemini.google.com__6_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353678592-cylsmp-brave_screenshot_gemini.google.com__7_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677284-uon4q0-brave_screenshot_gemini.google.com__5_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353676620-pjtx7d-brave_screenshot_gemini.google.com__4_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353679154-696wze-brave_screenshot_gemini.google.com__10_.png',
    ],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        name: 'One-Time Purchase',
        amount: 5500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },

  // ---- 10. White Oversized T-Shirt — $35.00 ----
  {
    name: 'White Oversized T-Shirt',
    description:
      'Clean white heavyweight boxy t-shirt with an oversized relaxed fit. Features dropped shoulders and premium cotton construction for a structured silhouette that elevates any outfit.',
    imageUrl:
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/1772755217905-f5muhv-brave_screenshot_gemini.google.com__8_.png',
    images: [
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353676620-pjtx7d-brave_screenshot_gemini.google.com__4_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353677284-uon4q0-brave_screenshot_gemini.google.com__5_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/1772755217905-f5muhv-brave_screenshot_gemini.google.com__8_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353678592-cylsmp-brave_screenshot_gemini.google.com__7_.png',
      'https://pub-b16391d3db6b4dc5a99e67768464dcee.r2.dev/public/org-689812ea-2e9c-4d13-8c4e-aeb7db8a3af9/folder-cmmo0y8yf004k8oibupm26h0m/1773353675192-q0pd05-brave_screenshot_gemini.google.com__2_.png',
    ],
    trackInventory: false,
    allowBackorder: false,
    lowStockThreshold: null,
    prices: [
      {
        name: 'One-Time Purchase',
        amount: 3500,
        currency: 'usd',
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        installments: null,
        installmentInterval: null,
        installmentIntervalCount: null,
        active: true,
        features: [],
      },
    ],
  },
]
