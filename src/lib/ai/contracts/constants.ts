/**
 * ============================================================================
 * CONTRACT AI - CONSTANTS
 * ============================================================================
 *
 * Configuration constants for the AI-powered contract content generation system.
 * With the modular stream architecture, contract content streams INLINE
 * through the Mochi chat stream — no dedicated endpoint needed.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractAIConstants, ContractAIConfig
 * ============================================================================
 */

/**
 * Throttle interval for progressive Lexical editor updates during streaming.
 * Every 100ms, the accumulated markdown is converted to Lexical state.
 * Lower values = snappier typewriter effect, higher values = fewer DOM thrashes.
 */
export const PROGRESSIVE_UPDATE_MS = 100
