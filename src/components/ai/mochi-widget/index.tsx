/**
 * ============================================================================
 * MOCHI WIDGET - MAIN CONTAINER
 * ============================================================================
 *
 * A floating AI chat widget with minimal and expanded states.
 * Uses the shared AIWidgetShell for UI (resize, header, glass styling)
 * and injects Mochi-specific content into the shell's slots:
 * - FlatConversation for the chat area
 * - WidgetInput for minimal + expanded inputs
 * - Suggested prompts in the pre-input slot
 * - Clear Chat button as a header action
 *
 * Also preserves Mochi-specific features:
 * - Keyboard shortcuts: Ctrl/Cmd+Shift+L to toggle, Escape to close
 * - Suggested prompts in empty state
 * - Human-in-the-loop question UI
 * - useMochiAI hook integration for streaming
 *
 * SOURCE OF TRUTH KEYWORDS: MochiWidget, FloatingAIChat, MochiAIWidget
 * ============================================================================
 */

'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useMochiAI } from './hooks/use-mochi-ai'
import { DEFAULT_MODEL_ID } from '@/lib/ai/gateway/models'
import { FlatConversation } from '@/components/ui/flat-conversation'
import type { FlatConversationTurn } from '@/components/ui/flat-conversation'
import { AIWidgetShell, WidgetInput } from '@/components/ai/widget-shell'
import type { WidgetState } from '@/components/ai/widget-shell'
import { TaskItem } from './task-item'
import {
  groupMessagesIntoTurns,
  DEFAULT_SUGGESTED_PROMPTS,
  WEBSITE_BUILDER_SUGGESTED_PROMPTS,
} from './types'
import type { MochiConversationTurn } from './types'
import type { MochiHumanInput, MochiToolCall, MochiImageAttachment } from '@/lib/ai/mochi/types'
import { useMochiEvents, consumeFeatureBuffer } from '@/lib/ai/mochi/events'
import type { MochiAIEvent } from '@/lib/ai/mochi/events'
import { resolveNavigation } from '@/lib/ai/mochi/navigation'
import { detectBackgroundIntent, detectRealtimeIntent, detectPlacementDirective } from '@/lib/ai/mochi/intent'
import type { PlacementDirective } from '@/lib/ai/mochi/intent'
import { useJsonRenderAI } from './hooks/use-json-render-ai'
import { IncrementalSpecConverter } from '@/lib/ai/ui-render/spec-to-canvas'
import { canvasBridge, createAIContainer, resolvePlacement } from '@/lib/ai/ui-render/canvas-bridge'
import type { PlacementIntent, CanvasBridgeSelectionInfo } from '@/lib/ai/ui-render/canvas-bridge'
import type { Spec } from '@json-render/core'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Checks if a turn contains a human-in-the-loop question (askUser result).
 * Looks for a tool call result with type: 'human_input_required'.
 */
function getHumanInput(toolCalls: MochiToolCall[]): MochiHumanInput | null {
  for (const tc of toolCalls) {
    if (
      tc.result &&
      (tc.result as { type?: string }).type === 'human_input_required'
    ) {
      return {
        question: (tc.result as { question?: string }).question || '',
        options: (tc.result as { options?: string[] }).options,
      }
    }
  }
  return null
}

/**
 * Maps Mochi-specific conversation turns into the shared FlatConversationTurn format.
 * Pre-renders TaskItem components and extracts human-in-the-loop input.
 */
function mapToFlatTurns(turns: MochiConversationTurn[]): FlatConversationTurn[] {
  return turns.map((turn) => {
    const humanInput = getHumanInput(turn.toolCalls)

    return {
      id: turn.id,
      userPrompt: turn.userPrompt,
      /** Map image attachments to the flat turn's userImages shape for thumbnail display */
      userImages: turn.imageAttachments?.map((img) => ({
        id: img.id,
        base64: img.base64,
        mediaType: img.mediaType,
      })),
      taskItems: turn.toolCalls.length > 0 ? (
        <div className="flex flex-col gap-2">
          {turn.toolCalls.map((tc) => (
            <TaskItem key={tc.toolCallId} toolCall={tc} />
          ))}
        </div>
      ) : null,
      aiResponse: turn.aiResponse,
      isStreaming: turn.isActive && !turn.aiResponse && turn.toolCalls.length === 0,
      /**
       * isError is only set at the stream level (state.status === 'error')
       * in flatTurns memo below. Individual tool failures already show
       * red styling in their TaskItem — no need to make the AI prose red too.
       */
      isError: false,
      humanInput: humanInput && !turn.isActive
        ? { question: humanInput.question, options: humanInput.options }
        : undefined,
    }
  })
}

// ============================================================================
// TYPES
// ============================================================================

interface MochiWidgetProps {
  /** Organization ID for API calls */
  organizationId: string
  /** Optional className */
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * MochiWidget — Floating AI chat widget for the dashboard.
 * Manages widget state (minimal/expanded), keyboard shortcuts, streaming AI,
 * and conversation history. Delegates shell rendering to AIWidgetShell.
 */
export function MochiWidget({ organizationId, className }: MochiWidgetProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Widget UI state
  const [widgetState, setWidgetState] = useState<WidgetState>('minimal')
  const [inputValue, setInputValue] = useState('')
  /** Image attachments pending submission — cleared on send */
  const [imageAttachments, setImageAttachments] = useState<MochiImageAttachment[]>([])

  /** Selected AI model — passed to the API route via the hook */
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID)

  /**
   * Background mode — when active, ALL navigation is suppressed.
   * The AI performs actions and reports results inline in the chat.
   * Toggled via UI button or auto-detected from user intent.
   */
  const [backgroundMode, setBackgroundMode] = useState(false)

