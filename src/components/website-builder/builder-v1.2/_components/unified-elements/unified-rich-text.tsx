/**
 * ============================================================================
 * UNIFIED RICH TEXT ELEMENT - Single Component for Canvas + Preview Modes
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedRichText, unified-rich-text, rich-text-rendering
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * CANVAS MODE:
 *   - NOT editing → LexicalStaticContent (same lightweight renderer as preview)
 *   - Editing → mounts a FRESH RichTextEditor (readOnly=false) each session
 *   - Double-click → mount editor, enables toolbar + slash commands
 *   - Click outside / deselect → save content, unmount editor
 *   - pointerDown stopped so canvas doesn't steal selection
 *
 * WHY mount/unmount instead of toggling readOnly?
 *   LexicalComposer only reads initialConfig on mount. Toggling readOnly
 *   creates a new useMemo config but Composer ignores it — the editor gets
 *   stuck in whatever editable state it was created with. Mount/unmount
 *   guarantees a clean Lexical instance with the latest content each time.
 *
 * PREVIEW MODE (Published Pages):
 *   - Uses LexicalStaticContent — a pure HTML renderer that parses Lexical
 *     JSON and outputs real HTML elements (<h1>, <p>, <ul>, <a>, etc.)
 *   - No Lexical runtime loaded — zero JS, zero flash, zero layout shift
 *   - Content is in the initial SSR HTML — fully crawlable by search engines
 *   - Tailwind classes match editorTheme exactly so styling is pixel-identical
 *
 * WHY NOT use RichTextEditor in readOnly mode for preview?
 *   - Lexical renders content via client-side DOM manipulation
 *   - During SSR, Lexical outputs an empty div — no content in HTML
 *   - Browser shows empty space until React hydrates → visible flash
 *   - Search engines can't crawl content that only exists after JS execution
 *
 * ============================================================================
 */

'use client'

