'use client'

/**
 * ============================================================================
 * EMAIL BUILDER CONTEXT
 * ============================================================================
 *
 * Central state management for the email template builder.
 * Uses React Context + useReducer for predictable state updates.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailBuilderContext, EmailBuilderState
 *
 * ARCHITECTURE:
 * - EmailBuilderProvider: Wraps the entire builder
 * - useEmailBuilder: Hook to access state and actions
 * - Reducer pattern for complex state updates
 * - Built-in undo/redo support via history
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from 'react'
import { v4 as uuid } from 'uuid'
import { arrayMove } from '@dnd-kit/sortable'
import type {
  EmailBlock,
  EmailBlockType,
  HeadingLevel,
  TextAlign,
  ColumnsBlock,
  EmailSettings,
} from '@/types/email-templates'
import { DEFAULT_EMAIL_SETTINGS } from '@/types/email-templates'
import type { LeadOption } from '@/components/leads/lead-search-command'
import type { VariableContext } from '@/lib/variables/types'

// ============================================================================
// HISTORY CONFIGURATION
// ============================================================================

/**
 * History system configuration for production-grade undo/redo.
 * SOURCE OF TRUTH KEYWORDS: HistoryConfig, UndoRedoConfig
 */
const HISTORY_CONFIG = {
  /** Maximum number of history entries to keep */
  maxEntries: 50,
  /** Debounce delay for text input changes (ms) */
  debounceDelay: 500,
  /** Minimum time between history saves for same description (ms) */
  mergeWindow: 1000,
} as const

// ============================================================================
// TYPES
// ============================================================================

// EmailSettings is imported from @/types/email-templates (SOURCE OF TRUTH)
// Re-export for backwards compatibility with imports from this file
export type { EmailSettings } from '@/types/email-templates'

/**
 * Single history entry with timestamp for smart merging.
 * SOURCE OF TRUTH KEYWORDS: HistoryEntry, UndoEntry
 */
interface HistoryEntry {
  /** Snapshot of blocks at this point */
  blocks: EmailBlock[]
  /** Snapshot of email settings at this point */
  emailSettings: EmailSettings
  /** Description of the change */
  description: string
  /** Timestamp for smart merging of rapid changes */
  timestamp: number
}

/**
 * Builder state structure
 */
export interface EmailBuilderState {
  /** Email template name */
  name: string
  /** Email subject line */
  subject: string
  /** Array of email blocks */
  blocks: EmailBlock[]
  /** Currently selected block ID, or 'canvas' for email settings */
  selectedBlockId: string | null
  /** Email container/canvas settings */
  emailSettings: EmailSettings
  /** Drag state */
  drag: {
    isDragging: boolean
    draggedType: EmailBlockType | null
    draggedBlockId: string | null
  }
  /**
   * Undo/redo history stack.
   * History works like this:
   * - historyIndex points to the CURRENT state in history
   * - Undo moves back, redo moves forward
   * - New changes after undo clear the forward history
   */
  history: HistoryEntry[]
  historyIndex: number
  /** UI state */
  isDirty: boolean
  isPreviewMode: boolean
  /**
   * Selected lead for testing/preview (basic info for UI display).
   * When set, preview mode uses this lead's data instead of sample data.
   */
  testLead: LeadOption | null
  /**
   * Full variable context for the test lead (REAL data from database).
   * Contains lead info, custom data, transactions, submissions, org data, etc.
   * This is fetched from the server when a test lead is selected.
   *
   * SOURCE OF TRUTH KEYWORDS: TestVariableContext, RealLeadContext
   */
  testVariableContext: VariableContext | null
}

/**
 * Initial state factory.
 * Saves the initial state as the first history entry so undo works from the start.
 */
const createInitialState = (
  initialName = '',
  initialSubject = '',
  initialBlocks: EmailBlock[] = [],
  initialEmailSettings?: Partial<EmailSettings>
): EmailBuilderState => {
  const emailSettings = { ...DEFAULT_EMAIL_SETTINGS, ...initialEmailSettings }
  const blocks = initialBlocks

  // Create initial history entry so we have something to undo to
  const initialHistoryEntry: HistoryEntry = {
    blocks: JSON.parse(JSON.stringify(blocks)),
    emailSettings: { ...emailSettings },
    description: 'Initial state',
    timestamp: Date.now(),
  }

  return {
    name: initialName,
    subject: initialSubject,
    blocks,
    selectedBlockId: null,
    emailSettings,
    drag: {
      isDragging: false,
      draggedType: null,
      draggedBlockId: null,
    },
    // Start with initial state in history, index at 0
    history: [initialHistoryEntry],
    historyIndex: 0,
    isDirty: false,
    isPreviewMode: false,
    testLead: null,
    testVariableContext: null,
  }
}