  /**
   * Tracks which feature is being generated in background mode.
   * null = idle, 'contract' | 'page' = actively generating.
   * Used to render a progress indicator in the chat so the user
   * knows something is happening even without navigation or glow.
   */
  const [backgroundProcessing, setBackgroundProcessing] = useState<string | null>(null)

  /**
   * Reactive canvas selection — updated via canvasBridge.onPageInfoChange().
   * Displayed as a minimal indicator in the widget so the user knows
   * which frame/element is targeted for AI-generated content placement.
   */
  const [canvasSelection, setCanvasSelection] = useState<CanvasBridgeSelectionInfo | null>(null)

  /**
   * Ref mirror of backgroundMode for synchronous reads.
   * React state updates are batched, so navigateForEvent's closure
   * may still see the OLD backgroundMode value in the same render cycle.
   * The ref is always current and solves the race condition.
   */
  const backgroundModeRef = useRef(backgroundMode)
  /** Keep the ref in sync whenever the state updates (covers all pathways) */
  backgroundModeRef.current = backgroundMode

  /**
   * Parse website builder URL segments to extract domainName and pageSlug.
   * URL pattern: /{domainName}/{pageSlug}/edit
   * Returns null when the user is NOT in the website builder.
   *
   * SOURCE OF TRUTH KEYWORDS: BuilderUrlInfo, WebsiteBuilderUrlSegments
   */
  const builderUrlInfo = useMemo(() => {
    if (!pathname?.endsWith('/edit') || pathname.includes('/payments/')) return null
    const segments = pathname.split('/').filter(Boolean)
    // Expect at least 3 segments: [domainName, pageSlug, 'edit']
    // Could also be: ['_', websiteId, pageSlug, 'edit'] for fallback routes
    if (segments.length >= 3 && segments[segments.length - 1] === 'edit') {
      return {
        domainName: segments[segments.length - 3],
        pageSlug: segments[segments.length - 2],
      }
    }
    return null
  }, [pathname])

  /**
   * Fetch current website/page identity when inside the builder.
   * This data is typically ALREADY cached from the builder page's server-side
   * prefetch (via HydrationBoundary), so no extra network request is made.
   * Provides websiteId, websiteName, pageId, pageName to the AI context so
   * it knows the "current website/page" without asking the user.
   */
  const { data: builderData } = trpc.builder.getDataByPageSlug.useQuery(
    {
      organizationId,
      domainName: builderUrlInfo?.domainName ?? '',
      pageSlug: builderUrlInfo?.pageSlug ?? '',
    },
    {
      enabled: !!builderUrlInfo,
      staleTime: Infinity,
    }
  )

  /**
   * Build page context from the current URL so the AI knows what
   * the user is looking at. This avoids the AI asking for IDs that
   * are already visible on screen.
   *
   * Currently supports:
   * - Contracts page with a contract open (/payments/contracts?contract={id})
   * - Website builder with specific website/page identity
   */
  const pageContext = useMemo(() => {
    const parts: string[] = []

    /** Detect open contract in builder */
    if (pathname?.includes('/payments/contracts')) {
      const contractId = searchParams?.get('contract')
      if (contractId) {
        parts.push(
          `The user currently has a contract open in the contract builder (contract ID: "${contractId}"). ` +
          `You can use this ID directly for updateContractContent or other contract tools — ` +
          `do NOT ask the user for the contract ID.`
        )
      }
    }

    /**
     * Detect website builder — URL pattern: /[domain]/[pathname]/edit
     * The builder is under the (website-builder) layout group which uses
     * dynamic route segments. We detect it by the trailing /edit segment.
     *
     * When builderData is available, inject specific website/page IDs so the
     * AI can use them directly in tool calls (createPage, editPageContent, etc.)
     * without calling listWebsites or asking the user "which website?"
     */
    if (pathname?.endsWith('/edit') && !pathname.includes('/payments/')) {
      if (builderData) {
        parts.push(
          `[website-builder] The user is currently editing page "${builderData.pageName}" ` +
          `(pageId: "${builderData.pageId}", slug: "${builderUrlInfo?.pageSlug}") ` +
          `in website "${builderData.websiteName}" (websiteId: "${builderData.websiteId}"). ` +
          `When the user says "this website", "current website", or similar, use websiteId "${builderData.websiteId}" directly — ` +
          `do NOT call listWebsites or ask the user which website. ` +
          `For editPageContent, use pageId "${builderData.pageId}" and slug "${builderUrlInfo?.pageSlug}". ` +
          `You can generate website sections using \`\`\`ui-spec code fences. ` +
          `The generated UI will appear as a live preview in the chat, then get ` +
          `converted to canvas elements and added to the builder automatically.`
        )
      } else {
        /** Fallback when builder data hasn't loaded yet (e.g. first render) */
        parts.push(
          `[website-builder] The user is currently in the website builder editing a page. ` +
          `You can generate website sections using \`\`\`ui-spec code fences. ` +
          `The generated UI will appear as a live preview in the chat, then get ` +
          `converted to canvas elements and added to the builder automatically.`
        )
      }
    }

    return parts.length > 0 ? parts.join('\n') : undefined
  }, [pathname, searchParams, builderData, builderUrlInfo])

  // AI hook — manages streaming, messages, and control
  const { state, messages, send, abort, clearMessages, setBackgroundModeImmediate } = useMochiAI({
    organizationId,
    modelId: selectedModel,
    pageContext,
    backgroundMode,
  })

  /**
   * Incremental converter ref — converts one JSONL patch at a time into
   * a CanvasElement during streaming. Created fresh when each ```ui-spec
   * stream starts, initialized with the current page context from the bridge.
   */
  const converterRef = useRef<IncrementalSpecConverter | null>(null)

