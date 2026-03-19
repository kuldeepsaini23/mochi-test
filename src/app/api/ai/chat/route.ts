/**
 * ============================================================================
 * MOCHI AI - STREAMING CHAT API ROUTE
 * ============================================================================
 *
 * POST /api/ai/chat
 *
 * Streams AI responses with tool calling using Vercel AI SDK.
 *
 * Flow:
 * 1. Authenticate via Better Auth session
 * 2. Verify organization membership
 * 3. Create tools bound to the organization
 * 4. Stream Claude response with auto-executing tools via stepCountIs
 * 5. pipeContractContent() separates contract markdown from chat text
 * 6. Return UI message stream
 *
 * SOURCE OF TRUTH KEYWORDS: MochiAIRoute, MochiChatEndpoint
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  streamText,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai'
import { z } from 'zod'
import { headers } from 'next/headers'
import { auth } from '@/lib/better-auth/auth'
import { hasOrganizationMembership } from '@/services/membership.service'
import { chargeForAIUsage, ensureSufficientBalance, recordFailedAICharge } from '@/services/wallet.service'
import {
  MAX_PROMPT_LENGTH,
  MAX_STEPS,
  GENERATION_TIMEOUT_MS,
  MOCHI_ERROR_CODES,
} from '@/lib/ai/mochi/constants'
import {
  createGatewayModel,
  resolveModelId,
  getGatewayProviderOptions,
} from '@/lib/ai/gateway'
import { MOCHI_SYSTEM_PROMPT } from '@/lib/ai/mochi/prompts'
import { createAllMochiTools } from '@/lib/ai/mochi/tools'
import { createCaller } from '@/trpc/server'
import { pipeContentFences, getAllFenceNames, getActivePromptExtensions } from '@/lib/ai/stream'
import { detectBackgroundIntent } from '@/lib/ai/mochi/intent'

/**
 * Side-effect imports — each file registers its execution strategy.
 * Adding a new strategy is as simple as importing a new file here.
 */
import '@/lib/ai/stream/strategies/contract-strategy'
import '@/lib/ai/stream/strategies/ui-render-strategy'

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

/**
 * Schema for an image attachment on a user message.
 * Base64-encoded image data sent inline for AI vision analysis.
 */
const imageAttachmentSchema = z.object({
  /** Base64-encoded image data — capped at 15MB to prevent memory exhaustion from oversized payloads */
  base64: z.string().max(15_000_000),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
})

/**
 * Schema for a single chat message in the conversation.
 * User messages may include image attachments for vision analysis.
 */
const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  /** Optional image attachments (user messages only, max 5) */
  images: z.array(imageAttachmentSchema).max(5).optional(),
})

/**
 * Request body schema for the Mochi AI chat endpoint.
 */
const requestSchema = z.object({
  /** Conversation messages (user and assistant turns) */
  messages: z.array(messageSchema).min(1, 'At least one message is required'),
  /** Organization ID for authorization and tool binding */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** Optional AI model to use (validated against allowed gateway models) */
  modelId: z.string().optional(),
  /**
   * Optional page context injected into the system prompt.
   * Provides the AI with awareness of what the user currently has open
   * (e.g., which contract is in the builder) so it doesn't need to ask.
   * Capped at 10K chars to prevent oversized payloads inflating token costs.
   */
  pageContext: z.string().max(10_000).optional(),
  /**
   * When true, the AI should perform actions without navigating the user.
   * Detected automatically from user intent (e.g., "do this in the background")
   * or set explicitly via the UI toggle.
   */
  backgroundMode: z.boolean().optional(),
})

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Creates a structured JSON error response.
 */
