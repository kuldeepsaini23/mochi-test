/**
 * ============================================================================
 * UI RENDER - REACT COMPONENT REGISTRY (CLIENT-SAFE)
 * ============================================================================
 *
 * Maps the Mochi catalog's component definitions to actual React
 * implementations using shadcn's pre-built components. This registry
 * is used by the Renderer to display json-render specs.
 *
 * Uses createRenderer which accepts a simpler ComponentMap type,
 * avoiding the complex generic inference chain of defineRegistry.
 * The shadcn components are designed to work with their definitions.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiRegistry, UIComponentRegistry
 * ============================================================================
 */

'use client'

import React from 'react'
import { createRenderer } from '@json-render/react'
import type { ComponentMap } from '@json-render/react'
import { mochiCatalog } from './catalog'
import { shadcnComponents } from '@json-render/shadcn'

// ============================================================================
// CUSTOM PREVIEW COMPONENTS — Minimal chat previews for builder-specific types
// ============================================================================
//
// These are simple preview placeholders shown in the Mochi chat widget.
// Real rendering happens on the canvas via the builder's element renderers.
// Accordion already has a shadcn preview component — no duplicate needed.
// ============================================================================

/**
 * Video preview — shows a placeholder in the chat widget.
 * The actual video element is created on the canvas by the registry converter.
 */
function VideoPreview({ props }: { props: { alt?: string } }) {
  return React.createElement('div', {
    style: {
      width: '100%',
      aspectRatio: '16/9',
      backgroundColor: '#0a0a0a',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#6b7280',
      fontSize: 14,
    },
  }, `🎬 ${props.alt || 'Video'}`)
}

/**
 * BulletList preview — renders a simple list in the chat widget.
 */
function BulletListPreview({ props }: { props: { items?: string[]; icon?: string } }) {
  const items = Array.isArray(props.items) ? props.items : []
  return React.createElement('ul', {
    style: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  }, items.map((item, i) =>
    React.createElement('li', {
      key: i,
      style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151' },
    }, React.createElement('span', { style: { color: '#3b82f6' } }, '✓'), item),
  ))
}

/**
 * CountdownTimer preview — shows a static placeholder in the chat widget.
 */
function CountdownTimerPreview({ props }: { props: { timerMode?: string } }) {
  const mode = props.timerMode === 'duration' ? 'Duration' : 'Date'
  return React.createElement('div', {
    style: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center',
      padding: '12px 0',
    },
  }, ['Days', 'Hours', 'Min', 'Sec'].map((label) =>
    React.createElement('div', {
      key: label,
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      },
    },
    React.createElement('span', { style: { fontSize: 24, fontWeight: 700, color: '#111827' } }, '00'),
    React.createElement('span', { style: { fontSize: 10, color: '#6b7280', textTransform: 'uppercase' } }, label),
    ),
  ))
}

/**
 * RichText preview — shows the initial text content in the chat widget.
 */
function RichTextPreview({ props }: { props: { content?: string; editorVariant?: string } }) {
  return React.createElement('div', {
    style: {
      padding: 8,
      backgroundColor: 'transparent',
      color: '#374151',
      fontSize: 14,
      lineHeight: 1.6,
      minHeight: 40,
    },
  }, props.content || 'Rich text content...')
}

/** Shared placeholder style for elements that need user configuration */
const placeholderStyle = {
  width: '100%',
  padding: '24px 16px',
  backgroundColor: '#f8fafc',
  border: '2px dashed #e2e8f0',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  color: '#64748b',
  fontSize: 13,
  textAlign: 'center' as const,
}

/** Form preview — shows a form placeholder in the chat widget */
function FormPreview({ props }: { props: { formName?: string } }) {
  return React.createElement('div', { style: placeholderStyle },
    React.createElement('span', { style: { fontSize: 24 } }, '📋'),
    React.createElement('span', { style: { fontWeight: 600, color: '#334155' } }, props.formName || 'Form'),
    React.createElement('span', null, 'Select form in Settings'),
  )
}

/** Payment preview — shows a payment placeholder in the chat widget */
function PaymentPreview({ props }: { props: { theme?: string } }) {
  return React.createElement('div', { style: { ...placeholderStyle, backgroundColor: props.theme === 'dark' ? '#1e293b' : '#f8fafc', color: props.theme === 'dark' ? '#94a3b8' : '#64748b' } },
    React.createElement('span', { style: { fontSize: 24 } }, '💳'),
    React.createElement('span', { style: { fontWeight: 600, color: props.theme === 'dark' ? '#e2e8f0' : '#334155' } }, 'Payment Form'),
    React.createElement('span', null, 'Select product in Settings'),
  )
}

