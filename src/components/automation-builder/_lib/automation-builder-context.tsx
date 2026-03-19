/**
 * ============================================================================
 * AUTOMATION BUILDER CONTEXT
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: AutomationBuilderContext, AutomationBuilderProvider
 *
 * Central state management for the automation builder.
 * Uses React Context + useReducer for predictable state updates.
 *
 * ARCHITECTURE:
 * - AutomationBuilderProvider: Wraps the entire automation builder
 * - useAutomationBuilder: Hook to access state and actions
 * - Reducer pattern for complex state updates
 * - Built-in undo/redo support via history
 *
 * STATE STRUCTURE:
 * - schema: The automation schema being edited (nodes and edges)
 * - selection: Currently selected node
 * - drag: Drag state for node palette
 * - history: Undo/redo history stack
 * - UI state: Active tab, drawer open, etc.
 */

'use client'

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Node,
  type Edge,
} from '@xyflow/react'
import type {
  AutomationBuilderState,
  AutomationSchema,
  AutomationNode,
  AutomationEdge,
  AutomationNodeData,
  AutomationNodeType,
  AutomationStatus,
  HistoryEntry,
  Automation,
} from './types'
import { DEFAULT_AUTOMATION_SCHEMA, DEFAULT_AUTOMATION_STATS, START_NODE_ID } from './types'
import type { StartNodeData } from './types'

// ============================================================================
// ACTION TYPES
// ============================================================================

type AutomationBuilderAction =
  // Node actions
  | { type: 'ADD_NODE'; payload: { node: AutomationNode } }
  | { type: 'UPDATE_NODE'; payload: { nodeId: string; data: Partial<AutomationNodeData> } }
  | { type: 'DELETE_NODE'; payload: { nodeId: string } }
  | { type: 'MOVE_NODE'; payload: { nodeId: string; position: { x: number; y: number } } }
  | { type: 'SET_NODES'; payload: { nodes: AutomationNode[] } }
  // React Flow change actions — applied inside reducer to always use latest state
  | { type: 'APPLY_NODE_CHANGES'; payload: { changes: NodeChange[] } }
  | { type: 'APPLY_EDGE_CHANGES'; payload: { changes: EdgeChange[] } }
  // Edge actions
  | { type: 'ADD_EDGE'; payload: { edge: AutomationEdge } }
  | { type: 'DELETE_EDGE'; payload: { edgeId: string } }
  | { type: 'SET_EDGES'; payload: { edges: AutomationEdge[] } }
  // Selection actions
  | { type: 'SELECT_NODE'; payload: { nodeId: string | null } }
  | { type: 'CLEAR_SELECTION' }
  // Drag actions
  | { type: 'SET_DRAGGING'; payload: { isDragging: boolean; draggedNodeType: AutomationNodeType | null } }
  // Schema actions
  | { type: 'SET_SCHEMA'; payload: AutomationSchema }
  // Metadata actions
  | { type: 'SET_NAME'; payload: { name: string } }
  | { type: 'SET_DESCRIPTION'; payload: { description: string } }
  | { type: 'SET_STATUS'; payload: { status: AutomationStatus } }
  // History actions
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_HISTORY'; payload: { description: string } }
  // UI actions
  | { type: 'SET_ACTIVE_TAB'; payload: { tab: 'build' | 'activity' } }
  | { type: 'SET_DRAWER_OPEN'; payload: { open: boolean } }
  | { type: 'SET_AUTO_SAVE'; payload: { enabled: boolean } }
  | { type: 'MARK_SAVED' }
  // Load automation
  | { type: 'LOAD_AUTOMATION'; payload: Automation }

// ============================================================================
// INITIAL STATE
// ============================================================================

