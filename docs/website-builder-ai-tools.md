# Website Builder AI Tools Documentation

This document covers the Mochi AI tools for creating and managing websites and pages from the chat widget.

## Overview

Users can create websites, add pages, and generate AI-powered page content directly from the Mochi AI chat — without manually navigating to the website builder. When a `contentPrompt` is provided, the AI creates the page, navigates the user to the builder, and generates UI content via `ui-spec` code fences.

## Architecture

### Data Flow

```
User: "Create a landing page with a hero section"
  │
  ▼
Mochi AI → createPage tool (tRPC caller)
  │         ├─ websites.getById() → previewId, domainId
  │         ├─ pages.create() → new page entity
  │         └─ Returns _event { feature: 'website-builder', navigate: true, data: { previewId, slug } }
  │
  ▼
MochiWidget → navigateForEvent()
  │         └─ FEATURE_ROUTES['website-builder'] → /{previewId}/{slug}/edit
  │
  ▼
AI outputs ```ui-spec code fence
  │
  ▼
Content fence transform → data-ui-spec events
  │
  ▼
canvasBridge.pushElements() → Builder Redux store
```

### Key Components

| Component | Location | Role |
|-----------|----------|------|
| Website tools | `src/lib/ai/mochi/tools/websites.ts` | Tool definitions for website/page CRUD |
| Tools aggregator | `src/lib/ai/mochi/tools/index.ts` | Registers all tools including website tools |
| Canvas bridge | `src/lib/ai/ui-render/canvas-bridge.ts` | Delivers AI elements to the builder with buffering |
| Navigation routes | `src/components/ai/mochi-widget/index.tsx` | `FEATURE_ROUTES` map for `website-builder` |
| Builder context | `src/components/ai/mochi-widget/index.tsx` | `builderUrlInfo` + `builderData` query for current website/page identity |
| UI render strategy | `src/lib/ai/stream/strategies/ui-render-strategy.ts` | Ensures ui-spec prompt is always available |
| Event types | `src/lib/ai/mochi/events/types.ts` | `website-builder` in `MochiEventFeature` union |

## Available Tools

### listWebsites

Lists all websites in the organization with basic info.

```typescript
// Input
{ search?: string }

// Output
{
  success: true,
  websites: [{ id, name, previewId, pageCount }],
  total: number,
  message: string
}
```

**Permission:** `WEBSITES_READ`

### createWebsite

Creates a new website (category) with an optional initial "home" page.

```typescript
// Input
{
  name: string,              // e.g., "Portfolio"
  description?: string,
  createHomePage?: boolean    // default: true
}

// Output
{
  success: true,
  websiteId: string,
  name: string,
  previewId: string,
  message: string,
  _event: { feature: 'website-builder', action: 'created', entityId: string }
}
```

**Permission:** `WEBSITES_CREATE`
**Feature Gate:** `websites.limit`

### listPages

Lists all pages for a specific website.

```typescript
// Input
{ websiteId: string }

// Output
{
  success: true,
  pages: [{ id, name, slug, status }],
  total: number,
  message: string
}
```

**Permission:** `WEBSITES_READ`

### createPage

Creates a new page. When `contentPrompt` is provided, navigates to the builder and triggers AI content generation via `ui-spec` code fences.

```typescript
// Input
{
  websiteId: string,
  name: string,               // e.g., "About Us"
  slug?: string,              // auto-generated from name if omitted
  contentPrompt?: string      // triggers navigation + AI content generation
}

// Output (with contentPrompt)
{
  success: true,
  pageId: string,
  name: string,
  slug: string,
  previewId: string,
  message: "Page created and builder is open. Output content in ```ui-spec fence...",
  _event: {
    feature: 'website-builder',
    action: 'navigate',
    entityId: string,
    navigate: true,
    data: { previewId: string, slug: string }
  }
}
```

**Permission:** `WEBSITES_CREATE`
**Feature Gate:** `pages_per_website.limit`

### editPageContent

Opens an existing page in the builder for AI content generation. No database mutation — purely navigates.

```typescript
// Input
{
  websiteId: string,
  pageId: string,
  slug: string,
  prompt: string              // what to generate
}

// Output
{
  success: true,
  pageId: string,
  slug: string,
  message: "Builder is open. Output content in ```ui-spec fence...",
  _event: { feature: 'website-builder', action: 'navigate', navigate: true, data: { previewId, slug } }
}
```

**Permission:** `WEBSITES_READ` (only fetches website for previewId)

### deletePage

Permanently deletes a page. Always requires `askUser` confirmation first.

```typescript
// Input
{ pageId: string }

// Output
{
  success: true,
  pageId: string,
  message: "Page deleted successfully",
  _event: { feature: 'website-builder', action: 'deleted', entityId: string }
}
```

**Permission:** `WEBSITES_DELETE`

## Element Buffering (Canvas Bridge)

### Problem

When the AI creates a page and immediately starts streaming `ui-spec` content, the navigation to the builder hasn't completed yet. Elements pushed via `canvasBridge.pushElements()` before the builder mounts and subscribes would be silently dropped.

### Solution

The `CanvasBridge` class buffers elements in a `pendingElements` array when no listener is active:

```typescript
// pushElements() — buffers when no subscriber
pushElements(elements: CanvasElement[]): void {
  if (this.listener) {
    this.listener(elements)       // deliver immediately
  } else {
    this.pendingElements.push(...elements)  // buffer for later
  }
}

