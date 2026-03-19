/**
 * ============================================================================
 * AUTOMATION CANVAS
 * ============================================================================
 *
 * The main canvas area where nodes are placed and connected.
 * Uses React Flow for the node-based visual editor.
 *
 * FEATURES:
 * - Drag and drop nodes from sidebar
 * - Connect nodes with edges
 * - Select nodes to edit in properties drawer
 * - Delete nodes with keyboard shortcut
 * - Pan and zoom the canvas
 *
 * SOURCE OF TRUTH: AutomationNode, AutomationEdge, AutomationSchema
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  useReactFlow,
  ConnectionMode,
  PanOnScrollMode,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  type Node,
  type Edge,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useAutomationBuilder } from '../_lib/automation-builder-context'
import { createAutomationNode, generateEdgeId } from '../_lib/utils'
import { TriggerNode } from './nodes/trigger-node'
import { ActionNode } from './nodes/action-node'
import { ConditionNode } from './nodes/condition-node'
import { StartNode } from './nodes/start-node'
import { AddNodeEdge } from './edges'
import type { AutomationNode, AutomationEdge, AutomationNodeType } from '../_lib/types'
import { START_NODE_ID } from '../_lib/types'

// ============================================================================
// NODE TYPES
// ============================================================================

/**
 * Custom node type mapping for React Flow.
 * Maps node type strings to their respective components.
 */
const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  start: StartNode,
} as const

/**
 * Custom edge type mapping for React Flow.
 * Uses our AddNodeEdge component with the "+" button.
 */
const edgeTypes = {
  addNode: AddNodeEdge,
} as const

// ============================================================================
// COMPONENT
// ============================================================================