  /**
   * Placement directives keyed by request ID to prevent leaks between rapid
   * consecutive requests. Without this, a second request's directive could
   * overwrite the first before its converter initializes, placing elements
   * in the wrong canvas position.
   *
   * Flow: handleSubmit stores the directive → tryInitConverter/onPatchApplied
   * reads it by the active request ID → onComplete cleans it up.
   *
   * SOURCE OF TRUTH KEYWORDS: PlacementDirectiveMap, RequestScopedDirective
   */
  const placementDirectivesRef = useRef<Map<string, PlacementDirective>>(new Map())

  /**
   * Monotonically increasing request counter used to generate unique IDs
   * for each AI request. Ensures each request's placement directive is
   * isolated even under rapid consecutive submissions.
   */
  const requestCounterRef = useRef(0)

  /**
   * Tracks the request ID of the currently active ui-spec stream.
   * Set when a new request starts, used by tryInitConverter and onPatchApplied
   * to look up the correct placement directive from the map.
   */
  const activeRequestIdRef = useRef<string | null>(null)

  /**
   * json-render receiver — passive hook that accumulates JSONL patches
   * from ```ui-spec code fences into a renderable Spec object.
   *
   * LIVE STREAMING via onPatchApplied:
   * Each time a JSONL line is parsed and applied, the incremental converter
   * translates it into a CanvasElement and pushes it to the builder immediately.
   * Elements appear on the canvas as the AI generates them, not waiting for
   * the full spec to complete.
   *
   * onComplete is kept as a finalization step (logging, cleanup) since
   * all elements are already on the canvas by the time the stream ends.
   */
  /**
   * Tracks how many times tryInitConverter has been called without success
   * for the current stream. Used to detect when the builder is permanently
   * unavailable (page deleted, builder not mounted) and surface an error
   * instead of silently discarding patches forever.
   *
   * Reset to 0 on each new stream start. After MAX_INIT_RETRIES attempts,
   * a toast error is shown and retries stop.
   */
  const converterInitAttemptsRef = useRef(0)

  /**
   * Maximum number of tryInitConverter attempts before giving up.
   * At ~1 attempt per JSONL delta (~50-100ms apart), 10 attempts
   * gives the builder roughly 0.5-1 second to mount.
   */
  const MAX_INIT_RETRIES = 10

  /**
   * Whether the converter init has permanently failed for the current
   * stream. When true, further tryInitConverter calls short-circuit
   * to avoid spamming retries and duplicate error toasts.
   */
  const converterInitFailedRef = useRef(false)

