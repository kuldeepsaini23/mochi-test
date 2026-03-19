/**
 * ============================================================================
 * USE MOCHI AI HOOK
 * ============================================================================
 *
 * Manages the Mochi AI streaming chat with tool calling.
 *
 * This hook:
 * 1. Sends messages to the /api/ai/chat streaming endpoint
 * 2. Parses the Vercel AI SDK UI message stream protocol (SSE format)
 * 3. Updates messages state with streamed text + tool call events
 * 4. Handles abort, error, and reset flows
 *
 * Parses the Vercel AI SDK UI message stream protocol
 * (toUIMessageStreamResponse) which sends SSE events where
 * each `data:` line contains a JSON object with a `type` field.
 *
 * SOURCE OF TRUTH KEYWORDS: useMochiAI, MochiAIHook, MochiStreaming
 * ============================================================================
 */

'use client'

import { useCallback, useRef, useState } from 'react'
import type {
  MochiAIState,
  MochiMessage,
  MochiImageAttachment,
  MochiToolCall,
  UseMochiAIResult,
} from '@/lib/ai/mochi/types'
import { MOCHI_AI_ENDPOINT, MAX_PROMPT_LENGTH } from '@/lib/ai/mochi/constants'
import { emitMochiEvent } from '@/lib/ai/mochi/events'
import type { MochiAIEvent } from '@/lib/ai/mochi/events'

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: MochiAIState = {
  status: 'idle',
  error: null,
  currentPrompt: null,
}

// ============================================================================
// UI MESSAGE STREAM PROTOCOL PARSER
// ============================================================================

/**
 * Represents a parsed event from the UI message stream protocol.
 * Each SSE `data:` line contains a JSON object with a `type` field.
 *
 * SOURCE OF TRUTH KEYWORDS: UIMessageStreamEvent, MochiStreamEvent
 */
type UIMessageStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string }
  | { type: 'tool_call_delta'; toolCallId: string; inputTextDelta: string }
  | {
      type: 'tool_call'
      toolCallId: string
      toolName: string
      input: Record<string, unknown>
    }
  | {
      type: 'tool_result'
      toolCallId: string
      output: Record<string, unknown>
    }
  | { type: 'tool_error'; toolCallId: string; errorText: string }
  | { type: 'finish'; finishReason?: string }
  | { type: 'error'; message: string }
  /**
   * Contract content fence events — emitted by pipeContractContent() when
   * the model outputs markdown inside ```contract code fences.
   * Part of the modular content fence architecture.
   */
  | { type: 'data_contract_start'; mode: string }
  | { type: 'data_contract'; delta: string }
  | { type: 'data_contract_complete' }
  /**
   * UI spec content fence events — emitted by pipeContentFences() when
   * the model outputs JSONL patches inside ```ui-spec code fences.
   * Part of the modular content fence architecture (json-render integration).
   */
  | { type: 'data_ui_spec_start'; mode: string }
  | { type: 'data_ui_spec'; delta: string }
  | { type: 'data_ui_spec_complete' }

/**
 * Parses a single SSE line from the Vercel AI SDK UI message stream protocol.
 *
 * The UI message stream (toUIMessageStreamResponse) sends Server-Sent Events
 * where each event is formatted as: `data: {JSON}\n\n`
 *
 * The JSON object has a `type` field indicating the event kind:
 * - text-delta:           text chunk with `delta` field
 * - tool-input-start:     tool call start with `toolCallId`, `toolName`
 * - tool-input-delta:     tool call args delta with `toolCallId`, `inputTextDelta`
 * - tool-input-available: complete tool call with `toolCallId`, `toolName`, `input`
 * - tool-output-available: tool result with `toolCallId`, `output`
 * - tool-output-error:    tool execution error with `toolCallId`, `errorText`
 * - tool-input-error:     tool input validation error with `toolCallId`, `errorText`
 * - finish:               stream complete with optional `finishReason`
 * - error:                stream error with `errorText`
 * - start / start-step / finish-step / text-start / text-end: lifecycle events (ignored)
 *
 * @param line - A single line from the SSE stream (e.g. 'data: {"type":"text-delta","delta":"hi"}')
 * @returns Parsed event or null if line is empty, a comment, or unrecognized
 */