function createErrorResponse(
  code: string,
  message: string,
  status: number
) {
  return NextResponse.json({ error: code, message }, { status })
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * POST /api/ai/chat
 *
 * Accepts conversation messages and streams back AI response with tool calls.
 * Uses Vercel AI SDK UI message stream protocol (toUIMessageStreamResponse).
 */
export async function POST(request: NextRequest) {
  const headersList = await headers()

  /**
   * Declare the timeout controller at function scope so the catch block
   * can inspect its signal.reason to differentiate timeout aborts from
   * other errors. Initialized to a default controller; the actual timeout
   * is set up later inside the try block before streaming begins.
   */
  let timeoutController = new AbortController()

  try {
    // ========================================================================
    // AUTHENTICATION
    // ========================================================================

    const session = await auth.api.getSession({
      headers: headersList,
    })

    if (!session?.user) {
      return createErrorResponse(
        MOCHI_ERROR_CODES.UNAUTHORIZED,
        'Authentication required',
        401
      )
    }

    // ========================================================================
    // REQUEST PARSING & VALIDATION
    // ========================================================================

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return createErrorResponse(
        MOCHI_ERROR_CODES.INVALID_REQUEST,
        'Invalid JSON body',
        400
      )
    }

    const validation = requestSchema.safeParse(body)
    if (!validation.success) {
      return createErrorResponse(
        MOCHI_ERROR_CODES.INVALID_REQUEST,
        'Invalid request data',
        400
      )
    }

    const { messages, organizationId, modelId: rawModelId, pageContext, backgroundMode: explicitBg } = validation.data

    /** Resolve and validate the requested model against the allowed list */
    const modelId = resolveModelId(rawModelId)

    // Validate last message length
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.content.length > MAX_PROMPT_LENGTH) {
      return createErrorResponse(
        MOCHI_ERROR_CODES.PROMPT_TOO_LONG,
        `Prompt exceeds ${MAX_PROMPT_LENGTH} characters`,
        400
      )
    }

    // ========================================================================
    // AUTHORIZATION
    // ========================================================================

    const hasAccess = await hasOrganizationMembership(
      session.user.id,
      organizationId
    )

    if (!hasAccess) {
      return createErrorResponse(
        MOCHI_ERROR_CODES.FORBIDDEN,
        'Access denied to this organization',
        403
      )
    }

    // ========================================================================
    // WALLET BALANCE CHECK
    // ========================================================================

    /**
     * Pre-flight check: block AI usage if the organization has no funds.
     * WHY: Without this, AI streams run and charges are recorded after,
     * allowing the balance to go negative indefinitely.
     * Returns 402 Payment Required so the frontend can prompt the user.
     */
    const balanceCheck = await ensureSufficientBalance(organizationId)

    if (!balanceCheck.allowed) {
      return createErrorResponse(
        MOCHI_ERROR_CODES.INSUFFICIENT_BALANCE,
        balanceCheck.reason || 'Insufficient wallet balance',
        402
      )
    }

    // ========================================================================
    // AI STREAMING WITH TOOLS
    // ========================================================================

    /**
     * Create tRPC caller with full middleware chain (permissions, feature gates, Stripe connect).
     * WHY: All AI tools route through tRPC instead of calling services directly,
     * ensuring the same security enforcement as UI-initiated tRPC calls.
     */
    const caller = await createCaller()

    /**
     * Create all tools bound to this organization and tRPC caller.
     * Tools call tRPC procedures via the caller for full middleware enforcement.
     */
    const tools = createAllMochiTools(organizationId, caller)

    /**
     * Stream the AI response using Vercel AI SDK.
     * stopWhen: stepCountIs(MAX_STEPS) allows multi-turn tool calling:
     * the AI calls tools, sees results, and can call more tools or
     * generate a final response — up to MAX_STEPS total steps.
     */
    /**
     * Build the system prompt — append page context and contract prompt.
     *
     * When `pageContext` is present (e.g., contract builder context),
     * it's appended so the AI knows what the user has open.
     */
    const systemParts: string[] = [MOCHI_SYSTEM_PROMPT]

    /**
     * Append prompt extensions from all active execution strategies.
     * Each strategy contributes its system prompt section (e.g., contract
     * generation instructions, UI rendering rules). This is registry-driven —
     * adding a new strategy doesn't require changes here.
     */
    for (const ext of getActivePromptExtensions({ pageContext })) {
      systemParts.push(ext)
    }

    if (pageContext) {
      systemParts.push(`## Current Page Context\n\n${pageContext}`)
    }

    /**
     * Detect background mode — either from explicit client flag or by
     * scanning the last user message for intent patterns like
     * "in the background", "don't navigate", "stay here", etc.
     *
     * When active, instruct the AI to suppress all navigation and
     * report everything inline in the chat response.
     */
    const lastUserContent = lastMessage?.content ?? ''
    const isBackgroundMode = explicitBg || detectBackgroundIntent(lastUserContent)

    /**
     * Background mode system prompt injection.
     *
     * WHY the old prompt was wrong: It told the AI to "set navigate: false on
     * ALL _event objects in tool results" — but the AI cannot modify tool
     * results after they're returned. Navigation suppression actually happens
     * on the CLIENT side, which strips the navigate flag. The AI's job is
     * simply to avoid TALKING about navigation or suggesting it.
     */
    if (isBackgroundMode) {
      systemParts.push(
        `## Background Mode Active\n` +
        `You are in background mode. The user chose to stay on their current page. ` +
        `Do NOT tell the user you are opening any builder or navigating anywhere. ` +
        `Do NOT suggest the user navigate — the content is being created in the background ` +
        `and will be ready when they choose to view it.`
      )
    }

    const systemPrompt = systemParts.join('\n\n')

    /**
     * Custom AbortController for generation timeout with error differentiation.
     *
     * WHY: AbortSignal.timeout() throws a generic AbortError with no way to
     * distinguish a timeout from a user-initiated abort or other abort causes.
     * By using our own controller + setTimeout, we can abort with a custom
     * reason ("GENERATION_TIMEOUT") that the catch block can identify and
     * return a specific MOCHI_AI_TIMEOUT error code instead of a generic 500.
     *
     * CLEANUP: The timeout is cleared when the stream finishes (via result.usage)
     * to prevent the timer from firing after the response is already sent,
     * which would leak memory and trigger a spurious abort.
     */
    timeoutController = new AbortController()
    const timeoutHandle = setTimeout(() => {
      timeoutController.abort(new Error('GENERATION_TIMEOUT'))
    }, GENERATION_TIMEOUT_MS)

    /**
     * Transform messages with image attachments into multi-part UserContent
     * for the Vercel AI SDK. User messages with images become an array of
     * TextPart + ImagePart objects; all other messages pass through as-is.
     *
     * The AI SDK natively supports this format — Claude sees both the text
     * prompt and the attached images for vision analysis.
     */
    const sdkMessages = messages.map((msg) => {
      if (msg.role === 'user' && msg.images?.length) {
        return {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: msg.content },
            ...msg.images.map((img) => ({
              type: 'image' as const,
              image: img.base64,
              mediaType: img.mediaType,
            })),
          ],
        }
      }
      return { role: msg.role as 'user' | 'assistant', content: msg.content }
    })

    /**
     * Stream the AI response. Do NOT await streamText() — it returns a
     * thenable StreamTextResult. Awaiting would block until the full
     * generation finishes. By using the result directly, .toUIMessageStream()
     * yields chunks in real-time as the model produces tokens.
     */
    const result = streamText({
      model: createGatewayModel(modelId),
      system: systemPrompt,
      messages: sdkMessages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: timeoutController.signal,
      providerOptions: getGatewayProviderOptions(modelId),

      /**
       * STORAGE VISION — URL-based image injection.
       *
       * When getStorageFile returns an image, it includes the image URL in
       * a _imageUrl field. This hook injects the URL as a user message image
       * part so the model sees the image through standard vision — the same
       * path as user-uploaded images. Works with ALL vision-capable providers.
       *
       * URLs are tiny so this won't blow up context like base64 would.
       */
      prepareStep({ steps, stepNumber, messages }) {
        if (stepNumber === 0 || steps.length === 0) return undefined

        const lastStep = steps[steps.length - 1]
        const imageUrls: string[] = []

        for (const toolResult of lastStep.toolResults) {
          const output = toolResult.output as Record<string, unknown> | undefined
          if (!output || typeof output !== 'object') continue
          const imageUrl = output._imageUrl as string | undefined
          if (imageUrl) imageUrls.push(imageUrl)
        }

        if (imageUrls.length === 0) return undefined

        return {
          messages: [
            ...messages,
            {
              role: 'user' as const,
              content: [
                { type: 'text' as const, text: 'Here are the storage images I retrieved. Describe what you see.' },
                ...imageUrls.map((url) => ({ type: 'image' as const, image: new URL(url) })),
              ],
            },
          ],
        }
      },
    })

    /**
     * Clear the timeout once the stream finishes to prevent memory leaks.
     * result.usage resolves when all generation steps are complete, making
     * it the ideal signal that the stream has finished normally.
     */
    result.usage
      .then(() => clearTimeout(timeoutHandle))
      .catch(() => clearTimeout(timeoutHandle))

    /**
     * Post-stream wallet charging with retry and audit trail.
     *
     * WHY: The old fire-and-forget approach silently swallowed charge failures,
     * meaning lost revenue with zero visibility. Now we retry up to 3 times
     * with exponential backoff (1s, 2s), and if ALL retries fail, we record
     * a FAILED WalletTransaction so finance can see and recover it.
     *
     * HOW: Uses the .usage promise which resolves once the full response
     * (including all tool-call steps) is finished. The charging runs in the
     * background — it never blocks the streamed response to the user.
     */
    result.usage.then(async (usage) => {
      const totalTokens = usage.totalTokens ?? 0
      if (totalTokens <= 0) return

      const tokenBreakdown = {
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
      }

      /** Maximum number of charge attempts before giving up */
      const MAX_CHARGE_RETRIES = 3
      /** Backoff delays in ms between retries (1s, then 2s) */
      const RETRY_DELAYS_MS = [1000, 2000]

      let lastError: Error | null = null

      for (let attempt = 1; attempt <= MAX_CHARGE_RETRIES; attempt++) {
        try {
          await chargeForAIUsage(
            organizationId,
            totalTokens,
            modelId,
            'Mochi AI chat',
            tokenBreakdown
          )
          /** Charge succeeded — exit the retry loop */
          return
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          console.error(
            `[Mochi AI] Charge attempt ${attempt}/${MAX_CHARGE_RETRIES} failed:`,
            lastError.message
          )

          /** Wait before the next retry (skip delay after the final attempt) */
          if (attempt < MAX_CHARGE_RETRIES) {
            const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? 2000
            await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
          }
        }
      }

      /**
       * All retries exhausted — record a FAILED transaction for audit/recovery.
       * This ensures finance has visibility into lost charges and an automated
       * recovery job can pick them up later.
       */
      try {
        await recordFailedAICharge(
          organizationId,
          totalTokens,
          modelId,
          'Mochi AI chat',
          lastError?.message ?? 'Unknown charge failure',
          tokenBreakdown
        )
        console.error(
          '[Mochi AI] All charge retries failed — FAILED transaction recorded for audit.',
          { organizationId, totalTokens, model: modelId }
        )
      } catch (recordErr) {
        /**
         * CRITICAL: Even recording the failure failed. This is the worst case —
         * log everything we know so ops can manually investigate.
         */
        console.error(
          '[Mochi AI] CRITICAL: Failed to record failed charge audit trail.',
          { organizationId, totalTokens, model: modelId, chargeError: lastError?.message, recordError: recordErr }
        )
      }
    }).catch((err) => {
      /**
       * The .usage promise itself rejected — this means the stream errored
       * before usage could be calculated. Nothing to charge for.
       */
      console.error('[Mochi AI] Usage tracking failed (stream error):', err)
    })

    /**
     * Stream processing pipeline — pipeContentFences() detects all registered
     * content fences (```contract, ```ui-spec, etc.) and separates them into
     * typed data-{name} events. Fence names come from the strategy registry.
     * Non-text chunks (tool calls, tool results, etc.) pass through unchanged.
     */
    const fenceNames = getAllFenceNames()
    console.log(`[Mochi AI] Active fences: [${fenceNames.join(', ')}] | pageContext: ${pageContext?.slice(0, 60) || 'none'}`)

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.merge(pipeContentFences(result.toUIMessageStream(), fenceNames))
      },
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    console.error('[Mochi AI] Chat error:', error)

    /**
     * Detect generation timeout — our custom AbortController aborts with
     * a reason of Error('GENERATION_TIMEOUT'). The AbortError wraps this
     * reason, so we check both the error message itself and the abort
     * signal's reason for the sentinel string.
     *
     * WHY: Timeouts deserve their own error code (MOCHI_AI_TIMEOUT) and
     * a 408 status so the client can show "took too long" messaging
     * instead of a generic "something went wrong".
     */
    const errorMessage = error instanceof Error ? error.message : String(error)

    /**
     * Check multiple signals for our custom timeout:
     * 1. The error message itself contains 'GENERATION_TIMEOUT' (direct throw)
     * 2. It's an AbortError AND the controller's signal.reason is our Error
     *    (some runtimes wrap the reason in a DOMException)
     */
    const isAbortError = error instanceof DOMException && error.name === 'AbortError'
    const signalReason = timeoutController.signal.reason
    const isTimeoutReason = signalReason instanceof Error && signalReason.message === 'GENERATION_TIMEOUT'
    const isTimeout = errorMessage.includes('GENERATION_TIMEOUT') || (isAbortError && isTimeoutReason)

    if (isTimeout) {
      return createErrorResponse(
        MOCHI_ERROR_CODES.TIMEOUT,
        `AI generation timed out after ${GENERATION_TIMEOUT_MS / 1000} seconds. Try a simpler prompt or break it into smaller steps.`,
        408
      )
    }

    /**
     * Extract a meaningful error message from AI SDK errors.
     * AI_APICallError (from @ai-sdk/provider) has statusCode, responseBody,
     * and message properties that contain the actual Anthropic API error.
     */
    const aiError = error as {
      statusCode?: number
      message?: string
      responseBody?: string
    }

    const statusCode =
      aiError.statusCode && aiError.statusCode >= 400 && aiError.statusCode < 600
        ? aiError.statusCode
        : 500

    // Log the detailed error server-side for debugging, but never leak it to the client
    console.error('[AI Chat] Generation failed:', aiError.message || error)

    return createErrorResponse(
      MOCHI_ERROR_CODES.GENERATION_FAILED,
      'Failed to generate response',
      statusCode
    )
  }
}