// ============================================================================
// ACTION TYPES
// ============================================================================

type EmailBuilderAction =
  // Metadata actions
  | { type: 'SET_NAME'; payload: string }
  | { type: 'SET_SUBJECT'; payload: string }
  // Block actions
  | { type: 'ADD_BLOCK'; payload: { block: EmailBlock; index?: number } }
  | { type: 'UPDATE_BLOCK'; payload: { id: string; updates: Partial<EmailBlock> } }
  | { type: 'DELETE_BLOCK'; payload: string }
  | { type: 'DUPLICATE_BLOCK'; payload: string }
  | { type: 'REORDER_BLOCKS'; payload: { fromIndex: number; toIndex: number } }
  // Selection actions
  | { type: 'SELECT_BLOCK'; payload: string | null }
  // Email settings actions
  | { type: 'UPDATE_EMAIL_SETTINGS'; payload: Partial<EmailSettings> }
  // Drag actions
  | { type: 'START_DRAG'; payload: { type: EmailBlockType | null; blockId: string | null } }
  | { type: 'END_DRAG' }
  // History actions
  | { type: 'SAVE_HISTORY'; payload: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  // UI actions
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'TOGGLE_PREVIEW' }
  | { type: 'SET_TEST_LEAD'; payload: LeadOption | null }
  | { type: 'SET_TEST_VARIABLE_CONTEXT'; payload: VariableContext | null }
  // Reset action
  | { type: 'RESET'; payload: { name: string; subject: string; blocks: EmailBlock[] } }

// ============================================================================
// REDUCER
// ============================================================================