function parseStreamLine(line: string): UIMessageStreamEvent | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed === '') return null

  // SSE format: lines starting with "data: " contain the JSON payload
  // The terminal "[DONE]" marker signals the end of the stream
  if (trimmed === 'data: [DONE]') {
    return { type: 'finish', finishReason: 'stop' }
  }

  // Only process SSE data lines
  if (!trimmed.startsWith('data: ')) return null

  const jsonStr = trimmed.slice(6) // Strip the "data: " prefix

  try {
    const chunk = JSON.parse(jsonStr) as Record<string, unknown>
    const chunkType = chunk.type as string

    switch (chunkType) {
      case 'text-delta': {
        // Streamed text content — `delta` contains the text fragment
        return { type: 'text', text: chunk.delta as string }
      }

      case 'tool-input-start': {
        // A new tool call is beginning — AI has started generating tool args
        return {
          type: 'tool_call_start',
          toolCallId: chunk.toolCallId as string,
          toolName: chunk.toolName as string,
        }
      }

      case 'tool-input-delta': {
        // Streaming fragment of tool call arguments (JSON text delta)
        return {
          type: 'tool_call_delta',
          toolCallId: chunk.toolCallId as string,
          inputTextDelta: chunk.inputTextDelta as string,
        }
      }

      case 'tool-input-available': {
        // Complete tool call — all arguments are parsed and available
        return {
          type: 'tool_call',
          toolCallId: chunk.toolCallId as string,
          toolName: chunk.toolName as string,
          input: (chunk.input as Record<string, unknown>) || {},
        }
      }

      case 'tool-output-available': {
        // Tool execution completed successfully — result is available
        return {
          type: 'tool_result',
          toolCallId: chunk.toolCallId as string,
          output: (chunk.output as Record<string, unknown>) || {},
        }
      }

      case 'tool-output-error':
      case 'tool-input-error': {
        // Tool execution or input validation failed
        return {
          type: 'tool_error',
          toolCallId: chunk.toolCallId as string,
          errorText: chunk.errorText as string,
        }
      }

      case 'finish': {
        // Stream has finished — finishReason indicates why (stop, tool-calls, etc.)
        return {
          type: 'finish',
          finishReason: (chunk.finishReason as string) || 'stop',
        }
      }

      case 'error': {
        // Stream-level error
        return {
          type: 'error',
          message: (chunk.errorText as string) || 'Unknown error',
        }
      }

      /**
       * Contract content fence events — from pipeContractContent().
       * Part of the modular content fence architecture. These events carry
       * contract markdown from the chat stream to the contract builder.
       */
      case 'data-contract-start': {
        return {
          type: 'data_contract_start',
          mode: (chunk.mode as string) || 'generate',
        }
      }

      case 'data-contract': {
        return {
          type: 'data_contract',
          delta: (chunk.delta as string) || '',
        }
      }

      case 'data-contract-complete': {
        return { type: 'data_contract_complete' }
      }

      /**
       * UI spec content fence events — from pipeContentFences(['ui-spec']).
       * Part of the json-render integration. These events carry JSONL patches
       * from the chat stream to the json-render panel.
       */
      case 'data-ui-spec-start': {
        return {
          type: 'data_ui_spec_start',
          mode: (chunk.mode as string) || 'generate',
        }
      }

      case 'data-ui-spec': {
        return {
          type: 'data_ui_spec',
          delta: (chunk.delta as string) || '',
        }
      }

      case 'data-ui-spec-complete': {
        return { type: 'data_ui_spec_complete' }
      }

      // Lifecycle events we don't need to handle in the UI:
      // start, start-step, finish-step, text-start, text-end,
      // reasoning-*, source-*, file, message-metadata, abort
      default:
        return null
    }
  } catch (err) {
    /** Log SSE parse failures so stream issues are debuggable */
    console.warn('[Mochi AI] SSE line parse failed:', err, '| raw line:', line?.slice(0, 200))
    return null
  }
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