import React, {
  memo,
  useState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { ReactReduxContext } from 'react-redux'
import { RichTextEditor } from '@/components/editor'
import type {
  RichTextElement,
  ResizeHandle,
} from '../../_lib/types'
import {
  useRenderMode,
  useBuilderContextSafe,
  updateElement,
  getStyleValue,
  computeElementPositionStyles,
  useElementSizeStyles,
} from '../../_lib'
import type { AppDispatch } from '../../_lib'

// ============================================================================
// LEXICAL STATIC CONTENT RENDERER
// ============================================================================
//
// Parses Lexical serialized JSON and renders it as native HTML elements.
// No Lexical runtime needed — works during SSR, crawlable by search engines.
//
// Tailwind classes are copied from editorTheme (src/components/editor/theme.ts)
// so the static output is visually identical to Lexical's live render.
// ============================================================================

/**
 * Lexical text format bitmask values.
 * SOURCE OF TRUTH: Lexical core (lexical/src/LexicalConstants.ts)
 */
const IS_BOLD = 1
const IS_ITALIC = 2
const IS_STRIKETHROUGH = 4
const IS_UNDERLINE = 8
const IS_CODE = 16
const IS_SUBSCRIPT = 32
const IS_SUPERSCRIPT = 64

/**
 * Heading tag → Tailwind class mapping.
 * Matches editorTheme.heading from theme.ts exactly.
 */
const HEADING_CLASSES: Record<string, string> = {
  h1: 'text-3xl font-bold text-foreground mt-6 mb-4 first:mt-0',
  h2: 'text-2xl font-semibold text-foreground mt-5 mb-3 first:mt-0',
  h3: 'text-xl font-semibold text-foreground mt-4 mb-2 first:mt-0',
  h4: 'text-lg font-medium text-foreground mt-3 mb-2 first:mt-0',
  h5: 'text-base font-medium text-foreground mt-2 mb-1 first:mt-0',
  h6: 'text-sm font-medium text-muted-foreground mt-2 mb-1 first:mt-0',
}

/** Matches editorTheme.paragraph */
const PARAGRAPH_CLASS = 'relative m-0 text-foreground leading-relaxed'

/** Matches editorTheme.link */
const LINK_CLASS = 'text-primary underline decoration-primary/30 hover:decoration-primary transition-colors cursor-pointer'

/** Matches editorTheme.quote */
const QUOTE_CLASS = 'relative m-0 ml-0 my-3 pl-4 border-l-4 border-border text-muted-foreground italic'

/** Matches editorTheme.code (block-level) */
const CODE_BLOCK_CLASS = 'block bg-muted/50 rounded-lg p-4 font-mono text-sm overflow-x-auto border border-border my-3'

/** Matches editorTheme.hr */
const HR_CLASS = 'my-6 border-none h-px bg-border'

/** Matches editorTheme.list */
const UL_CLASS = 'list-disc list-outside p-0 m-0 ml-5'
const OL_CLASS = 'list-decimal list-outside p-0 m-0 ml-5'
const LI_CLASS = 'my-1 leading-relaxed'

/** Matches editorTheme.image */
const IMAGE_CLASS = 'inline-block cursor-default max-w-full'

/**
 * Lexical element node format → CSS text-align mapping.
 * SOURCE OF TRUTH: Lexical core (lexical/src/LexicalConstants.ts)
 * 0 = default (no alignment), 1 = left, 2 = center, 3 = right, 4 = justify, 5 = start, 6 = end
 */
const ELEMENT_FORMAT_TO_ALIGN: Record<number, string> = {
  1: 'left',
  2: 'center',
  3: 'right',
  4: 'justify',
  5: 'start',
  6: 'end',
}

/** Lexical indent base value — matches editorTheme.indent */
const INDENT_PX = 24

/**
 * Parses a CSS style string (e.g., "color: red; font-size: 20px;") into
 * a React.CSSProperties object. Handles camelCase conversion for CSS properties.
 *
 * WHY: Lexical text nodes store inline styles (color, font-size, background-color, etc.)
 * as a CSS string in the `style` property. We need to convert this to a React style object.
 */
function parseCssString(css: string): React.CSSProperties {
  if (!css) return {}
  const styles: Record<string, string> = {}
  const declarations = css.split(';')
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':')
    if (colonIdx === -1) continue
    const prop = decl.slice(0, colonIdx).trim()
    const value = decl.slice(colonIdx + 1).trim()
    if (!prop || !value) continue
    /** Convert kebab-case to camelCase (e.g., font-size → fontSize) */
    const camelProp = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    styles[camelProp] = value
  }
  return styles as React.CSSProperties
}

/**
 * Builds inline styles for block-level nodes based on Lexical's format (text-align)
 * and indent (padding-left) properties.
 *
 * WHY: Lexical stores text alignment as a numeric format enum and indentation as a
 * level number on element nodes. Without applying these, centered/right-aligned text
 * and indented content loses its positioning in the static renderer.
 */
function getBlockStyles(node: Record<string, unknown>): React.CSSProperties | undefined {
  const format = node.format as number | string | undefined
  const indent = node.indent as number | undefined
  const direction = node.direction as string | undefined

  const styles: React.CSSProperties = {}
  let hasStyles = false

  /**
   * Lexical v0.39.0+ serializes element format as a STRING ('center', 'right', etc.)
   * instead of a number (2, 3, etc.). We handle both for backward compatibility
   * with any content serialized by older Lexical versions.
   */
  if (format) {
    const align = typeof format === 'string'
      ? format  // Already a CSS text-align value
      : ELEMENT_FORMAT_TO_ALIGN[format]
    if (align) {
      styles.textAlign = align as React.CSSProperties['textAlign']
      hasStyles = true
    }
  }

  if (indent && indent > 0) {
    styles.paddingInlineStart = `${indent * INDENT_PX}px`
    hasStyles = true
  }

  if (direction === 'rtl') {
    styles.direction = 'rtl'
    hasStyles = true
  }

  return hasStyles ? styles : undefined
}

