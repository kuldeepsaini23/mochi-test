/**
 * ============================================================================
 * UI RENDER - WEBSITE BUILDER COMPONENT CATALOG (SERVER-SAFE)
 * ============================================================================
 *
 * Defines the component catalog for AI-generated website builder content
 * using json-render's defineCatalog() with pre-built shadcn definitions.
 *
 * This catalog is used EXCLUSIVELY for the website builder — when the AI
 * streams a ```ui-spec code fence, the Mochi chat widget renders a live
 * preview, then on completion converts the spec to CanvasElements and
 * pushes them to the builder's Redux store.
 *
 * The catalog is server-safe (no React imports) and used for:
 *   - System prompt generation (catalog.prompt())
 *   - Spec validation (catalog.validate())
 *   - JSON Schema generation (catalog.jsonSchema())
 *
 * SOURCE OF TRUTH KEYWORDS: MochiCatalog, UIComponentCatalog, MochiUICatalog,
 * WebsiteBuilderCatalog
 * ============================================================================
 */

import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { shadcnComponentDefinitions } from '@json-render/shadcn'
import { getCustomCatalogDefinitions } from './ai-element-registry'

/**
 * The Mochi component catalog — defines UI components the AI uses to
 * preview website sections in the chat widget before pushing to the builder.
 *
 * Uses the pre-built shadcn component definitions for the PREVIEW rendering,
 * plus custom element definitions from the AI element registry (Video,
 * BulletList, CountdownTimer). Accordion is already in shadcn — not duplicated.
 *
 * The actual conversion to CanvasElements (frames, text, images, buttons,
 * faq, list, timer, video) happens in spec-to-canvas.ts after the stream completes.
 *
 * The AI uses these for a rich preview, then spec-to-canvas maps them
 * to the builder's native element types.
 */
export const mochiCatalog = defineCatalog(schema, {
  components: { ...shadcnComponentDefinitions, ...getCustomCatalogDefinitions() },
  actions: {},
})