interface UseMochiAIOptions {
  /** Organization ID for the API route */
  organizationId: string
  /** Optional AI gateway model ID (e.g. "anthropic/claude-sonnet-4.5") */
  modelId?: string
  /**
   * Optional page context injected into the system prompt.
   * WHY: When the user has a specific resource open (e.g., a contract in the
   * builder), the AI should know about it without the user having to specify
   * the ID manually. This context string is appended to the system prompt.
   *
   * @example "The user currently has contract \"Client NDA\" (ID: abc123) open in the contract builder."
   */
  pageContext?: string
  /**
   * When true, the AI suppresses navigation and reports all results inline.
   * Detected from user intent or toggled via the widget UI.
   */
  backgroundMode?: boolean
}

/**
 * Hook for Mochi AI streaming chat with tool calling.
 *
 * @example
 * ```tsx
 * const { state, messages, send, abort, reset, clearMessages } = useMochiAI({
 *   organizationId: 'org_123',
 * })
 *
 * // Send a message
 * await send('Create a lead named John Doe')
 *
 * // Check state
 * if (state.status === 'streaming') { ... }
 *
 * // Abort
 * abort()
 * ```
 */
export function useMochiAI(options: UseMochiAIOptions): UseMochiAIResult {
  const { organizationId, modelId, pageContext, backgroundMode } = options

  const [state, setState] = useState<MochiAIState>(initialState)
  const [messages, setMessages] = useState<MochiMessage[]>([])

  /** Abort controller for cancelling the current stream */
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * Ref mirror of backgroundMode for synchronous reads inside the streaming loop.
   *
   * WHY: When handleSendResponse calls setBackgroundMode(true) then send(),
   * the send closure captures the OLD backgroundMode value (false) from when
   * useCallback created it. The ref is always current because it's updated
   * on every render AND the widget sets it synchronously via backgroundModeRef.
   *
   * Used for:
   * 1. Sending the correct backgroundMode to the server in the fetch body
   * 2. Stripping navigate:true from tool events before emission — the tools
   *    hardcode navigate:true and the AI can't change it, so we must enforce
   *    background mode suppression at the event emission point.
   */
  const backgroundModeRef = useRef(backgroundMode)
  backgroundModeRef.current = backgroundMode

  /**
   * Flag for intentional/silent aborts.
   *
   * WHY: When the stream is intentionally aborted, the AbortError catch block
   * fires on the next microtask with `setState` + `setMessages` — these are
   * URGENT React updates that can INTERRUPT navigation transitions (which use
   * `startTransition` internally in Next.js App Router).
   *
   * When this flag is true, the catch block skips its state updates so any
   * concurrent navigation transition completes without interference.
   */
  const intentionalAbortRef = useRef(false)

  /**
   * Sends a user prompt to the AI and streams the response.
   * Adds both user and assistant messages to the messages array.
   *
   * @param prompt - The user's message text
   * @param extraContext - Optional additional context (e.g., selection info)
   *   merged with pageContext for this single request
   */
  const send = useCallback(
    async (prompt: string, extraContext?: string, images?: MochiImageAttachment[]): Promise<void> => {
      const trimmed = prompt.trim()
      if (!trimmed || trimmed.length > MAX_PROMPT_LENGTH) return

      /**
       * If a previous stream is active, mark its abort as intentional BEFORE
       * aborting, so its catch block skips the "aborted" status update.
       *
       * WHY: Without this, the sequence is: reset flag → abort → old catch runs
       * with flag=false → sets status='aborted' → new stream sets status='connecting'.
       * This causes a brief "aborted" flicker between the two sends.
       *
       * The flag is only reset to false AFTER aborting, so only a NEW unexpected
       * abort (not this intentional one) will enter the non-intentional path.
       */
      if (abortControllerRef.current) {
        intentionalAbortRef.current = true
        abortControllerRef.current.abort()
      }
      intentionalAbortRef.current = false

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Create user message (with optional image attachments)
      const userMessage: MochiMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        ...(images?.length ? { imageAttachments: images } : {}),
      }

      // Create placeholder assistant message
      const assistantMessageId = `assistant-${Date.now()}`
      const assistantMessage: MochiMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        isStreaming: true,
        timestamp: new Date(),
      }

      // Add both messages
      setMessages((prev) => [...prev, userMessage, assistantMessage])

      // Update state to connecting
      setState({
        status: 'connecting',
        error: null,
        currentPrompt: trimmed,
      })

      try {
        /**
         * Build the messages array for the API.
         * Include previous conversation history + the new user message.
         * Only send role and content (the AI SDK format).
         *
         * For assistant messages that generated ui-spec content, append a
         * hidden marker so the AI knows it previously output JSONL patches
         * and should continue doing so. This marker is NEVER displayed in
         * the chat — it's only included in API conversation history.
         *
         * Also sanitize old fake code fence markers from earlier sessions
         * that may still exist in message content.
         */
        const UI_SPEC_HISTORY_MARKER =
          '\n\n[I previously generated ui-spec JSONL patches that were rendered to the website builder canvas. For follow-up requests, I must output a NEW ui-spec fence with real JSONL patch lines like {"op":"add","path":"/root","value":"..."} — never put markdown, bullet points, or descriptions inside the fence.]'

        const apiMessages = [
          ...messages
            .filter((m) => m.content)
            .map((m) => {
              let content = m.content
              if (m.role === 'assistant') {
                content = sanitizeUISpecMarkers(content)
                /** Append the ui-spec history marker for messages that generated specs */
                if (m._uiSpecGenerated) {
                  content += UI_SPEC_HISTORY_MARKER
                }
              }
              return {
                role: m.role,
                content,
                /**
                 * Include image attachments for user messages that had images.
                 * Only the current message's images are sent — previous turns'
                 * images are omitted to keep the payload size manageable.
                 * The AI's previous response already incorporated what it saw.
                 */
                ...(m.role === 'user' && m.imageAttachments?.length
                  ? { images: m.imageAttachments.map((img) => ({ base64: img.base64, mediaType: img.mediaType })) }
                  : {}),
              }
            }),
          {
            role: 'user' as const,
            content: trimmed,
            ...(images?.length
              ? { images: images.map((img) => ({ base64: img.base64, mediaType: img.mediaType })) }
              : {}),
          },
        ]

        /**
         * Merge pageContext + extraContext for the API request.
         * extraContext carries per-request info like the user's canvas selection.
         */
        const mergedPageContext = extraContext
          ? [pageContext, extraContext].filter(Boolean).join('\n')
          : pageContext

        /**
         * Read backgroundMode from the ref (not the closure) for the fetch body.
         * WHY: When handleSendResponse sets backgroundMode=true then calls send(),
         * the closure still has backgroundMode=false. The ref is always current
         * because it's synced on every render AND set synchronously by the widget.
         */
        const response = await fetch(MOCHI_AI_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            organizationId,
            modelId,
            pageContext: mergedPageContext,
            backgroundMode: backgroundModeRef.current,
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            (errorData as { message?: string }).message ||
            `HTTP ${response.status}`
          )
        }

        // Switch to streaming state
        setState((prev) => ({ ...prev, status: 'streaming' }))

        // Process the streaming response
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Response body is not readable')

        const decoder = new TextDecoder()
        let buffer = ''

        /**
         * Track tool call argument deltas for streaming tool calls.
         * The UI message stream protocol sends tool-input-start, then
         * tool-input-delta chunks, then tool-input-available with parsed args,
         * then tool-output-available with results. We accumulate args text
         * in case we need to parse them from deltas.
         */
        const toolCallArgsBuffer: Record<string, string> = {}

        /**
         * Track the last finish reason from the stream.
         * If the model was cut off by MAX_STEPS (finishReason !== 'stop'),
         * we'll show a user-friendly message explaining why it stopped.
         */
        let lastFinishReason: string | undefined

        /**
         * Flag to break out of BOTH the inner for-loop AND the outer while-loop
         * when an event handler triggers an abort during processing.
         *
         * WHY: When emitMochiEvent() calls the widget handler synchronously and
         * the handler calls abort({ silent: true }), we need to stop processing
         * ALL remaining SSE lines immediately. Otherwise `finish` events queue
         * more urgent setMessages calls that cancel the router.push() transition.
         */
        let abortedDuringLoop = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Process complete lines
          const lines = buffer.split('\n')
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || ''

          for (const line of lines) {
            const event = parseStreamLine(line)
            if (!event) continue

            switch (event.type) {
              case 'text': {
                // Append text to the assistant message
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + event.text }
                      : msg
                  )
                )
                break
              }

              case 'tool_call_start': {
                // A new tool call is starting (streaming mode)
                toolCallArgsBuffer[event.toolCallId] = ''
                const newToolCall: MochiToolCall = {
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  args: {},
                  status: 'executing',
                }
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          toolCalls: [...(msg.toolCalls || []), newToolCall],
                        }
                      : msg
                  )
                )
                break
              }

              case 'tool_call_delta': {
                // Accumulate argument text delta for streaming tool calls
                if (toolCallArgsBuffer[event.toolCallId] !== undefined) {
                  toolCallArgsBuffer[event.toolCallId] += event.inputTextDelta
                }
                break
              }

              case 'tool_call': {
                /**
                 * Complete tool call (tool-input-available) — args are fully parsed.
                 * If we already added this tool call via tool_call_start, update its args.
                 * Otherwise add it fresh (non-streaming mode).
                 */
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg
                    const existingIndex = (msg.toolCalls || []).findIndex(
                      (tc) => tc.toolCallId === event.toolCallId
                    )
                    if (existingIndex >= 0) {
                      // Update existing tool call with parsed args
                      return {
                        ...msg,
                        toolCalls: (msg.toolCalls || []).map((tc) =>
                          tc.toolCallId === event.toolCallId
                            ? { ...tc, args: event.input }
                            : tc
                        ),
                      }
                    }
                    // Add new tool call (non-streaming path)
                    const newToolCall: MochiToolCall = {
                      toolCallId: event.toolCallId,
                      toolName: event.toolName,
                      args: event.input,
                      status: 'executing',
                    }
                    return {
                      ...msg,
                      toolCalls: [...(msg.toolCalls || []), newToolCall],
                    }
                  })
                )
                break
              }

              case 'tool_result': {
                // Tool call completed successfully — update its status and output
                const output = event.output

                /**
                 * Emit event from tool result `_event` metadata BEFORE setMessages.
                 *
                 * CRITICAL ORDER: Event emission MUST happen BEFORE the setMessages call.
                 * WHY: setMessages is an URGENT React update. If it fires before the
                 * event handler calls router.push() (which uses startTransition internally),
                 * React queues the urgent update first. When the transition tries to commit,
                 * React sees a pending urgent update, interrupts the transition, and the
                 * navigation is silently discarded. By emitting first, the event handler
                 * can call abort({ silent: true }) + router.push() before any urgent
                 * updates get queued.
                 *
                 * The event handler runs SYNCHRONOUSLY — emitMochiEvent() calls listeners
                 * directly. If a listener calls abort(), intentionalAbortRef becomes true
                 * in the same call stack, so we can detect it and break out of the loop.
                 */
                if (output?._event) {
                  try {
                    const toolEvent = output._event as MochiAIEvent

                    /**
                     * BACKGROUND MODE NAVIGATION SUPPRESSION
                     *
                     * Strip navigate:true from tool events when background mode is active.
                     * WHY: Tool code (e.g., createPage in websites.ts) HARDCODES
                     * navigate:true in _event objects — the AI cannot change these values
                     * even when the system prompt instructs "set navigate: false".
                     * This is the authoritative enforcement point for background mode.
                     *
                     * Reads from backgroundModeRef (not the closure) so the value is
                     * always current even when send() was called with a stale closure.
                     */
                    if (backgroundModeRef.current && toolEvent.navigate) {
                      toolEvent.navigate = false
                    }

                    emitMochiEvent(toolEvent)
                  } catch (err) {
                    console.warn('[MochiEvents] Failed to emit event:', err)
                  }

                  /**
                   * Check if the event handler triggered an abort (silent or otherwise).
                   * If so, skip the setMessages call and break out of the for loop —
                   * remaining SSE lines (like `finish` events) would queue MORE urgent
                   * state updates that cancel the navigation transition.
                   */
                  if (intentionalAbortRef.current) {
                    abortedDuringLoop = true
                    break
                  }
                }

                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg
                    return {
                      ...msg,
                      toolCalls: (msg.toolCalls || []).map((tc) =>
                        tc.toolCallId === event.toolCallId
                          ? {
                              ...tc,
                              result: output,
                              status: (output?.success === false
                                ? 'error'
                                : 'complete') as MochiToolCall['status'],
                              // Parse args from buffer if we had streaming deltas
                              args:
                                Object.keys(tc.args).length === 0 &&
                                toolCallArgsBuffer[tc.toolCallId]
                                  ? safeParseJSON(
                                      toolCallArgsBuffer[tc.toolCallId]
                                    )
                                  : tc.args,
                            }
                          : tc
                      ),
                    }
                  })
                )

                break
              }

              case 'tool_error': {
                // Tool call failed — mark the tool call as errored
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg
                    return {
                      ...msg,
                      toolCalls: (msg.toolCalls || []).map((tc) =>
                        tc.toolCallId === event.toolCallId
                          ? {
                              ...tc,
                              result: { success: false, error: event.errorText },
                              status: 'error' as MochiToolCall['status'],
                            }
                          : tc
                      ),
                    }
                  })
                )
                break
              }

              /**
               * Contract content fence events — from pipeContractContent().
               * Emit to the Mochi event bus so the contract builder
               * (via useMochiEvents) can apply markdown to the Lexical editor.
               */
              case 'data_contract_start': {
                emitMochiEvent({
                  feature: 'contract',
                  action: 'contract_content',
                  entityId: '',
                  data: { type: 'start', mode: event.mode },
                })
                break
              }

              case 'data_contract': {
                emitMochiEvent({
                  feature: 'contract',
                  action: 'contract_content',
                  entityId: '',
                  data: { type: 'delta', delta: event.delta },
                })
                break
              }

              case 'data_contract_complete': {
                emitMochiEvent({
                  feature: 'contract',
                  action: 'contract_content_complete',
                  entityId: '',
                })
                break
              }

              /**
               * UI spec content fence events — from pipeContentFences(['ui-spec']).
               * Emit to the Mochi event bus so the json-render panel
               * (via useMochiEvents) can build UI specs progressively.
               */
              case 'data_ui_spec_start': {
                emitMochiEvent({
                  feature: 'ui-render',
                  action: 'ui_spec_content',
                  entityId: '',
                  data: { type: 'start', mode: event.mode },
                })
                break
              }

              case 'data_ui_spec': {
                emitMochiEvent({
                  feature: 'ui-render',
                  action: 'ui_spec_content',
                  entityId: '',
                  data: { type: 'delta', delta: event.delta },
                })
                break
              }

              case 'data_ui_spec_complete': {
                emitMochiEvent({
                  feature: 'ui-render',
                  action: 'ui_spec_content_complete',
                  entityId: '',
                })

                /**
                 * Flag this assistant message as having generated ui-spec content.
                 *
                 * WHY: The content fence transform strips ```ui-spec content from
                 * text-delta events, so the assistant message only contains surrounding
                 * text. When this history is sent to the API on the NEXT message, the AI
                 * doesn't see it ever generated a ui-spec fence — it learns to just
                 * describe sections in text instead of outputting fences.
                 *
                 * We set a metadata flag (_uiSpecGenerated) instead of injecting text
                 * into the message content. The flag is only used when building API
                 * messages — the marker text is appended there, never displayed in chat.
                 */
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, _uiSpecGenerated: true }
                      : msg
                  )
                )
                break
              }

              case 'finish': {
                /**
                 * Stream finished — save the finish reason and mark message as done.
                 * If finishReason is NOT 'stop', the model was cut off by MAX_STEPS.
                 */
                lastFinishReason = event.finishReason
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, isStreaming: false }
                      : msg
                  )
                )
                break
              }

              case 'error': {
                /**
                 * Stream error — display the actual error text from the AI provider.
                 * Maps known Anthropic API errors to user-friendly messages.
                 */
                const friendlyError = humanizeStreamError(event.message)
                setState((prev) => ({
                  ...prev,
                  status: 'error',
                  error: friendlyError,
                }))
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: msg.content || friendlyError,
                          isStreaming: false,
                        }
                      : msg
                  )
                )
                return
              }
            }
          }

          /**
           * If an event handler triggered an abort during the for-loop,
           * exit the outer while-loop immediately. The next reader.read()
           * would throw AbortError, but we skip it to avoid any further
           * state updates that could interfere with the navigation transition.
           */
          if (abortedDuringLoop) {
            break
          }
        }

        /**
         * Skip ALL post-loop state updates if an event handler triggered an abort.
         * These setMessages/setState calls are urgent React updates that would
         * cancel the router.push() navigation transition in progress.
         */
        if (abortedDuringLoop) {
          intentionalAbortRef.current = false
          return
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const event = parseStreamLine(buffer)
          if (event?.type === 'text') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + event.text }
                  : msg
              )
            )
          }
        }

        /**
         * Detect if the stream was cut off by MAX_STEPS.
         * When finishReason is NOT 'stop', the model wanted to continue but
         * was stopped by the step limit. Append a helpful message so the user
         * knows to clear and try a simpler prompt.
         */
        const wasCutOff = lastFinishReason && lastFinishReason !== 'stop'

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== assistantMessageId) return msg
            const cutOffNotice = wasCutOff && !msg.content
              ? '\n\nI reached the maximum number of operations for a single prompt. Please clear the chat and try a simpler request, or break your request into smaller parts.'
              : ''
            return {
              ...msg,
              content: (msg.content || '') + cutOffNotice,
              isStreaming: false,
            }
          })
        )
        setState((prev) => ({ ...prev, status: 'complete' }))
      } catch (error) {
        // Handle abort
        if (error instanceof Error && error.name === 'AbortError') {
          /**
           * Skip state updates for intentional/silent aborts.
           *
           * WHY: These setState/setMessages calls are URGENT React updates. If they
           * fire while router.push()'s navigation transition is in progress, React
           * interrupts the transition (urgent > transition priority) and the navigation
           * is discarded.
           *
           * For silent aborts, the caller handles message cleanup synchronously,
           * so the catch block can safely skip.
           */
          if (intentionalAbortRef.current) {
            intentionalAbortRef.current = false
            return
          }
          setState((prev) => ({ ...prev, status: 'aborted' }))
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, isStreaming: false }
                : msg
            )
          )
          return
        }

        // Handle other errors — map to user-friendly messages
        const rawError =
          error instanceof Error ? error.message : 'Unknown error'
        const friendlyError = humanizeStreamError(rawError)
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: friendlyError,
        }))
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: friendlyError,
                  isStreaming: false,
                }
              : msg
          )
        )
      } finally {
        abortControllerRef.current = null
      }
    },
    [organizationId, modelId, pageContext, backgroundMode, messages]
  )

  /**
   * Abort the current streaming response.
   *
   * @param options.silent - When true, suppresses ALL async state updates from the abort.
   *   This prevents the AbortError catch block's setState/setMessages from firing as
   *   urgent React updates that would interrupt a concurrent router.push() transition.
   *   The caller is responsible for handling message cleanup synchronously.
   */
  const abort = useCallback((options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false

    if (silent) {
      intentionalAbortRef.current = true
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    if (silent) {
      /**
       * Mark streaming messages as done synchronously (same handler as router.push).
       * Synchronous urgent updates in the same handler DON'T cancel transitions —
       * React batches them and processes urgent first, then transition.
       */
      setMessages((prev) =>
        prev.map((msg) => msg.isStreaming ? { ...msg, isStreaming: false } : msg)
      )
    } else {
      /**
       * Transition any in-flight tool calls from 'executing'/'pending' → 'cancelled'
       * so the UI stops showing the spinner and shows the cancelled state instead.
       * Without this, tool call cards stay stuck in loading state forever after abort.
       */
      setMessages((prev) =>
        prev.map((msg) => ({
          ...msg,
          isStreaming: false,
          toolCalls: msg.toolCalls?.map((tc) =>
            tc.status === 'executing' || tc.status === 'pending'
              ? { ...tc, status: 'cancelled' as const }
              : tc
          ),
        }))
      )
      setState((prev) => ({ ...prev, status: 'aborted' }))
    }
  }, [])

  /**
   * Reset state to idle (does not clear messages)
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setState(initialState)
  }, [])

  /**
   * Clear all messages and reset state
   */
  const clearMessages = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setMessages([])
    setState(initialState)
  }, [])

  /**
   * Synchronously update the hook's internal backgroundMode ref.
   * Called by the widget BEFORE send() when background mode changes,
   * so the streaming loop reads the correct value immediately without
   * waiting for React's next re-render cycle.
   */
  const setBackgroundModeImmediate = useCallback((active: boolean) => {
    backgroundModeRef.current = active
  }, [])

  return { state, messages, send, abort, reset, clearMessages, setBackgroundModeImmediate }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Strips old fake ```ui-spec code fence markers from assistant message content
 * before sending conversation history to the API.
 *
 * WHY: An earlier implementation injected a real ```ui-spec code fence as a
 * placeholder marker into assistant messages. When this was sent as conversation
 * history, the AI echoed the placeholder text verbatim in a real ui-spec fence.
 * The server-side content fence transform then detected it, and the json-render
 * hook tried to JSON.parse the placeholder — causing a parsing error and an
 * empty spec (nothing rendered to canvas).
 *
 * This function replaces both the old fake fence format AND the new plain-text
 * format with a clean, consistent marker that the AI can learn from without
 * producing broken output.
 */
