/**
 * ============================================================================
 * ADD NODE EDGE
 * ============================================================================
 *
 * Custom edge component with a "+" button in the middle.
 * Clicking the button opens a dropdown to add a new node between the connected nodes.
 *
 * SOURCE OF TRUTH: AutomationEdge
 */

'use client'

import { useState, useCallback } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAutomationBuilder } from '../../_lib/automation-builder-context'
import { createAutomationNode, generateEdgeId } from '../../_lib/utils'
import { NODE_REGISTRY } from '../../_lib/node-registry'
import type { AutomationNodeType, AutomationNode, AutomationEdge } from '../../_lib/types'

// ============================================================================
// COMPONENT
// ============================================================================

export function AddNodeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false)
  const { dispatch, state } = useAutomationBuilder()
  const reactFlowInstance = useReactFlow()

  /**
   * Get the bezier curve path for the edge — smooth, natural-looking curves
   */
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  /**
   * Handle adding a new node in between
   */
  const handleAddNode = useCallback(
    (nodeType: AutomationNodeType) => {
      // Find the source and target nodes
      const sourceNode = state.schema.nodes.find((n) =>
        state.schema.edges.find((e) => e.id === id)?.source === n.id
      )
      const targetNode = state.schema.nodes.find((n) =>
        state.schema.edges.find((e) => e.id === id)?.target === n.id
      )

      if (!sourceNode || !targetNode) return

      // Calculate position for new node (midpoint between source and target, offset for horizontal flow)
      const newPosition = {
        x: (sourceNode.position.x + targetNode.position.x) / 2 + 50,
        y: (sourceNode.position.y + targetNode.position.y) / 2,
      }

      // Create the new node
      const newNode = createAutomationNode(nodeType, newPosition)

      // Get the current edge
      const currentEdge = state.schema.edges.find((e) => e.id === id)
      if (!currentEdge) return

      // Remove the old edge and add two new edges
      const newEdges = state.schema.edges.filter((e) => e.id !== id)

      // Edge from source to new node
      const edge1: AutomationEdge = {
        id: generateEdgeId(),
        source: currentEdge.source,
        target: newNode.id,
        sourceHandle: currentEdge.sourceHandle,
      }

      // Edge from new node to target
      const edge2: AutomationEdge = {
        id: generateEdgeId(),
        source: newNode.id,
        target: currentEdge.target,
        targetHandle: currentEdge.targetHandle,
      }

      // Dispatch updates
      dispatch({ type: 'ADD_NODE', payload: { node: newNode } })
      dispatch({ type: 'SET_EDGES', payload: { edges: [...newEdges, edge1, edge2] } })
      dispatch({ type: 'SELECT_NODE', payload: { nodeId: newNode.id } })
    },
    [id, state.schema, dispatch]
  )

  /**
   * Get action nodes from registry
   */
  const actionNodes = Object.entries(NODE_REGISTRY).filter(
    ([_, entry]) => entry.category === 'action'
  )

  /**
   * Get condition nodes from registry
   */
  const conditionNodes = Object.entries(NODE_REGISTRY).filter(
    ([_, entry]) => entry.category === 'condition'
  )

  return (
    <>
      {/* The edge path — bezier curve with muted stroke */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: 'color-mix(in oklch, var(--muted-foreground) 25%, transparent)'
        }}
      />

      {/* The "+" button — appears on hover, centered on the edge */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`
                  h-5 w-5 rounded-full bg-muted/80 backdrop-blur-sm border border-muted-foreground/20
                  hover:border-muted-foreground/40 hover:bg-muted-foreground/20
                  transition-all duration-200
                  ${isHovered || selected ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
                `}
              >
                <PlusIcon className="h-2.5 w-2.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44 rounded-xl border-muted-foreground/10 shadow-lg">
              <DropdownMenuLabel className="text-xs">Add Node</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-muted-foreground/10" />

              {/* Actions */}
              <DropdownMenuLabel className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Actions</DropdownMenuLabel>
              {actionNodes.map(([type, entry]) => {
                const Icon = entry.icon
                return (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => handleAddNode(type as AutomationNodeType)}
                    className="text-xs"
                  >
                    <Icon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    {entry.label}
                  </DropdownMenuItem>
                )
              })}

              <DropdownMenuSeparator className="bg-muted-foreground/10" />

              {/* Conditions */}
              <DropdownMenuLabel className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Conditions</DropdownMenuLabel>
              {conditionNodes.map(([type, entry]) => {
                const Icon = entry.icon
                return (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => handleAddNode(type as AutomationNodeType)}
                    className="text-xs"
                  >
                    <Icon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    {entry.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
