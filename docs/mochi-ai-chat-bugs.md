# Mochi AI Chat — Architecture Bugs & Issues

Comprehensive audit of the Mochi AI streaming chat system.
Last updated: 2026-03-10

---

## HIGH Priority

### 1. Fire-and-Forget Wallet Charging Can Silently Fail
- **Location:** `src/app/api/ai/chat/route.ts` (lines ~306-317)
- **Issue:** Wallet charging uses `.usage.then()` fire-and-forget pattern. If `chargeForAIUsage()` throws, the error is logged but the user already received their full AI response for free.
- **Impact:** Business logic leak — users could get unlimited free AI usage if the charging path consistently fails (e.g., wallet service down, DB connection issue).
- **Fix:** Track charge success/failure and handle accordingly (e.g., retry queue, flag account, or at minimum surface the failure).

### 2. No Architectural Guard Against Auto-Sending Contracts/Invoices
- **Location:** `src/lib/ai/mochi/prompts.ts`, `src/lib/ai/mochi/tools/contracts.ts`, `src/lib/ai/mochi/tools/invoices.ts`
- **Issue:** The "NEVER auto-send" rule is enforced only via system prompt instructions (repeated 5+ times in caps). There is no code-level guard preventing `sendContract` or `sendInvoice` from being called without explicit user consent.
- **Impact:** If the AI misinterprets instructions and calls `sendContract`, a contract gets sent to the recipient with no undo. This is destructive and irreversible.
- **Fix:** Add server-side guard — e.g., require a `userConfirmedSend: true` flag that only gets set when the user explicitly responds to an askUser prompt about sending. Or track conversation state and block send() unless user message contains "send" keyword.

### 3. Website Background Mode Content Lost — No Buffer Replay
- **Location:** `src/components/ai/mochi-widget/index.tsx` (lines ~523-543), no equivalent of contract builder's `consumeFeatureBuffer('contract')`
- **Issue:** When a user creates a page in background mode, the page record is created (tool succeeds), but the AI-generated content (ui-spec JSONL patches) is discarded. The widget's `useMochiEvents('ui-render', ...)` handler processes events, but `tryInitConverter()` fails because no canvas/builder is mounted → `converterRef.current` stays null → all patches are silently dropped.
- **Difference from contracts:** The contract builder has `consumeFeatureBuffer('contract')` on mount which replays buffered events. The website builder has NO equivalent replay mechanism. The emitter buffers ui-render events, but nothing consumes the buffer when the builder opens.
- **Impact:** User chooses "Background" for page creation → page exists but is completely empty. User must manually regenerate content.
- **Fix:** Either: (a) add buffer replay in the website builder similar to contract builder, (b) save generated content server-side during the tool execution, or (c) disable background mode for website content generation.

---

## MEDIUM Priority

### 4. Placement Directive Ref Leaks Between Rapid Consecutive Requests
- **Location:** `src/components/ai/mochi-widget/index.tsx` (lines ~279, ~660-667)
- **Issue:** `placementDirectiveRef` is updated per-request in `handleSubmit()`, but `tryInitConverter()` reads from the ref asynchronously. If two requests fire rapidly, the second request's directive overwrites the ref before the first request's converter initializes.
- **Impact:** Elements could be placed in the wrong position on the canvas (e.g., "above selection" becomes "canvas-floating" or vice versa).
- **Fix:** Scope the placement directive per-request using a request ID, or clear the directive after converter initialization.

### 5. Converter Lazy Init Has No Error Feedback
- **Location:** `src/components/ai/mochi-widget/index.tsx` (lines ~308-341)
- **Issue:** If `canvasBridge.getPageInfo()` returns null repeatedly (e.g., page deleted, permission error, builder not mounted), the converter never initializes. JSONL patches arrive and are silently discarded. User sees "generating..." UI but nothing appears on canvas.
- **Impact:** Silent failure with no error message — user waits indefinitely.
- **Fix:** Add a retry limit with timeout and surface an error toast if converter initialization fails.

### 6. Background Mode Prompt Mismatch — Server Instructs AI to Do Something Impossible
- **Location:** `src/app/api/ai/chat/route.ts` (lines ~272-279)
- **Issue:** The server injects: "Set navigate: false on ALL _event objects in tool results." But tool `execute()` functions hardcode `navigate: true` in their return values — the AI has NO ability to modify the `_event` object in a tool result. The instruction is impossible to follow.
- **Impact:** Confusing — the AI may try to follow the instruction by not outputting events at all, or may hallucinate different behavior. Navigation suppression actually works because the client strips the flag in `use-mochi-ai.ts`, not because of this prompt.
- **Fix:** Remove the misleading instruction from the server-side background mode prompt. Replace with: "You are in background mode. Do NOT tell the user you're opening any builder or navigating anywhere."

