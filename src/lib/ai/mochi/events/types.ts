/**
 * ============================================================================
 * MOCHI AI EVENTS - TYPE DEFINITIONS
 * ============================================================================
 *
 * Typed event system for real-time UI feedback from Mochi AI tool actions.
 * Tools emit events via `_event` in their success results. The client-side
 * event bus broadcasts them to subscribed components (builders, widget).
 *
 * SOURCE OF TRUTH KEYWORDS: MochiAIEvent, MochiEventFeature, MochiEventAction
 * ============================================================================
 */

/** Features that can emit events — extend this union as new builders are added */
export type MochiEventFeature = 'invoice' | 'contract' | 'form' | 'ui-render' | 'website-builder'

/**
 * Event actions — common vocabulary across all features.
 *
 * CRUD: 'created' / 'updated' / 'deleted' / 'sent'
 * Lists: 'items_changed' (invoice items, form elements)
 * Leads: 'recipient_set' (assigning a lead/customer)
 * Navigation: 'navigate' (navigate to a feature's builder/viewer)
 *
 * Content fence streaming (modular):
 * 'contract_content' — Streaming markdown chunk for the contract builder
 * 'contract_content_complete' — Contract markdown fence closed, do final processing
 *
 * These content fence actions are part of the modular stream architecture.
 * Future features (email, forms) would add their own *_content actions.
 */
export type MochiEventAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'sent'
  | 'items_changed'
  | 'recipient_set'
  | 'navigate'
  | 'contract_content'
  | 'contract_content_complete'
  | 'ui_spec_content'
  | 'ui_spec_content_complete'
  /** Canvas element property update (connect form, product, etc. to existing elements) */
  | 'element_update'

/**
 * MochiAIEvent — The event shape emitted by tools and consumed by subscribers.
 *
 * @property feature - Which feature domain this event belongs to
 * @property action - What happened (CRUD action or special action)
 * @property entityId - Primary entity ID (invoiceId, contractId, formId)
 * @property navigate - If true, MochiWidget auto-navigates to the entity's builder
 * @property data - Extra payload for feature-specific handlers (e.g., aiPrompt, aiMode)
 */
export type MochiAIEvent = {
  feature: MochiEventFeature
  action: MochiEventAction
  entityId: string
  navigate?: boolean
  data?: Record<string, string>
}
