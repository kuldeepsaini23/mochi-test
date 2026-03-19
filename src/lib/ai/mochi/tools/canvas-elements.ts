/**
 * ============================================================================
 * CANVAS ELEMENT TOOLS — Full AI Control Over Website Builder Canvas
 * ============================================================================
 *
 * Tools that allow the AI to update properties on existing canvas elements.
 * Covers: connecting forms/products, changing text/colors/images, reordering,
 * and bulk updates across multiple elements.
 *
 * ARCHITECTURE: Tools run on the server but canvas elements live in client-side
 * Redux. Communication flows through the Mochi event system:
 * 1. Tool packages the update data into an _event
 * 2. MochiWidget receives event → calls canvasBridge.pushElementUpdates()
 * 3. Builder hook dispatches Redux updateElement() action
 *
 * The event data field `updates` is a JSON-stringified Record<string,unknown>
 * containing the property updates to apply to the target element.
 *
 * SOURCE OF TRUTH KEYWORDS: CanvasElementTools, AICanvasUpdate, ConnectFormTool
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/**
 * Helper to create an element_update event with JSON-serialized updates.
 * All canvas element tools use this to package their updates consistently.
 */
function makeUpdateEvent(
  elementType: string,
  updates: Record<string, unknown>,
  entityId: string = 'canvas-update',
) {
  return {
    feature: 'website-builder' as const,
    action: 'element_update' as const,
    entityId,
    data: {
      elementType,
      updates: JSON.stringify(updates),
    },
  }
}

/**
 * Creates all tools for updating existing canvas elements.
 * Gives the AI full control over the website builder canvas.
 */