const createInitialState = (automation?: Automation): AutomationBuilderState => {
  // Start with automation schema or default (which already has Start node)
  let schema = automation?.schema
    ? (JSON.parse(JSON.stringify(automation.schema)) as AutomationSchema)
    : DEFAULT_AUTOMATION_SCHEMA

  // Migrate v1 schemas: inject Start node if not present
  if (!schema.nodes.some((n) => n.id === START_NODE_ID)) {
    schema = migrateV1ToV2(schema)
  }

  // Create initial history entry so undo has a base state to return to
  const initialHistoryEntry: HistoryEntry = {
    schema: JSON.parse(JSON.stringify(schema)), // Deep clone
    timestamp: Date.now(),
    description: 'Initial state',
  }

  return {
    id: automation?.id || `auto_${Date.now()}`,
    name: automation?.name || 'Untitled Automation',
    description: automation?.description || '',
    status: automation?.status || 'draft',
    schema,
    selection: {
      selectedNodeId: null,
    },
    drag: {
      isDragging: false,
      draggedNodeType: null,
    },
    history: [initialHistoryEntry], // Start with initial state in history
    historyIndex: 0, // Point to initial entry
    isDirty: false,
    activeTab: 'build',
    isDrawerOpen: false,
    autoSaveEnabled: true, // Auto-save ON by default (matches form builder UX)
  }
}

// ============================================================================
// REDUCER
// ============================================================================

// ============================================================================
// HISTORY HELPERS
// ============================================================================

/**
 * Snapshot the POST-mutation schema into the history stack.
 * History stores the result of each action so undo restores the previous result
 * and redo restores the next result.
 *
 * @param state          Current builder state (used for existing history)
 * @param newSchema      The schema AFTER the mutation has been applied
 * @param description    Human-readable label for the history entry
 * @param mergeIfRecent  If true, merges with the last entry when same description
 *                       within 1s (prevents flooding on rapid edits like typing)
 */
function pushHistory(
  state: AutomationBuilderState,
  newSchema: AutomationSchema,
  description: string,
  mergeIfRecent = false
): Pick<AutomationBuilderState, 'history' | 'historyIndex'> {
  const MAX_HISTORY = 50
  const MERGE_WINDOW_MS = 1000
  const newEntry: HistoryEntry = {
    schema: JSON.parse(JSON.stringify(newSchema)),
    timestamp: Date.now(),
    description,
  }

  // For rapid edits (e.g. typing in label field), merge with last entry
  // if same action type and within the merge window
  if (mergeIfRecent && state.history.length > 1) {
    const lastEntry = state.history[state.historyIndex]
    if (
      lastEntry &&
      lastEntry.description === description &&
      newEntry.timestamp - lastEntry.timestamp < MERGE_WINDOW_MS
    ) {
      const mergedHistory = [...state.history]
      mergedHistory[state.historyIndex] = newEntry
      return { history: mergedHistory, historyIndex: state.historyIndex }
    }
  }

  // Truncate redo entries — new action branches off
  const newHistory = state.history.slice(0, state.historyIndex + 1)
  newHistory.push(newEntry)

  // Evict oldest if over limit
  if (newHistory.length > MAX_HISTORY) {
    newHistory.shift()
    return { history: newHistory, historyIndex: newHistory.length - 1 }
  }

  return { history: newHistory, historyIndex: newHistory.length - 1 }
}

// ============================================================================
// V1 → V2 SCHEMA MIGRATION
// ============================================================================

/**
 * Migrate a v1 schema (no Start node) to v2 (with Start node).
 *
 * WHY: v2 introduces a permanent Start node that connects triggers (left) to the
 * action/condition sequence (right). Existing v1 automations with direct
 * trigger→action edges need to be rewired through the Start node.
 *
 * MIGRATION STEPS:
 * 1. Find all trigger nodes in the schema
 * 2. Calculate Start node position (midpoint between triggers and first action)
 * 3. Inject the Start node
 * 4. For each trigger, add edge: trigger → Start (triggers handle)
 * 5. Find the first action connected to any trigger, add edge: Start (sequence) → first action
 * 6. Remove old trigger→action edges (replaced by the two-hop path)
 */