  /**
   * Attempts to create the AI container and converter when page info is available.
   * Returns true if initialization succeeded, false if page info isn't ready yet.
   *
   * Uses resolvePlacement() to determine WHERE on the canvas the container goes:
   * - insert-before: sibling of the selected element (shifts selected down)
   * - append-to-page: appended at end of page (existing behavior)
   * - floating: detached root element the user can drag into position
   *
   * WHY LAZY: When the AI creates a page and navigates simultaneously, the old
   * builder unmounts (clearing page info) before the new builder mounts. The
   * 'start' event may fire during this gap when getPageInfo() returns null.
   * By retrying on each delta, we initialize as soon as the new builder is ready.
   *
   * ERROR FEEDBACK: After MAX_INIT_RETRIES failed attempts, stops retrying and
   * shows a toast error so the user knows why generated content isn't appearing.
   */
  const tryInitConverter = useCallback(() => {
    if (converterRef.current) return true

    /**
     * If we already exhausted retries for this stream, bail out immediately.
     * Prevents duplicate toasts and wasted work on every subsequent delta.
     */
    if (converterInitFailedRef.current) return false

    /**
     * Increment attempt counter and check if we've exceeded the retry limit.
     * Each call corresponds to one JSONL delta, so this naturally rate-limits.
     */
    converterInitAttemptsRef.current += 1
    if (converterInitAttemptsRef.current > MAX_INIT_RETRIES) {
      converterInitFailedRef.current = true
      console.error(
        '[MochiWidget] Converter init failed after %d attempts — ' +
        'canvasBridge.getPageInfo() never returned valid page info. ' +
        'The builder may not be mounted or the page may have been deleted.',
        MAX_INIT_RETRIES
      )
      toast.error(
        'Failed to connect to the canvas. Please navigate to the page builder and try again.'
      )
      return false
    }

    /**
     * Look up the placement directive for the active request from the map.
     * Falls back to 'direct' so AI content goes straight onto the page/canvas
     * instead of the staging panel. Direct mode uses resolvePlacement() to
     * decide: append-to-page when a page exists, floating when empty canvas.
     */
    const requestId = activeRequestIdRef.current
    const storedDirective = requestId
      ? placementDirectivesRef.current.get(requestId)
      : null
    const directiveMode = storedDirective?.mode ?? 'direct'

    const isDirectInsert = directiveMode === 'direct'
    const isCanvasFloating = directiveMode === 'canvas-floating'
    const pageInfo = canvasBridge.getPageInfo()

    /**
     * Resolve placement based on the directive mode:
     * - DIRECT: Use resolved placement (insert-before / append-to-page / floating)
     * - CANVAS-FLOATING: Create a floating container at a smart position to the
     *   right of the page and breakpoints — dispatched to canvas store as a real
     *   interactive element the user can immediately select, move, and resize.
     * - STAGING: Create a floating container routed to the staging slice.
     */
    let placement: PlacementIntent

    if (isDirectInsert) {
      placement = resolvePlacement(pageInfo)
    } else if (isCanvasFloating) {
      placement = { mode: 'floating' }
    } else {
      /** Staging mode — floating placement routed to staging slice */
      placement = { mode: 'floating' as const }
    }

    /**
     * For direct insert modes (insert-before / append-to-page), we need a page element.
     * Canvas-floating and staging modes use floating placement — no page info needed.
     */
    if (isDirectInsert && placement.mode !== 'floating' && !pageInfo.pageElementId) {
      return false
    }

    /** Create the AI container at the resolved placement position */
    const aiContainer = createAIContainer(placement)

    /**
     * CANVAS-FLOATING: Position the AI container on a clear spot on the
     * empty canvas near the page. Tries candidate positions around the
     * page and picks the first one that doesn't overlap any existing
     * root-level elements (sections/components already on the canvas).
     *
     * Candidate order: below page, above page, right of page, left of page.
     * Each candidate is checked against existing root element bounds.
     * Falls back to a stacked position below all existing elements.
     */
    if (isCanvasFloating) {
      const GAP = 80
      const containerW = aiContainer.width || 1440
      const containerH = 400

      /**
       * Build the list of occupied bounding boxes — includes the page
       * itself (and mobile breakpoint if active) plus all existing
       * root-level floating elements.
       */
      const BREAKPOINT_MOBILE_WIDTH = 390
      const BREAKPOINT_FRAME_GAP = 40
      const pageRight = pageInfo.hasMobileBreakpoint
        ? pageInfo.pageX + pageInfo.pageWidth + BREAKPOINT_FRAME_GAP + BREAKPOINT_MOBILE_WIDTH
        : pageInfo.pageX + pageInfo.pageWidth

      const occupied = [
        /** Page (+ breakpoint) as one occupied zone */
        { x: pageInfo.pageX, y: pageInfo.pageY, width: pageRight - pageInfo.pageX, height: 900 },
        ...pageInfo.rootElementBounds,
      ]

      /**
       * Check if a candidate rectangle overlaps any occupied bounding box.
       * Uses AABB (axis-aligned bounding box) intersection test.
       */
      const overlapsAny = (cx: number, cy: number, cw: number, ch: number): boolean =>
        occupied.some(
          (r) => cx < r.x + r.width && cx + cw > r.x && cy < r.y + r.height && cy + ch > r.y
        )

      /**
       * Candidate positions around the page — try right, then left.
       * NEVER place above the page — content appearing above is confusing.
       * Fallback stacks below the lowest element (see below).
       */
      const candidates = [
        { x: pageRight + GAP, y: pageInfo.pageY },
        { x: pageInfo.pageX - containerW - GAP, y: pageInfo.pageY },
      ]

      let placed = false
      for (const c of candidates) {
        if (!overlapsAny(c.x, c.y, containerW, containerH)) {
          aiContainer.x = c.x
          aiContainer.y = c.y
          placed = true
          break
        }
      }

      /**
       * Fallback: stack below the lowest existing element on the canvas.
       * This always finds a clear spot since we go past all content.
       */
      if (!placed) {
        let lowestY = pageInfo.pageY + 900
        for (const r of pageInfo.rootElementBounds) {
          const bottom = r.y + r.height
          if (bottom > lowestY) lowestY = bottom
        }
        aiContainer.x = pageInfo.pageX
        aiContainer.y = lowestY + GAP
      }
    }

    /**
     * Push the container element to the bridge with directInsert flag.
     * - Direct mode: goes to the page canvas (insertElement/addElement)
     * - Canvas-floating mode: goes to the canvas store as a real floating element
     * - Staging mode: goes to the staging slice for preview/drag-drop
     */
    const shouldDirectInsert = isDirectInsert || isCanvasFloating
    canvasBridge.pushElements(
      [aiContainer],
      {
        shiftSiblings: isDirectInsert && placement.mode === 'insert-before',
        directInsert: shouldDirectInsert,
      }
    )

    converterRef.current = new IncrementalSpecConverter({
      pageElementId: aiContainer.id,
      existingChildCount: 0,
    })

    /**
     * Clean up the placement directive from the map now that the converter
     * has been initialized. The directive is no longer needed — the placement
     * has been resolved and the container created.
     */
    if (requestId) {
      placementDirectivesRef.current.delete(requestId)
    }

    return true
  }, [])

  const jsonRenderAI = useJsonRenderAI({
    onPatchApplied: useCallback((spec: Spec, patch: { op: string; path: string; value?: unknown }) => {
      /**
       * Lazy init: if converter wasn't ready on stream 'start' (page was
       * navigating), try again on each patch. The builder should have mounted
       * by the time the first few JSONL deltas arrive.
       *
       * Patches that arrive before the converter is ready are applied to the
       * spec (by the jsonRenderAI hook) but won't produce canvas elements.
       * In practice this is rare — the AI outputs preamble text before the
       * ui-spec fence, giving the builder enough time to mount.
       *
       * If tryInitConverter has exceeded its retry limit, it returns false
       * permanently and a toast error has already been shown to the user.
       */
      if (!converterRef.current) {
        if (!tryInitConverter()) return // Still not ready or permanently failed
      }

      try {
        const elements = converterRef.current!.convertPatch(spec, patch)
        if (elements && elements.length > 0) {
          /**
           * Look up the directive for the active request from the map.
           * Pass directInsert flag so the bridge hook knows whether to
           * route this element to the page canvas or staging panel.
           * Both 'direct' and 'canvas-floating' modes go to the canvas store.
           * Defaults to 'direct' — elements go straight to page/canvas.
           */
          const requestId = activeRequestIdRef.current
          const storedDirective = requestId
            ? placementDirectivesRef.current.get(requestId)
            : null
          const directiveMode = storedDirective?.mode ?? 'direct'
          const shouldDirectInsert = directiveMode === 'direct' || directiveMode === 'canvas-floating'
          canvasBridge.pushElements(elements, { directInsert: shouldDirectInsert })
        }
      } catch (err) {
        console.warn('[MochiWidget] Incremental patch conversion failed:', err)
      }
    }, [tryInitConverter]),

    onComplete: useCallback(() => {
      /** Elements were already pushed incrementally via onPatchApplied — nothing to batch convert */
      converterRef.current = null

      /**
       * Clean up the placement directive for the completed request.
       * This prevents stale entries from accumulating in the map.
       */
      const requestId = activeRequestIdRef.current
      if (requestId) {
        placementDirectivesRef.current.delete(requestId)
      }

      /**
       * End the stream session — safety net in case ui_spec_content_complete
       * event was missed. Ensures the session is always cleaned up.
       */
      canvasBridge.endStreamSession()

      /**
       * Signal the bridge that this generation stream is finished.
       * The builder hook uses this to mark the staging group as 'ready'.
       */
      canvasBridge.signalGenerationComplete()
    }, []),
  })