function emailBuilderReducer(
  state: EmailBuilderState,
  action: EmailBuilderAction
): EmailBuilderState {
  switch (action.type) {
    // Metadata
    case 'SET_NAME':
      return { ...state, name: action.payload, isDirty: true }

    case 'SET_SUBJECT':
      return { ...state, subject: action.payload, isDirty: true }

    // Block actions
    case 'ADD_BLOCK': {
      const { block, index } = action.payload
      const newBlocks = [...state.blocks]

      if (index !== undefined && index >= 0) {
        newBlocks.splice(index, 0, block)
      } else {
        newBlocks.push(block)
      }

      return {
        ...state,
        blocks: newBlocks,
        selectedBlockId: block.id,
        isDirty: true,
      }
    }

    case 'UPDATE_BLOCK': {
      const { id, updates } = action.payload

      /**
       * Recursively update a block anywhere in the tree (including nested in columns).
       * This enables property updates for blocks inside columns.
       */
      const updateBlockRecursively = (blocks: EmailBlock[]): EmailBlock[] => {
        return blocks.map((block) => {
          // Direct match - update this block
          if (block.id === id) {
            return { ...block, ...updates } as EmailBlock
          }

          // Check inside columns blocks for nested blocks
          if (block.type === 'columns') {
            const leftUpdated = updateBlockRecursively(block.props.leftColumn.blocks)
            const rightUpdated = updateBlockRecursively(block.props.rightColumn.blocks)

            // Only create new object if something changed
            if (
              leftUpdated !== block.props.leftColumn.blocks ||
              rightUpdated !== block.props.rightColumn.blocks
            ) {
              return {
                ...block,
                props: {
                  ...block.props,
                  leftColumn: { ...block.props.leftColumn, blocks: leftUpdated },
                  rightColumn: { ...block.props.rightColumn, blocks: rightUpdated },
                },
              } as EmailBlock
            }
          }

          return block
        })
      }

      return {
        ...state,
        blocks: updateBlockRecursively(state.blocks),
        isDirty: true,
      }
    }

    case 'DELETE_BLOCK': {
      const newBlocks = state.blocks.filter((b) => b.id !== action.payload)
      return {
        ...state,
        blocks: newBlocks,
        selectedBlockId:
          state.selectedBlockId === action.payload ? null : state.selectedBlockId,
        isDirty: true,
      }
    }

    case 'DUPLICATE_BLOCK': {
      const index = state.blocks.findIndex((b) => b.id === action.payload)
      if (index === -1) return state

      const original = state.blocks[index]
      const duplicate: EmailBlock = {
        ...JSON.parse(JSON.stringify(original)),
        id: `block_${uuid()}`,
      }

      const newBlocks = [...state.blocks]
      newBlocks.splice(index + 1, 0, duplicate)

      return {
        ...state,
        blocks: newBlocks,
        selectedBlockId: duplicate.id,
        isDirty: true,
      }
    }

    case 'REORDER_BLOCKS': {
      const { fromIndex, toIndex } = action.payload
      return {
        ...state,
        blocks: arrayMove(state.blocks, fromIndex, toIndex),
        isDirty: true,
      }
    }

    // Selection
    case 'SELECT_BLOCK':
      return { ...state, selectedBlockId: action.payload }

    // Email settings
    case 'UPDATE_EMAIL_SETTINGS':
      return {
        ...state,
        emailSettings: { ...state.emailSettings, ...action.payload },
        isDirty: true,
      }

    // Drag
    case 'START_DRAG':
      return {
        ...state,
        drag: {
          isDragging: true,
          draggedType: action.payload.type,
          draggedBlockId: action.payload.blockId,
        },
      }

    case 'END_DRAG':
      return {
        ...state,
        drag: {
          isDragging: false,
          draggedType: null,
          draggedBlockId: null,
        },
      }

    // History - Production-grade undo/redo with smart merging
    case 'SAVE_HISTORY': {
      const now = Date.now()
      const description = action.payload

      // Get the last entry to check for merging
      const lastEntry = state.history[state.historyIndex]

      /**
       * Smart merge: If the same type of change happened recently,
       * update the existing entry instead of creating a new one.
       * This prevents flooding history with individual keystrokes.
       */
      const shouldMerge =
        lastEntry &&
        lastEntry.description === description &&
        now - lastEntry.timestamp < HISTORY_CONFIG.mergeWindow

      if (shouldMerge) {
        // Update the current history entry with new state
        const updatedHistory = [...state.history]
        updatedHistory[state.historyIndex] = {
          blocks: JSON.parse(JSON.stringify(state.blocks)),
          emailSettings: { ...state.emailSettings },
          description,
          timestamp: now,
        }
        return {
          ...state,
          history: updatedHistory,
        }
      }

      // Clear any redo history (everything after current index)
      const newHistory = state.history.slice(0, state.historyIndex + 1)

      // Add new entry
      newHistory.push({
        blocks: JSON.parse(JSON.stringify(state.blocks)),
        emailSettings: { ...state.emailSettings },
        description,
        timestamp: now,
      })

      // Keep only last N entries
      while (newHistory.length > HISTORY_CONFIG.maxEntries) {
        newHistory.shift()
      }

      return {
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      }
    }

    case 'UNDO': {
      // Can't undo if at the beginning
      if (state.historyIndex <= 0) return state

      const newIndex = state.historyIndex - 1
      const entry = state.history[newIndex]

      return {
        ...state,
        blocks: JSON.parse(JSON.stringify(entry.blocks)),
        emailSettings: { ...entry.emailSettings },
        historyIndex: newIndex,
        // Keep selection if the block still exists
        selectedBlockId: null,
        isDirty: true,
      }
    }

    case 'REDO': {
      // Can't redo if at the end
      if (state.historyIndex >= state.history.length - 1) return state

      const newIndex = state.historyIndex + 1
      const entry = state.history[newIndex]

      return {
        ...state,
        blocks: JSON.parse(JSON.stringify(entry.blocks)),
        emailSettings: { ...entry.emailSettings },
        historyIndex: newIndex,
        selectedBlockId: null,
        isDirty: true,
      }
    }

    // UI
    case 'SET_DIRTY':
      return { ...state, isDirty: action.payload }

    case 'TOGGLE_PREVIEW':
      return { ...state, isPreviewMode: !state.isPreviewMode, selectedBlockId: null }

    case 'SET_TEST_LEAD':
      return { ...state, testLead: action.payload }

    case 'SET_TEST_VARIABLE_CONTEXT':
      return { ...state, testVariableContext: action.payload }

    // Reset
    case 'RESET':
      return createInitialState(
        action.payload.name,
        action.payload.subject,
        action.payload.blocks
      )

    default:
      return state
  }
}