function migrateV1ToV2(schema: AutomationSchema): AutomationSchema {
  const triggerNodes = schema.nodes.filter((n) => n.type === 'trigger')
  const firstTrigger = triggerNodes[0]

  // Calculate Start position (offset from first trigger, or use default)
  const startX = firstTrigger ? firstTrigger.position.x + 250 : 400
  const startY = firstTrigger ? firstTrigger.position.y : 200

  const startNode: AutomationNode = {
    id: START_NODE_ID,
    type: 'start',
    position: { x: startX, y: startY },
    data: { label: 'Start', isConfigured: true, nodeCategory: 'start' } as StartNodeData,
  }

  const newEdges = [...schema.edges]

  // Track which trigger→action edges to remove (replaced by trigger→Start→action)
  const edgeIdsToRemove = new Set<string>()
  let sequenceEdgeAdded = false

  for (const trigger of triggerNodes) {
    // Find the outgoing edge from this trigger to the next node
    const triggerEdge = schema.edges.find((e) => e.source === trigger.id)

    // Add edge: trigger → Start (triggers handle)
    newEdges.push({
      id: `edge_migrate_${trigger.id}_to_start`,
      source: trigger.id,
      target: START_NODE_ID,
      targetHandle: 'triggers',
    })

    if (triggerEdge) {
      // Mark old trigger→action edge for removal
      edgeIdsToRemove.add(triggerEdge.id)

      // Add edge: Start (sequence) → first action (only once — all triggers share the same sequence)
      if (!sequenceEdgeAdded) {
        newEdges.push({
          id: `edge_migrate_start_to_${triggerEdge.target}`,
          source: START_NODE_ID,
          sourceHandle: 'sequence',
          target: triggerEdge.target,
        })
        sequenceEdgeAdded = true
      }
    }
  }

  // Remove old trigger→action edges that were replaced
  const filteredEdges = newEdges.filter((e) => !edgeIdsToRemove.has(e.id))

  return {
    version: 2,
    nodes: [...schema.nodes, startNode],
    edges: filteredEdges,
  }
}

// ============================================================================
// REDUCER
// ============================================================================

/**
 * Main reducer for automation builder state.
 * Every schema-mutating action computes the new schema first, then snapshots
 * the POST-mutation result into history. This way undo restores the previous
 * result and redo restores the next result.
 */
