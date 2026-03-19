/**
 * ============================================================================
 * MODULAR CONTENT FENCE TRANSFORM
 * ============================================================================
 *
 * A generic, reusable TransformStream factory that detects ```{fenceName}
 * code fences in Vercel AI SDK text-delta chunks and separates them into
 * typed data-{fenceName} events.
 *
 * This is NOT feature-specific — any feature registers a fence name and gets
 * streaming content separation for free:
 *
 *   - Contracts: pipeContentFences(stream, ['contract'])
 *   - Future:    pipeContentFences(stream, ['email', 'form-schema'])
 *
 * The transform sits in the stream pipeline:
 *
 *   result.toUIMessageStream()
 *     → pipeContentFences()    (handles ```contract → data-contract, etc.)
 *     → createUIMessageStreamResponse()
 *
 * Chunk protocol (Vercel AI SDK UI message stream):
 *   Input:  { type: 'text-delta', delta: string, ... }
 *   Output: { type: 'text-delta', delta: string }           — normal text
 *           { type: 'data-{name}-start', mode: string }     — fence opened
 *           { type: 'data-{name}', delta: string }          — content chunk
 *           { type: 'data-{name}-complete' }                — fence closed
 *
 * SOURCE OF TRUTH KEYWORDS: ContentFenceTransform, PipeContentFences,
 * ModularStreamTransform, ContentFenceFactory
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A chunk in the Vercel AI SDK UI message stream.
 * We only transform 'text-delta' chunks — all others pass through untouched.
 */
interface StreamChunk {
  type: string
  delta?: string
  [key: string]: unknown
}

/**
 * Configuration for a single fence type.
 * The fenceName controls both detection (```{fenceName}) and
 * emission (data-{fenceName} event types).
 */
export interface ContentFenceConfig {
  /** The fence name to detect — e.g., 'contract' detects ```contract */
  name: string
}

// ============================================================================
// TRANSFORM FACTORY
// ============================================================================

/**
 * Creates a TransformStream that detects ```{fenceName} code fences in
 * text-delta chunks and separates them into data-{fenceName} events.
 *
 * Fence syntax:
 *   Opening: ```{name} or ```{name}:{mode} (mode defaults to 'generate')
 *   Closing: ``` (bare triple backtick on its own line)
 *
 * @param fenceNames - Fence names to detect (e.g., ['contract', 'email'])
 * @returns A TransformStream that separates fenced content from normal text
 *
 * @example
 * ```ts
 * // Single fence type
 * const transform = createContentFenceTransform(['contract'])
 * const outputStream = inputStream.pipeThrough(transform)
 *
 * // Multiple fence types
 * const transform = createContentFenceTransform(['contract', 'email'])
 * ```
 */