// subscribe() — flushes pending elements to new subscriber
subscribe(callback: CanvasElementsListener): () => void {
  this.listener = callback
  if (this.pendingElements.length > 0) {
    callback(this.pendingElements)  // flush buffered elements
    this.pendingElements = []
  }
  return () => { /* cleanup */ }
}
```

### Timeline

```
1. AI calls createPage → event emitted with navigate: true
2. MochiWidget calls router.push('/{previewId}/{slug}/edit')
3. AI starts outputting ```ui-spec content (elements arrive)
4. canvasBridge.pushElements() → no listener → buffered in pendingElements
5. Builder component mounts → calls canvasBridge.subscribe()
6. subscribe() flushes pendingElements to the builder
7. Subsequent elements delivered directly via listener
```

## Builder Context Awareness

When the user is inside the website builder (`/{domainName}/{pageSlug}/edit`), the MochiWidget automatically detects the current website and page, injecting their IDs into the AI's system context. This means the AI knows the "current website" without calling `listWebsites` or asking the user.

### How It Works

```
1. builderUrlInfo — useMemo parses pathname into { domainName, pageSlug }
2. trpc.builder.getDataByPageSlug.useQuery() — fetches (or reads from cache)
   websiteId, websiteName, pageId, pageName
3. pageContext — injects these IDs into the AI system prompt:
   "The user is editing page 'Home' (pageId: xyz) in website 'Portfolio' (websiteId: abc).
    Use websiteId 'abc' directly — do NOT call listWebsites."
```

### Cache Optimization

The builder page's server component already prefetches `getDataByPageSlug` via `HydrationBoundary`. The MochiWidget's query uses the same cache key, so it reads from the React Query cache instantly — no extra network request.

### Fallback

If the builder data hasn't loaded yet (first render race condition), the widget falls back to a generic builder context message without specific IDs. The AI will then call `listWebsites` as before.

## Navigation

### FEATURE_ROUTES Entry

```typescript
// In MochiWidget (src/components/ai/mochi-widget/index.tsx)
const FEATURE_ROUTES = {
  'website-builder': (_id, data) => `/${data?.previewId}/${data?.slug}/edit`,
  // ... other routes
}
```

The route uses `data.previewId` and `data.slug` from the event's `data` field (not `entityId`) because the builder URL requires both the website's preview ID and the page's slug.

### Background Mode

When background mode is active, ALL navigation is suppressed by `resolveNavigation()`. The AI creates pages and reports results inline in the chat without opening the builder.

## UI Render Strategy

The `ui-render-strategy.ts` is set to `isAlwaysActive: true` so the AI knows the `ui-spec` format even when the user is on the dashboard (not in the builder). Without this, the AI can't generate valid JSONL patches because the prompt extension wouldn't be included in non-builder contexts.

## Slug Generation

When `slug` is not provided to `createPage`, it's auto-generated from the page name:

```
"About Us"          → "about-us"
"My Landing Page!"  → "my-landing-page"
"Contact"           → "contact"
```

The helper strips non-alphanumeric characters, collapses hyphens, trims edges, and caps at 63 characters.

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/ai/mochi/tools/websites.ts` | Tool definitions (listWebsites, createWebsite, etc.) |
| `src/lib/ai/mochi/tools/index.ts` | Tool aggregator — registers website tools |
| `src/lib/ai/ui-render/canvas-bridge.ts` | Element delivery bridge with buffering |
| `src/lib/ai/mochi/events/types.ts` | `website-builder` feature type |
| `src/lib/ai/mochi/navigation/navigation-controller.ts` | Navigation decision logic (exact path matching) |
| `src/components/ai/mochi-widget/index.tsx` | FEATURE_ROUTES navigation map + builder context query |
| `src/components/website-builder/builder-v1.2/[id]/builder-client.tsx` | Handles external navigation page switch |
| `src/lib/ai/stream/strategies/ui-render-strategy.ts` | Always-active ui-spec strategy |
| `src/trpc/routers/pages.ts` | Page tRPC router (nullable domainId) |
| `src/trpc/routers/websites.ts` | Website tRPC router |
| `src/services/website.service.ts` | Website service layer |
| `src/services/page.service.ts` | Page service layer |

## Testing Checklist

1. **List websites:** Ask "list my websites" → should return website list with names and page counts
2. **Create website:** Ask "create a new website called Portfolio" → should create website with home page
3. **List pages:** Ask "show pages in my Portfolio website" → should list the home page
4. **Create page (no content):** Ask "create an about page in Portfolio" → should create empty page
5. **Create page (with content):** Ask "create a landing page with a hero section and features grid" → should create page, navigate to builder, AND generate ui-spec content on canvas
6. **Edit existing page:** Ask "add a testimonials section to my about page" → should navigate to builder and stream content
7. **Delete page:** Ask "delete the about page" → should confirm with askUser then delete
8. **Element buffering:** Elements should appear on canvas even when builder mounts after navigation starts
9. **Background mode:** With background mode on, pages should be created but no navigation should occur
