/**
 * Rich Text Editor Types
 *
 * Type definitions for the Lexical-based rich text editor component.
 *
 * SOURCE OF TRUTH: Lexical SerializedEditorState, EditorState
 * Keywords: EDITOR_TYPES, LEXICAL_TYPES, RICH_TEXT_EDITOR
 */

import type React from 'react'
import type { EditorState, SerializedEditorState } from 'lexical'

// ============================================================================
// EDITOR CONFIGURATION
// ============================================================================

/**
 * Editor variant determines the feature set and UI complexity
 */
export type EditorVariant = 'minimal' | 'standard' | 'full'

/**
 * Configuration for the rich text editor
 */
export interface RichTextEditorConfig {
  /**
   * Editor variant determines available features
   * - minimal: Basic text formatting only
   * - standard: Text + lists + links (default)
   * - full: All features including tables, code blocks, etc.
   */
  variant?: EditorVariant

  /**
   * Placeholder text when editor is empty
   */
  placeholder?: string

  /**
   * Whether the editor is read-only
   */
  readOnly?: boolean

  /**
   * Whether to autofocus the editor on mount
   */
  autoFocus?: boolean

  /**
   * Maximum number of characters allowed
   */
  maxLength?: number
}

// ============================================================================
// EDITOR PROPS
// ============================================================================

/**
 * Props for the RichTextEditor component
 *
 * SOURCE OF TRUTH: RichTextEditorProps
 * Keywords: RICH_TEXT_EDITOR_PROPS, EDITOR_COMPONENT_PROPS
 */
export interface RichTextEditorProps extends RichTextEditorConfig {
  /**
   * Initial content as serialized JSON string
   * WHY: We use JSON string for easy storage in database
   * This content is parsed and loaded immediately on mount (SSR compatible)
   */
  initialContent?: string

  /**
   * Callback when editor content changes (debounced)
   * WHY: Debouncing prevents excessive saves during rapid typing
   * Returns serialized JSON string for storage
   */
  onChange?: (content: string) => void

  /**
   * Debounce delay in milliseconds for onChange callback
   * WHY: Prevents excessive API calls during rapid typing
   * @default 500
   */
  debounceMs?: number

  /**
   * Callback when editor loses focus (immediate, not debounced)
   * WHY: Triggers immediate save on blur for auto-save functionality
   */
  onBlur?: (content: string) => void

  /**
   * Optional className for the editor container
   */
  className?: string

  /**
   * Optional className for the editable content area
   */
  contentClassName?: string

  /**
   * Organization ID for storage operations
   * WHY: Required for image upload/paste functionality and storage browser
   * Enables: paste image upload, /image storage command
   */
  organizationId?: string

  /**
   * Callback when an image is deleted from the editor
   * WHY: Allows parent component to clean up storage when images are removed
   * @param storageFileId - The ID of the deleted file in storage
   */
  onImageDelete?: (storageFileId: string) => void

  /**
   * Callback when saving state changes (debounce pending/complete)
   * WHY: Allows parent to show saving indicator (spinner/checkmark)
   * @param isPending - true when debounce is pending (user is typing)
   */
  onSavingStateChange?: (isPending: boolean) => void

  /**
   * Hides the color picker from the floating toolbar
   * WHY: Some contexts (e.g. template name/description fields) should not
   * allow font color changes — this prop strips the color picker section
   * from the inline floating toolbar while keeping all other formatting.
   *
   * SOURCE OF TRUTH: Consumed by FloatingToolbarPlugin
   * Keywords: HIDE_COLOR, FLOATING_TOOLBAR_COLOR, EDITOR_COLOR_PICKER
   */
  hideColor?: boolean

  /**
   * Shows the font-family picker in the floating toolbar (default: false).
   * WHY: Only the website builder rich text element needs inline font changes.
   * Other contexts (template descriptions, emails) use document-level fonts.
   *
   * SOURCE OF TRUTH: Consumed by FloatingToolbarPlugin
   * Keywords: SHOW_FONT_FAMILY, INLINE_FONT_PICKER, EDITOR_FONT_PICKER
   */
  showFontFamily?: boolean

  /**
   * Ref that receives the debounce flush function when the editor mounts.
   * WHY: The canvas deselection path (pointerdown → marquee) calls
   * e.preventDefault() which suppresses blur. Without blur, the 500ms
   * debounced onChange never flushes and pending inline-style changes are
   * lost when the editor unmounts. The parent can call flushRef.current?.()
   * in its deselect effect to guarantee all pending changes reach Redux
   * before the editor is torn down.
   *
   * SOURCE OF TRUTH: RichTextEditor flush mechanism
   * Keywords: FLUSH_REF, DEBOUNCE_FLUSH, DESELECT_SAVE, INLINE_STYLE_FIX
   */
  flushRef?: React.MutableRefObject<(() => void) | null>
}

// ============================================================================
// EDITOR STATE HELPERS
// ============================================================================

/**
 * Serialized editor content for storage
 * This is what gets saved to the database
 */
export type SerializedContent = string

/**
 * Utility type for editor state access
 */
export interface EditorStateAccessor {
  getEditorState: () => EditorState
  setEditorState: (state: EditorState) => void
}

// ============================================================================
// TOOLBAR TYPES
// ============================================================================

/**
 * Text format types supported by the editor
 */
export type TextFormatType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'subscript'
  | 'superscript'
  | 'highlight'

/**
 * Block format types for paragraphs and headings
 */
export type BlockFormatType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'quote'
  | 'code'

/**
 * List types
 */
export type ListType = 'bullet' | 'number' | 'check'

/**
 * Toolbar state tracking active formats
 */
export interface ToolbarState {
  isBold: boolean
  isItalic: boolean
  isUnderline: boolean
  isStrikethrough: boolean
  isCode: boolean
  isSubscript: boolean
  isSuperscript: boolean
  isHighlight: boolean
  isLink: boolean
  blockType: BlockFormatType
  listType: ListType | null
  canUndo: boolean
  canRedo: boolean
}

// ============================================================================
// PLUGIN TYPES
// ============================================================================

/**
 * Configuration for the floating link editor
 */
export interface FloatingLinkEditorConfig {
  anchorElement?: HTMLElement | null
}

/**
 * Configuration for the slash command menu
 */
export interface SlashCommandConfig {
  maxSuggestions?: number
}
