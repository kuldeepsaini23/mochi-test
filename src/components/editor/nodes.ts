/**
 * Lexical Editor Nodes Configuration
 *
 * Registers all node types used in the rich text editor.
 * Nodes define the structure of content (headings, lists, links, etc.)
 *
 * SOURCE OF TRUTH: Lexical Klass<LexicalNode>
 * Keywords: EDITOR_NODES, LEXICAL_NODES, RICH_TEXT_NODES
 */

import type { Klass, LexicalNode } from 'lexical'

import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode, AutoLinkNode } from '@lexical/link'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'
import { TableNode, TableRowNode, TableCellNode } from '@lexical/table'
import { HashtagNode } from '@lexical/hashtag'
import { MarkNode } from '@lexical/mark'

// Custom nodes
import { ImageNode, SignatureNode, InputFieldNode, VariableNode } from './nodes/index'

// ============================================================================
// NODE REGISTRATION
// ============================================================================

/**
 * All nodes used in the editor
 * WHY: Lexical requires explicit node registration for each type of content
 *
 * Organized by category:
 * - Rich Text: Headings, quotes
 * - Lists: Ordered, unordered, checklists
 * - Links: Regular links, auto-detected links
 * - Code: Code blocks with syntax highlighting
 * - Tables: Full table support
 * - Special: Horizontal rules, hashtags, marks
 */
export const editorNodes: Array<Klass<LexicalNode>> = [
  // Rich Text nodes - headings and block quotes
  HeadingNode,
  QuoteNode,

  // List nodes - bullet, numbered, and checklist support
  ListNode,
  ListItemNode,

  // Link nodes - clickable links and auto-detection
  LinkNode,
  AutoLinkNode,

  // Code nodes - code blocks with syntax highlighting
  CodeNode,
  CodeHighlightNode,

  // Table nodes - full table support
  TableNode,
  TableRowNode,
  TableCellNode,

  // Special nodes
  HorizontalRuleNode,
  HashtagNode,
  MarkNode,

  // Media nodes
  ImageNode,
]

// ============================================================================
// NODE UTILITIES
// ============================================================================

/**
 * Minimal node set for simple editors (descriptions, comments)
 * Excludes tables, images, and complex features for lighter weight
 * Includes CodeNode to support markdown shortcuts without warnings
 */
export const minimalNodes: Array<Klass<LexicalNode>> = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  CodeNode,
  CodeHighlightNode,
]

/**
 * Standard node set for most use cases
 * Includes all common formatting without tables
 */
export const standardNodes: Array<Klass<LexicalNode>> = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  CodeNode,
  CodeHighlightNode,
  HorizontalRuleNode,
  HashtagNode,
  ImageNode,
]

/**
 * Full node set with all features
 * Use for full-featured editors like blog posts, documents
 */
export const fullNodes: Array<Klass<LexicalNode>> = editorNodes

/**
 * Contract editor node set
 * Extends full nodes with contract-specific nodes (signature fields, input fields)
 * WHY: Contract builder needs all standard editor features plus signature/input placeholders
 */
/**
 * Contract editor node set
 * Extends full nodes with contract-specific nodes (signature, input, variable)
 * WHY: Contract builder needs all standard features plus signature/input/variable placeholders
 */
export const contractNodes: Array<Klass<LexicalNode>> = [
  ...fullNodes,
  SignatureNode,
  InputFieldNode,
  VariableNode,
]

/**
 * Invoice editor node set
 * Extends full nodes with variable pills only (no signature/input fields).
 * WHY: Invoice notes need dynamic variable interpolation but NOT contract-specific nodes.
 */
export const invoiceNodes: Array<Klass<LexicalNode>> = [
  ...fullNodes,
  VariableNode,
]
