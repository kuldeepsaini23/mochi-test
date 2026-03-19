'use client'

/**
 * ContentPreview Component - Lightweight Rich Content Renderer
 *
 * Renders Lexical editor content in a preview mode suitable for ticket cards.
 * Shows all formatting (bold, italic, etc.) but normalizes font sizes
 * so headings appear the same size as regular text.
 *
 * Features:
 * - Rich formatting preserved (bold, italic, underline, strikethrough, code)
 * - Font sizes normalized (no heading size differences)
 * - Images rendered as small thumbnails
 * - Max height with overflow hidden for card previews
 *
 * Usage:
 * ```tsx
 * <ContentPreview
 *   content={ticket.description}
 *   maxHeight={80}
 *   className="text-xs"
 * />
 * ```
 *
 * SOURCE OF TRUTH: Lexical content preview for cards
 * Keywords: CONTENT_PREVIEW, TICKET_PREVIEW, LEXICAL_PREVIEW
 */

import { useMemo } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import type { Klass, LexicalNode } from 'lexical'
import { cn } from '@/lib/utils'
import { standardNodes } from './nodes'
import { MarqueeFade } from '@/components/global/marquee-fade'

// ============================================================================
// PREVIEW THEME - Normalized sizes, no heading differences
// ============================================================================

/**
 * Preview-specific theme that normalizes all text to same size
 * WHY: In card previews, we want formatting but not size variations
 */
const previewTheme = {
  // Root styling
  root: 'preview-root',

  // Text formats - all preserved
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'font-mono bg-muted px-1 rounded text-[0.9em]',
    subscript: 'align-sub text-[0.8em]',
    superscript: 'align-super text-[0.8em]',
  },

  // Headings - same size as paragraph (normalized)
  heading: {
    h1: 'font-semibold',
    h2: 'font-semibold',
    h3: 'font-medium',
    h4: 'font-medium',
    h5: 'font-medium',
    h6: 'font-medium',
  },

  // Paragraph - base styling
  paragraph: '',

  // Quote - subtle styling
  quote: 'border-l-2 border-muted-foreground/30 pl-2 italic',

  // Lists - compact
  list: {
    ul: 'list-disc list-inside',
    ol: 'list-decimal list-inside',
    listitem: '',
    nested: {
      listitem: 'pl-4',
    },
    listitemChecked: 'line-through text-muted-foreground',
    listitemUnchecked: '',
  },

  // Links
  link: 'text-primary underline',

  // Code blocks - compact
  code: 'font-mono bg-muted p-1 rounded text-[0.9em] block',
  codeHighlight: {},

  // Horizontal rule
  hr: 'border-t border-border my-1',

  // Image - preview size
  image: 'max-h-12 rounded object-cover inline-block',
}

// ============================================================================
// COMPONENT
// ============================================================================

interface ContentPreviewProps {
  /**
   * The Lexical JSON content string to render
   */
  content: string | null
  /**
   * Maximum height in pixels (default: 60)
   * Content will be clipped with overflow hidden
   */
  maxHeight?: number
  /**
   * Additional className for the container
   */
  className?: string
  /**
   * Custom Lexical node set for rendering (default: standardNodes).
   * WHY: Content with custom decorator nodes (e.g. SignatureNode, InputFieldNode)
   *      needs those nodes registered or Lexical creates empty placeholder DOM elements.
   */
  nodes?: Array<Klass<LexicalNode>>
}

/**
 * ContentPreview - Lightweight rich content renderer for ticket cards
 *
 * WHY: Full RichTextEditor is too heavy for rendering many cards.
 * This component uses a minimal Lexical setup with read-only mode
 * and a preview-optimized theme.
 */
export function ContentPreview({
  content,
  maxHeight = 60,
  className,
  nodes,
}: ContentPreviewProps) {
  /**
   * Don't render anything if no content
   */
  if (!content) return null

  /**
   * Validate content is valid JSON before attempting to render
   * WHY: Prevents crashes from malformed content
   */
  const isValidJson = useMemo(() => {
    try {
      JSON.parse(content)
      return true
    } catch {
      return false
    }
  }, [content])

  if (!isValidJson) {
    // Fallback: render as plain text if not valid Lexical JSON
    return (
      <p className={cn('text-muted-foreground line-clamp-2', className)}>
        {content}
      </p>
    )
  }

  /**
   * Generate a unique key for the content
   * WHY: Forces Lexical to re-mount when content changes
   * Without this, editorState is only read on initial mount
   * Using full content as key ensures any change triggers re-render
   */
  const contentKey = useMemo(() => {
    if (!content) return 'empty'
    // Use content length + hash of full content for unique key
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i)
      hash = hash & hash
    }
    return `preview-${content.length}-${hash}`
  }, [content])

  /**
   * Editor configuration for preview mode
   * WHY: Minimal setup for read-only rendering
   */
  const initialConfig = {
    namespace: 'ContentPreview',
    theme: previewTheme,
    nodes: nodes ?? standardNodes,
    editable: false,
    onError: (error: Error) => {
      console.warn('ContentPreview error:', error)
    },
    editorState: content,
  }

  return (
    <MarqueeFade
      showBottomFade
      fadeHeight={16}
      className={cn('overflow-hidden', className)}
      style={{ maxHeight }}
    >
      <LexicalComposer key={contentKey} initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={cn(
                'outline-none cursor-default select-none pointer-events-none',
                'text-muted-foreground',
                // Normalize all text sizes
                '[&_*]:!text-[inherit] [&_*]:!leading-tight',
                // Make images small square thumbnails - use !important to override inline styles
                '[&_img]:!h-6 [&_img]:!w-6 [&_img]:!min-h-0 [&_img]:!min-w-0 [&_img]:!max-h-6 [&_img]:!max-w-6',
                '[&_img]:rounded [&_img]:object-cover [&_img]:inline-block [&_img]:mr-1 [&_img]:align-middle',
                // Compact spacing
                '[&_p]:mb-0.5 [&_h1]:mb-0.5 [&_h2]:mb-0.5 [&_h3]:mb-0.5',
                '[&_ul]:mb-0.5 [&_ol]:mb-0.5 [&_li]:mb-0',
                // Hide horizontal rules in preview
                '[&_hr]:hidden',
                // Hide custom decorator nodes (signature, input fields) — they're interactive elements, not text
                '[&_.editor-signature]:hidden [&_.editor-input-field]:hidden',
                // Show variable nodes as compact inline pills in preview — they represent dynamic data
                '[&_.editor-variable]:inline [&_.editor-variable]:text-primary/70 [&_.editor-variable]:text-[0.85em]'
              )}
              contentEditable={false}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </LexicalComposer>
    </MarqueeFade>
  )
}
