'use client'

/**
 * SpotlightSearch — Quick-access search overlay for the website builder.
 *
 * Appears above the bottom toolbar as a keyboard-driven command palette.
 * Users can search for elements, quick actions, and local components,
 * then insert/execute/navigate with Enter or drag elements onto the canvas.
 *
 * SOURCE OF TRUTH KEYWORDS: SpotlightSearch, SpotlightSearchProps, SpotlightItem, SpotlightAction
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutGrid,
  Circle,
  Type,
  FileText,
  Image,
  Video,
  RectangleHorizontal,
  FormInput,
  Smile,
  Database,
  ShoppingBag,
  HelpCircle,
  List,
  StickyNote,
  Timer,
  ShoppingCart,
  Plus,
  CreditCard,
  Receipt,
  FilePlus,
  Globe,
  Undo2,
  Redo2,
  Settings,
  HardDrive,
  RefreshCw,
  Component,
  Search,
  Command,
} from 'lucide-react'

import type { SpotlightItem, SpotlightAction, SpotlightCategory } from './spotlight-items'
import {
  getStaticSpotlightItems,
  buildComponentItems,
  filterSpotlightItems,
} from './spotlight-items'

/* -------------------------------------------------------------------------- */
/*  Icon mapping — maps string icon names to actual lucide components         */
/* -------------------------------------------------------------------------- */

/** SOURCE OF TRUTH: ICON_MAP for spotlight icon string-to-component resolution */
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutGrid,
  Circle,
  Type,
  FileText,
  Image,
  Video,
  RectangleHorizontal,
  FormInput,
  Smile,
  Database,
  ShoppingBag,
  HelpCircle,
  List,
  StickyNote,
  Timer,
  ShoppingCart,
  Plus,
  CreditCard,
  Receipt,
  FilePlus,
  Globe,
  Undo2,
  Redo2,
  Settings,
  HardDrive,
  RefreshCw,
  Component,
  Search,
  Command,
}

/**
 * Renders a lucide icon from its string name.
 * Returns null if the name doesn't match any mapped icon.
 */
function SpotlightIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon size={size} className="opacity-70 shrink-0 text-muted-foreground" />
}

/* -------------------------------------------------------------------------- */
/*  Category display labels                                                   */
/* -------------------------------------------------------------------------- */

const CATEGORY_LABELS: Record<SpotlightCategory, string> = {
  elements: 'Elements',
  actions: 'Quick Actions',
  components: 'Components',
}

/** Display order for categories */
const CATEGORY_ORDER: SpotlightCategory[] = ['elements', 'actions', 'components']

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * SOURCE OF TRUTH: SpotlightSearchProps
 *
 * The parent component owns Redux/state — this component is purely visual
 * and delegates all mutations through callbacks.
 */
interface SpotlightSearchProps {
  open: boolean
  onClose: () => void
  /** Called when user selects an insert-element item — parent handles the actual canvas drop */
  onInsertElement: (action: {
    elementType: string
    variant?: string
    prebuiltType?: string
    variantId?: string
  }) => void
  /** Called when user selects an insert-component item */
  onInsertComponent: (componentId: string) => void
  /** Called when user selects an execute action (createPage, publishPage, undo, redo) */
  onExecute: (handler: string) => void
  /** Called when user selects a navigate action (settings, settings-page, cms, storage, layers, pages, components) */
  onNavigate: (target: string) => void
  /** Local components for the components category — passed from parent who has Redux access */
  components: { id: string; name: string }[]
}

/* -------------------------------------------------------------------------- */
/*  Right-side hint text for items                                            */
/* -------------------------------------------------------------------------- */

/** Known keyboard shortcuts for execute actions */
const EXECUTE_SHORTCUTS: Record<string, string> = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
}

/**
 * Returns a short hint string shown on the right side of an item row.
 * - Execute actions show keyboard shortcuts when available.
 * - Navigate actions show a return-key hint.
 * - Insert actions show nothing (they are draggable instead).
 */
