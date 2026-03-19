/**
 * Rich Text Editor Exports
 *
 * Central export file for the Lexical-based rich text editor.
 * Import from '@/components/editor' for all editor functionality.
 *
 * Usage:
 * ```tsx
 * import { RichTextEditor } from '@/components/editor'
 *
 * <RichTextEditor
 *   initialContent={content}
 *   onChange={handleChange}
 *   variant="standard"
 * />
 * ```
 *
 * SOURCE OF TRUTH: Editor exports
 * Keywords: EDITOR_EXPORTS, RICH_TEXT_EXPORTS
 */

// Main editor component
export { RichTextEditor } from './rich-text-editor'

// Lightweight content preview for cards/lists
export { ContentPreview } from './content-preview'

// Theme
export { editorTheme } from './theme'

// Nodes
export { editorNodes, minimalNodes, standardNodes, fullNodes } from './nodes'

// Types
export type {
  RichTextEditorProps,
  RichTextEditorConfig,
  EditorVariant,
  SerializedContent,
  TextFormatType,
  BlockFormatType,
  ListType,
  ToolbarState,
} from './types'

// Plugins (for advanced usage)
export {
  FloatingToolbarPlugin,
  FloatingLinkEditorPlugin,
  SlashCommandPlugin,
  AutoLinkPlugin,
  Placeholder,
} from './plugins'