  const isProcessing = state.status === 'connecting' || state.status === 'streaming'
  const isExpanded = widgetState === 'expanded'

  /**
   * Tracks whether a SERVICE content fence is actively streaming.
   * Only these fence types trigger the spinning gradient glow:
   * - contract (contract:generate / contract:update / contract:append)
   * - ui-spec (website builder UI generation)
   *
   * Regular chat text streaming does NOT glow — only service-specific
   * content generation gets the visual treatment.
   * Cleared by fence-complete events, with a safety net when the stream ends.
   */
  const [isServiceStreaming, setIsServiceStreaming] = useState(false)

  /** Safety net: clear streaming flags when the overall stream ends */
  useEffect(() => {
    if (!isProcessing) {
      setIsServiceStreaming(false)
      setBackgroundProcessing(null)
    }
  }, [isProcessing])

  // ========================================================================
  // NAVIGATION — pure event-driven, no abort/continuation
  // ========================================================================

  /**
   * Route map for feature navigation — maps feature names to their builder URLs.
   * Adding a new navigable feature is a one-liner here.
   *
   * Each entry is a function that takes an entityId and returns the target URL.
   * This keeps all routing knowledge in one place instead of scattered if-blocks.
   */
  const FEATURE_ROUTES: Record<string, (entityId: string, data?: Record<string, string>) => string> = useMemo(() => ({
    contract: (id) => `/payments/contracts?contract=${id}`,
    invoice:  (id) => `/payments/invoices?invoice=${id}`,
    /** Website builder — navigates to /{previewId}/{slug}/edit using data from the event */
    'website-builder': (_id, data) => `/${data?.previewId}/${data?.slug}/edit`,
    // form: (id) => `/forms/${id}/edit`,  <- uncomment when forms need navigation
  }), [])

  /**
   * Navigate for a given event using the navigation controller.
   * Delegates to resolveNavigation() which checks background mode,
   * event flags, route existence, and current page — returning a
   * deterministic NavigationDecision.
   */
  const navigateForEvent = useCallback((event: MochiAIEvent) => {
    try {
      /**
       * Read backgroundMode from the ref (not state) to avoid the race condition
       * where setBackgroundMode(true) is called in handleSubmit but React hasn't
       * re-rendered yet, so the state closure still has the old value.
       * The ref is updated synchronously in handleSubmit alongside setState.
       */
      const decision = resolveNavigation(event, {
        featureRoutes: FEATURE_ROUTES,
        currentPathname: pathname ?? '',
        currentSearchParams: searchParams?.toString() || '',
        backgroundMode: backgroundModeRef.current,
      })

      if (decision.shouldNavigate && decision.targetUrl) {
        router.push(decision.targetUrl)
      }
    } catch (err) {
      console.warn('[MochiWidget] Navigation event failed:', err)
    }
  }, [router, FEATURE_ROUTES, pathname, searchParams])

  /**
   * Subscribe to ALL Mochi AI events for navigation.
   *
   * Content generation (contracts, builder patches) happens INLINE in the
   * chat stream via modular content fences. The model naturally outputs
   * text + fenced content + tool calls in sequence.
   *
   * This handler only processes navigation events (navigate: true).
   * The navigation controller handles background mode suppression.
   */
  useMochiEvents('', (event) => {
    if (!event.navigate) return
    navigateForEvent(event)
  })

  /**
   * Subscribe to ui-render events — route JSONL patches to the
   * json-render receiver hook for progressive UI building.
   *
   * On stream start, we create a fresh IncrementalSpecConverter with the
   * current page context so each patch can be converted and pushed to the
   * canvas immediately (live streaming).
   */
  useMochiEvents('ui-render', (event) => {
    if (event.action === 'ui_spec_content' && event.data?.type === 'start') {
      /**
       * Reset converter for the new stream and try to initialize immediately.
       * If the builder is mounted, this succeeds and patches are processed
       * from the first delta. If the builder is mid-navigation (page info null),
       * the converter stays null and lazy-inits on the first delta after the
       * builder mounts (see onPatchApplied catch-up logic above).
       *
       * Also reset the retry counter and failure flag so this new stream
       * gets a fresh set of initialization attempts.
       */
      converterRef.current = null
      converterInitAttemptsRef.current = 0
      converterInitFailedRef.current = false

      /**
       * CROSS-PAGE GUARD: Lock this stream session to the current page.
       * Captures the pageElementId at stream start so the bridge can detect
       * if the user navigates away mid-stream and drop elements instead of
       * delivering them to the wrong page.
       */
      const currentPageInfo = canvasBridge.getPageInfo()
      canvasBridge.startStreamSession(currentPageInfo.pageElementId)

      tryInitConverter()

      jsonRenderAI.startReceiving()
      if (backgroundModeRef.current) {
        /** Show background processing indicator in the chat */
        setBackgroundProcessing('page')
      } else {
        /** Show glow border in real-time mode — user is watching the builder */
        setIsServiceStreaming(true)
      }
    } else if (event.action === 'ui_spec_content' && event.data?.type === 'delta') {
      /** Pass character delta(s) — the hook buffers into complete JSONL lines */
      jsonRenderAI.receiveDelta(event.data.delta ?? '')
    } else if (event.action === 'ui_spec_content_complete') {
      /** End the stream session — allows the next stream to target a different page */
      canvasBridge.endStreamSession()
      jsonRenderAI.receiveComplete()
      setIsServiceStreaming(false)
      if (backgroundModeRef.current) {
        setBackgroundProcessing(null)
      }
    }
  })

