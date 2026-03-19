/**
 * ============================================================================
 * NODE SIDEBAR
 * ============================================================================
 *
 * Left sidebar containing draggable nodes organized by category.
 * Users drag nodes from here onto the canvas to build automations.
 *
 * CATEGORIES:
 * - Triggers (amber): Events that start the automation
 * - Actions (blue): Operations to perform
 * - Conditions (purple): Branching logic
 * - Control (slate): Flow control (Wait/Delay)
 *
 * DRAG AND DROP:
 * - Uses HTML5 drag and drop API
 * - Node type is stored in dataTransfer
 * - Canvas listens for drop events
 *
 * SOURCE OF TRUTH: NodeRegistry, AutomationNodeType
 */

'use client'

import { useCallback, useState, useMemo, useRef } from 'react'
import { SearchIcon, XIcon } from 'lucide-react'
import { NODE_CATEGORIES, getNodesByCategory, getCategoryMeta } from '../_lib/node-registry'
import { useAutomationBuilder } from '../_lib/automation-builder-context'
import { Input } from '@/components/ui/input'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { cn } from '@/lib/utils'
import type { AutomationNodeType, AutomationNodeCategory } from '../_lib/types'

// ============================================================================
// COMPONENT
// ============================================================================

export function NodeSidebar() {
  const { dispatch } = useAutomationBuilder()
  const [searchQuery, setSearchQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  /**
   * Handle drag start for a node.
   * Stores the node type in dataTransfer for the canvas to read.
   */
  const handleDragStart = useCallback(
    (event: React.DragEvent, nodeType: AutomationNodeType) => {
      event.dataTransfer.setData('application/automation-node-type', nodeType)
      event.dataTransfer.effectAllowed = 'move'

      // Update drag state in context
      dispatch({
        type: 'SET_DRAGGING',
        payload: { isDragging: true, draggedNodeType: nodeType },
      })
    },
    [dispatch]
  )

  /**
   * Handle drag end.
   * Resets the drag state.
   */
  const handleDragEnd = useCallback(() => {
    dispatch({
      type: 'SET_DRAGGING',
      payload: { isDragging: false, draggedNodeType: null },
    })
  }, [dispatch])

  /**
   * Update fade visibility based on scroll position.
   * Shows top fade when scrolled down, bottom fade when more content below.
   */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowTopFade(el.scrollTop > 4)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }, [])

  return (
    <aside
      className={cn(
        'absolute top-16 left-4 z-20',
        'w-58',
        'bg-white dark:bg-muted',
        'rounded-3xl',
        'flex flex-col overflow-hidden',
        'transition-all duration-200'
      )}
    >
      {/* Compact search header */}
      <div className="p-3 pb-2 space-y-2">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 pr-7 text-xs rounded-lg bg-muted/50 dark:bg-background/20 border-0 text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable node list with marquee fade on scroll edges */}
      <MarqueeFade
        showTopFade={showTopFade}
        showBottomFade={showBottomFade}
        fadeHeight={70}
        className="flex-1 min-h-0"
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="overflow-y-auto max-h-[60vh] px-3 pb-3 space-y-4"
        >
          {NODE_CATEGORIES.map((category) => (
            <NodeCategorySection
              key={category.id}
              category={category.id}
              searchQuery={searchQuery}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* Empty state when search matches nothing */}
          <SearchEmptyState searchQuery={searchQuery} />
        </div>
      </MarqueeFade>
    </aside>
  )
}

// ============================================================================
// SEARCH EMPTY STATE
// ============================================================================

/**
 * Shows a message when the search query matches no nodes.
 * Checks all categories to determine if anything matched.
 */
function SearchEmptyState({ searchQuery }: { searchQuery: string }) {
  const hasResults = useMemo(() => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return NODE_CATEGORIES.some((category) => {
      const nodes = getNodesByCategory(category.id)
      return nodes.some(
        (node) =>
          node.label.toLowerCase().includes(query) ||
          node.description.toLowerCase().includes(query)
      )
    })
  }, [searchQuery])

  if (hasResults) return null

  return (
    <div className="text-center py-6">
      <p className="text-sm text-muted-foreground">
        No nodes matching &quot;{searchQuery}&quot;
      </p>
    </div>
  )
}

// ============================================================================
// SUBCATEGORY SECTION
// ============================================================================

interface NodeCategorySectionProps {
  category: AutomationNodeCategory
  searchQuery: string
  onDragStart: (event: React.DragEvent, nodeType: AutomationNodeType) => void
  onDragEnd: () => void
}

function NodeCategorySection({
  category,
  searchQuery,
  onDragStart,
  onDragEnd,
}: NodeCategorySectionProps) {
  const allNodes = getNodesByCategory(category)
  const categoryMeta = getCategoryMeta(category)

  // Filter nodes by search query — matches against label and description
  const nodes = useMemo(() => {
    if (!searchQuery.trim()) return allNodes
    const query = searchQuery.toLowerCase()
    return allNodes.filter(
      (node) =>
        node.label.toLowerCase().includes(query) ||
        node.description.toLowerCase().includes(query)
    )
  }, [allNodes, searchQuery])

  // Hide entire category if no nodes match or category doesn't exist
  if (nodes.length === 0 || !categoryMeta) return null

  return (
    <div className="space-y-1.5">
      {/* Category header — compact, minimal */}
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 px-1">
        {categoryMeta.label}
      </h3>

      {/* Nodes */}
      <div className="space-y-0.5">
        {nodes.map((node) => (
          <DraggableNode
            key={node.type}
            type={node.type}
            label={node.label}
            description={node.description}
            icon={node.icon}
            colorClass={categoryMeta.colorClass}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// DRAGGABLE NODE
// ============================================================================

interface DraggableNodeProps {
  type: AutomationNodeType
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  onDragStart: (event: React.DragEvent, nodeType: AutomationNodeType) => void
  onDragEnd: () => void
}

function DraggableNode({
  type,
  label,
  description,
  icon: Icon,
  colorClass,
  onDragStart,
  onDragEnd,
}: DraggableNodeProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, type)}
      onDragEnd={onDragEnd}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab',
        'hover:bg-sidebar-accent border border-transparent',
        'active:cursor-grabbing active:scale-[0.97]',
        'transition-all duration-150'
      )}
      title={description}
    >
      {/* Compact icon container */}
      <div className="w-6 h-6 rounded-md flex items-center justify-center bg-sidebar-accent shrink-0">
        <Icon className="h-3 w-3 text-sidebar-foreground/60" />
      </div>
      <span className="text-xs font-medium truncate text-sidebar-foreground/80">{label}</span>
    </div>
  )
}
