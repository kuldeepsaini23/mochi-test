'use client'

/**
 * Rich Text Editor Component
 *
 * A global, reusable Notion-like rich text editor built on Lexical.
 * Supports multiple variants for different use cases.
 *
 * Usage:
 * ```tsx
 * <RichTextEditor
 *   initialContent={savedContent}
 *   onChange={(content) => save(content)}
 *   debounceMs={500}
 *   placeholder="Write something..."
 * />
 * ```
 *
 * Features:
 * - Debounced onChange for efficient DB saves
 * - Initial content loads immediately (SSR compatible)
 * - onBlur triggers immediate save (not debounced)
 *
 * Variants:
 * - minimal: Basic text formatting only
 * - standard: Text + lists + links (default)
 * - full: All features including tables, code blocks, etc.
 *
 * SOURCE OF TRUTH: RichTextEditorProps from @/components/editor/types
 * Keywords: RICH_TEXT_EDITOR, LEXICAL_EDITOR, NOTION_EDITOR
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Lexical core
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'

// Markdown transformers
import { TRANSFORMERS } from '@lexical/markdown'

// Editor state
import { EditorState } from 'lexical'

// Local imports
import { cn } from '@/lib/utils'
import { editorTheme } from './theme'
import { editorNodes, minimalNodes, standardNodes, fullNodes } from './nodes'
import {
  FloatingLinkEditorPlugin,
  SlashCommandPlugin,
  AutoLinkPlugin,
  Placeholder,
  FloatingToolbarPlugin,
  ImagePlugin,
} from './plugins'
import { trpc } from '@/trpc/react-provider'

import type { RichTextEditorProps, EditorVariant } from './types'

// ============================================================================
// DEBOUNCE HOOK
// ============================================================================

/**
 * Debounced callback result type
 */
interface DebouncedCallback {
  (content: string): void
  flush: () => void
}

/**
 * Custom hook for debouncing a string callback function
 * WHY: Prevents excessive API calls during rapid typing
 *
 * @param callback - The function to debounce (accepts string content)
 * @param delay - Delay in milliseconds
 * @param onPendingChange - Optional callback when pending state changes (called directly, not via React state)
 * @returns Debounced function that also has a flush method
 */
function useDebouncedCallback(
  callback: (content: string) => void,
  delay: number,
  onPendingChange?: (isPending: boolean) => void
): DebouncedCallback {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const callbackRef = useRef(callback)
  const pendingContentRef = useRef<string | null>(null)
  const onPendingChangeRef = useRef(onPendingChange)
  const isPendingRef = useRef(false)

  // Keep callback refs updated
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    onPendingChangeRef.current = onPendingChange
  }, [onPendingChange])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  /**
   * Helper to update pending state and notify parent
   * Uses ref to avoid React state updates that could interfere with editor
   */
  const setPending = useCallback((pending: boolean) => {
    if (isPendingRef.current !== pending) {
      isPendingRef.current = pending
      onPendingChangeRef.current?.(pending)
    }
  }, [])

  const debouncedFn = useCallback(
    (content: string) => {
      pendingContentRef.current = content
      setPending(true)

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        if (pendingContentRef.current !== null) {
          callbackRef.current(pendingContentRef.current)
          pendingContentRef.current = null
        }
        setPending(false)
      }, delay)
    },
    [delay, setPending]
  ) as DebouncedCallback

  // Flush method to immediately execute pending callback
  debouncedFn.flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (pendingContentRef.current !== null) {
      callbackRef.current(pendingContentRef.current)
      pendingContentRef.current = null
    }
    setPending(false)
  }, [setPending])

  return debouncedFn
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Gets the appropriate nodes for the editor variant
 */
function getNodesForVariant(variant: EditorVariant) {
  switch (variant) {
    case 'minimal':
      return minimalNodes
    case 'standard':
      return standardNodes
    case 'full':
      return fullNodes
    default:
      return standardNodes
  }
}

/**
 * Validates a URL for link creation
 */
function validateUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// EDITOR ERROR BOUNDARY FALLBACK
// ============================================================================

