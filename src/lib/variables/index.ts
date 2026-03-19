/**
 * Variable System Module
 *
 * Provides unified variable interpolation for templates.
 * Use in emails, contracts, website pages, and automations.
 *
 * @example
 * // Server-side with real data
 * import { buildVariableContext, interpolate } from '@/lib/variables'
 * const context = await buildVariableContext(orgId, leadId)
 * const result = interpolate('Hello {{lead.firstName}}!', context)
 *
 * @example
 * // Client-side preview with sample data
 * import { getSampleVariableContext, interpolate } from '@/lib/variables'
 * const sampleContext = getSampleVariableContext()
 * const preview = interpolate('Hello {{lead.firstName}}!', sampleContext)
 * // => 'Hello John!'
 */

// Types
export * from './types'

// Context builder (server-side, requires Prisma)
export { buildVariableContext, formatCurrency, formatDate } from './context-builder'

// Interpolation
export { interpolate, extractVariables, validateVariables, previewTemplate } from './interpolate'

// Block interpolation (universal helper for all block types)
export { interpolateBlock, interpolateBlocks, interpolateTextSafe } from './interpolate-block'

// Sample context (client-side, for previews)
export {
  getSampleVariableContext,
  sampleData,
  isVariablePlaceholder,
  extractVariablePlaceholders,
} from './sample-context'