/**
 * Wraps a text string with formatting elements based on the Lexical format bitmask.
 * Applies bold, italic, underline, strikethrough, code, sub, sup in the same
 * order Lexical applies them — ensuring identical DOM structure.
 *
 * Also applies inline CSS styles (color, font-size, etc.) from the Lexical `style` property.
 */
function formatText(text: string, format: number, style?: string): React.ReactNode {
  let node: React.ReactNode = text

  if (format & IS_BOLD) node = <strong className="font-bold">{node}</strong>
  if (format & IS_ITALIC) node = <em className="italic">{node}</em>
  if (format & IS_UNDERLINE) node = <span className="underline">{node}</span>
  if (format & IS_STRIKETHROUGH) node = <span className="line-through">{node}</span>
  if (format & IS_CODE) {
    node = <code className="font-mono text-[0.9em] bg-muted px-1.5 py-0.5 rounded-sm text-foreground">{node}</code>
  }
  if (format & IS_SUBSCRIPT) node = <sub className="text-[0.8em] align-sub">{node}</sub>
  if (format & IS_SUPERSCRIPT) node = <sup className="text-[0.8em] align-super">{node}</sup>

  /** Apply inline CSS styles (color, font-size, background-color, etc.) if present */
  if (style) {
    const inlineStyles = parseCssString(style)
    if (Object.keys(inlineStyles).length > 0) {
      node = <span style={inlineStyles}>{node}</span>
    }
  }

  return node
}

/**
 * Recursively renders a single Lexical serialized node as React elements.
 * Handles all common node types: text, paragraph, heading, list, link,
 * quote, code block, image, horizontal rule, and linebreak.
 *
 * Unknown node types are skipped gracefully — no crashes from custom nodes.
 */