function EditorErrorFallback({ error }: { error: Error }) {
  return (
    <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
      <p className="text-sm text-destructive font-medium">
        Editor failed to load
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {error.message || 'An unexpected error occurred'}
      </p>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Default debounce delay in milliseconds
 */
const DEFAULT_DEBOUNCE_MS = 500

/**
 * Rich Text Editor Component
 *
 * A flexible, production-ready rich text editor with Notion-like features.
 * Can be used for tickets, blog posts, comments, and more.
 *
 * WHY: Provides a consistent editing experience across the application
 * while being flexible enough to handle different use cases through variants.
 *
 * Features:
 * - Debounced onChange prevents excessive DB calls during typing
 * - Initial content loads immediately on mount (SSR compatible)
 * - onBlur flushes pending debounced changes then triggers immediate save
 */
export function RichTextEditor({
  initialContent,
  onChange,
  onBlur,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  variant = 'standard',
  placeholder = "Type '/' for commands...",
  readOnly = false,
  autoFocus = false,
  maxLength,
  className,
  contentClassName,
  organizationId,
  onImageDelete,
  onSavingStateChange,
  hideColor,
  showFontFamily,
  flushRef,
}: RichTextEditorProps) {
  // Reference to the editor container for positioning floating elements
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [floatingAnchorElement, setFloatingAnchorElement] =
    useState<HTMLDivElement | null>(null)

  // Track if editor is focused for styling
  const [isFocused, setIsFocused] = useState(false)

  /**
   * Track latest content for immediate access on blur
   * WHY: Ensures we can save the current content even before debounce completes
   * Initialized with initialContent to handle blur without changes
   */
  const latestContentRef = useRef<string | null>(initialContent ?? null)

  // ============================================================================
  // DEBOUNCED CHANGE HANDLER
  // ============================================================================

  /**
   * Debounced callback for onChange
   * WHY: Prevents excessive API calls during rapid typing
   * The flush method is used on blur to ensure pending changes are saved
   */
  const handleDebouncedChange = useCallback(
    (content: string) => {
      if (onChange) {
        onChange(content)
      }
    },
    [onChange]
  )

  const debouncedOnChange = useDebouncedCallback(
    handleDebouncedChange,
    debounceMs,
    onSavingStateChange
  )

  /**
   * Expose the debounce flush function to the parent via flushRef.
   * WHY: When the canvas deselects an element via pointerdown (which calls
   * e.preventDefault()), blur never fires and the debounced onChange is lost.
   * The parent calls flushRef.current?.() in its deselect effect to guarantee
   * all pending inline-style changes are dispatched before the editor unmounts.
   */
  useEffect(() => {
    if (flushRef) {
      flushRef.current = debouncedOnChange.flush
    }
    return () => {
      if (flushRef) {
        flushRef.current = null
      }
    }
  }, [flushRef, debouncedOnChange])

  // ============================================================================
  // INITIAL CONFIG
  // ============================================================================

  /**
   * Editor configuration
   * WHY: Sets up the editor with the appropriate theme, nodes, and initial state
   *
   * Initial content is parsed and loaded immediately on mount.
   * This works on both server and client side rendering.
   */
  const initialConfig = useMemo(
    () => ({
      namespace: 'RichTextEditor',
      theme: editorTheme,
      nodes: getNodesForVariant(variant),
      onError: (error: Error) => {
        console.error('Lexical editor error:', error)
      },
      editable: !readOnly,
      /**
       * Parse and load initial content if provided
       * WHY: Ensures content is displayed immediately on mount
       * This is SSR compatible - content is parsed from the JSON string
       */
      editorState: initialContent
        ? (editor: import('lexical').LexicalEditor) => {
            try {
              const state = editor.parseEditorState(initialContent)
              editor.setEditorState(state)
            } catch (e) {
              // If parsing fails, start with empty editor
              console.warn('Failed to parse initial content, starting empty')
            }
          }
        : undefined,
    }),
    // Only re-create config on mount - initialContent changes after mount
    // should not recreate the editor (that would lose user's work)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variant, readOnly]
  )

  // ============================================================================
  // HANDLERS
  // ============================================================================

  /**
   * Handle editor state changes (debounced)
   * WHY: Serializes the editor state to JSON and triggers debounced save
   */
  const handleChange = useCallback(
    (editorState: EditorState) => {
      const json = editorState.toJSON()
      const content = JSON.stringify(json)

      // Store latest content for immediate access on blur
      latestContentRef.current = content

      // Trigger debounced onChange
      debouncedOnChange(content)
    },
    [debouncedOnChange]
  )

  /**
   * Handle editor blur (immediate save)
   * WHY: Flushes any pending debounced changes, then triggers onBlur
   * This ensures all changes are saved when user leaves the editor
   */
  const handleBlur = useCallback(() => {
    // Flush any pending debounced onChange calls first
    debouncedOnChange.flush()

    // Trigger onBlur with latest content
    // WHY: onBlur triggers immediate save to database
    if (onBlur && latestContentRef.current) {
      onBlur(latestContentRef.current)
    }

    setIsFocused(false)
  }, [debouncedOnChange, onBlur])

  // ============================================================================
  // SETUP FLOATING ANCHOR
  // ============================================================================

  useEffect(() => {
    if (editorContainerRef.current) {
      setFloatingAnchorElement(editorContainerRef.current)
    }
  }, [])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      ref={editorContainerRef}
      className={cn(
        'relative bg-transparent',
        readOnly && 'bg-muted/30',
        className
      )}
    >
      <LexicalComposer initialConfig={initialConfig}>
        {/* Main Editor Area - Minimal, no borders */}
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={cn(
                  'min-h-[150px] outline-none',
                  'text-foreground text-base leading-relaxed',
                  readOnly && 'cursor-default',
                  contentClassName
                )}
                aria-placeholder={placeholder}
                placeholder={<Placeholder text={placeholder} />}
                onFocus={() => setIsFocused(true)}
                onBlur={handleBlur}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>

        {/* Core Plugins */}
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <LinkPlugin validateUrl={validateUrl} />
        <HorizontalRulePlugin />
        <TabIndentationPlugin />

        {/* Markdown shortcuts for power users */}
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />

        {/* Auto-link detection */}
        <AutoLinkPlugin />

        {/* Floating editors and menus */}
        {!readOnly && (
          <>
            {floatingAnchorElement && (
              <FloatingLinkEditorPlugin anchorElement={floatingAnchorElement} />
            )}
            <SlashCommandPlugin organizationId={organizationId} />
            <FloatingToolbarPlugin hideColor={hideColor} showFontFamily={showFontFamily} />
            {/* Image plugin for paste handling and upload */}
            <ImagePlugin
              organizationId={organizationId}
              onImageDelete={onImageDelete}
            />
          </>
        )}

        {/* Change tracking */}
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
      </LexicalComposer>
    </div>
  )
}

// ============================================================================
// EXPORTS
// ============================================================================

export { editorTheme } from './theme'
export { editorNodes, minimalNodes, standardNodes, fullNodes } from './nodes'
export type { RichTextEditorProps, EditorVariant, SerializedContent } from './types'