export function createCanvasElementTools(organizationId: string, caller: TRPCCaller) {
  return {
    // ========================================================================
    // RESOURCE CONNECTION TOOLS — Connect forms, products, CMS tables
    // ========================================================================

    /**
     * Connect a form to an existing Form element on the canvas.
     */
    connectFormToElement: tool({
      description: 'Connect a form to a Form placeholder element on the website builder canvas. Use this when the user asks to connect/link a form. You need the formId (from listForms). The system finds the Form element on the current page and connects it automatically.',
      inputSchema: z.object({
        formId: z.string().describe('The form ID to connect (from listForms result)'),
        formName: z.string().describe('The form name for display'),
        formSlug: z.string().optional().describe('The form slug'),
      }),
      execute: async ({ formId, formName, formSlug }) => {
        try {
          return {
            success: true,
            message: `Connected form "${formName}" to the Form element on your page.`,
            _event: makeUpdateEvent('form', {
              formId,
              formName,
              formSlug: formSlug ?? '',
            }, formId),
          }
        } catch (err) {
          return handleToolError('connectFormToElement', err)
        }
      },
    }),

    /**
     * Connect a product/price to an existing Payment element on the canvas.
     */
    connectProductToPayment: tool({
      description: 'Connect a product and price to a Payment placeholder element on the website builder canvas. Use this when the user asks to connect a product/course to a payment form. You need the productId and priceId (from listProducts/listPrices).',
      inputSchema: z.object({
        productId: z.string().describe('The product ID to connect'),
        priceId: z.string().describe('The price ID to connect'),
        productName: z.string().describe('The product name for display'),
        priceName: z.string().optional().describe('The price name for display'),
      }),
      execute: async ({ productId, priceId, productName, priceName }) => {
        try {
          return {
            success: true,
            message: `Connected product "${productName}" to the Payment element on your page.`,
            _event: makeUpdateEvent('payment', {
              productId,
              priceId,
              productName,
              priceName: priceName ?? '',
            }, productId),
          }
        } catch (err) {
          return handleToolError('connectProductToPayment', err)
        }
      },
    }),

    // ========================================================================
    // CONTENT UPDATE TOOLS — Change text, labels, images
    // ========================================================================

    /**
     * Update text content on an existing element (heading, text, badge, button).
     * AI finds the element by type + current content match.
     */
    updateElementContent: tool({
      description: 'Update the text content of an existing element on the canvas. Use this when the user asks to change a headline, body text, button label, or badge text. Specify the element type and the current text to find it, plus the new text to replace it with.',
      inputSchema: z.object({
        elementType: z.enum(['text', 'button', 'badge']).describe('The type of element to update. Use "text" for headings AND body text (both are text elements). Use "button" for buttons. Use "badge" for badge text.'),
        currentText: z.string().describe('The current text content to identify the element (partial match OK)'),
        newText: z.string().describe('The new text content to set'),
      }),
      execute: async ({ elementType, currentText, newText }) => {
        try {
          const updateKey = elementType === 'button' ? 'label' : 'content'
          return {
            success: true,
            message: `Updated "${currentText}" → "${newText}"`,
            _event: makeUpdateEvent(
              elementType === 'badge' ? 'text' : elementType,
              { [updateKey]: newText, __matchText: currentText },
            ),
          }
        } catch (err) {
          return handleToolError('updateElementContent', err)
        }
      },
    }),

    /**
     * Update the image source on an existing Image element.
     */
    updateElementImage: tool({
      description: 'Update the image source (src) on an existing Image element on the canvas. Use this when the user asks to change, swap, or set an image. You can also update the alt text.',
      inputSchema: z.object({
        src: z.string().describe('The new image URL or path'),
        alt: z.string().optional().describe('New alt text for the image'),
      }),
      execute: async ({ src, alt }) => {
        try {
          const updates: Record<string, unknown> = { src }
          if (alt) updates.alt = alt
          return {
            success: true,
            message: `Updated image source.`,
            _event: makeUpdateEvent('image', updates),
          }
        } catch (err) {
          return handleToolError('updateElementImage', err)
        }
      },
    }),

    /**
     * Update the video source on an existing Video element.
     */
    updateElementVideo: tool({
      description: 'Set the video source on an existing Video element on the canvas. Use this when the user provides a video URL or asks to connect a video.',
      inputSchema: z.object({
        src: z.string().describe('The video URL or storage path'),
        sourceType: z.enum(['storage', 'url', 'loom']).optional().describe('Source type (default: url)'),
      }),
      execute: async ({ src, sourceType }) => {
        try {
          const updates: Record<string, unknown> = sourceType === 'loom'
            ? { loomUrl: src, sourceType: 'loom' }
            : { src, sourceType: sourceType ?? 'url' }
          return {
            success: true,
            message: `Connected video source.`,
            _event: makeUpdateEvent('video', updates),
          }
        } catch (err) {
          return handleToolError('updateElementVideo', err)
        }
      },
    }),

    // ========================================================================
    // STYLE UPDATE TOOLS — Change colors, padding, backgrounds
    // ========================================================================

    /**
     * Update visual styles on an existing element.
     * Supports any CSS-like property: backgroundColor, color, padding, etc.
     */
    updateElementStyle: tool({
      description: 'Update visual styles on an existing element on the canvas. Use this when the user asks to change colors, padding, font size, background, border radius, or any visual property. Specify the element type to find it.',
      inputSchema: z.object({
        elementType: z.enum(['frame', 'text', 'button', 'image']).describe('The type of element to update'),
        matchName: z.string().optional().describe('Element name to match (e.g., "Section", "H1", "Hero"). Helps find the right element when multiple exist.'),
        styles: z.record(z.string(), z.unknown()).describe('Style properties to update. Examples: {"backgroundColor":"#0f172a"}, {"color":"#ffffff","fontSize":48}, {"padding":32,"borderRadius":12}'),
      }),
      execute: async ({ elementType, matchName, styles }) => {
        try {
          return {
            success: true,
            message: `Updated styles on ${matchName ?? elementType} element.`,
            _event: makeUpdateEvent(elementType, {
              styles,
              ...(matchName ? { __matchName: matchName } : {}),
            }),
          }
        } catch (err) {
          return handleToolError('updateElementStyle', err)
        }
      },
    }),

    /**
     * Change the background color of a section (Card element).
     * Convenience tool — wraps updateElementStyle for the most common use case.
     */
    updateSectionBackground: tool({
      description: 'Change the background color of a section on the canvas. Use this when the user says "make the hero darker", "change the pricing section to blue", etc. Specify the section name or index to find it.',
      inputSchema: z.object({
        sectionName: z.string().optional().describe('The section name to find (e.g., "Section", "Hero", "Pricing"). If not specified, updates the first section.'),
        backgroundColor: z.string().describe('New background color (hex). Example: "#0f172a" for dark, "#ffffff" for white'),
      }),
      execute: async ({ sectionName, backgroundColor }) => {
        try {
          return {
            success: true,
            message: `Changed section background to ${backgroundColor}.`,
            _event: makeUpdateEvent('frame', {
              styles: { backgroundColor },
              ...(sectionName ? { __matchName: sectionName } : {}),
            }),
          }
        } catch (err) {
          return handleToolError('updateSectionBackground', err)
        }
      },
    }),
  }
}