export function createContentFenceTransform(
  fenceNames: string[]
): TransformStream<StreamChunk, StreamChunk> {
  /**
   * Buffer for accumulating characters into a complete line.
   * We buffer when the start of a line MIGHT be a fence marker (starts with `).
   * Once we hit a newline, we process the complete line.
   */
  let lineBuffer = ''
  let buffering = false

  /** Which fence is currently active (null = not inside any fence) */
  let activeFence: string | null = null

  /**
   * Build the set of fence opening markers for fast detection.
   * Each entry maps '```{name}' to the fence name.
   */
  const fenceMarkers = new Map<string, string>()
  for (const name of fenceNames) {
    fenceMarkers.set('```' + name, name)
  }

  /**
   * Process a complete buffered line.
   * Checks for fence open/close markers and routes content accordingly.
   */
  function processLine(
    line: string,
    controller: TransformStreamDefaultController<StreamChunk>
  ): void {
    const trimmed = line.trim()

    /**
     * Check for fence CLOSE — a line that is exactly ``` (bare triple backtick).
     * This only triggers when we're already inside a fence.
     */
    if (activeFence && trimmed === '```') {
      const closedFence = activeFence
      controller.enqueue({ type: `data-${closedFence}-complete` })

      /**
       * FENCE HISTORY MARKER — inject a visible text-delta so the AI sees
       * evidence of previous fence output in conversation history.
       *
       * WHY: The content fence transform strips ```ui-spec fences from the
       * text stream (routing content as data events). This means the AI's
       * own previous assistant messages in conversation history appear as
       * text-only descriptions with NO fence. The model then follows that
       * text-only pattern on follow-up requests, never outputting a new fence.
       *
       * By emitting this marker as a text-delta, it appears in the stored
       * assistant message content, giving the model clear evidence that it
       * DID output a fence previously → it should do so again.
       *
       * USER-FACING: Shows a helpful tip so the user knows what to do next.
       * AI-FACING: sanitizeUISpecMarkers() replaces this with an instruction
       * before sending conversation history back to the API.
       */
      controller.enqueue({
        type: 'text-delta',
        delta: closedFence === 'ui-spec'
          ? '\n\n✅ **Section added to your canvas!** Select any element to customize colors, fonts, and spacing in the properties panel. Ask me to add more sections or modify the layout.\n'
          : `\n[✓ Generated \`\`\`${closedFence} content — applied]\n`,
      })

      activeFence = null
      return
    }

    /**
     * Check for fence OPEN — a line starting with ```{fenceName}.
     * Supports optional mode suffix: ```contract:append → mode='append'
     */
    for (const [marker, fenceName] of fenceMarkers) {
      if (trimmed.startsWith(marker)) {
        /** Extract optional mode from ```name:mode syntax */
        const rest = trimmed.slice(marker.length)
        const mode = rest.startsWith(':') ? rest.slice(1).trim() : 'generate'

        activeFence = fenceName
        console.log(`[ContentFence] OPENED fence: ${fenceName} (mode=${mode})`)
        controller.enqueue({
          type: `data-${fenceName}-start`,
          mode,
        })
        return
      }
    }

    /**
     * Not a fence marker — emit the buffered line content.
     * Route to either fence content or normal text based on active state.
     */
    if (activeFence) {
      /** Inside a fence — emit as fence content */
      controller.enqueue({
        type: `data-${activeFence}`,
        delta: line + '\n',
      })
    } else {
      /** Outside any fence — emit as normal text */
      controller.enqueue({ type: 'text-delta', delta: line + '\n' })
    }
  }

  return new TransformStream<StreamChunk, StreamChunk>({
    transform(chunk, controller) {
      /**
       * Non-text chunks pass through unchanged.
       * This preserves tool-call, tool-result, finish, etc.
       */
      if (chunk.type !== 'text-delta' || typeof chunk.delta !== 'string') {
        controller.enqueue(chunk)
        return
      }

      const text = chunk.delta

      /**
       * Process character by character to detect line boundaries.
       *
       * WHY character-by-character: Text-delta chunks may be single characters
       * or multi-character deltas — we handle both cases.
       *
       * Buffering strategy:
       * - Start buffering when a line begins with ` (potential fence marker)
       * - Accumulate until newline
       * - Process the complete line for fence detection
       * - Content inside fences is accumulated and emitted as larger chunks
       */
      for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i)

        if (ch === '\n') {
          if (buffering) {
            /** Complete line ready — check for fence markers */
            processLine(lineBuffer, controller)
            lineBuffer = ''
            buffering = false
          } else if (activeFence) {
            /** Inside a fence, newline is part of the content */
            controller.enqueue({
              type: `data-${activeFence}`,
              delta: '\n',
            })
          } else {
            /** Normal text newline */
            controller.enqueue({ type: 'text-delta', delta: '\n' })
          }
        } else if (!buffering && lineBuffer.length === 0 && ch === '`') {
          /**
           * Start of a new line that begins with backtick — buffer it.
           * Could be a fence marker (```contract) or inline code (`code`).
           * We won't know until we see the full line.
           */
          buffering = true
          lineBuffer = ch
        } else if (buffering) {
          /** Accumulating a potential fence marker line */
          lineBuffer += ch
        } else if (activeFence) {
          /** Inside a fence — emit as fence content */
          controller.enqueue({
            type: `data-${activeFence}`,
            delta: ch,
          })
        } else {
          /** Normal text outside any fence */
          controller.enqueue({ type: 'text-delta', delta: ch })
        }
      }
    },

    /**
     * Flush any remaining buffered content when the stream ends.
     * Handles edge case where the stream ends mid-line.
     */
    flush(controller) {
      if (lineBuffer) {
        processLine(lineBuffer, controller)
        lineBuffer = ''
        buffering = false
      }

      /** If a fence was never closed, emit complete anyway for cleanup */
      if (activeFence) {
        const closedFence = activeFence
        controller.enqueue({ type: `data-${closedFence}-complete` })
        /**
         * Inject history marker even for unclosed fences (stream cut off).
         * Ensures the AI still sees evidence of fence output in history.
         */
        controller.enqueue({
          type: 'text-delta',
          delta: closedFence === 'ui-spec'
            ? '\n\n✅ **Section added to your canvas!** Select any element to customize colors, fonts, and spacing in the properties panel. Ask me to add more sections or modify the layout.\n'
            : `\n[✓ Generated \`\`\`${closedFence} content — applied]\n`,
        })
        activeFence = null
      }
    },
  })
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Wraps a ReadableStream in the content fence transform.
 * Generic helper — pass any fence names to detect.
 *
 * @param stream - The input ReadableStream
 * @param fenceNames - Fence names to detect (e.g., ['contract'])
 * @returns A new ReadableStream with fenced content separated into typed events
 *
 * @example
 * ```ts
 * const stream = createUIMessageStream({
 *   execute: async ({ writer }) => {
 *     writer.merge(pipeContentFences(result.toUIMessageStream(), ['contract']))
 *   },
 * })
 * ```
 */
export function pipeContentFences(
  stream: ReadableStream,
  fenceNames: string[]
): ReadableStream {
  return stream.pipeThrough(createContentFenceTransform(fenceNames))
}

/**
 * Convenience wrapper for contract content fences.
 * Detects ```contract and ```contract:{mode} code fences.
 *
 * @param stream - The input ReadableStream
 * @returns A new ReadableStream with contract content as data-contract events
 */
export function pipeContractContent(stream: ReadableStream): ReadableStream {
  return pipeContentFences(stream, ['contract'])
}