export function AutomationCanvas() {
  const { state, dispatch } = useAutomationBuilder()
  const reactFlowInstance = useReactFlow()
  const [selectedEdges, setSelectedEdges] = useState<string[]>([])

  /**
   * Get nodes and edges from state
   * Cast to standard React Flow types for compatibility
   */
  const nodes = state.schema.nodes as Node[]
  const edges = state.schema.edges as Edge[]

  /**
   * Handle node changes (position, selection, removal).
   * Dispatches APPLY_NODE_CHANGES so the reducer reads from the latest state,
   * preventing stale closure issues where changes would overwrite recent additions.
   * History is auto-managed by the reducer — no manual saveHistory needed.
   */
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      dispatch({ type: 'APPLY_NODE_CHANGES', payload: { changes } })
    },
    [dispatch]
  )

  /**
   * Handle edge changes (selection, removal).
   * Dispatches APPLY_EDGE_CHANGES so the reducer reads from the latest state,
   * preventing the race condition where onEdgesChange fires after onConnect
   * and overwrites the just-added edge with stale data.
   * History is auto-managed by the reducer — no manual saveHistory needed.
   */
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      dispatch({ type: 'APPLY_EDGE_CHANGES', payload: { changes } })
    },
    [dispatch]
  )

  /**
   * Handle new connections between nodes.
   * Uses ADD_EDGE dispatch so the reducer always works with the latest state.
   * History is auto-managed by the reducer — no manual saveHistory needed.
   */
  const onConnect: OnConnect = useCallback(
    (connection) => {
      const newEdge: AutomationEdge = {
        id: generateEdgeId(),
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      }
      dispatch({ type: 'ADD_EDGE', payload: { edge: newEdge } })
    },
    [dispatch]
  )

  /**
   * Validate connections between nodes.
   *
   * CONNECTION RULES:
   * - trigger → start (triggers handle): ALLOWED (triggers feed into Start)
   * - start (sequence handle) → action/condition: ALLOWED (Start feeds into actions)
   * - action → action/condition: ALLOWED (chain actions together)
   * - condition (true/false) → action/condition: ALLOWED (branching)
   * - trigger → action/condition directly: BLOCKED (must go through Start)
   * - anything → start (sequence handle): BLOCKED (sequence is output only)
   * - start (triggers handle) → anything: BLOCKED (triggers is input only)
   */
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const { source, target, sourceHandle, targetHandle } = connection

      if (!source || !target) return false

      // Look up source and target node types from schema
      const sourceNode = state.schema.nodes.find((n) => n.id === source)
      const targetNode = state.schema.nodes.find((n) => n.id === target)

      if (!sourceNode || !targetNode) return false

      const sourceType = sourceNode.type
      const targetType = targetNode.type

      // Rule: Start node's "triggers" handle is input only — cannot be a source
      if (sourceType === 'start' && sourceHandle === 'triggers') return false

      // Rule: Start node's "sequence" handle is output only — cannot be a target
      if (targetType === 'start' && targetHandle === 'sequence') return false

      // Rule: trigger → start (triggers handle) is the ONLY valid trigger connection
      if (sourceType === 'trigger') {
        return targetType === 'start' && targetHandle === 'triggers'
      }

      // Rule: start (sequence handle) → action or condition
      if (sourceType === 'start') {
        return sourceHandle === 'sequence' && (targetType === 'action' || targetType === 'condition')
      }

      // Rule: action/condition → action/condition (standard chaining)
      if (sourceType === 'action' || sourceType === 'condition') {
        return targetType === 'action' || targetType === 'condition'
      }

      return false
    },
    [state.schema.nodes]
  )

  /**
   * Handle node click - select node and open drawer.
   * Start node clicks are suppressed in the SELECT_NODE reducer.
   */
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      dispatch({ type: 'SELECT_NODE', payload: { nodeId: node.id } })
    },
    [dispatch]
  )

  /**
   * Handle drop event for new nodes from sidebar.
   * History is auto-managed by ADD_NODE in the reducer.
   */
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const nodeType = event.dataTransfer.getData('application/automation-node-type') as AutomationNodeType
      if (!nodeType) return

      // Get the drop position in canvas coordinates
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      // Create the new node and add to state (reducer auto-snapshots history)
      const newNode = createAutomationNode(nodeType, position)
      dispatch({ type: 'ADD_NODE', payload: { node: newNode } })

      // Select the new node
      dispatch({ type: 'SELECT_NODE', payload: { nodeId: newNode.id } })
    },
    [reactFlowInstance, dispatch]
  )

  /**
   * Handle drag over event to allow drop
   */
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  /**
   * Handle edge selection
   */
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdges([edge.id])
    },
    []
  )

  /**
   * Canvas-scoped keyboard shortcuts (Delete/Backspace).
   * Only fires when the canvas div is focused — prevents deleting nodes
   * while typing in input fields.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Delete selected node or edge (only from canvas, not from inputs)
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Skip deletion if the Start node is selected — it's permanent
        if (state.selection.selectedNodeId && state.selection.selectedNodeId !== START_NODE_ID) {
          dispatch({
            type: 'DELETE_NODE',
            payload: { nodeId: state.selection.selectedNodeId },
          })
        }
        if (selectedEdges.length > 0) {
          const remainingEdges = edges.filter((e) => !selectedEdges.includes(e.id))
          dispatch({
            type: 'SET_EDGES',
            payload: { edges: remainingEdges as AutomationEdge[] },
          })
          setSelectedEdges([])
        }
      }
    },
    [state.selection.selectedNodeId, selectedEdges, edges, dispatch]
  )

  /**
   * Global keyboard shortcuts (Undo/Redo/Save).
   * Attached to `window` so they work regardless of which element has focus
   * (canvas, properties drawer, sidebar, etc.).
   */
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Don't intercept shortcuts when typing in an input/textarea
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Undo — Ctrl+Z / Cmd+Z
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        dispatch({ type: 'UNDO' })
      }

      // Redo — Ctrl+Y / Cmd+Shift+Z
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault()
        dispatch({ type: 'REDO' })
      }

      // Save — Ctrl+S / Cmd+S (prevent browser default)
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [dispatch])

  return (
    <div
      className="h-full w-full bg-accent dark:bg-muted/50"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges.map((e) => ({
          ...e,
          type: 'addNode',
          selected: selectedEdges.includes(e.id),
        }))}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => {
          dispatch({ type: 'SELECT_NODE', payload: { nodeId: null } })
          setSelectedEdges([])
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        connectionMode={ConnectionMode.Strict}
        fitView
        fitViewOptions={{
          padding: 0.3,
          maxZoom: 1, // Prevent zooming in too much on fitView
          minZoom: 0.5, // Prevent zooming out too much on fitView
        }}
        minZoom={0.25}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        defaultEdgeOptions={{
          type: 'addNode',
        }}
        /* Canvas interaction: trackpad scroll = pan, pinch = zoom, click+drag = move nodes only */
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        panOnDrag={false}
        panActivationKeyCode="Meta" /* Hold Cmd and drag to pan with hand cursor */
        deleteKeyCode={null} /* Disabled — we handle delete in onKeyDown to avoid double history entries */
        selectionMode={SelectionMode.Partial}
        selectNodesOnDrag={false}
        proOptions={{ hideAttribution: true }}
        connectionRadius={40}
      />
    </div>
  )
}