function sanitizeUISpecMarkers(content: string): string {
  let result = content

  /** Replace old fake code fence markers (the original bug) */
  result = result.replace(
    /\n*```ui-spec\n\[\.\.\.ui-spec JSONL patches rendered to canvas\.\.\.\]\n```\n*/g,
    '\n\n[I output JSONL patches inside a ui-spec fence and they were rendered to the canvas. For any future requests, I must output a NEW ui-spec fence with real JSONL patch lines starting with {"op":"add",...} — never put markdown or descriptions inside the fence.]\n\n'
  )

  /** Replace intermediate plain-text marker format (from earlier fix iteration) */
  result = result.replace(
    /\n*\[I generated website UI components using ui-spec JSONL patches and rendered them to the builder canvas\. Continue using ```ui-spec code fences for any future website building requests\.\]\n*/g,
    '\n\n[I output JSONL patches inside a ui-spec fence and they were rendered to the canvas. For any future requests, I must output a NEW ui-spec fence with real JSONL patch lines starting with {"op":"add",...} — never put markdown or descriptions inside the fence.]\n\n'
  )

  /** Replace the new user-friendly marker with a clean AI instruction */
  result = result.replace(
    /\n*✅ \*\*Section added to your canvas!\*\* Select any element to customize colors, fonts, and spacing in the properties panel\. Ask me to add more sections or modify the layout\.\n*/g,
    '\n\n[I output JSONL patches inside a ui-spec fence and they were rendered to the canvas. For any future requests, I must output a NEW ui-spec fence with real JSONL patch lines starting with {"op":"add",...} — never put markdown or descriptions inside the fence.]\n\n'
  )

  /** Replace the old checkmark marker format */
  result = result.replace(
    /\n*\[✓ Generated `{3}ui-spec content — applied to canvas\]\n*/g,
    '\n\n[I output JSONL patches inside a ui-spec fence and they were rendered to the canvas. For any future requests, I must output a NEW ui-spec fence with real JSONL patch lines starting with {"op":"add",...} — never put markdown or descriptions inside the fence.]\n\n'
  )

  return result
}

