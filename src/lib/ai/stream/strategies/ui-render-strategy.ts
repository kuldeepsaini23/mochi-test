/**
 * ============================================================================
 * UI RENDER EXECUTION STRATEGY (WEBSITE BUILDER ONLY)
 * ============================================================================
 *
 * Registers the json-render UI generation as an execution strategy.
 * This enables the AI to output ```ui-spec code fences that get
 * separated into data-ui-spec events by the content fence transform.
 *
 * CONDITIONAL: This strategy is NOT always active — it only activates
 * when the user is on the website builder page (detected via pageContext).
 * The fence names are still registered so the content fence transform
 * knows to look for ```ui-spec fences in the stream.
 *
 * Side-effect import: importing this file registers the strategy.
 *
 * SOURCE OF TRUTH KEYWORDS: UIRenderStrategy, UISpecStrategy
 * ============================================================================
 */

import { registerStrategy } from '../execution-strategies'
import { getUIRenderPrompt } from '@/lib/ai/ui-render/prompts'

/**
 * Register the UI render strategy for website builder.
 * - Fence name: 'ui-spec' (detects ```ui-spec code fences)
 * - NOT always active: Only activates when pageContext indicates builder page
 * - Prompt: auto-generated from the json-render catalog with builder-specific rules
 */
registerStrategy({
  id: 'ui-render',
  fenceNames: ['ui-spec'],
  getSystemPromptExtension: () => getUIRenderPrompt(),
  /**
   * Always active so the AI knows the ui-spec format even when creating
   * pages from the dashboard. Without this, the AI can't generate valid
   * JSONL patches because the prompt extension isn't included.
   */
  isAlwaysActive: true,
  activateOnPageContext: 'website-builder',
})
