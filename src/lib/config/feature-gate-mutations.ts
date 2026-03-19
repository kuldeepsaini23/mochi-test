/**
 * Feature Gate Mutation Mapping - Optimistic Cache Updates
 *
 * SOURCE OF TRUTH: FeatureGateMutations, OptimisticUsageUpdates
 *
 * WHY: When mutations that affect usage counts START, we optimistically
 * update the feature gates cache so the UI reflects limits instantly.
 * If the mutation fails, we rollback the change.
 *
 * HOW: This config maps tRPC mutations to their feature keys and operation types.
 * The global mutation observer uses this to:
 * 1. Update cache on mutation START (pending)
 * 2. Rollback on mutation ERROR
 * 3. Adjust on mutation SUCCESS (for bulk operations)
 *
 * BENEFIT: Instant UI updates that match optimistic UI patterns.
 * User can't exceed limits even during the mutation window.
 */

import type { FeatureKey } from '@/lib/config/feature-gates'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Operation type for usage updates
 * - increment: Add to usage count (create operations)
 * - decrement: Subtract from usage count (delete operations)
 */
type OperationType = 'increment' | 'decrement'

/**
 * Mutation mapping configuration
 *
 * SOURCE OF TRUTH: MutationFeatureMapping
 */
interface MutationMapping {
  /** The feature key this mutation affects (e.g., 'forms.limit') */
  feature: FeatureKey
  /** Whether this creates or deletes resources */
  operation: OperationType
  /**
   * For bulk operations, extract count from mutation VARIABLES (input)
   * Used at mutation START to know how many items are being affected
   * If not provided, defaults to 1
   */
  getCountFromVariables?: (variables: unknown) => number
  /**
   * For bulk operations, extract count from mutation RESULT
   * Used at mutation SUCCESS to verify/adjust the count
   * If not provided, defaults to 1
   */
  getCountFromResult?: (result: unknown) => number
}

/**
 * Tracked mutation for rollback purposes
 *
 * SOURCE OF TRUTH: PendingMutationTrack
 */
export interface PendingMutation {
  feature: FeatureKey
  countChange: number
}

// ============================================================================
// MUTATION TO FEATURE MAPPING
// ============================================================================

/**
 * Maps tRPC mutation paths to their feature keys and operations.
 *
 * SOURCE OF TRUTH: MUTATION_FEATURE_MAP
 *
 * FORMAT: 'router.procedure' -> { feature, operation, getCountFromVariables?, getCountFromResult? }
 *
 * HOW TO ADD A NEW MAPPING:
 * 1. Find the tRPC router name and procedure name (e.g., 'forms.create')
 * 2. Add an entry with the feature key from src/lib/config/feature-gates.ts
 * 3. Set operation to 'increment' for create mutations, 'decrement' for delete mutations
 * 4. For bulk operations (e.g., bulkDelete), add getCountFromVariables to extract
 *    the count from the mutation input, and getCountFromResult to verify from the result
 *
 * WHEN TO ADD A MAPPING:
 * Add a mapping for every tRPC mutation that calls incrementUsageAndInvalidate()
 * or decrementUsageAndInvalidate() in its handler. This enables optimistic UI updates
 * so the feature gate counter reflects changes instantly in the client.
 */