function renderNode(node: Record<string, unknown>, index: number): React.ReactNode {
  const type = node.type as string
  const children = node.children as Record<string, unknown>[] | undefined

  /** Recursively render all child nodes */
  const renderChildren = () =>
    children?.map((child, i) => renderNode(child, i)) ?? null

  switch (type) {
    // --- Root container — just render children ---
    case 'root':
      return <React.Fragment key={index}>{renderChildren()}</React.Fragment>

    // --- Block-level text nodes (with text-align + indent support) ---

    case 'paragraph': {
      const blockStyle = getBlockStyles(node)
      return <p key={index} className={PARAGRAPH_CLASS} style={blockStyle}>{renderChildren()}</p>
    }

    case 'heading': {
      const tag = (node.tag as string) || 'h2'
      const cls = HEADING_CLASSES[tag] ?? HEADING_CLASSES.h2
      const blockStyle = getBlockStyles(node)
      const kids = renderChildren()
      if (tag === 'h1') return <h1 key={index} className={cls} style={blockStyle}>{kids}</h1>
      if (tag === 'h3') return <h3 key={index} className={cls} style={blockStyle}>{kids}</h3>
      if (tag === 'h4') return <h4 key={index} className={cls} style={blockStyle}>{kids}</h4>
      if (tag === 'h5') return <h5 key={index} className={cls} style={blockStyle}>{kids}</h5>
      if (tag === 'h6') return <h6 key={index} className={cls} style={blockStyle}>{kids}</h6>
      return <h2 key={index} className={cls} style={blockStyle}>{kids}</h2>
    }

    case 'quote': {
      const blockStyle = getBlockStyles(node)
      return <blockquote key={index} className={QUOTE_CLASS} style={blockStyle}>{renderChildren()}</blockquote>
    }

    case 'code':
      return <pre key={index} className={CODE_BLOCK_CLASS}><code>{renderChildren()}</code></pre>

    // --- Lists ---

    case 'list': {
      const listType = node.listType as string
      const blockStyle = getBlockStyles(node)
      if (listType === 'number') {
        return <ol key={index} className={OL_CLASS} style={blockStyle}>{renderChildren()}</ol>
      }
      return <ul key={index} className={UL_CLASS} style={blockStyle}>{renderChildren()}</ul>
    }

    case 'listitem': {
      const blockStyle = getBlockStyles(node)
      /**
       * Lexical list items can be nested (contain another list node).
       * Check if first child is a list — if so, render without <li> wrapper
       * to match Lexical's DOM structure.
       */
      const hasNestedList = children?.some(
        (c) => (c.type as string) === 'list'
      )
      if (hasNestedList) {
        return <li key={index} className="list-none before:hidden after:hidden" style={blockStyle}>{renderChildren()}</li>
      }
      return <li key={index} className={LI_CLASS} style={blockStyle}>{renderChildren()}</li>
    }

    // --- Inline nodes ---

    case 'text': {
      const text = node.text as string
      const format = (node.format as number) || 0
      /** Inline CSS styles (color, font-size, background-color, etc.) set via toolbar */
      const style = node.style as string | undefined
      if (!text) return null

      /** No formatting and no inline styles — render as plain text */
      if (format === 0 && !style) {
        return <React.Fragment key={index}>{text}</React.Fragment>
      }

      /** Has formatting bitmask or inline styles — wrap with appropriate elements */
      if (format !== 0) {
        return <React.Fragment key={index}>{formatText(text, format, style)}</React.Fragment>
      }

      /** No format bitmask but has inline styles (e.g., just a color change) */
      const inlineStyles = parseCssString(style!)
      return <span key={index} style={inlineStyles}>{text}</span>
    }

    case 'link': {
      const url = node.url as string
      return (
        <a key={index} href={url} className={LINK_CLASS} target="_blank" rel="noopener noreferrer">
          {renderChildren()}
        </a>
      )
    }

    case 'autolink': {
      const url = node.url as string
      return (
        <a key={index} href={url} className={LINK_CLASS} target="_blank" rel="noopener noreferrer">
          {renderChildren()}
        </a>
      )
    }

    // --- Decorators / void nodes ---

    case 'linebreak':
      return <br key={index} />

    case 'horizontalrule':
      return <hr key={index} className={HR_CLASS} />

    case 'image': {
      const src = node.src as string
      const alt = (node.altText as string) || ''
      const width = node.width as number | undefined
      const height = node.height as number | undefined
      return (
        <img
          key={index}
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={IMAGE_CLASS}
          loading="lazy"
        />
      )
    }

    // --- Unknown node types — skip gracefully ---
    default:
      /** If it has children, render them to avoid losing nested content */
      if (children && children.length > 0) {
        return <div key={index}>{renderChildren()}</div>
      }
      return null
  }
}

/**
 * Static HTML renderer for Lexical JSON content.
 * Parses the serialized JSON string and renders native HTML elements.
 *
 * Used in preview/published mode instead of RichTextEditor to ensure:
 * - Content is in the SSR HTML (no flash, no layout shift)
 * - Content is crawlable by search engines (SEO)
 * - No Lexical JS runtime loaded (lighter pages)
 */
