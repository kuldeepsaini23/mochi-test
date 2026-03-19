/**
 * ============================================================================
 * MARKDOWN → LEXICAL JSON CONVERTER (Server-Side)
 * ============================================================================
 *
 * Converts markdown text to a serialized Lexical JSON string that the
 * RichTextEditor component can parse via editor.parseEditorState().
 *
 * Used by CMS AI tools to populate RICH_TEXT columns — the AI writes
 * markdown (headings, bold, lists, links, etc.) and this utility converts
 * it to the exact Lexical format the editor expects.
 *
 * Uses Lexical's createEditor (no DOM required — runs server-side) with
 * $convertFromMarkdownString and the standard TRANSFORMERS.
 *
 * SOURCE OF TRUTH KEYWORDS: MarkdownToLexical, CmsRichTextConverter
 * ============================================================================
 */

import { createEditor } from 'lexical'
import { $convertFromMarkdownString, TRANSFORMERS } from '@lexical/markdown'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode, AutoLinkNode } from '@lexical/link'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { HashtagNode } from '@lexical/hashtag'

/**
 * Server-safe node set for markdown conversion.
 * WHY: standardNodes from editor/nodes.ts includes HorizontalRuleNode from
 * @lexical/react which requires a React/DOM environment and crashes in API routes.
 * This set includes only pure Lexical nodes that work server-side.
 */
const SERVER_SAFE_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  CodeNode,
  CodeHighlightNode,
  HashtagNode,
]

/**
 * Converts a markdown string into a serialized Lexical JSON string.
 *
 * WHY: The RichTextEditor expects Lexical SerializedEditorState JSON as its
 * initialContent. The AI generates markdown, so we need a server-side bridge.
 *
 * HOW: Creates a headless Lexical editor instance, runs the markdown converter
 * inside an editor.update() call, then serializes the resulting state to JSON.
 *
 * @param markdown - The markdown content (supports headings, bold, italic, lists, links, code, etc.)
 * @returns A JSON string of the Lexical editor state, ready for RichTextEditor.initialContent
 */
export function markdownToLexicalJson(markdown: string): string {
  /** Create a headless editor with server-safe nodes (no React/DOM dependencies) */
  const editor = createEditor({
    namespace: 'MarkdownConverter',
    nodes: SERVER_SAFE_NODES,
    onError: (error: Error) => {
      console.error('Lexical markdown conversion error:', error)
    },
  })

  /**
   * Run the markdown conversion inside editor.update (synchronous).
   * $convertFromMarkdownString clears root and creates nodes from markdown.
   */
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, TRANSFORMERS)
    },
    { discrete: true }
  )

  /** Serialize the editor state to JSON string — this is what the RichTextEditor expects */
  const state = editor.getEditorState()
  return JSON.stringify(state.toJSON())
}