### 7. Rapid Send Causes Brief Status Flicker
- **Location:** `src/components/ai/mochi-widget/hooks/use-mochi-ai.ts` (lines ~362-367, ~905-930)
- **Issue:** When `send()` is called during an active stream, the first stream is aborted. But `intentionalAbortRef.current` was already reset to `false` by the second `send()` (line 362). So the first stream's catch block enters the NON-intentional abort path and sets `status: 'aborted'` — briefly overwriting the second stream's `status: 'connecting'`.
- **Impact:** User may see a brief "aborted" state flash before the second stream updates to "streaming". No data loss.
- **Fix:** Set `intentionalAbortRef.current = true` before aborting in `send()`, or check if a new stream has already started before setting abort status.

---

## LOW Priority

### 8. Event Buffering Race Condition (Theoretical)
- **Location:** `src/lib/ai/mochi/events/emitter.ts`
- **Issue:** If a builder component mounts DURING an active content stream and calls `consumeFeatureBuffer()`, the `activeBuffering` flag gets cleared. Subsequent deltas won't be buffered — they go only to live listeners. But since the builder just subscribed via `useMochiEvents`, it catches them. The window for missed events is extremely narrow.
- **Impact:** Theoretical — unlikely in practice because navigation transitions take longer than delta intervals.
- **Fix:** Don't clear `activeBuffering` on consume. Let it stay active until `_complete` event.

### 9. Tool Args JSON Parse Failures Silently Return Empty Object
- **Location:** `src/components/ai/mochi-widget/hooks/use-mochi-ai.ts` (lines ~678-680)
- **Issue:** `safeParseJSON()` returns `{}` on parse failure. Tool calls display with no arguments.
- **Impact:** Hard to debug — users see tool calls with missing params.
- **Fix:** Log a warning when parse fails.

### 10. No Timeout Error Differentiation
- **Location:** `src/app/api/ai/chat/route.ts` (line ~296)
- **Issue:** `AbortSignal.timeout(120s)` throws a generic `AbortError`. Client can't distinguish timeout vs user abort vs network failure.
- **Impact:** Generic error messages instead of specific ones.
- **Fix:** Tag timeout errors with a custom code.

### 11. SSE Line Parsing Doesn't Log Invalid JSON
- **Location:** `src/components/ai/mochi-widget/hooks/use-mochi-ai.ts` (lines ~251-253)
- **Issue:** JSON parse failures in SSE processing are silently caught. No logging.
- **Impact:** Makes debugging stream issues extremely difficult.
- **Fix:** Add `console.warn` for parse failures.

---

## VERIFIED NOT BUGS (False Positives from Automated Scan)

These were flagged by the automated scan but verified as working correctly:

1. **"Missing return in ui-spec buffering"** — Line 89 in emitter.ts DOES have a `return`. FALSE POSITIVE.
2. **"Backtick inside fence breaks transform"** — The buffering logic correctly handles inline backticks inside active fences. Lines starting with `` ` `` are buffered, processed by `processLine()`, and correctly emitted as fence content when they don't match a fence marker. This is REQUIRED to detect closing ``` markers.
3. **"Navigation comparison logic error"** — The `already_on_page` comparison in navigation-controller.ts correctly handles both query-param and no-query-param routes. Different query params = different page state = should navigate.
4. **"backgroundModeRef not synced in handleSendResponse"** — Line 727 in index.tsx clearly shows `backgroundModeRef.current = true`. Correctly synced.
5. **"useMochiEvents without useCallback"** — `useMochiEvents` uses a `handlerRef` pattern (line 36-37 in use-mochi-events.ts) that subscribes ONCE and always calls the latest handler. No useCallback wrapper needed.
6. **"Content fence buffering enters wrong state with activeFence"** — The line 206 condition `!buffering && lineBuffer.length === 0 && ch === '`'` correctly triggers INSIDE active fences too, because we NEED to buffer potential closing ``` markers. Non-marker lines fall through to fence content emission.

---

## Architecture Strengths (Confirmed Working Well)

- Modular strategy registry for extensible content fences (`src/lib/ai/stream/execution-strategies.ts`)
- Centralized tool error handling with structured error codes (`src/lib/ai/mochi/tools/tool-error.ts`)
- Navigation controller as pure testable function (`src/lib/ai/mochi/navigation/navigation-controller.ts`)
- Background mode enforcement at multiple levels (widget ref, hook ref, server prompt)
- Event buffering for late-subscribing components with batched replay (`emitter.ts` + `contract-builder.tsx`)
- Intent detection as pure functions with comprehensive regex patterns
- `handlerRef` pattern in `useMochiEvents` prevents subscription churn
- Proper AbortController usage with intentional vs unintentional abort distinction
- Content fence transform correctly handles nested backticks and edge cases
- Good TypeScript types with SOURCE OF TRUTH keywords throughout
