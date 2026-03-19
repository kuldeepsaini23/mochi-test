/**
 * ============================================================================
 * MOCHI AI TOOLS - SEQUENCE STEP (Barrier/Checkpoint)
 * ============================================================================
 *
 * Lightweight barrier tool that enforces sequential execution of multi-part
 * requests. The Vercel AI SDK's streamText executes all tool calls within a
 * single step in parallel. When the model calls this tool ALONE, it creates
 * a real step boundary — previous tool calls must complete and their results
 * must be returned before the model can continue to the next phase.
 *
 * This tool itself is a no-op — it just returns a confirmation message.
 * The value is in the step boundary it creates, not in what it does.
 *
 * Example: "Create a contract, then create an invoice"
 * - Step 1: createContract → completes
 * - Step 2: sequenceStep("Created contract", "Creating invoice") → barrier
 * - Step 3: createInvoice → starts only after contract is fully done
 *
 * SOURCE OF TRUTH KEYWORDS: MochiSequenceStep, AITaskBarrier, SequenceTool
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'

/**
 * Creates the sequenceStep tool.
 * No org binding needed — this tool just returns a progress message.
 */
export function createSequenceTool() {
  return {
    /**
     * Barrier tool that signals completion of one phase in a multi-part request.
     * The model MUST call this ALONE (not alongside other tools) to create a
     * real step boundary in the AI SDK pipeline.
     */
    sequenceStep: tool({
      description:
        'Signal that you completed one phase of a multi-part request and are ready for the next phase. ' +
        'CRITICAL: Call this tool ALONE — do NOT call any other tools alongside it in the same step. ' +
        'This ensures all previous operations fully complete before the next phase begins. ' +
        'Use this ONLY when handling prompts with multiple distinct tasks (e.g., "create a contract THEN create an invoice"). ' +
        'Do NOT use this for single tasks that just involve multiple related tool calls.',
      inputSchema: z.object({
        completedPhase: z.string().describe('Brief summary of what was just completed'),
        nextPhase: z.string().describe('Brief description of what will be done next'),
      }),
      execute: async (params) => {
        return {
          success: true,
          completed: params.completedPhase,
          next: params.nextPhase,
          message: `Completed: ${params.completedPhase}. Moving on to: ${params.nextPhase}`,
        }
      },
    }),
  }
}
