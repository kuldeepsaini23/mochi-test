/**
 * ============================================================================
 * CONTRACT EXECUTION STRATEGY
 * ============================================================================
 *
 * Wraps the existing getContractInlinePrompt() as a registered execution
 * strategy. This allows the contract content fence and prompt to be
 * managed through the strategy registry instead of hardcoded in route.ts.
 *
 * Side-effect import: importing this file registers the strategy.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractStrategy, ContractExecutionStrategy
 * ============================================================================
 */

import { registerStrategy } from '../execution-strategies'
import { getContractInlinePrompt } from '@/lib/ai/contracts/prompts'

/**
 * Register the contract strategy.
 * - Fence name: 'contract' (detects ```contract code fences)
 * - Always active: contracts can be created from any page
 * - Prompt: the full contract inline generation prompt
 */
registerStrategy({
  id: 'contract',
  fenceNames: ['contract'],
  getSystemPromptExtension: () => getContractInlinePrompt(),
  isAlwaysActive: true,
})
