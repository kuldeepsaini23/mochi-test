/**
 * Usage-Based Pricing Configuration - Single Source of Truth
 *
 * WHY: Centralized pricing for all usage-based billing
 * HOW: All services that charge for usage MUST use these rates
 *
 * IMPORTANT: All amounts are in MILLICENTS (1/1000 of a dollar) to handle sub-cent pricing
 * without floating point issues. Example: 20 millicents = $0.02, 15 millicents = $0.015
 *
 * WHY MILLICENTS OVER CENTS:
 * Sub-cent pricing (e.g., $0.015 starter, $0.008 enterprise) can't be represented as
 * integer cents without precision loss. Math.round(0.015 * 100) = 1, not 1.5.
 * With millicents: Math.round(0.015 * 1000) = 15 - a clean integer.
 *
 * TIER-AWARE PRICING:
 * PAYG features now have tier-specific pricing. Use the tier-aware functions
 * (e.g., getEmailCostMillicentsByTier) instead of the hardcoded constants.
 *
 * SOURCE OF TRUTH: UsagePricing, TierAwarePricing, EMAIL_COST, SMS_COST, AI_COSTS, STORAGE_COST
 */

import type { PlanKey } from './feature-gates'

// ============================================================================
// EMAIL PRICING
// ============================================================================

/**
 * DEFAULT cost per email sent in MILLICENTS (used as fallback)
 *
 * @deprecated Use getEmailCostMillicentsByTier() for tier-aware pricing
 *
 * SOURCE OF TRUTH: EMAIL_COST_MILLICENTS
 */
export const EMAIL_COST_MILLICENTS = 20 // $0.02 per email (free tier rate)


// ============================================================================
// SMS PRICING
// ============================================================================

/**
 * Cost per SMS segment in MILLICENTS
 * Note: Long messages may be split into multiple segments
 *
 * SOURCE OF TRUTH: SMS_COST_MILLICENTS
 */
export const SMS_COST_MILLICENTS = 80 // $0.08 per SMS segment


// ============================================================================
// AI USAGE PRICING
// ============================================================================

/**
 * AI model pricing per 1000 tokens in MILLICENTS
 * Prices based on model capabilities and API costs
 *
 * SOURCE OF TRUTH: AI_COST_PER_1K_TOKENS
 */
export const AI_COST_PER_1K_TOKENS = {
  // Gateway models (provider/model format matching AI_GATEWAY_MODELS)
  'moonshotai/kimi-k2.5': 10,          // $0.01 per 1K tokens
  'anthropic/claude-sonnet-4.5': 60,   // $0.06 per 1K tokens
  'anthropic/claude-haiku-4.5': 10,    // $0.01 per 1K tokens
  'openai/gpt-4o': 30,                // $0.03 per 1K tokens
  'openai/gpt-4o-mini': 10,           // $0.01 per 1K tokens
  'google/gemini-2.5-flash': 10,      // $0.01 per 1K tokens
  'google/gemini-2.5-pro': 30,        // $0.03 per 1K tokens
  'deepseek/deepseek-v3': 10,         // $0.01 per 1K tokens
  'mistral/mistral-large-3': 30,      // $0.03 per 1K tokens
  'xai/grok-3': 30,                   // $0.03 per 1K tokens

  // Legacy model names (kept for backward compatibility with existing transactions)
  'gpt-4': 60,           // $0.06 per 1K tokens
  'gpt-4-turbo': 30,     // $0.03 per 1K tokens
  'gpt-4o': 30,          // $0.03 per 1K tokens
  'gpt-4o-mini': 10,     // $0.01 per 1K tokens
  'gpt-3.5-turbo': 10,   // $0.01 per 1K tokens
  'claude-3-opus': 150,    // $0.15 per 1K tokens
  'claude-3-sonnet': 60,   // $0.06 per 1K tokens
  'claude-3-haiku': 10,    // $0.01 per 1K tokens
  'claude-3.5-sonnet': 60, // $0.06 per 1K tokens

  // Default for unknown models
  default: 30,           // $0.03 per 1K tokens
} as const

/**
 * Calculate AI usage cost in MILLICENTS
 *
 * @param model - The AI model used
 * @param totalTokens - Total tokens (input + output)
 * @returns Cost in MILLICENTS
 */
export function calculateAICost(model: string, totalTokens: number): number {
  const ratePerK = AI_COST_PER_1K_TOKENS[model as keyof typeof AI_COST_PER_1K_TOKENS]
    ?? AI_COST_PER_1K_TOKENS.default

  return Math.ceil((totalTokens / 1000) * ratePerK)
}

// ============================================================================
// STORAGE PRICING
// ============================================================================

/**
 * Storage pricing in MILLICENTS per GB per month
 *
 * SOURCE OF TRUTH: STORAGE_COST_PER_GB_MILLICENTS
 */
export const STORAGE_COST_PER_GB_MILLICENTS = 250 // $0.25 per GB/month


/**
 * Free storage tier in bytes (1 GB)
 */
export const FREE_STORAGE_BYTES = 1 * 1024 * 1024 * 1024 // 1 GB

/**
 * Calculate storage overage cost in MILLICENTS
 *
 * @param totalBytes - Total storage used in bytes
 * @returns Cost in MILLICENTS (0 if under free tier)
 */
