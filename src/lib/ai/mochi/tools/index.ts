/**
 * ============================================================================
 * MOCHI AI TOOLS - AGGREGATOR
 * ============================================================================
 *
 * Merges all domain tool factories into a single function that
 * returns every tool available to the Mochi AI assistant.
 *
 * SECURITY: All tool factories receive a tRPC caller so they route through
 * the full middleware chain (permissions, feature gates, Stripe connect)
 * instead of calling service functions directly.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiToolsAggregator, createAllMochiTools
 * ============================================================================
 */

import type { TRPCCaller } from '@/trpc/server'
import { createLeadTools } from './leads'
import { createTagTools } from './tags'
import { createDatasetTools } from './datasets'
import { createProductTools } from './products'
import { createPriceTools } from './prices'
import { createPaymentLinkTools } from './payment-links'
import { createFormTools } from './forms'
import { createCalendarTools } from './calendar'
import { createEmailTools } from './email'
import { createPipelineTools } from './pipeline'
import { createInvoiceTools } from './invoices'
import { createContractTools } from './contracts'
import { createDomainTools } from './domains'
import { createWebsiteTools } from './websites'
import { createCmsTools } from './cms'
import { createStoreTools } from './stores'
import { createStorageTools } from './storage'
import { createAskUserTool } from './ask-user'
import { createSequenceTool } from './sequence'
import { createCanvasElementTools } from './canvas-elements'

/**
 * Creates all Mochi AI tools bound to the given organization.
 *
 * Each domain factory returns an object of tool definitions.
 * We spread them all into a single flat object for the AI SDK.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller for secure procedure invocation with full middleware
 * @returns A flat object of all tool definitions
 */
export function createAllMochiTools(organizationId: string, caller: TRPCCaller) {
  return {
    ...createLeadTools(organizationId, caller),
    ...createTagTools(organizationId, caller),
    ...createDatasetTools(organizationId, caller),
    ...createProductTools(organizationId, caller),
    ...createPriceTools(organizationId, caller),
    ...createPaymentLinkTools(organizationId, caller),
    ...createFormTools(organizationId, caller),
    ...createCalendarTools(organizationId, caller),
    ...createEmailTools(organizationId, caller),
    ...createPipelineTools(organizationId, caller),
    ...createInvoiceTools(organizationId, caller),
    ...createContractTools(organizationId, caller),
    ...createDomainTools(organizationId, caller),
    ...createWebsiteTools(organizationId, caller),
    ...createCmsTools(organizationId, caller),
    ...createStoreTools(organizationId, caller),
    ...createStorageTools(organizationId, caller),
    ...createCanvasElementTools(organizationId, caller),
    ...createAskUserTool(),
    ...createSequenceTool(),
  }
}
