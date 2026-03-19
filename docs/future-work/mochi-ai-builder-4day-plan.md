# Mochi AI Website Builder — 4-Day Feature Upgrade Plan

## Executive Summary

Currently, Mochi AI can **generate** website pages but cannot **see, edit, or intelligently compose** them. The AI is blind to what's already on the canvas — it can't delete elements, rearrange sections, or select from our pre-built component library. This creates a "generate and hope" experience with high regeneration rates.

This 4-day sprint adds **canvas awareness**, **element manipulation**, **smart component selection**, and **batch styling** — transforming Mochi from a content generator into an interactive design partner.

---

## Day 1 — Canvas State Reading

| | |
|---|---|
| **What** | AI gains visibility into what's currently on the builder canvas |
| **Why** | Today the AI is completely blind — it can't answer "what's on my page?" or target specific elements. Every other improvement depends on this. |
| **How** | Extend the existing canvas bridge to push a lightweight element summary (name, type, position, colors) from the builder's Redux store into the AI's request context. Reuses existing selectors and bridge patterns — no new APIs needed. |
| **User Impact** | Users can ask "what's on my page?" and get an accurate answer. AI makes context-aware decisions instead of guessing. |
| **Deliverable** | AI accurately describes all sections on the current page by name, type, and structure. |

---

## Day 2 — Element Deletion, Reorder, Move & Batch Styles

| | |
|---|---|
| **What** | AI can remove elements, rearrange section order, move elements between containers, and apply style changes across multiple elements at once |
| **Why** | Users constantly ask "delete this section", "move the CTA higher", "make all headings blue" — the AI currently can't do any of these. Users have to manually edit, which defeats the purpose of AI assistance. |
| **How** | Create new AI tools that return action events through the existing event pipeline. The builder hook dispatches to existing Redux actions (`deleteElement`, `reorderElement`, `moveElement`) — all the underlying operations already exist, they just aren't exposed to the AI. |
| **User Impact** | Full conversational editing: "Delete the testimonials section", "Move the CTA above the hero", "Make all headings white". All operations support undo (Ctrl+Z). |
| **Deliverable** | Delete, reorder, move, and batch style operations via chat, each with single-step undo. |

---

## Day 3 — Smart Component Selection & Section Replace

| | |
|---|---|
| **What** | AI intelligently searches our pre-built component library (Navbar, Sidebar, Logo Carousel, Social Proof, etc.) and selects the best match based on user intent, business niche, and page context. Users can also replace entire sections in one command. |
| **Why** | Today when a user asks for a "navbar", the AI builds one from scratch using basic elements — missing mobile menus, sticky behavior, and responsive design. We already have polished pre-built components with rich metadata (tags, keywords, industry fit), but the AI doesn't know they exist. |
| **How** | Create a search tool that queries the existing pre-built registry (already has AI-friendly metadata: tags, keywords, niches, use cases). If one match → auto-insert. If multiple → show options. Section replace combines Day 2's delete with new generation. |
| **User Impact** | "Add a navbar for my SaaS site" → AI finds and inserts a production-quality responsive navbar instead of building a crude one from text and buttons. "Replace the hero" → old section removed, new one generated in its place. |
| **Deliverable** | Intelligent component selection from pre-built library. One-step section replacement. Every new pre-built component added to the library is automatically available to the AI (zero additional code). |

---

## Day 4 — Edge Cases, Safety & Integration Testing

| | |
|---|---|
| **What** | Error handling, safety guardrails, prompt optimization, and full end-to-end testing |
| **Why** | Destructive operations (delete, replace) need safety rails. Edge cases (stale IDs, ambiguous targets, large pages) need graceful handling. The full workflow needs integration testing. |
| **How** | Add confirmation prompts for ambiguous/destructive actions, optimize canvas summary for token efficiency, handle stale state gracefully, run full integration test suite. |
| **User Impact** | Reliable, predictable behavior. AI asks for confirmation when unsure. Errors produce helpful messages instead of silent failures. |
| **Deliverable** | Full integration test passing: build page → inspect → delete → reorder → replace → insert prebuilt → batch style. All operations undo-able. |

---

## What This Unlocks (Before → After)

| Capability | Before | After |
|-----------|--------|-------|
| "What's on my page?" | AI has no idea | Accurate section-by-section description |
| "Delete the testimonials" | Impossible — user must delete manually | One command, supports undo |
| "Move CTA above pricing" | Impossible | One command |
| "Add a navbar" | AI builds crude one from basic elements | AI inserts polished pre-built with mobile menu, sticky, responsive |
| "Make all headings blue" | Must click each heading manually | One command, batch update |
| "Replace the hero section" | Delete manually, re-prompt AI | One command: delete + regenerate |
| "Make the design consistent" | Entirely manual | AI analyzes page, applies harmonized styles |

---

## Technical Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Canvas state too large for AI context | Capped at ~50 elements, only essential properties (name, type, bg color) |
| Destructive operations (delete) | AI asks for confirmation when target is ambiguous. Page element can never be deleted. |
| Stale element references | Graceful error handling — "element may have been removed" |
| Performance impact | Element summary debounced (250ms), reuses existing Redux selectors |

## Technical Approach

- **Zero new APIs or database changes** — all operations use existing Redux actions and bridge patterns
- **Zero breaking changes** — extends existing event system, doesn't modify it
- **Reuses existing infrastructure**: Redux selectors, canvas bridge, event pipeline, pre-built registry with AI metadata
- **Each day produces a working, independently testable improvement**

---

## Dependency Chain

```
     Day 1: Canvas Reading
     (AI can SEE the canvas)
              │
     ┌────────┴────────┐
     │                 │
Day 2: Delete      Day 3: Smart
Reorder, Move,     Component
Batch Styles       Selection
     │                 │
     └────────┬────────┘
              │
       Day 4: Polish
       & Integration
```