function automationBuilderReducer(
  state: AutomationBuilderState,
  action: AutomationBuilderAction
): AutomationBuilderState {
  switch (action.type) {
    // ========================================
    // NODE ACTIONS
    // ========================================

    case 'ADD_NODE': {
      const { node } = action.payload
      const newSchema = {
        ...state.schema,
        nodes: [...state.schema.nodes, node],
      }
      const hist = pushHistory(state, newSchema, `Add ${node.data.label || 'node'}`)
      return {
        ...state,
        ...hist,
        schema: newSchema,
        selection: { selectedNodeId: node.id },
        isDrawerOpen: true,
        isDirty: true,
      }
    }

    case 'UPDATE_NODE': {
      const { nodeId, data } = action.payload
      const newSchema = {
        ...state.schema,
        nodes: state.schema.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...data } as AutomationNodeData }
            : node
        ),
      }
      // mergeIfRecent=true so rapid edits (typing in label) consolidate into one undo step
      const hist = pushHistory(state, newSchema, `Update node ${nodeId}`, true)
      return {
        ...state,
        ...hist,
        schema: newSchema,
        isDirty: true,
      }
    }

    case 'DELETE_NODE': {
      const { nodeId } = action.payload
      // Start node cannot be deleted — it's a permanent connector
      if (nodeId === START_NODE_ID) return state
      const deletedNode = state.schema.nodes.find((n) => n.id === nodeId)
      const newSchema = {
        ...state.schema,
        nodes: state.schema.nodes.filter((node) => node.id !== nodeId),
        edges: state.schema.edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId
        ),
      }
      const hist = pushHistory(state, newSchema, `Delete ${deletedNode?.data.label || 'node'}`)
      return {
        ...state,
        ...hist,
        schema: newSchema,
        selection: state.selection.selectedNodeId === nodeId
          ? { selectedNodeId: null }
          : state.selection,
        isDrawerOpen: state.selection.selectedNodeId === nodeId ? false : state.isDrawerOpen,
        isDirty: true,
      }
    }

    case 'MOVE_NODE': {
      const { nodeId, position } = action.payload
      return {
        ...state,
        schema: {
          ...state.schema,
          nodes: state.schema.nodes.map((node) =>
            node.id === nodeId ? { ...node, position } : node
          ),
        },
        // Don't set isDirty or push history on move — only on drop
      }
    }

    case 'SET_NODES': {
      const { nodes } = action.payload
      const newSchema = { ...state.schema, nodes }
      const hist = pushHistory(state, newSchema, 'Set nodes')
      return {
        ...state,
        ...hist,
        schema: newSchema,
        isDirty: true,
      }
    }

    /**
     * Apply React Flow node changes (position, selection, removal) inside the reducer.
     * Position changes happen on every drag frame — we do NOT snapshot these
     * to avoid flooding history. Only structural changes get a snapshot.
     *
     * BUG FIX: Only truly structural changes (remove, add, replace) mark dirty.
     * React Flow fires `dimensions` changes on initial render when it measures
     * DOM nodes, and `position`/`select` changes during layout. None of these
     * are user edits, so they must NOT set isDirty or auto-save will fire on
     * load with stale cached data, overwriting the user's real data in the DB.
     */
    case 'APPLY_NODE_CHANGES': {
      const { changes } = action.payload
      // Filter out removal of Start node — it cannot be deleted
      const safeChanges = changes.filter(
        (c) => !(c.type === 'remove' && c.id === START_NODE_ID)
      )
      const hasStructuralChange = safeChanges.some((c) => c.type === 'remove')
      /**
       * Only structural changes should mark dirty: remove, add, replace.
       * Exclude position (drag frames), select (click), and dimensions
       * (React Flow measuring DOM elements after render — NOT a user edit).
       */
      const hasDirtyChange = safeChanges.some(
        (c) => c.type !== 'position' && c.type !== 'select' && c.type !== 'dimensions'
      )
      const updatedNodes = applyNodeChanges(safeChanges, state.schema.nodes as Node[])
      const newSchema = { ...state.schema, nodes: updatedNodes as AutomationNode[] }
      const histUpdate = hasStructuralChange
        ? pushHistory(state, newSchema, 'Remove node')
        : {}
      return {
        ...state,
        ...histUpdate,
        schema: newSchema,
        isDirty: state.isDirty || hasDirtyChange,
      }
    }

    /**
     * Apply React Flow edge changes (selection, removal) inside the reducer.
     * Only removal changes get a history snapshot.
     *
     * BUG FIX: Only set isDirty for structural changes (remove).
     * Selection-only changes should not trigger auto-save.
     */
    case 'APPLY_EDGE_CHANGES': {
      const { changes } = action.payload
      const hasStructuralChange = changes.some((c) => c.type === 'remove')
      /**
       * Only mark dirty if edges are actually being removed,
       * not just selected/deselected.
       */
      const hasDirtyChange = changes.some((c) => c.type !== 'select')
      const updatedEdges = applyEdgeChanges(changes, state.schema.edges as Edge[])
      const newSchema = { ...state.schema, edges: updatedEdges as AutomationEdge[] }
      const histUpdate = hasStructuralChange
        ? pushHistory(state, newSchema, 'Remove edge')
        : {}
      return {
        ...state,
        ...histUpdate,
        schema: newSchema,
        // Only mark dirty for structural changes, not selection
        isDirty: state.isDirty || hasDirtyChange,
      }
    }

    // ========================================
    // EDGE ACTIONS
    // ========================================

    case 'ADD_EDGE': {
      const { edge } = action.payload
      const exists = state.schema.edges.some(
        (e) =>
          e.source === edge.source &&
          e.target === edge.target &&
          e.sourceHandle === edge.sourceHandle
      )
      if (exists) return state

      const newSchema = { ...state.schema, edges: [...state.schema.edges, edge] }
      const hist = pushHistory(state, newSchema, 'Add edge')
      return {
        ...state,
        ...hist,
        schema: newSchema,
        isDirty: true,
      }
    }

    case 'DELETE_EDGE': {
      const { edgeId } = action.payload
      const newSchema = {
        ...state.schema,
        edges: state.schema.edges.filter((edge) => edge.id !== edgeId),
      }
      const hist = pushHistory(state, newSchema, 'Delete edge')
      return {
        ...state,
        ...hist,
        schema: newSchema,
        isDirty: true,
      }
    }

    case 'SET_EDGES': {
      const { edges } = action.payload
      const newSchema = { ...state.schema, edges }
      const hist = pushHistory(state, newSchema, 'Set edges')
      return {
        ...state,
        ...hist,
        schema: newSchema,
        isDirty: true,
      }
    }

    // ========================================
    // SELECTION ACTIONS
    // ========================================

    case 'SELECT_NODE': {
      const { nodeId } = action.payload
      // Start node has no properties drawer — suppress selection and drawer open
      const isStartNode = nodeId === START_NODE_ID
      return {
        ...state,
        selection: { selectedNodeId: isStartNode ? null : nodeId },
        isDrawerOpen: nodeId !== null && !isStartNode,
      }
    }

    case 'CLEAR_SELECTION': {
      return {
        ...state,
        selection: { selectedNodeId: null },
        isDrawerOpen: false,
      }
    }

    // ========================================
    // DRAG ACTIONS
    // ========================================

    case 'SET_DRAGGING': {
      const { isDragging, draggedNodeType } = action.payload
      return {
        ...state,
        drag: {
          isDragging,
          draggedNodeType,
        },
      }
    }

    // ========================================
    // SCHEMA ACTIONS
    // ========================================

    case 'SET_SCHEMA': {
      return {
        ...state,
        schema: action.payload,
        isDirty: true,
      }
    }

    // ========================================
    // METADATA ACTIONS
    // ========================================

    case 'SET_NAME': {
      const { name } = action.payload
      return {
        ...state,
        name,
        isDirty: true,
      }
    }

    case 'SET_DESCRIPTION': {
      const { description } = action.payload
      return {
        ...state,
        description,
        isDirty: true,
      }
    }

    case 'SET_STATUS': {
      const { status } = action.payload
      return {
        ...state,
        status,
        isDirty: true,
      }
    }

    // ========================================
    // HISTORY ACTIONS
    // ========================================

    case 'SAVE_HISTORY': {
      const { description } = action.payload
      const newEntry: HistoryEntry = {
        schema: JSON.parse(JSON.stringify(state.schema)), // Deep clone
        timestamp: Date.now(),
        description,
      }

      // Truncate any redo history
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(newEntry)

      // Limit history to 50 entries
      const MAX_HISTORY = 50
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift()
      }

      return {
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      }
    }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state

      const prevIndex = state.historyIndex - 1
      const prevEntry = state.history[prevIndex]
      if (!prevEntry) return state

      return {
        ...state,
        schema: JSON.parse(JSON.stringify(prevEntry.schema)),
        historyIndex: prevIndex,
        isDirty: true,
      }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state

      const nextIndex = state.historyIndex + 1
      const nextEntry = state.history[nextIndex]
      if (!nextEntry) return state

      return {
        ...state,
        schema: JSON.parse(JSON.stringify(nextEntry.schema)),
        historyIndex: nextIndex,
        isDirty: true,
      }
    }

    // ========================================
    // UI ACTIONS
    // ========================================

    case 'SET_ACTIVE_TAB': {
      const { tab } = action.payload
      return {
        ...state,
        activeTab: tab,
      }
    }

    case 'SET_DRAWER_OPEN': {
      const { open } = action.payload
      return {
        ...state,
        isDrawerOpen: open,
        // Clear selection when closing drawer
        selection: open ? state.selection : { selectedNodeId: null },
      }
    }

    case 'SET_AUTO_SAVE': {
      const { enabled } = action.payload
      return {
        ...state,
        autoSaveEnabled: enabled,
      }
    }

    case 'MARK_SAVED': {
      return {
        ...state,
        isDirty: false,
      }
    }

    // ========================================
    // LOAD AUTOMATION
    // ========================================

    case 'LOAD_AUTOMATION': {
      const automation = action.payload

      // Migrate v1 schemas: inject Start node if not present
      let schema = JSON.parse(JSON.stringify(automation.schema)) as AutomationSchema
      if (!schema.nodes.some((n) => n.id === START_NODE_ID)) {
        schema = migrateV1ToV2(schema)
      }

      // Create initial history entry for the loaded (and possibly migrated) automation
      const initialHistoryEntry: HistoryEntry = {
        schema: JSON.parse(JSON.stringify(schema)), // Deep clone
        timestamp: Date.now(),
        description: 'Initial state',
      }

      return {
        ...state,
        id: automation.id,
        name: automation.name,
        description: automation.description || '',
        status: automation.status,
        schema,
        isDirty: false,
        selection: { selectedNodeId: null },
        isDrawerOpen: false,
        history: [initialHistoryEntry], // Reset history with initial state
        historyIndex: 0,
      }
    }

    default:
      return state
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