export const MUTATION_FEATURE_MAP: Record<string, MutationMapping> = {
  // =========================================================================
  // FORMS
  // =========================================================================
  'forms.create': {
    feature: 'forms.limit',
    operation: 'increment',
  },
  'forms.delete': {
    feature: 'forms.limit',
    operation: 'decrement',
  },
  'forms.bulkDelete': {
    feature: 'forms.limit',
    operation: 'decrement',
    getCountFromVariables: (vars) => (vars as { formIds?: string[] })?.formIds?.length ?? 1,
    getCountFromResult: (result) => (result as { count?: number })?.count ?? 1,
  },

  // =========================================================================
  // WEBSITES
  // =========================================================================
  'websites.create': {
    feature: 'websites.limit',
    operation: 'increment',
  },
  'websites.delete': {
    feature: 'websites.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // PAGES (per website limit)
  // =========================================================================
  'pages.create': {
    feature: 'pages_per_website.limit',
    operation: 'increment',
  },
  'pages.delete': {
    feature: 'pages_per_website.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // CHAT WIDGETS
  // =========================================================================
  'chatWidgets.create': {
    feature: 'chat_widgets.limit',
    operation: 'increment',
  },
  'chatWidgets.delete': {
    feature: 'chat_widgets.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // PIPELINES
  // =========================================================================
  'pipeline.create': {
    feature: 'pipelines.limit',
    operation: 'increment',
  },
  'pipeline.delete': {
    feature: 'pipelines.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // TICKETS
  // =========================================================================
  'pipeline.createTicket': {
    feature: 'tickets.limit',
    operation: 'increment',
  },
  'pipeline.deleteTicket': {
    feature: 'tickets.limit',
    operation: 'decrement',
  },
  'pipeline.bulkDeleteTickets': {
    feature: 'tickets.limit',
    operation: 'decrement',
    getCountFromVariables: (vars) => (vars as { ticketIds?: string[] })?.ticketIds?.length ?? 1,
    getCountFromResult: (result) => (result as { count?: number })?.count ?? 1,
  },

  // =========================================================================
  // EMAIL TEMPLATES
  // =========================================================================
  'emailTemplates.create': {
    feature: 'email_templates.limit',
    operation: 'increment',
  },
  'emailTemplates.delete': {
    feature: 'email_templates.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // EMAIL DOMAINS
  // =========================================================================
  'emailDomains.create': {
    feature: 'email_domains.limit',
    operation: 'increment',
  },
  'emailDomains.delete': {
    feature: 'email_domains.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // PRODUCTS
  // =========================================================================
  'products.create': {
    feature: 'products.limit',
    operation: 'increment',
  },
  'products.delete': {
    feature: 'products.limit',
    operation: 'decrement',
  },
  'products.bulkDelete': {
    feature: 'products.limit',
    operation: 'decrement',
    getCountFromVariables: (vars) => (vars as { productIds?: string[] })?.productIds?.length ?? 1,
    getCountFromResult: (result) => (result as { count?: number })?.count ?? 1,
  },

  // =========================================================================
  // LEADS
  // =========================================================================
  'leads.create': {
    feature: 'leads.limit',
    operation: 'increment',
  },
  'leads.delete': {
    feature: 'leads.limit',
    operation: 'decrement',
  },
  'leads.bulkDelete': {
    feature: 'leads.limit',
    operation: 'decrement',
    getCountFromVariables: (vars) => (vars as { leadIds?: string[] })?.leadIds?.length ?? 1,
    getCountFromResult: (result) => (result as { count?: number })?.count ?? 1,
  },

  // =========================================================================
  // CMS TABLES
  // =========================================================================
  'cms.createTable': {
    feature: 'cms_tables.limit',
    operation: 'increment',
  },
  'cms.deleteTable': {
    feature: 'cms_tables.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // TEAM MEMBERS
  // =========================================================================
  'organization.inviteMember': {
    feature: 'team_seats.limit',
    operation: 'increment',
  },
  'organization.removeMember': {
    feature: 'team_seats.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // AUTOMATIONS
  // =========================================================================
  'automation.create': {
    feature: 'automations.limit',
    operation: 'increment',
  },
  'automation.delete': {
    feature: 'automations.limit',
    operation: 'decrement',
  },
  'automation.duplicate': {
    feature: 'automations.limit',
    operation: 'increment',
  },
  'automation.bulkDelete': {
    feature: 'automations.limit',
    operation: 'decrement',
    getCountFromVariables: (vars) => (vars as { automationIds?: string[] })?.automationIds?.length ?? 1,
    getCountFromResult: (result) => (result as { count?: number })?.count ?? 1,
  },

  // =========================================================================
  // CONTRACTS
  // =========================================================================
  'contracts.create': {
    feature: 'contracts.limit',
    operation: 'increment',
  },
  'contracts.delete': {
    feature: 'contracts.limit',
    operation: 'decrement',
  },
  'contracts.createFromTemplate': {
    feature: 'contracts.limit',
    operation: 'increment',
  },


  // =========================================================================
  // INVOICES
  // =========================================================================
  'invoices.create': {
    feature: 'invoices.limit',
    operation: 'increment',
  },
  'invoices.delete': {
    feature: 'invoices.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // STORES
  // =========================================================================
  'stores.create': {
    feature: 'stores.limit',
    operation: 'increment',
  },
  'stores.delete': {
    feature: 'stores.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // BOOKING CALENDARS
  // =========================================================================
  'bookingCalendar.create': {
    feature: 'calendars.limit',
    operation: 'increment',
  },
  'bookingCalendar.delete': {
    feature: 'calendars.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // CALENDAR EVENTS
  // =========================================================================
  'calendar.create': {
    feature: 'calendars.limit',
    operation: 'increment',
  },
  'calendar.delete': {
    feature: 'calendars.limit',
    operation: 'decrement',
  },

  // =========================================================================
  // LOCAL COMPONENTS
  // =========================================================================
  'localComponents.create': {
    feature: 'local_components.limit',
    operation: 'increment',
  },
  'localComponents.delete': {
    feature: 'local_components.limit',
    operation: 'decrement',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get mutation mapping from a tRPC mutation key
 *
 * @param mutationKey - The tRPC mutation key (nested array like [['forms', 'delete']])
 * @returns The mapping if found, or null
 */
export function getMutationMapping(mutationKey: unknown): MutationMapping | null {
  if (!Array.isArray(mutationKey)) return null

  // tRPC mutation keys are nested arrays like [['forms', 'delete']]
  const procedurePath = mutationKey[0]
  if (!Array.isArray(procedurePath)) return null

  // Join the procedure path to get 'forms.delete'
  const keyString = procedurePath.join('.')

  return MUTATION_FEATURE_MAP[keyString] ?? null
}

/**
 * Get the count change for a mutation at START (using variables)
 *
 * @param mapping - The mutation mapping
 * @param variables - The mutation variables (input)
 * @returns The count to add (positive for increment) or subtract (negative for decrement)
 */
export function getCountChangeFromVariables(mapping: MutationMapping, variables: unknown): number {
  const count = mapping.getCountFromVariables ? mapping.getCountFromVariables(variables) : 1
  return mapping.operation === 'increment' ? count : -count
}

/**
 * Get the count change for a mutation at SUCCESS (using result)
 * Used to verify/adjust the optimistic update
 *
 * @param mapping - The mutation mapping
 * @param result - The mutation result
 * @returns The count to add (positive for increment) or subtract (negative for decrement)
 */
export function getCountChangeFromResult(mapping: MutationMapping, result: unknown): number {
  const count = mapping.getCountFromResult ? mapping.getCountFromResult(result) : 1
  return mapping.operation === 'increment' ? count : -count
}
