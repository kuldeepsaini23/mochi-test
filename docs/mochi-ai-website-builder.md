# Mochi AI Website Builder — Complete Architecture Guide

This document covers the entire end-to-end architecture of how Mochi AI generates website content and delivers it to the website builder canvas. Use this to understand, debug, and expand the system.

---

## Table of Contents

1. [High-Level Flow](#1-high-level-flow)
2. [System Prompt Assembly](#2-system-prompt-assembly)
3. [The `ui-spec` Code Fence Format](#3-the-ui-spec-code-fence-format)
4. [Content Fence Detection (Server)](#4-content-fence-detection-server)
5. [Client-Side Stream Parsing](#5-client-side-stream-parsing)
6. [JSON Render Receiver Hook](#6-json-render-receiver-hook)
7. [Spec-to-Canvas Conversion](#7-spec-to-canvas-conversion)
8. [Canvas Bridge (Widget → Builder)](#8-canvas-bridge-widget--builder)
9. [Builder-Side Dispatch](#9-builder-side-dispatch)
10. [Website Builder Tools](#10-website-builder-tools)
11. [Context Injection (How AI Knows You're on the Builder)](#11-context-injection)
12. [Live Preview in Chat Widget](#12-live-preview-in-chat-widget)
13. [Style Presets & Properties Panel Compatibility](#13-style-presets--properties-panel-compatibility)
14. [Responsive Design (Automatic)](#14-responsive-design-automatic)
15. [Conversation History Markers](#15-conversation-history-markers)
16. [How to Expand the System](#16-how-to-expand-the-system)
17. [File Reference Map](#17-file-reference-map)

---

## 1. High-Level Flow

```
User types "build a pricing card" in Mochi chat widget
  ↓
POST /api/ai/chat (with pageContext identifying the builder page)
  ↓
System prompt assembled: base Mochi prompt + ui-render prompt extension + pageContext
  ↓
Claude streams response containing ```ui-spec code fence with JSONL patches
  ↓
pipeContentFences() (server TransformStream) detects ```ui-spec markers
  → Separates fence content into data-ui-spec SSE events
  → Normal text continues as text-delta events
  ↓
Client (use-mochi-ai.ts) parses SSE stream
  → Emits events to Mochi event bus: { feature: 'ui-render', action: 'ui_spec_content' }
  ↓
MochiWidget listens for 'ui-render' events
  → Routes deltas to useJsonRenderAI hook
  ↓
useJsonRenderAI buffers character deltas → completes JSONL lines → applies patches to Spec
  → Fires onPatchApplied(spec, patch) for each applied patch
  ↓
IncrementalSpecConverter.convertPatch() converts each patch → one CanvasElement
  ↓
canvasBridge.pushElements([element]) delivers element to builder
  ↓
useAICanvasBridge hook receives element → dispatch(addElement(element)) to Redux
  ↓
Canvas re-renders with new element visible — LIVE as AI generates
  ↓
Stream completes → canvasBridge.signalGenerationComplete()
  → Staging panel marks group as 'ready'
```

**Key insight**: Elements appear on the canvas ONE AT A TIME as the AI generates them, not after the full response completes. This is the "live streaming" experience.

---

## 2. System Prompt Assembly

**File**: `src/app/api/ai/chat/route.ts`

The system prompt is built from multiple parts:

```
1. MOCHI_SYSTEM_PROMPT (base)         ← src/lib/ai/mochi/prompts.ts
2. Strategy prompt extensions          ← getActivePromptExtensions({ pageContext })
   └── getUIRenderPrompt()            ← src/lib/ai/ui-render/prompts.ts (when on builder)
3. Page context (if any)              ← "[website-builder] The user is editing page..."
4. Background mode instructions        ← (if background mode active)
```

The **execution strategy system** (`src/lib/ai/stream/execution-strategies.ts`) is a plug-and-play registry. Each strategy registers:
- `fenceNames`: what code fences to detect (e.g., `['ui-spec']`)
- `getSystemPromptExtension()`: prompt rules appended to the system prompt
- `isAlwaysActive` / `activateOnPageContext`: when to activate

The ui-render strategy is registered in `src/lib/ai/stream/strategies/ui-render-strategy.ts` as always-active, so the AI always knows how to output `ui-spec` fences even when creating pages from the dashboard.

---

## 3. The `ui-spec` Code Fence Format

The AI outputs a markdown code fence with language `ui-spec`:

````
```ui-spec
{"op":"add","path":"/root","value":"hero"}
{"op":"add","path":"/elements/hero","value":{"type":"Card","props":{"title":""},"children":["hero-stack"]}}
{"op":"add","path":"/elements/hero-stack","value":{"type":"Stack","props":{"direction":"vertical","gap":6},"children":["heading","subtitle"]}}
{"op":"add","path":"/elements/heading","value":{"type":"Heading","props":{"text":"Hello World","level":1}}}
{"op":"add","path":"/elements/subtitle","value":{"type":"Text","props":{"text":"Welcome to our site."}}}
```
````

### Format Rules
- **JSONL** (JSON Lines): one JSON object per line, NO trailing commas
- Each line is a **JSON Patch** operation (RFC 6902): `{ "op": "add", "path": "...", "value": ... }`
- First line sets the root: `{"op":"add","path":"/root","value":"root-key"}`
- Subsequent lines add elements: `{"op":"add","path":"/elements/{key}","value":{...}}`
- Element value shape: `{ "type": "ComponentName", "props": {...}, "children": ["child-key-1", ...] }`
- **No markdown, text, or comments** inside the fence — only JSON lines

### Available Components (json-render types)

| Component | Props | Maps to Canvas Element |
|-----------|-------|----------------------|
| Card | `title?: string` | FrameElement (white bg, border, shadow, 32px padding) |
| Stack | `direction: "vertical" \| "horizontal"`, `gap: number` | FrameElement (flexbox) |
| Grid | `columns: number` | FrameElement (flexbox row, wrap) |
| Heading | `text: string`, `level: 1-6` | TextElement (sized by level) |
| Text | `text: string` | TextElement (16px muted gray) |
| Badge | `text: string` | TextElement (blue pill) |
| Button | `label: string`, `variant: "default" \| "secondary" \| "outline" \| "ghost"` | ButtonElement |
| Image | `src: string`, `alt: string` | ImageElement |
| Alert | `title: string`, `description: string` | FrameElement (amber bg, left border) |
| Separator | (none) | FrameElement (1px gray line) |

**Gap units**: The `gap` prop is in 4px units. `gap:6` = 24px, `gap:8` = 32px.

---

## 4. Content Fence Detection (Server)

**File**: `src/lib/ai/stream/content-fence-transform.ts`

`createContentFenceTransform(fenceNames)` returns a `TransformStream` that sits between Claude's output and the SSE response. It processes text-delta chunks character-by-character:

1. **Normal text** → passes through as `text-delta`
2. **Opening fence** (`` ```ui-spec ``) → emits `data-ui-spec-start` event
3. **Content inside fence** → emits `data-ui-spec` events with `delta` field
4. **Closing fence** (`` ``` ``) → emits `data-ui-spec-complete` event
5. **History marker injected** → After fence closes, injects visible text `[✓ Generated ```ui-spec content — applied to canvas]`

The transform is applied via `pipeContentFences()` in the API route:

```typescript
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    writer.merge(pipeContentFences(result.toUIMessageStream(), fenceNames))
  },
})
```

---

## 5. Client-Side Stream Parsing

**File**: `src/components/ai/mochi-widget/hooks/use-mochi-ai.ts`

The hook reads the SSE response body and parses each line:

1. `parseStreamLine(line)` converts SSE `data: {...}` JSON into typed events
2. For `data-ui-spec-*` events, emits to the Mochi event bus:
   - `data_ui_spec_start` → `emitMochiEvent({ feature: 'ui-render', action: 'ui_spec_content', data: { type: 'start' } })`
   - `data_ui_spec` → `emitMochiEvent({ ..., data: { type: 'delta', delta: '...' } })`
   - `data_ui_spec_complete` → `emitMochiEvent({ ..., action: 'ui_spec_content_complete' })`
3. On complete, sets `_uiSpecGenerated: true` flag on the assistant message (for history markers)

---

## 6. JSON Render Receiver Hook

**File**: `src/components/ai/mochi-widget/hooks/use-json-render-ai.ts`

`useJsonRenderAI(options)` is a passive receiver that accumulates the streaming spec:

1. **`startReceiving()`** — Reset state, prepare for new stream
2. **`receiveDelta(delta)`** — Buffer characters into `lineBufferRef`. When `\n` completes a line:
   - Parse line as JSON: `{ op, path, value }`
   - Apply via `applySpecPatch(currentSpec, patch)` from `@json-render/core`
   - Update React state with new accumulated spec
   - **Fire `onPatchApplied(spec, patch)`** — this is where live canvas delivery happens
3. **`receiveComplete()`** — Flush remaining buffer, fire `onComplete(finalSpec)`

**Content validation**: First non-empty line must start with `{`. If the AI accidentally put markdown in the fence, the hook bails early.

---

## 7. Spec-to-Canvas Conversion

**File**: `src/lib/ai/ui-render/spec-to-canvas.ts`

### Two Conversion Modes

**A. Incremental (live streaming)** — `IncrementalSpecConverter` class
- Called on EACH `onPatchApplied` callback
- `convertPatch(spec, patch)` → returns a single `CanvasElement` or `null`
- Maintains `specKeyToCanvasId` map so children can find their parent's canvas ID
- Elements pushed to canvas immediately (one at a time)

**B. Full spec (batch)** — `specToCanvas(spec, options)` function
- Walks full spec tree depth-first
- Returns `{ elements: CanvasElement[], rootIds: string[] }`
- Used as a fallback or for testing

### Component Type Mapping

| json-render Type | → Canvas Type | Creator Function |
|-----------------|---------------|-----------------|
| Card, Stack, Grid, Alert | FrameElement | `createFrameElement()` |
| Heading, Text, Badge | TextElement | `createTextElement()` |
| Button | ButtonElement | `createButtonElement()` |
| Image, Avatar | ImageElement | `createImageElement()` |
| Separator | FrameElement (1px) | `createSeparatorElement()` |
| Unknown with children | FrameElement | `createFrameElement()` |
| Unknown leaf | TextElement | `createTextElement()` |

### Style Presets (FRAME_STYLE_PRESETS)

Visual defaults for frame-type components are centralized in a preset map:

```typescript
const FRAME_STYLE_PRESETS = {
  Card: {
    padding: 32,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    __borderConfig: createUniformBorderConfig('solid', 1, '#e5e7eb'),
    __effects: { shadows: [{ ...createDefaultDropShadow(), y: 1, blur: 3, ... }] },
  },
  Alert: {
    padding: 16,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    __borderConfig: { editMode: 'individual', left: { style: 'solid', width: 4, color: '#f59e0b' } },
  },
}
```

To add a new component type: add one entry to this map. The converter merges: `DEFAULT_FRAME_STYLES + layout props (direction, gap) + preset`.

### Key Rules
- **`flexWrap: 'wrap'` is MANDATORY** — the builder's `computeFrameSizing()` returns `height: auto` ONLY when `flexWrap === 'wrap'`. Without it, frames collapse to 0px height.
- **Child frames use `autoWidth: true`** to fill their parent (100% width).
- **Root frames use `width: 1200`** (fixed page width).
- **Gap prop is multiplied by 4** — `gap:6` in the spec → `gap: 24` (px) in the element.

---

## 8. Canvas Bridge (Widget → Builder)

**File**: `src/lib/ai/ui-render/canvas-bridge.ts`

A singleton pub-sub bridge (`canvasBridge`) connects the Mochi widget to the website builder:

### Data Flow

```
Builder mounts → canvasBridge.setPageInfo({ pageElementId, selection, geometry })
                                    ↕
Widget reads   → canvasBridge.getPageInfo()
Widget pushes  → canvasBridge.pushElements([element], options)
                                    ↓
Builder receives via canvasBridge.subscribe(callback)
```

### Placement Resolution

`resolvePlacement(pageInfo)` determines WHERE to put new elements:

| Selection State | Placement Mode | Behavior |
|----------------|---------------|----------|
| Frame selected | `insert-into-frame` | New content becomes child of selected frame |
| Non-frame element selected | `insert-before` | New content inserted as sibling before selection |
| Page selected / nothing selected | `append-to-page` | Appended at end of page children |
| No page at all | `floating` | Detached root element (1440px wide) |

### AI Container

Each ui-spec generation gets its own wrapper frame via `createAIContainer(placement)`:
- Isolates AI content for easy selection, move, or delete as a group
- Transparent background, column layout, 24px gap
- Properly parented based on placement mode

### Buffer Race Condition

When navigating from dashboard → builder (AI creates page + streams content), elements arrive before the builder mounts. The bridge **buffers** them in `pendingElements` and flushes on `subscribe()`.

---

## 9. Builder-Side Dispatch

**File**: `src/components/website-builder/builder-v1.2/_hooks/use-ai-canvas-bridge.ts`

Three effects in the builder hook:

1. **Push page info** — On mount and selection/page changes, calls `canvasBridge.setPageInfo()`
2. **Subscribe to elements** — Routes received elements to either:
   - **Direct insert**: `dispatch(addElement(element))` — immediate canvas placement
   - **Staging panel**: `dispatch(addStagedElement({ groupId, element }))` — user reviews before accepting
3. **Generation complete** — Transitions staging group from 'streaming' → 'ready'

---

## 10. Website Builder Tools

**File**: `src/lib/ai/mochi/tools/websites.ts`

| Tool | What It Does | Creates Page? | Generates Content? | Navigates? |
|------|-------------|--------------|-------------------|------------|
| `listWebsites` | Lists all websites | No | No | No |
| `createWebsite` | Creates a new website | Optional home page | No | No |
| `listPages` | Lists pages in a website | No | No | No |
| `createPage` | Creates a new page | **Yes** | **Yes** (if `contentPrompt` provided) | **Yes** (if `contentPrompt`) |
| `editPageContent` | Opens existing page for editing | No | **Yes** (always) | **Yes** (always) |
| `deletePage` | Deletes a page | No | No | No (requires `askUser` first) |

### createPage vs editPageContent

Both can trigger content generation via `ui-spec` fences:
- `createPage(websiteId, name, contentPrompt)` — Creates a new page in DB, then navigates + streams
- `editPageContent(websiteId, pageId, slug, prompt)` — NO DB mutation, just navigates + streams

When the AI is already on the builder page, it skips these tools entirely and outputs `ui-spec` directly.

---

## 11. Context Injection

**File**: `src/components/ai/mochi-widget/index.tsx`

The MochiWidget detects the website builder via URL pattern (`/{domainName}/{pageSlug}/edit`) and builds a `pageContext` string:

```
[website-builder] The user is currently editing page "Home"
(pageId: "page_abc", slug: "home")
in website "My Site" (websiteId: "ws_xyz").
When the user says "this website", use websiteId directly — do NOT call listWebsites.
For editPageContent, use pageId and slug.
You can generate website sections using ```ui-spec code fences.
```

This is sent to the API route and appended to the system prompt as `## Current Page Context`.

**Critical behavior**: When `[website-builder]` is in the pageContext, the main system prompt tells the AI to SKIP the `askUser("Real time or Background?")` question and stream immediately.

---

## 12. Live Preview in Chat Widget

**File**: `src/components/ai/mochi-widget/json-render-panel.tsx`

While the spec streams, a live preview renders in the chat bubble using `MochiRenderer`:

```tsx
<MochiRenderer spec={spec} loading={isStreaming} />
```

`MochiRenderer` (`src/lib/ai/ui-render/registry.ts`) is a pre-configured `@json-render/react` renderer that maps catalog component types to actual shadcn React components. This gives users a rich visual preview (cards, headings, buttons) in the chat before elements appear on the canvas.

---

## 13. Style Presets & Properties Panel Compatibility

### Property Format Guide

The builder's properties panel reads styles from `element.styles`. There are two categories:

**Standard CSS properties** — Panel reads directly, no special handling:
- `backgroundColor`, `padding`, `margin`, `borderRadius`, `gap`, `flexDirection`, `alignItems`, `justifyContent`, `color`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`, `opacity`
- These can be `number` (px) or `string` (e.g., `'8px 16px'`)

**Structured `__` configs** — Panel uses specialized editor components:
- `__borderConfig` → `BorderConfig` object → `BorderControl` editor
- `__effects` → `EffectsConfig` object → `EffectsControl` editor
- `__backgroundGradient` → `GradientConfig` object → `GradientControl` editor
- `__backgroundFit` → `'cover' | 'fill'`
- `__backgroundVideo` → `BackgroundVideoConfig` object

**NEVER set `border`, `boxShadow`, or `borderLeft` as raw CSS strings** — the panel can't read them. Always use `__borderConfig` and `__effects` structured objects.

### Adding a New Component Preset

In `spec-to-canvas.ts`, add to `FRAME_STYLE_PRESETS`:

```typescript
Testimonial: {
  padding: 24,
  backgroundColor: '#f9fafb',
  borderRadius: 16,
  __borderConfig: createUniformBorderConfig('solid', 1, '#e5e7eb'),
} as Partial<ElementStyles>,
```

Then add to the prompt's Available Components and the converter's `containerTypes` Set.

---

## 14. Responsive Design (Automatic)

The converter automatically handles mobile responsive layout:

**Row containers** (Grid, horizontal Stack) get:
```typescript
responsiveStyles: { mobile: { flexDirection: 'column' } }
```
→ Cards stack vertically on mobile instead of squashing horizontally.

**Cards inside row containers** get:
```typescript
width: 350                    // Fixed desktop card width
autoWidth: false              // Don't fill parent on desktop
responsiveSettings: { mobile: { autoWidth: true } }  // Fill width on mobile
```

This is automatic — no prompt instruction needed. The AI just uses `Grid` or `Stack(horizontal)` and the converter handles responsive.

---

## 15. Conversation History Markers

When a `ui-spec` fence closes, the content fence transform injects a visible marker:

```
[✓ Generated ```ui-spec content — applied to canvas]
```

This appears in the AI's conversation history on subsequent turns. It serves two purposes:
1. **AI memory**: The AI sees it generated fences before → continues the pattern
2. **User clarity**: Replaces the raw JSONL (which would be confusing) with a clean indicator

Before sending history to the API, `sanitizeUISpecMarkers()` cleans old markers. Messages with `_uiSpecGenerated: true` also get a hint appended to remind the AI to keep outputting fences.

---

## 16. How to Expand the System

### Adding a New Component Type

1. **Prompt** (`src/lib/ai/ui-render/prompts.ts`):
   - Add to "Available Components" list with props documentation
   - Add layout patterns showing how to use it

2. **Converter** (`src/lib/ai/ui-render/spec-to-canvas.ts`):
   - If it's a container → add to `containerTypes` Set + add preset to `FRAME_STYLE_PRESETS`
   - If it's a text type → add to `textTypes` Set
   - If it's a new element type entirely → add a new `create*Element()` function + add to the type switch in `convertNode()` and `convertPatch()`

3. **Catalog** (`src/lib/ai/ui-render/catalog.ts`):
   - If using `@json-render/shadcn`, the component must exist in shadcn definitions
   - For custom components, you'd extend the catalog with custom definitions

### Adding a New Execution Strategy (e.g., Email Templates)

1. Create `src/lib/ai/stream/strategies/email-strategy.ts`:
```typescript
import { registerStrategy } from '../execution-strategies'

registerStrategy({
  id: 'email-template',
  fenceNames: ['email-spec'],
  getSystemPromptExtension: () => `## Email Template Generation\n...your prompt rules...`,
  isAlwaysActive: false,
  activateOnPageContext: 'email-builder',
})
```

2. Import it in `src/app/api/ai/chat/route.ts` (side-effect import)
3. Handle `data-email-spec-*` events in the client widget
4. No changes needed to `content-fence-transform.ts` or `execution-strategies.ts`

### Adding a New Style Property

If the builder adds a new structured property (e.g., `__animation`):
1. Add the config type to `types.ts`
2. Add the editor control to `properties-panel.tsx`
3. Add CSS conversion utility (e.g., `animation-utils.ts`)
4. If the AI should set it, add to `FRAME_STYLE_PRESETS` using the structured format

---

## 17. File Reference Map

### Core Pipeline (ordered by data flow)

| Step | File | Purpose |
|------|------|---------|
| 1 | `src/app/api/ai/chat/route.ts` | API endpoint, prompt assembly, streaming |
| 2 | `src/lib/ai/mochi/prompts.ts` | Base Mochi system prompt (445 lines) |
| 3 | `src/lib/ai/ui-render/prompts.ts` | Website builder prompt extension |
| 4 | `src/lib/ai/stream/execution-strategies.ts` | Strategy registry (plug-and-play) |
| 5 | `src/lib/ai/stream/strategies/ui-render-strategy.ts` | UI render strategy registration |
| 6 | `src/lib/ai/stream/content-fence-transform.ts` | Fence detection TransformStream |
| 7 | `src/components/ai/mochi-widget/hooks/use-mochi-ai.ts` | Client SSE parser, event emitter |
| 8 | `src/components/ai/mochi-widget/hooks/use-json-render-ai.ts` | JSONL patch receiver, spec accumulator |
| 9 | `src/lib/ai/ui-render/spec-to-canvas.ts` | Spec → CanvasElement converter |
| 10 | `src/lib/ai/ui-render/canvas-bridge.ts` | Pub-sub bridge (widget → builder) |
| 11 | `src/components/website-builder/builder-v1.2/_hooks/use-ai-canvas-bridge.ts` | Builder-side element dispatch |

### Supporting Files

| File | Purpose |
|------|---------|
| `src/lib/ai/ui-render/catalog.ts` | json-render component catalog (server-safe) |
| `src/lib/ai/ui-render/registry.ts` | MochiRenderer React component (client-only) |
| `src/lib/ai/ui-render/types.ts` | Type definitions (UIRenderState, hook types) |
| `src/lib/ai/ui-render/index.ts` | Barrel exports (server-safe) |
| `src/lib/ai/mochi/events/index.ts` | Event emitter/subscriber (Mochi event bus) |
| `src/lib/ai/mochi/tools/websites.ts` | Website tool definitions (6 tools) |
| `src/lib/ai/mochi/tools/index.ts` | Tool aggregator (createAllMochiTools) |
| `src/components/ai/mochi-widget/json-render-panel.tsx` | Live preview component |
| `src/components/ai/mochi-widget/index.tsx` | Widget orchestrator (events → hooks → bridge) |

### Builder Types & Utilities

| File | Purpose |
|------|---------|
| `src/components/website-builder/builder-v1.2/_lib/types.ts` | All element types, styles, defaults |
| `src/components/website-builder/builder-v1.2/_lib/border-utils.ts` | BorderConfig creation/conversion |
| `src/components/website-builder/builder-v1.2/_lib/effect-utils.ts` | EffectsConfig creation/conversion |
| `src/components/website-builder/builder-v1.2/_lib/style-utils.ts` | Style computation for rendering |
| `src/components/website-builder/builder-v1.2/_components/properties-panel/properties-panel.tsx` | Properties panel (reads element.styles) |
