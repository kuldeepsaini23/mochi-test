/**
 * ============================================================================
 * EXECUTION STRATEGY REGISTRY
 * ============================================================================
 *
 * A plug-and-play registry for AI execution modes. Each strategy registers:
 *   - Content fence names it handles (fed into pipeContentFences)
 *   - System prompt extensions (appended to the base Mochi prompt)
 *   - Whether always active or conditional on page context
 *
 * Adding a new execution mode (e.g., email templates) is a one-file addition:
 *   1. Create strategies/email-strategy.ts
 *   2. Call registerStrategy({ id: 'email', fenceNames: ['email'], ... })
 *   3. Import the strategy file (side-effect) in route.ts
 *
 * No changes needed to route.ts, content fence transform, or event emitter.
 *
 * SOURCE OF TRUTH KEYWORDS: ExecutionStrategy, StrategyRegistry,
 * RegisterStrategy, ExecutionMode
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * An execution strategy defines how a specific content type (contracts,
 * UI specs, emails, etc.) integrates with the Mochi AI streaming pipeline.
 *
 * SOURCE OF TRUTH KEYWORDS: ExecutionStrategy
 */
export interface ExecutionStrategy {
  /** Unique strategy identifier (e.g., 'contract', 'ui-render') */
  id: string
  /** Content fence names this strategy handles (fed into pipeContentFences) */
  fenceNames: string[]
  /** System prompt extension text (appended when strategy is active) */
  getSystemPromptExtension: () => string
  /**
   * Whether this strategy is always active or conditional on page context.
   * Always-active strategies have their prompt + fences included on every request.
   * Conditional strategies require matching pageContext to activate.
   */
  isAlwaysActive: boolean
  /**
   * Page context pattern that activates this strategy (when isAlwaysActive is false).
   * Matched against the pageContext string — uses substring match (case-insensitive).
   * Example: 'website-builder' activates when the user is on the builder page.
   */
  activateOnPageContext?: string
}

// ============================================================================
// REGISTRY
// ============================================================================

/** Internal registry of all registered execution strategies */
const strategies: ExecutionStrategy[] = []

/**
 * Register an execution strategy. Called at module load time
 * as a side-effect import in the API route.
 *
 * @param strategy - The strategy to register
 */
export function registerStrategy(strategy: ExecutionStrategy): void {
  /** Prevent duplicate registrations (idempotent for HMR) */
  const existing = strategies.findIndex((s) => s.id === strategy.id)
  if (existing >= 0) {
    strategies[existing] = strategy
  } else {
    strategies.push(strategy)
  }
}

/**
 * Returns all registered fence names across all strategies.
 * Fed into pipeContentFences() to detect all registered content types.
 *
 * @returns Array of fence names (e.g., ['contract', 'ui-spec'])
 */
export function getAllFenceNames(): string[] {
  return strategies.flatMap((s) => s.fenceNames)
}

/**
 * Returns system prompt extensions from all active strategies.
 * Each extension is appended to the base Mochi system prompt.
 *
 * @param context - Optional context for conditional strategies
 * @returns Array of prompt extension strings
 */
export function getActivePromptExtensions(context?: { pageContext?: string }): string[] {
  return strategies
    .filter((s) => {
      if (s.isAlwaysActive) return true
      /**
       * Conditional strategies only activate when the pageContext
       * matches their activateOnPageContext pattern (case-insensitive substring).
       */
      if (!context?.pageContext || !s.activateOnPageContext) return false
      return context.pageContext.toLowerCase().includes(s.activateOnPageContext.toLowerCase())
    })
    .map((s) => s.getSystemPromptExtension())
}