// ============================================================================
// BLOCK FACTORY
// ============================================================================

/**
 * Create a new email block with default values.
 * Handles both basic blocks and composite blocks (pricing cards, testimonials, etc.)
 */
export function createEmailBlock(type: EmailBlockType): EmailBlock {
  const id = `block_${uuid()}`

  switch (type) {
    case 'heading':
      return {
        id,
        type: 'heading',
        props: { text: 'Heading', level: 'h1' as HeadingLevel, align: 'left' as TextAlign },
      }
    case 'text':
      return {
        id,
        type: 'text',
        props: { text: 'Start typing here...', align: 'left' as TextAlign },
      }
    case 'button':
      return {
        id,
        type: 'button',
        props: { text: 'Click Here', href: 'https://', align: 'center' as TextAlign },
      }
    case 'image':
      return {
        id,
        type: 'image',
        props: { src: '', alt: 'Image', align: 'center' as TextAlign },
      }
    case 'divider':
      return { id, type: 'divider' }
    case 'spacer':
      return { id, type: 'spacer', props: { height: 32 } }
    case 'columns':
      return {
        id,
        type: 'columns',
        props: {
          leftColumn: { blocks: [] },
          rightColumn: { blocks: [] },
          gap: 24,
          leftWidth: 50,
        },
      } as ColumnsBlock

    // ─────────────────────────────────────────────────────────────────────────
    // COMPOSITE BLOCKS - Professional pre-designed components
    // ─────────────────────────────────────────────────────────────────────────
    case 'list':
      return {
        id,
        type: 'list',
        props: {
          items: [
            { id: `item_${uuid()}`, text: 'First item' },
            { id: `item_${uuid()}`, text: 'Second item' },
            { id: `item_${uuid()}`, text: 'Third item' },
          ],
          iconType: 'check',
          iconColor: '#10b981',
          textColor: '#374151',
          padding: 16,
          itemSpacing: 12,
        },
      }
    case 'pricing-card':
      return {
        id,
        type: 'pricing-card',
        props: {
          planName: 'Professional',
          price: '29',
          currency: '$',
          billingPeriod: '/month',
          description: 'Perfect for growing businesses',
          features: [
            'Unlimited projects',
            'Priority support',
            'Advanced analytics',
            'Custom integrations',
          ],
          buttonText: 'Get Started',
          buttonHref: '#',
          accentColor: '#2563eb',
          backgroundColor: '#ffffff',
          textColor: '#1f2937',
          borderRadius: 12,
          padding: 32,
        },
      }
    case 'testimonial-card':
      return {
        id,
        type: 'testimonial-card',
        props: {
          quote: 'This product has completely transformed how we work. The results speak for themselves.',
          authorName: 'Sarah Johnson',
          authorRole: 'CEO',
          companyName: 'TechCorp',
          rating: 5,
          layout: 'centered',
          backgroundColor: '#f9fafb',
          textColor: '#1f2937',
          accentColor: '#f59e0b',
          borderRadius: 12,
          padding: 32,
        },
      }
    case 'feature-card':
      return {
        id,
        type: 'feature-card',
        props: {
          icon: '🚀',
          title: 'Lightning Fast',
          description: 'Experience blazing fast performance with our optimized infrastructure.',
          layout: 'vertical',
          align: 'center' as TextAlign,
          backgroundColor: '#ffffff',
          titleColor: '#1f2937',
          descriptionColor: '#6b7280',
          iconSize: 48,
          borderRadius: 12,
          padding: 24,
        },
      }
    case 'stats-card':
      return {
        id,
        type: 'stats-card',
        props: {
          value: '10K+',
          label: 'Happy Customers',
          icon: '👥',
          valueColor: '#1f2937',
          labelColor: '#6b7280',
          backgroundColor: '#ffffff',
          align: 'center' as TextAlign,
          borderRadius: 12,
          padding: 24,
        },
      }
    case 'alert-card':
      return {
        id,
        type: 'alert-card',
        props: {
          alertType: 'info',
          title: 'Information',
          message: 'This is an important notification that requires your attention.',
          borderRadius: 8,
          padding: 16,
        },
      }
    case 'countdown-timer':
      return {
        id,
        type: 'countdown-timer',
        props: {
          targetDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
          showDays: true,
          showHours: true,
          showMinutes: true,
          showSeconds: true,
          expiredMessage: 'Offer has ended',
          style: 'boxes' as const,
          digitColor: '#1f2937',
          labelColor: '#6b7280',
          backgroundColor: '#f3f4f6',
          separatorStyle: 'colon' as const,
          align: 'center' as TextAlign,
          borderRadius: 8,
          padding: 24,
          marginTop: 0,
          marginBottom: 0,
        },
      }
    default:
      // Fallback for any unhandled block type - return a text block
      return {
        id,
        type: 'text',
        props: { text: 'Unknown block type', align: 'left' as TextAlign },
      }
  }
}