/** AddToCartButton preview — shows the button in the chat widget */
function AddToCartButtonPreview({ props }: { props: { label?: string; variant?: string } }) {
  return React.createElement('button', {
    style: {
      padding: '10px 20px',
      backgroundColor: props.variant === 'ghost' ? 'transparent' : '#3b82f6',
      color: props.variant === 'ghost' ? '#374151' : '#ffffff',
      border: props.variant === 'outline' ? '1px solid #d1d5db' : 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      cursor: 'default',
    },
  }, props.label || 'Add to Cart')
}

/** Checkout preview — shows a checkout placeholder in the chat widget */
function CheckoutPreview({ props }: { props: { theme?: string; payButtonText?: string } }) {
  return React.createElement('div', { style: { ...placeholderStyle, backgroundColor: props.theme === 'dark' ? '#1e293b' : '#f8fafc', color: props.theme === 'dark' ? '#94a3b8' : '#64748b' } },
    React.createElement('span', { style: { fontSize: 24 } }, '🛒'),
    React.createElement('span', { style: { fontWeight: 600, color: props.theme === 'dark' ? '#e2e8f0' : '#334155' } }, 'Checkout'),
    React.createElement('span', null, props.payButtonText || 'Complete Purchase'),
  )
}

/** CartButton preview — shows a cart icon button in the chat widget */
function CartButtonPreview({ props }: { props: { label?: string } }) {
  return React.createElement('button', {
    style: {
      padding: 10,
      backgroundColor: 'transparent',
      color: '#374151',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      cursor: 'default',
    },
  }, '🛍️', props.label || '')
}

/** ProductCarousel preview — shows a carousel placeholder in the chat widget */
function ProductCarouselPreview() {
  return React.createElement('div', { style: placeholderStyle },
    React.createElement('span', { style: { fontSize: 24 } }, '🖼️'),
    React.createElement('span', { style: { fontWeight: 600, color: '#334155' } }, 'Product Carousel'),
    React.createElement('span', null, 'Add images in Settings'),
  )
}

/** CmsList preview — shows a CMS list placeholder in the chat widget */
function CmsListPreview({ props }: { props: { pageSize?: number } }) {
  return React.createElement('div', { style: placeholderStyle },
    React.createElement('span', { style: { fontSize: 24 } }, '📊'),
    React.createElement('span', { style: { fontWeight: 600, color: '#334155' } }, 'CMS List'),
    React.createElement('span', null, `Connect CMS table + drop component (${props.pageSize || 10} items/page)`),
  )
}

/** StickyNote preview — shows a colored note in the chat widget */
function StickyNotePreview({ props }: { props: { content?: string; noteColor?: string } }) {
  return React.createElement('div', {
    style: {
      padding: 20,
      backgroundColor: props.noteColor || '#fef08a',
      borderRadius: 4,
      color: '#1a1a1a',
      fontSize: 14,
      fontWeight: 500,
      minHeight: 60,
      boxShadow: '2px 2px 6px rgba(0,0,0,0.1)',
    },
  }, props.content || 'Note')
}

/** Receipt preview — shows a receipt placeholder in the chat widget */
function ReceiptPreview({ props }: { props: { theme?: string } }) {
  return React.createElement('div', { style: { ...placeholderStyle, backgroundColor: props.theme === 'dark' ? '#1e293b' : '#f8fafc', color: props.theme === 'dark' ? '#94a3b8' : '#64748b' } },
    React.createElement('span', { style: { fontSize: 24 } }, '🧾'),
    React.createElement('span', { style: { fontWeight: 600, color: props.theme === 'dark' ? '#e2e8f0' : '#334155' } }, 'Order Receipt'),
    React.createElement('span', null, 'Shows after successful payment'),
  )
}

/** Merge custom preview components with shadcn's built-in components */
const customPreviewComponents = {
  Video: VideoPreview,
  BulletList: BulletListPreview,
  CountdownTimer: CountdownTimerPreview,
  RichText: RichTextPreview,
  Form: FormPreview,
  Payment: PaymentPreview,
  AddToCartButton: AddToCartButtonPreview,
  Checkout: CheckoutPreview,
  CartButton: CartButtonPreview,
  ProductCarousel: ProductCarouselPreview,
  CmsList: CmsListPreview,
  StickyNote: StickyNotePreview,
  Receipt: ReceiptPreview,
}

const allComponents = { ...shadcnComponents, ...customPreviewComponents }

/**
 * The Mochi Renderer — pre-configured with the catalog + shadcn components
 * plus custom preview components for builder-specific element types.
 *
 * Uses createRenderer which returns a single React component that handles
 * spec rendering, state management, and visibility evaluation internally.
 * This is simpler than defineRegistry when you don't need action handlers.
 */
export const MochiRenderer = createRenderer(
  mochiCatalog,
  /**
   * Cast: shadcnComponents + custom previews are designed to work with their
   * respective catalog definitions. The types don't align perfectly because
   * defineCatalog's generic chain resolves props to 'unknown' when using
   * pre-built definitions. The runtime behavior is correct.
   */
  allComponents as unknown as ComponentMap<typeof mochiCatalog extends { data: { components: infer C } } ? C : never>,
)