function LexicalStaticContent({ content }: { content: string }) {
  const parsed = useMemo(() => {
    try {
      const json = JSON.parse(content)
      return json.root as Record<string, unknown>
    } catch {
      return null
    }
  }, [content])

  if (!parsed) {
    /** Fallback: if content isn't valid Lexical JSON, render as plain text */
    return <p className={PARAGRAPH_CLASS}>{content}</p>
  }

  const children = parsed.children as Record<string, unknown>[] | undefined
  if (!children || children.length === 0) return null

  return <>{children.map((child, i) => renderNode(child, i))}</>
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedRichText component.
 *
 * SOURCE OF TRUTH: UnifiedRichTextProps
 *
 * Canvas-specific props (isSelected, isEditing, setIsEditing) are optional
 * because they are only used in canvas mode. In preview mode these are ignored.
 */
export interface UnifiedRichTextProps {
  /** The rich text element data — from Redux in canvas, from page data in preview */
  element: RichTextElement

  /** Whether this element is currently selected (canvas only) */
  isSelected?: boolean

  /** Whether this element is currently hovered (canvas only) */
  isHovered?: boolean

  /** Whether this element is inside a master component (canvas only) */
  isInsideMaster?: boolean

  /** Current viewport zoom level for UI scaling (canvas only) */
  zoom?: number

  /** Handler for drag start from useDrag hook (canvas only) */
  onDragStart?: (
    e: React.PointerEvent,
    elementId: string,
    isModifierHeld?: boolean
  ) => void

  /** Handler for resize start from useResize hook (canvas only) */
  onResizeStart?: (
    e: React.PointerEvent,
    elementId: string,
    handle: ResizeHandle
  ) => void

  /** Handler for mouse enter hover state (canvas only) */
  onHoverStart?: (elementId: string, isModifierHeld: boolean) => void

  /** Handler for mouse leave hover state (canvas only) */
  onHoverEnd?: (elementId: string) => void

  /**
   * External editing state — controlled by parent via useUnifiedRichTextMeta.
   * Shared with ElementWrapper so it can prevent drag and change cursor.
   */
  isEditing?: boolean

  /** Setter for the external editing state */
  setIsEditing?: Dispatch<SetStateAction<boolean>>
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified rich text element — full Lexical editor in website builder.
 *
 * CANVAS MODE: RichTextEditor with double-click-to-edit pattern.
 * PREVIEW MODE: LexicalStaticContent for instant SSR + SEO.
 */
export const UnifiedRichText = memo(function UnifiedRichText({
  element,
  isSelected = false,
  isEditing: externalIsEditing,
  setIsEditing: externalSetIsEditing,
}: UnifiedRichTextProps) {
  const { mode, breakpoint, organizationId: contextOrgId } = useRenderMode()
  const isCanvas = mode === 'canvas'

  /**
   * Resolve organizationId for editor features (image upload, storage browser).
   * - Canvas mode: RenderModeContext does NOT provide organizationId (it's a
   *   preview-only field), so we fall back to BuilderContext which always has it.
   * - Preview mode: organizationId comes from RenderModeContext (set by page renderer).
   *
   * Without this, all slash command actions that need organizationId (like /image → storage)
   * silently fail because organizationId is undefined.
   */
  const builderContext = useBuilderContextSafe()
  const organizationId = contextOrgId || builderContext?.organizationId

  // ========================================================================
  // INLINE EDITING STATE (canvas only)
  // ========================================================================

  const [internalIsEditing, internalSetIsEditing] = useState(false)
  const isEditing = externalIsEditing ?? internalIsEditing
  const setIsEditing = externalSetIsEditing ?? internalSetIsEditing

  /**
   * Track the latest content from Lexical onChange so we can save on deselect.
   * This avoids depending on onBlur which fires prematurely when clicking
   * toolbar buttons (toolbar is outside the ContentEditable).
   */
  const latestContentRef = useRef<string>(element.content)

  /**
   * Ref that receives the RichTextEditor's debounce flush function.
   * WHY: When the user clicks outside the element, the canvas marquee handler
   * calls e.preventDefault() on pointerdown which prevents blur from firing.
   * Without blur, the 500ms debounced onChange never flushes and inline-style
   * changes (color, font-size, etc.) are lost when the editor unmounts.
   * We call flushRef.current?.() in the deselect effect to guarantee all
   * pending changes reach Redux before the editor is torn down.
   *
   * SOURCE OF TRUTH: FLUSH_REF, DESELECT_SAVE, INLINE_STYLE_FIX
   */
  const flushRef = useRef<(() => void) | null>(null)

  /**
   * Redux dispatch — safe via ReactReduxContext (null in preview mode).
   * No-op fallback is safe because dispatch is only called in canvas paths.
   */
  const reduxCtx = useContext(ReactReduxContext)
  const dispatch = (reduxCtx?.store?.dispatch ?? (() => ({}))) as AppDispatch

  // ========================================================================
  // VISUAL PROPERTIES — CSS styles from element data
  // ========================================================================

  const backgroundColor = getStyleValue<string>(
    element,
    'backgroundColor',
    breakpoint,
    'transparent'
  )
  const color = getStyleValue<string>(element, 'color', breakpoint, 'inherit')
  const padding = getStyleValue<string>(element, 'padding', breakpoint, '8px')
  const borderRadius = getStyleValue<string | number>(
    element,
    'borderRadius',
    breakpoint,
    0
  )
  const opacity = getStyleValue<number>(element, 'opacity', breakpoint, 1)

  // ========================================================================
  // CANVAS-ONLY: SAVE + EXIT EDIT ON DESELECT
  // ========================================================================

  useEffect(() => {
    if (!isCanvas || !isEditing) return

    if (!isSelected) {
      /**
       * CRITICAL: Flush the RichTextEditor's debounce BEFORE reading latestContentRef.
       * WHY: The canvas marquee handler calls e.preventDefault() on pointerdown,
       * which prevents blur from firing on the contenteditable. Without blur,
       * the 500ms debounced onChange never flushes and latestContentRef still
       * holds stale content (without the most recent inline-style changes).
       * Calling flush() here forces the pending debounced content through
       * handleContentChange → updates latestContentRef + dispatches to Redux.
       */
      flushRef.current?.()

      const latest = latestContentRef.current
      if (latest !== element.content) {
        dispatch(
          updateElement({
            id: element.id,
            updates: { content: latest },
          })
        )
      }
      setIsEditing(false)
    }
  }, [isCanvas, isSelected, isEditing, setIsEditing, dispatch, element.id, element.content])

  // ========================================================================
  // CANVAS-ONLY: DOUBLE-CLICK TO ENTER EDIT MODE
  // ========================================================================

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isCanvas) return
      e.stopPropagation()
      e.preventDefault()
      setIsEditing(true)
    },
    [isCanvas, setIsEditing]
  )

  // ========================================================================
  // CANVAS-ONLY: CONTENT CHANGE HANDLER
  // ========================================================================

  const handleContentChange = useCallback(
    (content: string) => {
      if (!isCanvas) return
      latestContentRef.current = content
      dispatch(
        updateElement({
          id: element.id,
          updates: { content },
        })
      )
    },
    [isCanvas, dispatch, element.id]
  )

  // ========================================================================
  // CANVAS-ONLY: STOP POINTER EVENTS FROM BUBBLING TO CANVAS
  // ========================================================================

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isCanvas && isEditing) {
        e.stopPropagation()
      }
    },
    [isCanvas, isEditing]
  )

  // ========================================================================
  // CONTAINER STYLES — Shared between canvas and preview
  // ========================================================================

  const containerStyles = useMemo(
    (): React.CSSProperties => ({
      width: '100%',
      height: '100%',
      backgroundColor,
      color,
      padding,
      borderRadius:
        typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
      opacity,
      overflow: 'auto',
      position: 'relative',
    }),
    [backgroundColor, color, padding, borderRadius, opacity]
  )

  // ========================================================================
  // PREVIEW MODE — Static HTML renderer (SSR-safe, SEO-friendly)
  // ========================================================================

  if (!isCanvas) {
    const isRoot = element.parentId === null
    const positionStyles = computeElementPositionStyles(
      element,
      isRoot,
      breakpoint
    )
    const sizeStyles = useElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: true,
    })

    return (
      <div
        data-rich-text-renderer
        data-element-id={element.id}
        style={{
          ...positionStyles,
          ...sizeStyles,
        }}
      >
        <div style={containerStyles} data-rich-text-body>
          {element.content ? (
            <LexicalStaticContent content={element.content} />
          ) : null}
        </div>
      </div>
    )
  }

  // ========================================================================
  // CANVAS MODE — Fresh Lexical editor per edit session
  // ========================================================================
  //
  // WHY mount/unmount instead of toggling readOnly?
  //   LexicalComposer only reads `initialConfig` on mount. Toggling readOnly
  //   creates a new config via useMemo but the existing Composer ignores it —
  //   the editor stays stuck in whatever editable state it was created with.
  //   By unmounting between sessions, each edit gets a clean Lexical instance
  //   initialized with the latest content.
  //
  // NOT editing → LexicalStaticContent (same renderer as preview, lightweight)
  // Editing     → fresh RichTextEditor with readOnly=false
  // ========================================================================

  const editorVariant = element.editorVariant ?? 'standard'

  return (
    <div
      style={{ ...containerStyles, transition: 'none' }}
      data-rich-text-body
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
    >
      {isEditing ? (
        /**
         * Fresh Lexical editor instance — unmounted on deselect, remounted on next double-click.
         *
         * onBlur is CRITICAL here: RichTextEditor debounces onChange by 500ms.
         * If the user applies an inline style (color, font-size, etc.) and clicks
         * another element within that 500ms window, the debounced onChange hasn't
         * fired yet — so handleContentChange was never called and latestContentRef
         * still has stale content. On unmount, the debounce cleanup clears the
         * timer WITHOUT flushing, and the styled content is lost.
         *
         * Passing onBlur makes RichTextEditor's handleBlur call flush() first
         * (which forces pending debounced content out to onChange immediately),
         * then call onBlur with the latest content. This guarantees styled content
         * is saved to Redux BEFORE the deselect effect runs setIsEditing(false).
         *
         * The floating toolbar prevents blur via mousedown.preventDefault(), so
         * onBlur only fires when clicking OUTSIDE the editor — exactly when we
         * need to save.
         */
        <RichTextEditor
          initialContent={element.content || undefined}
          onChange={handleContentChange}
          onBlur={handleContentChange}
          flushRef={flushRef}
          variant={editorVariant}
          readOnly={false}
          autoFocus
          placeholder="Start typing your content..."
          className="border-none shadow-none bg-transparent p-0"
          contentClassName="min-h-0 p-0"
          organizationId={organizationId}
          showFontFamily
        />
      ) : element.content ? (
        /* Static HTML when not editing — lightweight, no Lexical runtime */
        <LexicalStaticContent content={element.content} />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground/50 text-sm select-none pointer-events-none">
          Double-click to edit rich text
        </div>
      )}
    </div>
  )
})

// ============================================================================
// CANVAS HELPER — Provides sizeStyleOverrides + isEditing for ElementWrapper
// ============================================================================

/**
 * Hook to compute the size style overrides and editing state that
 * ElementWrapper needs when wrapping a UnifiedRichText component.
 *
 * Separated from the component because ElementWrapper needs these values
 * as PROPS. The parent canvas wrapper calls this hook and passes results
 * to both ElementWrapper (sizeStyles, isEditing) and UnifiedRichText
 * (isEditing, setIsEditing).
 */
export function useUnifiedRichTextMeta(element: RichTextElement) {
  /**
   * Inline editing state — shared between UnifiedRichText and ElementWrapper.
   * ElementWrapper uses it to prevent drag and switch cursor.
   * UnifiedRichText uses it to toggle readOnly on/off.
   */
  const [isEditing, setIsEditing] = useState(false)

  /**
   * Size styles for the rich text element.
   * autoHeight defaults to true (content grows with text),
   * autoWidth defaults to false (fixed pixel width unless fill is set).
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: true,
  })

  return { sizeStyles, isEditing, setIsEditing }
}