/**
 * Helper to create a block with custom props
 */
function createBlock<T extends EmailBlockType>(
  type: T,
  customProps?: Record<string, unknown>
): EmailBlock {
  const base = createEmailBlock(type)
  if (customProps && 'props' in base && base.props) {
    return { ...base, props: { ...(base.props as Record<string, unknown>), ...customProps } } as EmailBlock
  }
  return base
}

/**
 * Create pre-built block templates (multiple blocks)
 * Returns an array of blocks that form a common email pattern
 */
export function createPrebuiltBlocks(prebuiltId: string): EmailBlock[] {
  switch (prebuiltId) {
    case 'two-columns':
      // Two-column side-by-side layout with sample content
      return [
        {
          id: `block_${uuid()}`,
          type: 'columns',
          props: {
            leftColumn: {
              blocks: [
                { id: `block_${uuid()}`, type: 'heading', props: { text: 'Left Column', level: 'h2' as HeadingLevel, align: 'left' as TextAlign } },
                { id: `block_${uuid()}`, type: 'text', props: { text: 'Add your content here...', align: 'left' as TextAlign } },
              ],
            },
            rightColumn: {
              blocks: [
                { id: `block_${uuid()}`, type: 'heading', props: { text: 'Right Column', level: 'h2' as HeadingLevel, align: 'left' as TextAlign } },
                { id: `block_${uuid()}`, type: 'text', props: { text: 'Add your content here...', align: 'left' as TextAlign } },
              ],
            },
            gap: 24,
            leftWidth: 50,
          },
        } as ColumnsBlock,
      ]

    case 'hero':
      // Hero section with image and CTA
      return [
        createBlock('image', { src: '', alt: 'Hero Image', align: 'center' as TextAlign }),
        createBlock('heading', { text: 'Welcome to Our Service', level: 'h1' as HeadingLevel, align: 'center' as TextAlign }),
        createBlock('text', { text: 'Discover amazing features that will help you achieve your goals.', align: 'center' as TextAlign }),
        createBlock('button', { text: 'Get Started', href: 'https://', align: 'center' as TextAlign }),
      ]

    case 'testimonial':
      // Customer testimonial block
      return [
        createEmailBlock('divider'),
        createBlock('text', { text: '"This product changed my life. I highly recommend it to everyone!"', align: 'center' as TextAlign }),
        createBlock('text', { text: '— John Doe, CEO at Company', align: 'center' as TextAlign }),
        createEmailBlock('divider'),
      ]

    case 'footer':
      // Email footer with links
      return [
        createEmailBlock('divider'),
        createBlock('spacer', { height: 16 }),
        createBlock('text', { text: '{{organization.name}}\nYou received this email because you signed up for updates.', align: 'center' as TextAlign }),
        createBlock('text', { text: 'Unsubscribe | Privacy Policy | Contact Us', align: 'center' as TextAlign }),
      ]

    case 'social':
      // Social links section
      return [
        createBlock('spacer', { height: 24 }),
        createBlock('text', { text: 'Follow us on social media', align: 'center' as TextAlign }),
        createBlock('text', { text: 'Twitter | LinkedIn | Instagram', align: 'center' as TextAlign }),
      ]

    case 'cta':
      // Call to action section
      return [
        createBlock('spacer', { height: 24 }),
        createBlock('heading', { text: 'Ready to get started?', level: 'h2' as HeadingLevel, align: 'center' as TextAlign }),
        createBlock('text', { text: 'Join thousands of happy customers today.', align: 'center' as TextAlign }),
        createBlock('button', { text: 'Start Free Trial', href: 'https://', align: 'center' as TextAlign }),
        createBlock('spacer', { height: 24 }),
      ]

    default:
      return []
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

interface EmailBuilderContextValue {
  state: EmailBuilderState
  /** Currently selected block (searches nested blocks in columns too) */
  selectedBlock: EmailBlock | null
  /** True when 'canvas' is selected for editing email settings */
  isCanvasSelected: boolean
  /** True if undo is available */
  canUndo: boolean
  /** True if redo is available */
  canRedo: boolean
  actions: {
    setName: (name: string) => void
    setSubject: (subject: string) => void
    addBlock: (block: EmailBlock, index?: number) => void
    updateBlock: (id: string, updates: Partial<EmailBlock>) => void
    deleteBlock: (id: string) => void
    duplicateBlock: (id: string) => void
    reorderBlocks: (fromIndex: number, toIndex: number) => void
    selectBlock: (id: string | null) => void
    selectCanvas: () => void
    updateEmailSettings: (updates: Partial<EmailSettings>) => void
    startDrag: (type: EmailBlockType | null, blockId: string | null) => void
    endDrag: () => void
    /**
     * Save current state to history immediately.
     * Use for discrete actions like delete, duplicate, reorder.
     */
    saveHistory: (description: string) => void
    /**
     * Save history with debouncing for text input changes.
     * Rapid changes with the same description are merged.
     */
    saveHistoryDebounced: (description: string) => void
    /** Flush any pending debounced history save immediately */
    flushHistory: () => void
    undo: () => void
    redo: () => void
    setDirty: (dirty: boolean) => void
    togglePreview: () => void
    setTestLead: (lead: LeadOption | null) => void
    /**
     * Set the full variable context for the test lead.
     * This contains REAL data from the database.
     */
    setTestVariableContext: (context: VariableContext | null) => void
    reset: (name: string, subject: string, blocks: EmailBlock[]) => void
  }
}

const EmailBuilderContext = createContext<EmailBuilderContextValue | null>(null)

// ============================================================================
// PROVIDER
// ============================================================================

interface EmailBuilderProviderProps {
  children: ReactNode
  initialName?: string
  initialSubject?: string
  initialBlocks?: EmailBlock[]
  /** Initial email settings (background colors, padding, etc.) */
  initialEmailSettings?: Partial<EmailSettings>
}

export function EmailBuilderProvider({
  children,
  initialName = '',
  initialSubject = '',
  initialBlocks = [],
  initialEmailSettings,
}: EmailBuilderProviderProps) {
  const [state, dispatch] = useReducer(
    emailBuilderReducer,
    createInitialState(initialName, initialSubject, initialBlocks, initialEmailSettings)
  )

  /**
   * Debounce timer ref for text input history saves.
   * Stores the timeout ID so we can cancel/flush pending saves.
   */
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Store pending description for flush functionality.
   * When flushHistory is called, we need to know what description to use.
   */
  const pendingDescriptionRef = useRef<string | null>(null)

  /**
   * Save history immediately - for discrete actions like delete, duplicate.
   */
  const saveHistory = useCallback((description: string) => {
    dispatch({ type: 'SAVE_HISTORY', payload: description })
  }, [])

  /**
   * Save history with debouncing - for continuous text input changes.
   * Rapid changes with the same description are batched together.
   * This prevents flooding history with individual keystrokes.
   */
  const saveHistoryDebounced = useCallback((description: string) => {
    // Cancel any pending debounced save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Store the description for potential flush
    pendingDescriptionRef.current = description

    // Schedule new save after debounce delay
    debounceTimerRef.current = setTimeout(() => {
      dispatch({ type: 'SAVE_HISTORY', payload: description })
      pendingDescriptionRef.current = null
      debounceTimerRef.current = null
    }, HISTORY_CONFIG.debounceDelay)
  }, [])

  /**
   * Flush any pending debounced history save immediately.
   * Call this before discrete actions or when user stops editing.
   */
  const flushHistory = useCallback(() => {
    if (debounceTimerRef.current && pendingDescriptionRef.current) {
      clearTimeout(debounceTimerRef.current)
      dispatch({ type: 'SAVE_HISTORY', payload: pendingDescriptionRef.current })
      pendingDescriptionRef.current = null
      debounceTimerRef.current = null
    }
  }, [])

  /**
   * Cleanup debounce timer on unmount to prevent memory leaks.
   */
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Memoized actions (excluding debounced ones which use refs)
  const actions = useMemo(
    () => ({
      setName: (name: string) => dispatch({ type: 'SET_NAME', payload: name }),
      setSubject: (subject: string) => dispatch({ type: 'SET_SUBJECT', payload: subject }),
      addBlock: (block: EmailBlock, index?: number) =>
        dispatch({ type: 'ADD_BLOCK', payload: { block, index } }),
      updateBlock: (id: string, updates: Partial<EmailBlock>) =>
        dispatch({ type: 'UPDATE_BLOCK', payload: { id, updates } }),
      deleteBlock: (id: string) => dispatch({ type: 'DELETE_BLOCK', payload: id }),
      duplicateBlock: (id: string) => dispatch({ type: 'DUPLICATE_BLOCK', payload: id }),
      reorderBlocks: (fromIndex: number, toIndex: number) =>
        dispatch({ type: 'REORDER_BLOCKS', payload: { fromIndex, toIndex } }),
      selectBlock: (id: string | null) => dispatch({ type: 'SELECT_BLOCK', payload: id }),
      selectCanvas: () => dispatch({ type: 'SELECT_BLOCK', payload: 'canvas' }),
      updateEmailSettings: (updates: Partial<EmailSettings>) =>
        dispatch({ type: 'UPDATE_EMAIL_SETTINGS', payload: updates }),
      startDrag: (type: EmailBlockType | null, blockId: string | null) =>
        dispatch({ type: 'START_DRAG', payload: { type, blockId } }),
      endDrag: () => dispatch({ type: 'END_DRAG' }),
      saveHistory,
      saveHistoryDebounced,
      flushHistory,
      undo: () => dispatch({ type: 'UNDO' }),
      redo: () => dispatch({ type: 'REDO' }),
      setDirty: (dirty: boolean) => dispatch({ type: 'SET_DIRTY', payload: dirty }),
      togglePreview: () => dispatch({ type: 'TOGGLE_PREVIEW' }),
      setTestLead: (lead: LeadOption | null) => dispatch({ type: 'SET_TEST_LEAD', payload: lead }),
      setTestVariableContext: (context: VariableContext | null) =>
        dispatch({ type: 'SET_TEST_VARIABLE_CONTEXT', payload: context }),
      reset: (name: string, subject: string, blocks: EmailBlock[]) =>
        dispatch({ type: 'RESET', payload: { name, subject, blocks } }),
    }),
    [saveHistory, saveHistoryDebounced, flushHistory]
  )

  /**
   * Find a block by ID, including blocks nested inside columns.
   * This enables selection and editing of blocks inside column containers.
   */
  const selectedBlock = useMemo(() => {
    const id = state.selectedBlockId
    if (!id || id === 'canvas') return null

    // First, check top-level blocks
    const topLevel = state.blocks.find((b) => b.id === id)
    if (topLevel) return topLevel

    // Then, search inside columns
    for (const block of state.blocks) {
      if (block.type === 'columns') {
        // Check left column
        const leftMatch = block.props.leftColumn.blocks.find((b) => b.id === id)
        if (leftMatch) return leftMatch
        // Check right column
        const rightMatch = block.props.rightColumn.blocks.find((b) => b.id === id)
        if (rightMatch) return rightMatch
      }
    }

    return null
  }, [state.blocks, state.selectedBlockId])

  // Check if canvas is selected (for email settings)
  const isCanvasSelected = state.selectedBlockId === 'canvas'

  /**
   * Computed undo/redo availability.
   * canUndo: True if we're not at the beginning of history.
   * canRedo: True if we're not at the end of history.
   */
  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1

  const value = useMemo(
    () => ({ state, selectedBlock, isCanvasSelected, canUndo, canRedo, actions }),
    [state, selectedBlock, isCanvasSelected, canUndo, canRedo, actions]
  )

  return (
    <EmailBuilderContext.Provider value={value}>
      {children}
    </EmailBuilderContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

export function useEmailBuilder() {
  const context = useContext(EmailBuilderContext)
  if (!context) {
    throw new Error('useEmailBuilder must be used within EmailBuilderProvider')
  }
  return context
}