interface AutomationBuilderContextValue {
  state: AutomationBuilderState
  dispatch: React.Dispatch<AutomationBuilderAction>
  /** Organization ID for data fetching in config components */
  organizationId: string
  /** The currently selected node (derived from state) */
  selectedNode: AutomationNode | null
  /** Whether undo is available */
  canUndo: boolean
  /** Whether redo is available */
  canRedo: boolean
  /** Helper actions (wrapped dispatch calls for convenience) */
  actions: {
    // Node actions
    addNode: (node: AutomationNode) => void
    updateNode: (nodeId: string, data: Partial<AutomationNodeData>) => void
    deleteNode: (nodeId: string) => void
    moveNode: (nodeId: string, position: { x: number; y: number }) => void
    setNodes: (nodes: AutomationNode[]) => void
    // Edge actions
    addEdge: (edge: AutomationEdge) => void
    deleteEdge: (edgeId: string) => void
    setEdges: (edges: AutomationEdge[]) => void
    // Selection actions
    selectNode: (nodeId: string | null) => void
    clearSelection: () => void
    // Drag actions
    setDragging: (isDragging: boolean, draggedNodeType: AutomationNodeType | null) => void
    // Schema actions
    setSchema: (schema: AutomationSchema) => void
    // Metadata actions
    setName: (name: string) => void
    setDescription: (description: string) => void
    setStatus: (status: AutomationStatus) => void
    // History actions
    saveHistory: (description: string) => void
    undo: () => void
    redo: () => void
    // UI actions
    setActiveTab: (tab: 'build' | 'activity') => void
    setDrawerOpen: (open: boolean) => void
    setAutoSave: (enabled: boolean) => void
    markSaved: () => void
    // Load
    loadAutomation: (automation: Automation) => void
  }
}

