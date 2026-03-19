# Website Builder — Zero Code Drift Refactor

## Goal
Eliminate ALL duplicate rendering code in the website builder. Every element type should have ONE source of truth — the unified element in `unified-elements/`. No inline rendering, no copy-paste logic, no possibility of code drift.

## What We Discovered

### The 2 Clean Routing Systems (DONE — No Changes Needed)
1. **`page-renderer.tsx` ElementRenderer** — Routes all 17 types to unified elements. Clean.
2. **`canvas.tsx` renderElement** — Routes all 17 types to Canvas wrappers (ElementWrapper + unified element). Clean.

### The 3 Inline Duplicate Renderers (THE PROBLEM)
These bypass unified elements and re-implement rendering with inline code:

1. **`ComponentChildRenderer`** in `component-instance-renderer.tsx` (~500 lines)
   - Used by: UnifiedComponentInstance (preview mode), UnifiedSmartCmsList (preview mode)
   - Renders 9 types inline: text, image, button, frame, component, add-to-cart, checkout, cart, ecommerce-carousel
   - MISSING 8 types: video, form, payment, link, smartcms-list, prebuilt-navbar, prebuilt-sidebar, prebuilt-total-members
   - Has 4 sub-renderers: ButtonChildRenderer, AddToCartButtonChildRenderer, CheckoutChildRenderer, CartChildRenderer

2. **`CanvasChildRenderer`** in `unified-component-instance.tsx` (~400 lines)
   - Used by: UnifiedComponentInstance (canvas mode)
   - Renders 8 types inline: text, image, button, frame, component, add-to-cart, checkout, cart
   - MISSING 9 types: video, form, payment, link, ecommerce-carousel, smartcms-list, prebuilt-navbar, prebuilt-sidebar, prebuilt-total-members
   - Has special logic for interactive nested component instances (scoped IDs)

3. **`CanvasPreviewChild`** in `unified-smartcms-list.tsx` (~250 lines)
   - Used by: UnifiedSmartCmsList (canvas mode, component preview)
   - Renders 7 types inline: text, image, button, frame, add-to-cart, checkout, cart
   - MISSING 10 types: video, form, payment, link, component, ecommerce-carousel, smartcms-list, prebuilt-navbar, prebuilt-sidebar, prebuilt-total-members

### Dead Code (Never Imported by Any Consumer)
- `ComponentInstanceRenderer` in `component-instance-renderer.tsx` — replaced by UnifiedComponentInstance
- `SmartCmsListRenderer` + `SmartCmsListItemRenderer` in `smartcms-renderer.tsx` — replaced by UnifiedSmartCmsList

### Summary of Duplication
The same text/image/button/frame/cart rendering logic exists in **5 separate places** (3 inline renderers + the 2 clean routing systems). Any style change, bug fix, or new feature must be replicated across all 5 or the builder breaks. This is unsustainable.

## The Fix

### Core Idea
Replace all 3 inline renderers with thin dispatchers that delegate to unified elements. The unified elements already handle both canvas and preview modes — we just need to call them.

### Phase A — Preview Mode: Refactor ComponentChildRenderer
**File**: `component-instance-renderer.tsx`

Replace ~800 lines of inline rendering + sub-renderers with ~80 lines that delegate to unified elements.

**How it works**:
- In preview mode, unified elements render self-contained (wrapper + content)
- Elements in component sourceTrees have `parentId !== null`, so unified elements correctly use `position: relative`
- For container elements (frame, link), compute children and pass as React children to the unified element

**Before** (9 types, ~800 lines):
```tsx
if (element.type === 'text') {
  // 50 lines of inline text rendering...
}
if (element.type === 'image') {
  // 80 lines of inline image rendering...
}
// ... plus 4 sub-renderer functions (ButtonChildRenderer, AddToCartButtonChildRenderer, etc.)
```

**After** (ALL 17 types, ~80 lines):
```tsx
if (element.type === 'text') {
  return <UnifiedText element={element as TextElementType} />
}
if (element.type === 'image') {
  return <UnifiedImage element={element as ImageElementType} />
}
// etc. — one line per type, ALL types supported
```

**Deletes**: ButtonChildRenderer, AddToCartButtonChildRenderer, CheckoutChildRenderer, CartChildRenderer

### Phase B — Canvas Mode: Refactor CanvasChildRenderer
**File**: `unified-component-instance.tsx`

Replace ~400 lines of inline rendering with ~120 lines that delegate to unified elements wrapped in non-interactive wrappers.

**How it works**:
- In canvas mode, unified elements return CONTENT ONLY (no wrapper)
- We wrap each unified element in a simple `<div>` with `position: relative`, sizing, and `pointerEvents: none`
- EXCEPTION: nested component instances remain interactive (rendered as full UnifiedComponentInstance with scoped IDs)

**Before**:
```tsx
if (element.type === 'text') {
  // 25 lines of inline text rendering with pointerEvents: none...
}
```

**After**:
```tsx
if (element.type === 'text') {
  return (
    <NonInteractiveWrapper element={element}>
      <UnifiedText element={element as TextElementType} />
    </NonInteractiveWrapper>
  )
}
```

**Deletes**: FrameWithGradientBorder helper component

### Phase C — Canvas Mode: Refactor CanvasPreviewChild
**File**: `unified-smartcms-list.tsx`

Replace ~250 lines of inline rendering with imports of the same `CanvasChildRenderer` from Phase B, or a shared version.

Since `CanvasPreviewChild` is simpler than `CanvasChildRenderer` (no scoped IDs, no interactive nested components), we can either:
1. Import and reuse `CanvasChildRenderer` from unified-component-instance.tsx (passing no-op handlers)
2. Create a shared `NonInteractiveChildRenderer` that both files import

Best approach: Extract a shared `NonInteractiveChildRenderer` into a new shared file that both unified-component-instance.tsx and unified-smartcms-list.tsx import. The special interactive nested component handling stays in unified-component-instance.tsx.

### Phase D — Delete Dead Code
1. Delete `ComponentInstanceRenderer` function from `component-instance-renderer.tsx`
2. Delete `smartcms-renderer.tsx` entirely (SmartCmsListRenderer + SmartCmsListItemRenderer — fully replaced by UnifiedSmartCmsList)
3. Update `page-renderer/index.ts` barrel — remove dead exports
4. Clean up comments referencing deleted code

### Phase E — TypeScript Verification
Run `npx tsc --noEmit` to verify zero new errors.

## File Change Summary

### Files Modified
- `component-instance-renderer.tsx` — Gut from ~1200 lines to ~150 lines (thin dispatcher only)
- `unified-component-instance.tsx` — Replace CanvasChildRenderer (~400 lines) with unified delegation (~120 lines)
- `unified-smartcms-list.tsx` — Replace CanvasPreviewChild (~250 lines) with shared renderer import
- `page-renderer/index.ts` — Remove dead exports

### Files Created
- `_components/shared/non-interactive-child-renderer.tsx` — Shared canvas-mode child renderer (~100 lines)

### Files Deleted
- `renderers/page-renderer/smartcms-renderer.tsx` — Dead code (replaced by UnifiedSmartCmsList)

## Rules
1. NEVER use `any` or `unknown` — use SOURCE OF TRUTH types from `_lib/types.ts`
2. Write structured comments explaining WHAT and WHY
3. Keep code minimal and easy to read
4. Unified elements are the SINGLE SOURCE OF TRUTH for rendering
5. NEVER touch git, migrations, or run prisma commands
6. Test with `npx tsc --noEmit` after all changes