  /**
   * Replay buffered ui-render events when the builder mounts — BATCHED.
   *
   * WHY: When the AI creates a page in background mode, the page record is
   * created (tool succeeds) and the AI streams ui-spec JSONL patches. But
   * the builder component hasn't mounted yet, so tryInitConverter() fails
   * (canvasBridge has no page info) and all patches are silently dropped.
   * The event emitter buffers these events. When the builder mounts and
   * subscribes to the bridge, we consume the buffer and replay them.
   *
   * BATCHED REPLAY: We concatenate ALL delta characters into a single string,
   * then call startReceiving → receiveDelta → receiveComplete once each.
   * This produces ~3 state updates instead of hundreds, avoiding React's
   * "Maximum update depth exceeded" error. Same pattern as the contract
   * builder's consumeFeatureBuffer('contract') replay.
   *
   * TRIGGER: canvasBridge.onBuilderReady() fires when the builder hook
   * subscribes to the bridge (after page info is set). At that point
   * tryInitConverter() will succeed because the bridge has valid page info.
   */
  useEffect(() => {
    const unsubscribe = canvasBridge.onBuilderReady(() => {
      const buffered = consumeFeatureBuffer('ui-render')
      if (buffered.length === 0) return

      /** Pre-process: concatenate all deltas into a single string */
      let fullDelta = ''
      let hasStart = false
      let hasComplete = false

      for (const event of buffered) {
        if (event.action === 'ui_spec_content' && event.data?.type === 'start') {
          hasStart = true
        } else if (event.action === 'ui_spec_content' && event.data?.type === 'delta' && event.data?.delta) {
          fullDelta += event.data.delta
        } else if (event.action === 'ui_spec_content_complete') {
          hasComplete = true
        }
      }

      /** Only replay if we have actual content */
      if (!hasStart || !fullDelta) return

      console.log(
        `[MochiWidget] Replaying ${buffered.length} buffered ui-render events ` +
        `(${fullDelta.length} chars, complete: ${hasComplete})`
      )

      /**
       * Reset converter state for the replay stream.
       * The builder is now mounted so tryInitConverter() should succeed.
       */
      converterRef.current = null
      converterInitAttemptsRef.current = 0
      converterInitFailedRef.current = false

      /**
       * Start a stream session for the replay — the builder just mounted
       * so pageInfo is fresh and correct for this page.
       */
      const replayPageInfo = canvasBridge.getPageInfo()
      canvasBridge.startStreamSession(replayPageInfo.pageElementId)

      tryInitConverter()

      /**
       * Apply as a single batch: 1 start + 1 delta + 1 complete = ~3 state updates.
       * The jsonRenderAI hook parses the concatenated deltas into JSONL lines,
       * applies patches to the spec, and fires onPatchApplied for each element.
       */
      jsonRenderAI.startReceiving()
      jsonRenderAI.receiveDelta(fullDelta)
      if (hasComplete) {
        canvasBridge.endStreamSession()
        jsonRenderAI.receiveComplete()
      }
    })

    return unsubscribe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryInitConverter])

  /**
   * Track contract content fence for the glow effect.
   * The contract builder handles the actual content processing —
   * we only care about start/complete to toggle isServiceStreaming.
   */
  useMochiEvents('contract', (event) => {
    if (event.action === 'contract_content' && event.data?.type === 'start') {
      if (backgroundModeRef.current) {
        /** Show background processing indicator in the chat */
        setBackgroundProcessing('contract')
      } else {
        /** Show glow border in real-time mode — user is watching the builder */
        setIsServiceStreaming(true)
      }
    }
    if (event.action === 'contract_content_complete') {
      setIsServiceStreaming(false)
      if (backgroundModeRef.current) {
        /** Clear background indicator — generation is done */
        setBackgroundProcessing(null)
      }
    }
  })

  /**
   * Handle canvas element updates — connect forms, products, change text,
   * update styles, swap images, etc. The AI tool returns an event with
   * the element type and JSON-serialized updates. We parse and push to
   * the canvas bridge, which delivers to the Redux store.
   *
   * The update data includes:
   * - elementType: which element type to find ('form', 'payment', 'text', etc.)
   * - updates: JSON string of property updates to apply
   * - __matchText / __matchName: optional matchers to find the right element
   */
  useMochiEvents('website-builder', (event) => {
    if (event.action === 'element_update' && event.data) {
      const { elementType, updates: updatesJson } = event.data
      if (!elementType) return

      const pageInfo = canvasBridge.getPageInfo()
      if (!pageInfo.pageElementId) return

      try {
        /** Parse the JSON-serialized updates from the tool */
        const updates = updatesJson ? JSON.parse(updatesJson) as Record<string, unknown> : {}

        /** Push to bridge — builder hook finds the element by type and applies updates */
        canvasBridge.pushElementUpdates([{
          id: `__find_by_type:${elementType}`,
          updates,
        }])
      } catch (err) {
        console.warn('[MochiWidget] Failed to parse element update:', err)
      }
    }
  })