function getItemHint(action: SpotlightAction): string | null {
  if (action.type === 'execute') {
    return EXECUTE_SHORTCUTS[action.handler] ?? null
  }
  if (action.type === 'navigate') {
    return '\u21B5 to open'
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function SpotlightSearch({
  open,
  onClose,
  onInsertElement,
  onInsertComponent,
  onExecute,
  onNavigate,
  components,
}: SpotlightSearchProps) {
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  /** Controls CSS transition — set to true one frame after mount so the animation plays */
  const [visible, setVisible] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /* ---- Build the full item list (static + dynamic components) ------------ */
  const allItems = useMemo(() => {
    const staticItems = getStaticSpotlightItems()
    const componentItems = buildComponentItems(components)
    return [...staticItems, ...componentItems]
  }, [components])

  /* ---- Filter items based on the current query -------------------------- */
  const filteredItems = useMemo(() => {
    return filterSpotlightItems(allItems, query)
  }, [allItems, query])

  /* ---- Group filtered items by category in display order ---------------- */
  const groupedItems = useMemo(() => {
    const groups: { category: SpotlightCategory; items: SpotlightItem[] }[] = []
    for (const cat of CATEGORY_ORDER) {
      const items = filteredItems.filter((item) => item.category === cat)
      if (items.length > 0) {
        groups.push({ category: cat, items })
      }
    }
    return groups
  }, [filteredItems])

  /* ---- Flat list of visible items (for keyboard index navigation) ------- */
  const flatItems = useMemo(() => {
    return groupedItems.flatMap((g) => g.items)
  }, [groupedItems])

  /* ---- Reset state when opened/closed ----------------------------------- */
  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlightIndex(0)
      // Trigger the enter animation on the next frame
      requestAnimationFrame(() => setVisible(true))
      // Auto-focus the search input
      setTimeout(() => inputRef.current?.focus(), 10)
    } else {
      setVisible(false)
    }
  }, [open])

  /* ---- Reset highlight when query changes ------------------------------- */
  useEffect(() => {
    setHighlightIndex(0)
  }, [query])

  /* ---- Scroll the highlighted item into view ---------------------------- */
  useEffect(() => {
    if (!listRef.current) return
    const active = listRef.current.querySelector('[data-spotlight-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  /* ---- Dispatch the selected item's action ------------------------------ */
  const dispatchAction = useCallback(
    (item: SpotlightItem) => {
      const { action } = item
      switch (action.type) {
        case 'insert-element':
          onInsertElement({
            elementType: action.elementType,
            variant: action.variant,
            prebuiltType: action.prebuiltType,
            variantId: action.variantId,
          })
          break
        case 'insert-component':
          onInsertComponent(action.componentId)
          break
        case 'execute':
          onExecute(action.handler)
          break
        case 'navigate':
          onNavigate(action.target)
          break
      }
      onClose()
    },
    [onInsertElement, onInsertComponent, onExecute, onNavigate, onClose]
  )

  /* ---- Keyboard handler ------------------------------------------------- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl+F toggles spotlight closed (prevents browser find from opening)
      const modKey = e.metaKey || e.ctrlKey
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev + 1 < flatItems.length ? prev + 1 : 0))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev - 1 >= 0 ? prev - 1 : flatItems.length - 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = flatItems[highlightIndex]
        if (item) dispatchAction(item)
      }
    },
    [flatItems, highlightIndex, dispatchAction, onClose]
  )

  /* ---- Drag start handler for element items ----------------------------- */
  const handleDragStart = useCallback((e: React.DragEvent, item: SpotlightItem) => {
    if (item.action.type !== 'insert-element') return

    const { elementType, prebuiltType, variantId } = item.action

    // Match the sidebar drag data format so the canvas can consume it identically
    const dragData = prebuiltType
      ? { elementType: 'prebuilt', prebuiltType, variantId }
      : { elementType, variant: elementType }

    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  /* ---- Close when clicking outside the spotlight container --------------- */
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      // Close if click lands outside the spotlight container
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleMouseDown)
    return () => window.removeEventListener('mousedown', handleMouseDown)
  }, [open, onClose])

  /* ---- Don't render anything when closed -------------------------------- */
  if (!open) return null

  /** Running index counter to map grouped rendering back to the flat index */
  let flatIndex = 0

  return (
    <>
      {/* Spotlight container — fixed height to prevent layout shifts */}
      <div
        ref={containerRef}
        onKeyDown={handleKeyDown}
        className={`
          absolute bottom-20 left-1/2 z-[10000] w-[560px] h-[380px]
          bg-background border border-border rounded-2xl shadow-2xl
          flex flex-col overflow-hidden
          transition-all duration-150 ease-out
          ${visible ? '-translate-x-1/2 translate-y-0 opacity-100' : '-translate-x-1/2 translate-y-2 opacity-0'}
        `}
      >
        {/* Search input row */}
        <div className="flex items-center gap-2.5 px-4 py-3 shrink-0">
          <Search size={16} className="opacity-40 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search elements, actions..."
            className="flex-1 bg-transparent border-none outline-none text-foreground text-sm leading-5 font-[inherit] placeholder:text-muted-foreground"
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-border shrink-0" />

        {/* Results list — fills remaining space */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto py-1"
        >
          {flatItems.length === 0 && (
            <div className="px-4 py-6 text-center text-muted-foreground text-[13px]">
              No results found
            </div>
          )}

          {groupedItems.map((group) => {
            const categoryNode = (
              <React.Fragment key={group.category}>
                {/* Category header */}
                <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground select-none">
                  {CATEGORY_LABELS[group.category]}
                </div>

                {/* Items in this category */}
                {group.items.map((item) => {
                  const currentIndex = flatIndex++
                  const isActive = currentIndex === highlightIndex
                  const isDraggable = item.action.type === 'insert-element'
                  const hint = getItemHint(item.action)

                  return (
                    <div
                      key={item.id}
                      data-spotlight-active={isActive}
                      draggable={isDraggable}
                      onDragStart={(e) => handleDragStart(e, item)}
                      onClick={() => dispatchAction(item)}
                      onMouseEnter={() => setHighlightIndex(currentIndex)}
                      className={`
                        h-10 px-4 flex items-center gap-2.5 transition-colors duration-75
                        ${isDraggable ? 'cursor-grab' : 'cursor-pointer'}
                        ${isActive ? 'bg-accent' : 'bg-transparent'}
                      `}
                    >
                      <SpotlightIcon name={item.icon} />

                      {/* Label */}
                      <span className="flex-1 text-[13px] text-foreground/85 whitespace-nowrap overflow-hidden text-ellipsis">
                        {item.label}
                      </span>

                      {/* Right-side hint */}
                      {hint && (
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                          {hint}
                        </span>
                      )}
                    </div>
                  )
                })}
              </React.Fragment>
            )
            return categoryNode
          })}
        </div>
      </div>
    </>
  )
}