const AutomationBuilderContext = createContext<AutomationBuilderContextValue | null>(null)

// ============================================================================
// PROVIDER
// ============================================================================

interface AutomationBuilderProviderProps {
  children: ReactNode
  automationId?: string
  organizationId?: string
  initialAutomation?: Automation
}

/**
 * Provider component for the automation builder context.
 * Wraps the entire automation builder and provides state + actions.
 */
export function AutomationBuilderProvider({
  children,
  organizationId = '',
  initialAutomation,
}: AutomationBuilderProviderProps) {
  const [state, dispatch] = useReducer(
    automationBuilderReducer,
    initialAutomation,
    (auto) => createInitialState(auto)
  )

  // Derived: selected node
  const selectedNode = useMemo(() => {
    if (!state.selection.selectedNodeId) return null
    return state.schema.nodes.find((n) => n.id === state.selection.selectedNodeId) || null
  }, [state.selection.selectedNodeId, state.schema.nodes])

  // Derived: can undo/redo
  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1

  // Actions object (kept for backwards compatibility but dispatch is preferred)
  const actions = useMemo(
    () => ({
      // Node actions
      addNode: (node: AutomationNode) => dispatch({ type: 'ADD_NODE', payload: { node } }),
      updateNode: (nodeId: string, data: Partial<AutomationNodeData>) =>
        dispatch({ type: 'UPDATE_NODE', payload: { nodeId, data } }),
      deleteNode: (nodeId: string) => dispatch({ type: 'DELETE_NODE', payload: { nodeId } }),
      moveNode: (nodeId: string, position: { x: number; y: number }) =>
        dispatch({ type: 'MOVE_NODE', payload: { nodeId, position } }),
      setNodes: (nodes: AutomationNode[]) => dispatch({ type: 'SET_NODES', payload: { nodes } }),
      // Edge actions
      addEdge: (edge: AutomationEdge) => dispatch({ type: 'ADD_EDGE', payload: { edge } }),
      deleteEdge: (edgeId: string) => dispatch({ type: 'DELETE_EDGE', payload: { edgeId } }),
      setEdges: (edges: AutomationEdge[]) => dispatch({ type: 'SET_EDGES', payload: { edges } }),
      // Selection actions
      selectNode: (nodeId: string | null) => dispatch({ type: 'SELECT_NODE', payload: { nodeId } }),
      clearSelection: () => dispatch({ type: 'CLEAR_SELECTION' }),
      // Drag actions
      setDragging: (isDragging: boolean, draggedNodeType: AutomationNodeType | null) =>
        dispatch({ type: 'SET_DRAGGING', payload: { isDragging, draggedNodeType } }),
      // Schema actions
      setSchema: (schema: AutomationSchema) => dispatch({ type: 'SET_SCHEMA', payload: schema }),
      // Metadata actions
      setName: (name: string) => dispatch({ type: 'SET_NAME', payload: { name } }),
      setDescription: (description: string) =>
        dispatch({ type: 'SET_DESCRIPTION', payload: { description } }),
      setStatus: (status: AutomationStatus) => dispatch({ type: 'SET_STATUS', payload: { status } }),
      // History actions
      saveHistory: (description: string) =>
        dispatch({ type: 'SAVE_HISTORY', payload: { description } }),
      undo: () => dispatch({ type: 'UNDO' }),
      redo: () => dispatch({ type: 'REDO' }),
      // UI actions
      setActiveTab: (tab: 'build' | 'activity') =>
        dispatch({ type: 'SET_ACTIVE_TAB', payload: { tab } }),
      setDrawerOpen: (open: boolean) => dispatch({ type: 'SET_DRAWER_OPEN', payload: { open } }),
      setAutoSave: (enabled: boolean) => dispatch({ type: 'SET_AUTO_SAVE', payload: { enabled } }),
      markSaved: () => dispatch({ type: 'MARK_SAVED' }),
      // Load
      loadAutomation: (automation: Automation) =>
        dispatch({ type: 'LOAD_AUTOMATION', payload: automation }),
    }),
    []
  )

  const value = useMemo(
    () => ({
      state,
      dispatch,
      organizationId,
      selectedNode,
      canUndo,
      canRedo,
      actions,
    }),
    [state, organizationId, selectedNode, canUndo, canRedo, actions]
  )

  return (
    <AutomationBuilderContext.Provider value={value}>
      {children}
    </AutomationBuilderContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to access the automation builder context.
 * Must be used within an AutomationBuilderProvider.
 */
export function useAutomationBuilder() {
  const context = useContext(AutomationBuilderContext)
  if (!context) {
    throw new Error('useAutomationBuilder must be used within an AutomationBuilderProvider')
  }
  return context
}