export function calculateStorageOverageCost(totalBytes: number): number {
  if (totalBytes <= FREE_STORAGE_BYTES) {
    return 0
  }

  const overageBytes = totalBytes - FREE_STORAGE_BYTES
  const overageGB = overageBytes / (1024 * 1024 * 1024)

  return Math.ceil(overageGB * STORAGE_COST_PER_GB_MILLICENTS)
}

// ============================================================================
// API CALLS PRICING
// ============================================================================

/**
 * Free API calls per month
 */
export const FREE_API_CALLS = 10000

/**
 * Cost per API call beyond free tier in MILLICENTS
 *
 * SOURCE OF TRUTH: API_CALL_COST_MILLICENTS
 */
export const API_CALL_COST_MILLICENTS = 10 // $0.01 per API call (after free tier)


// ============================================================================
// WALLET DEFAULTS
// ============================================================================

/**
 * Wallet configuration defaults (in MILLICENTS, 1000 = $1.00)
 *
 * SOURCE OF TRUTH: WALLET_DEFAULTS
 */
export const WALLET_DEFAULTS = {
  /** Initial free credit for new organizations (1000 millicents = $1.00) */
  initialFreeCredit: 1000,

  /** Minimum manual top-up amount (1000 millicents = $1.00) */
  minimumTopUp: 1000,

  /** Default auto-top-up amount (1000 millicents = $1.00) */
  autoTopUpAmount: 1000,

  /** Default auto-top-up threshold (trigger when balance below this) */
  autoTopUpThreshold: 0, // $0.00
} as const

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AIModel = keyof typeof AI_COST_PER_1K_TOKENS

// ============================================================================
// FEATURE-GATES INTEGRATION
// ============================================================================

/**
 * Get email cost from feature-gates.ts (SOURCE OF TRUTH)
 *
 * @deprecated Use getEmailCostMillicentsByTier() for tier-aware pricing
 *
 * WHY: Feature-gates.ts is the single source of truth for PAYG pricing
 * HOW: Reads cost from FEATURES.organization['emails.payg'].cost and converts to millicents
 *
 * @returns Cost in MILLICENTS for one email (uses default/pro tier pricing)
 *
 * SOURCE OF TRUTH: getEmailCostMillicents, FeatureGatesEmailPricing
 */
export async function getEmailCostMillicents(): Promise<number> {
  const { FEATURES } = await import('@/lib/config/feature-gates')
  const costInDollars = FEATURES.organization['emails.payg'].cost
  return Math.round(costInDollars * 1000)
}


/**
 * Synchronous version using the hardcoded fallback for performance-critical paths
 *
 * @deprecated Use getEmailCostMillicentsByTier() for tier-aware pricing
 *
 * SOURCE OF TRUTH: getEmailCostMillicentsSync
 */
export function getEmailCostMillicentsSync(): number {
  return EMAIL_COST_MILLICENTS
}


// ============================================================================
// TIER-AWARE PRICING FUNCTIONS - SOURCE OF TRUTH
// ============================================================================

/**
 * Get tier-specific email cost in MILLICENTS
 *
 * SOURCE OF TRUTH: getEmailCostMillicentsByTier, TierAwareEmailPricing
 *
 * WHY: Different tiers pay different amounts for email sending
 * HOW: Uses TIER_SPECIFIC_PRICING from feature-gates.ts via getTierSpecificCostMillicents
 *
 * @param tier - The organization's plan tier
 * @returns Cost in MILLICENTS for one email
 *
 * EXAMPLES:
 *   getEmailCostMillicentsByTier('free')       // 20 millicents ($0.02)
 *   getEmailCostMillicentsByTier('starter')    // 15 millicents ($0.015)
 *   getEmailCostMillicentsByTier('pro')        // 10 millicents ($0.01)
 *   getEmailCostMillicentsByTier('enterprise') // 8 millicents ($0.008)
 *   getEmailCostMillicentsByTier('portal')     // 0 millicents ($0)
 */
export async function getEmailCostMillicentsByTier(tier: PlanKey): Promise<number> {
  const { getTierSpecificCostMillicents } = await import('@/lib/config/feature-gates')
  return getTierSpecificCostMillicents('emails.payg', tier)
}


/**
 * Get tier-specific AI credit cost in MILLICENTS (per 1K tokens)
 *
 * SOURCE OF TRUTH: getAICreditCostMillicentsByTier, TierAwareAICreditPricing
 *
 * WHY: Different tiers pay different amounts for AI usage
 * HOW: Uses TIER_SPECIFIC_PRICING from feature-gates.ts via getTierSpecificCostMillicents
 *
 * @param tier - The organization's plan tier
 * @returns Cost in MILLICENTS per 1K tokens (1 AI credit = 1K tokens)
 *
 * EXAMPLES:
 *   getAICreditCostMillicentsByTier('free')       // 2 millicents ($0.002)
 *   getAICreditCostMillicentsByTier('starter')    // 2 millicents ($0.0015 → rounded to 2)
 *   getAICreditCostMillicentsByTier('pro')        // 1 millicent ($0.001)
 *   getAICreditCostMillicentsByTier('enterprise') // 1 millicent ($0.0008 → rounded to 1)
 *   getAICreditCostMillicentsByTier('portal')     // 0 millicents ($0)
 */
export async function getAICreditCostMillicentsByTier(tier: PlanKey): Promise<number> {
  const { getTierSpecificCostMillicents } = await import('@/lib/config/feature-gates')
  return getTierSpecificCostMillicents('ai_credits.payg', tier)
}