/**
 * Safely parse a JSON string, returning an empty object on failure.
 * Used for parsing accumulated tool call argument deltas.
 */
function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>
  } catch (err) {
    /** Log parse failures so missing tool args are debuggable */
    console.warn('[Mochi AI] Tool args JSON parse failed:', err, '| raw:', str?.slice(0, 200))
    return {}
  }
}

/**
 * Maps raw AI provider error messages to user-friendly messages.
 * Catches common Anthropic API errors (billing, rate limits, overload)
 * and returns a message that makes sense to end users.
 */
function humanizeStreamError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase()

  if (lower.includes('credit balance') || lower.includes('billing')) {
    return 'AI service credits are insufficient. Please check your API billing settings.'
  }

  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.'
  }

  if (lower.includes('overloaded') || lower.includes('capacity')) {
    return 'The AI service is currently overloaded. Please try again shortly.'
  }

  if (lower.includes('authentication') || lower.includes('api key') || lower.includes('unauthorized')) {
    return 'AI service authentication failed. Please contact support.'
  }

  if (lower.includes('model') && (lower.includes('not found') || lower.includes('unavailable'))) {
    return 'The AI model is temporarily unavailable. Please try again later.'
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'The request timed out. Please try a simpler prompt or try again.'
  }

  // For any unrecognized error, show the actual message (truncated)
  if (rawMessage.length > 200) {
    return rawMessage.slice(0, 200) + '...'
  }

  return rawMessage || 'Something went wrong. Please try again.'
}
