/**
 * ============================================================================
 * MOCHI AI TOOLS - ASK USER (Human-in-the-Loop)
 * ============================================================================
 *
 * Tool that allows the AI to ask the user a question before proceeding.
 * Instead of Trigger.dev wait tokens, this returns a special result
 * that the client detects and renders as a question UI. The user's
 * response is sent as a new message, starting a new stream.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiAskUserTool, AIHumanInTheLoop
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'

/**
 * Creates the askUser tool.
 * No org binding needed — this tool just returns data for the client.
 */
export function createAskUserTool() {
  return {
    /**
     * Ask the user a question with optional quick-select options.
     * The AI should stop calling other tools after askUser and wait
     * for the user's response in the next message.
     */
    askUser: tool({
      description:
        'Ask the user a question before proceeding. Use when you need clarification or approval. ' +
        'ALWAYS provide the options array so the user sees clickable buttons instead of having to type. ' +
        'After calling this tool, STOP and wait for the user to respond in their next message.',
      inputSchema: z.object({
        question: z.string().describe('The question to ask the user'),
        options: z
          .array(z.string())
          .optional()
          .describe('Quick-select button labels for the user. ALWAYS provide this — e.g., ["Real time", "Background"] or ["Yes, proceed", "No, cancel"]'),
      }),
      execute: async (params) => {
        return {
          type: 'human_input_required' as const,
          question: params.question,
          options: params.options,
        }
      },
    }),
  }
}