  /**
   * Group flat messages into conversation turns, then map into the shared
   * FlatConversationTurn format. Memoized to avoid recomputing on every render.
   */
  const mochiTurns = useMemo(() => groupMessagesIntoTurns(messages), [messages])
  const flatTurns = useMemo(() => {
    const mapped = mapToFlatTurns(mochiTurns)

    /** If the AI stream itself errored, mark the last turn as error */
    if (state.status === 'error' && mapped.length > 0) {
      mapped[mapped.length - 1] = { ...mapped[mapped.length - 1], isError: true }
    }

    return mapped
  }, [mochiTurns, state.status])

  // ========================================================================
  // KEYBOARD SHORTCUTS
  // ========================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
      const modifierKey = isMac ? e.metaKey : e.ctrlKey

      // Toggle with Ctrl/Cmd + Shift + L
      if (modifierKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        setWidgetState((prev) => (prev === 'minimal' ? 'expanded' : 'minimal'))
      }

      // Minimize with Escape when expanded
      if (e.key === 'Escape' && isExpanded) {
        setWidgetState('minimal')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExpanded])

  /**
   * Subscribe to canvas bridge page info changes for reactive selection display.
   * Updates the canvasSelection state whenever the builder pushes new page info.
   * Only tracks selection when the user is on the builder page.
   */
  useEffect(() => {
    if (!builderUrlInfo) {
      setCanvasSelection(null)
      return
    }
    /** Read initial selection from bridge on mount */
    const initial = canvasBridge.getPageInfo()
    setCanvasSelection(initial.selectedElement)

    return canvasBridge.onPageInfoChange((info) => {
      setCanvasSelection(info.selectedElement)
    })
  }, [builderUrlInfo])

  // ========================================================================
  // HANDLERS
  // ========================================================================

  /**
   * Send a new message to the AI.
   * Called by the input component or suggested prompts.
   *
   * Reads the current canvas selection and builds a context string
   * so the AI knows what element the user has selected and where
   * new content will be placed.
   */
  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (isProcessing) return

      /**
       * Auto-detect background intent from the user's message.
       * If the user says "in the background", "don't navigate", etc.,
       * enable background mode on the CLIENT side so navigation is
       * suppressed regardless of what the AI does with the event flags.
       *
       * The server also detects this and instructs the AI, but the client
       * must enforce it independently as a safety net — the AI might not
       * follow the prompt instruction to set navigate: false.
       *
       * Works on ALL pages including the website builder — users can ask
       * AI to perform non-UI tasks (contracts, invoices) in the background
       * while staying on the builder.
       */
      if (!backgroundMode && detectBackgroundIntent(prompt)) {
        setBackgroundMode(true)
        /** Update ref synchronously so navigateForEvent reads the new value immediately */
        backgroundModeRef.current = true
        /** Also sync the hook's internal ref so the streaming loop strips navigate:true */
        setBackgroundModeImmediate(true)
      } else if (backgroundMode && detectRealtimeIntent(prompt)) {
        /**
         * Reset background mode when the user explicitly chooses realtime.
         * E.g., they click "Real time" button or say "open the builder".
         * Without this, backgroundMode stays true forever once activated.
         */
        setBackgroundMode(false)
        backgroundModeRef.current = false
        setBackgroundModeImmediate(false)
      }

      /**
       * Generate a unique request ID for this submission. Used to scope the
       * placement directive so rapid consecutive requests don't leak directives
       * between each other (Bug 4 fix).
       */
      requestCounterRef.current += 1
      const requestId = `req-${requestCounterRef.current}-${Date.now()}`
      activeRequestIdRef.current = requestId

      /**
       * Resolve placement directive based on context:
       *
       * ON BUILDER (builderUrlInfo non-null):
       * - Selection exists (frame/element) → 'direct' so resolvePlacement()
       *   can route content into the selected frame or before the element.
       * - No selection + explicit positional language → 'direct'
       * - No selection + no positional language → 'canvas-floating'
       *   (floating element the user can preview, move, drag into page)
       *
       * NOT ON BUILDER:
       * - Falls through to detectPlacementDirective() (default: 'stage')
       *
       * The directive is stored in the Map keyed by request ID instead of a
       * single shared ref, so concurrent requests each get their own directive.
       */
      if (builderUrlInfo) {
        const currentPageInfo = canvasBridge.getPageInfo()
        const hasSelection = currentPageInfo.selectedElement !== null
          && currentPageInfo.selectedElement.type !== 'page'

        /**
         * Placement on the builder:
         * - Frame/element selected → 'direct' (insert into frame or before element)
         * - No selection → 'canvas-floating' (floating element near the page)
         */
        let directive: PlacementDirective
        if (hasSelection) {
          directive = { mode: 'direct' }
        } else {
          const detected = detectPlacementDirective(prompt)
          directive = detected.mode === 'direct'
            ? detected
            : { mode: 'canvas-floating' }
        }
        placementDirectivesRef.current.set(requestId, directive)
      } else {
        placementDirectivesRef.current.set(requestId, detectPlacementDirective(prompt))
      }

      // Auto-expand when sending from minimal mode
      if (widgetState === 'minimal') {
        setWidgetState('expanded')
      }

      /**
       * Build selection context string for the AI.
       * Tells the AI which element is selected and where new content will go.
       *
       * Three cases:
       * - Frame selected → content goes INSIDE that frame
       * - Non-frame element selected → content goes BEFORE it (ask above/below)
       * - Page/nothing selected → content appends to page
       */
      let selectionContext: string | undefined
      const pageInfo = canvasBridge.getPageInfo()

      if (pageInfo.selectedElement) {
        const sel = pageInfo.selectedElement
        if (sel.type === 'page') {
          selectionContext =
            `[selection] The page element is selected. New content will be appended to the end of the page.`
        } else if (sel.type === 'frame') {
          /** Frame selected — AI content will be placed INSIDE this frame */
          selectionContext =
            `[selection] Frame "${sel.name || 'Unnamed Frame'}" (id: "${sel.id}") is selected as the target container. ` +
            `New content will be placed INSIDE this frame as children. ` +
            `The frame currently has ${sel.childCount} child element(s).`
        } else {
          /**
           * Non-frame element selected — ask user about placement.
           * The AI should use askUser to let the user choose: above, below, or empty canvas.
           */
          selectionContext =
            `[selection] Element "${sel.name || sel.type}" (type: ${sel.type}, id: "${sel.id}") is selected. ` +
            `Before generating UI content, ask the user using the askUser tool: ` +
            `"Where should I place the new content?" with options: ["Above ${sel.name || sel.type}", "Below ${sel.name || sel.type}", "On the empty canvas"]. ` +
            `Then generate the \`\`\`ui-spec fence based on their choice.`
        }
      }
      /** No selection = append to page or floating (no extra context needed) */

      /** Capture and clear images before async send */
      const currentImages = imageAttachments.length > 0 ? imageAttachments : undefined
      setImageAttachments([])

      await send(prompt, selectionContext, currentImages)
    },
    [send, isProcessing, widgetState, backgroundMode, setBackgroundModeImmediate, imageAttachments]
  )

  /**
   * Handle suggested prompt click — fills the input
   */
  const handlePromptClick = useCallback((prompt: string) => {
    setInputValue(prompt)
  }, [])

  /**
   * Handle a response to a human-in-the-loop question.
   * Sends the response as a new user message.
   *
   * CRITICAL: This path is triggered when users click askUser option buttons
   * (e.g., "Background" or "Real time"). Unlike handleSubmit, this was
   * previously calling send() directly WITHOUT running intent detection,
   * which meant clicking "Background" never activated background mode.
   */
  const handleSendResponse = useCallback(
    async (response: string) => {
      /**
       * Run background/realtime intent detection on the option button text.
       * The askUser tool presents ["Real time", "Background"] buttons, and
       * the clicked label becomes the response string. We must detect this
       * to activate or deactivate background mode correctly.
       */
      if (!backgroundMode && detectBackgroundIntent(response)) {
        setBackgroundMode(true)
        backgroundModeRef.current = true
        /** Sync the hook's internal ref so the streaming loop strips navigate:true */
        setBackgroundModeImmediate(true)
      } else if (backgroundMode && detectRealtimeIntent(response)) {
        setBackgroundMode(false)
        backgroundModeRef.current = false
        setBackgroundModeImmediate(false)
      }

      await send(response)
    },
    [send, backgroundMode, setBackgroundModeImmediate]
  )

  /**
   * Clear the chat and reset AI state
   */
  const handleClear = useCallback(() => {
    clearMessages()
    setInputValue('')
  }, [clearMessages])

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <AIWidgetShell
      title="Mochi AI"
      widgetState={widgetState}
      onWidgetStateChange={setWidgetState}
      onClose={() => setWidgetState('minimal')}
      /** Glow only during service content generation (contract, invoice, ui-spec) — not regular chat */
      isGenerating={isServiceStreaming}
      className={className}
      /* Header actions: Clear Chat */
      headerActions={
        <div className="flex items-center gap-1">
          {/* Clear Chat — only visible when there are messages */}
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Clear chat"
            >
              Clear
            </button>
          )}
        </div>
      }
      /* Minimal mode input */
      minimalInput={
        <WidgetInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          disabled={isProcessing}
          isMinimal={true}
          placeholder="Ask Mochi anything..."
        />
      }
      /* Expanded mode input — shows stop button while AI is generating */
      expandedInput={
        <WidgetInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          disabled={isProcessing}
          onStop={isProcessing ? abort : undefined}
          placeholder="Ask Mochi anything..."
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          imageAttachments={imageAttachments}
          onImagesChange={setImageAttachments}
        />
      }
      /* Pre-input area: selection indicator + suggested prompts */
      preInputContent={
        <>
          {/* Canvas selection indicator — shows which frame/element is targeted */}
          {builderUrlInfo && canvasSelection && canvasSelection.type !== 'page' && (
            <div className="mx-4 mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="shrink-0">{canvasSelection.type === 'frame' ? 'Target:' : 'Selected:'}</span>
              <span className="truncate font-medium">
                {canvasSelection.name || `Unnamed ${canvasSelection.type}`}
              </span>
              {canvasSelection.type === 'frame' && (
                <span className="shrink-0 opacity-60">
                  ({canvasSelection.childCount} {canvasSelection.childCount === 1 ? 'child' : 'children'})
                </span>
              )}
            </div>
          )}
          {/* Suggested prompts — context-aware, only in empty state */}
          {messages.length === 0 && !isProcessing && (
            <div className="px-4 pb-2">
              <div className="flex flex-wrap gap-2">
                {(builderUrlInfo ? WEBSITE_BUILDER_SUGGESTED_PROMPTS : DEFAULT_SUGGESTED_PROMPTS).map((sp) => (
                  <button
                    key={sp.label}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                      'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground',
                      'border border-border/50'
                    )}
                    onClick={() => handlePromptClick(sp.prompt)}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      }
    >
      {/* Conversation Area — shared flat chat layout */}
      <FlatConversation
        turns={flatTurns}
        onSendResponse={handleSendResponse}
        emptyStateMessage={builderUrlInfo
          ? "Describe what you want to build — hero sections, pricing cards, feature grids, full pages — and I'll create it on your canvas."
          : "Ask me anything about your dashboard — manage leads, datasets, pipelines, and more."
        }
      />

      {/* Background processing indicator — shown when AI is generating content silently */}
      {backgroundProcessing && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex gap-0.5">
            <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
            <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
            <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
          </div>
          <span>
            Generating {backgroundProcessing === 'contract' ? 'contract content' : 'page content'} in background...
          </span>
        </div>
      )}

    </AIWidgetShell>
  )
}

export default MochiWidget
