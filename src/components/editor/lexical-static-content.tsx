/**
 * ============================================================================
 * LEXICAL STATIC CONTENT — Zero-Runtime HTML Renderer for Lexical JSON
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: LexicalStaticContent, StaticRichText, InstantRichText
 *
 * WHY: Renders Lexical serialized JSON as pure native HTML elements — no Lexical
 * runtime, no LexicalComposer, no hydration delay. Content appears in the very
 * first paint (SSR-safe), is fully crawlable by search engines, and has zero JS
 * overhead beyond the initial JSON.parse.
 *
 * HOW: JSON.parse → recursive renderNode() → React elements (<h1>, <p>, <ul>, etc.)
 * Tailwind classes are copied from editorTheme (src/components/editor/theme.ts)
 * so the static output is visually identical to Lexical's live render.
 *
 * WHEN TO USE:
 * - Read-only rich text that must render instantly (template previews, detail pages)
 * - SSR pages where content must be in the initial HTML
 * - Anywhere ContentPreview or RichTextEditor readOnly is too slow
 *
 * EXTRACTED FROM: unified-rich-text.tsx (website builder) for reuse across the app.
 */

import React, { useMemo } from 'react'

// ============================================================================
// LEXICAL FORMAT BITMASK CONSTANTS
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

// ============================================================================
// TAILWIND CLASS CONSTANTS — Matching editorTheme from theme.ts
// ============================================================================

/** Heading tag → Tailwind class mapping. Matches editorTheme.heading */
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
const LINK_CLASS =
  'text-primary underline decoration-primary/30 hover:decoration-primary transition-colors cursor-pointer'

/** Matches editorTheme.quote */
const QUOTE_CLASS =
  'relative m-0 ml-0 my-3 pl-4 border-l-4 border-border text-muted-foreground italic'

/** Matches editorTheme.code (block-level) */
const CODE_BLOCK_CLASS =
  'block bg-muted/50 rounded-lg p-4 font-mono text-sm overflow-x-auto border border-border my-3'

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
 * 0 = default (no alignment), 1 = left, 2 = center, 3 = right, 4 = justify
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

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parses a CSS style string (e.g., "color: red; font-size: 20px;") into
 * a React.CSSProperties object. Handles camelCase conversion for CSS properties.
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
 */
function getBlockStyles(
  node: Record<string, unknown>
): React.CSSProperties | undefined {
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
 */
function formatText(
  text: string,
  format: number,
  style?: string
): React.ReactNode {
  let node: React.ReactNode = text

  if (format & IS_BOLD) node = <strong className="font-bold">{node}</strong>
  if (format & IS_ITALIC) node = <em className="italic">{node}</em>
  if (format & IS_UNDERLINE) node = <span className="underline">{node}</span>
  if (format & IS_STRIKETHROUGH)
    node = <span className="line-through">{node}</span>
  if (format & IS_CODE) {
    node = (
      <code className="font-mono text-[0.9em] bg-muted px-1.5 py-0.5 rounded-sm text-foreground">
        {node}
      </code>
    )
  }
  if (format & IS_SUBSCRIPT)
    node = <sub className="text-[0.8em] align-sub">{node}</sub>
  if (format & IS_SUPERSCRIPT)
    node = <sup className="text-[0.8em] align-super">{node}</sup>

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
function renderNode(
  node: Record<string, unknown>,
  index: number
): React.ReactNode {
  const type = node.type as string
  const children = node.children as Record<string, unknown>[] | undefined

  /** Recursively render all child nodes */
  const renderChildren = () =>
    children?.map((child, i) => renderNode(child, i)) ?? null

  switch (type) {
    case 'root':
      return <React.Fragment key={index}>{renderChildren()}</React.Fragment>

    case 'paragraph': {
      const blockStyle = getBlockStyles(node)
      return (
        <p key={index} className={PARAGRAPH_CLASS} style={blockStyle}>
          {renderChildren()}
        </p>
      )
    }

    case 'heading': {
      const tag = (node.tag as string) || 'h2'
      const cls = HEADING_CLASSES[tag] ?? HEADING_CLASSES.h2
      const blockStyle = getBlockStyles(node)
      const kids = renderChildren()
      if (tag === 'h1')
        return (
          <h1 key={index} className={cls} style={blockStyle}>
            {kids}
          </h1>
        )
      if (tag === 'h3')
        return (
          <h3 key={index} className={cls} style={blockStyle}>
            {kids}
          </h3>
        )
      if (tag === 'h4')
        return (
          <h4 key={index} className={cls} style={blockStyle}>
            {kids}
          </h4>
        )
      if (tag === 'h5')
        return (
          <h5 key={index} className={cls} style={blockStyle}>
            {kids}
          </h5>
        )
      if (tag === 'h6')
        return (
          <h6 key={index} className={cls} style={blockStyle}>
            {kids}
          </h6>
        )
      return (
        <h2 key={index} className={cls} style={blockStyle}>
          {kids}
        </h2>
      )
    }

    case 'quote': {
      const blockStyle = getBlockStyles(node)
      return (
        <blockquote key={index} className={QUOTE_CLASS} style={blockStyle}>
          {renderChildren()}
        </blockquote>
      )
    }

    case 'code':
      return (
        <pre key={index} className={CODE_BLOCK_CLASS}>
          <code>{renderChildren()}</code>
        </pre>
      )

    case 'list': {
      const listType = node.listType as string
      const blockStyle = getBlockStyles(node)
      if (listType === 'number') {
        return (
          <ol key={index} className={OL_CLASS} style={blockStyle}>
            {renderChildren()}
          </ol>
        )
      }
      return (
        <ul key={index} className={UL_CLASS} style={blockStyle}>
          {renderChildren()}
        </ul>
      )
    }

    case 'listitem': {
      const blockStyle = getBlockStyles(node)
      /** Nested list items — Lexical wraps sub-lists inside <li> */
      const hasNestedList = children?.some(
        (c) => (c.type as string) === 'list'
      )
      if (hasNestedList) {
        return (
          <li
            key={index}
            className="list-none before:hidden after:hidden"
            style={blockStyle}
          >
            {renderChildren()}
          </li>
        )
      }
      return (
        <li key={index} className={LI_CLASS} style={blockStyle}>
          {renderChildren()}
        </li>
      )
    }

    case 'text': {
      const text = node.text as string
      const format = (node.format as number) || 0
      const style = node.style as string | undefined
      if (!text) return null

      if (format === 0 && !style) {
        return <React.Fragment key={index}>{text}</React.Fragment>
      }

      if (format !== 0) {
        return (
          <React.Fragment key={index}>
            {formatText(text, format, style)}
          </React.Fragment>
        )
      }

      const inlineStyles = parseCssString(style!)
      return (
        <span key={index} style={inlineStyles}>
          {text}
        </span>
      )
    }

    case 'link': {
      const url = node.url as string
      return (
        <a
          key={index}
          href={url}
          className={LINK_CLASS}
          target="_blank"
          rel="noopener noreferrer"
        >
          {renderChildren()}
        </a>
      )
    }

    case 'autolink': {
      const url = node.url as string
      return (
        <a
          key={index}
          href={url}
          className={LINK_CLASS}
          target="_blank"
          rel="noopener noreferrer"
        >
          {renderChildren()}
        </a>
      )
    }

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

    default:
      /** If unknown node has children, render them to avoid losing nested content */
      if (children && children.length > 0) {
        return <div key={index}>{renderChildren()}</div>
      }
      return null
  }
}

// ============================================================================
// PROPS
// ============================================================================

export interface LexicalStaticContentProps {
  /** Lexical serialized JSON string — or plain text fallback */
  content: string
  /** Optional className applied to the wrapper div */
  className?: string
  /** Optional max height with overflow hidden */
  maxHeight?: number
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Static HTML renderer for Lexical JSON content.
 * Parses the serialized JSON string and renders native HTML elements — zero
 * Lexical JS runtime, instant mount, SSR-safe.
 *
 * Falls back to plain text paragraph if the content is not valid Lexical JSON.
 */
export function LexicalStaticContent({
  content,
  className,
  maxHeight,
}: LexicalStaticContentProps) {
  /** Parse once and memoize — only re-parses when content changes */
  const parsed = useMemo(() => {
    try {
      const json = JSON.parse(content)
      return json.root as Record<string, unknown>
    } catch {
      return null
    }
  }, [content])

  /** Wrapper styles — optional max height with overflow */
  const wrapperStyle: React.CSSProperties | undefined = maxHeight
    ? { maxHeight, overflow: 'hidden' }
    : undefined

  /** Not valid Lexical JSON — render as plain text */
  if (!parsed) {
    return (
      <div className={className} style={wrapperStyle}>
        <p className={PARAGRAPH_CLASS}>{content}</p>
      </div>
    )
  }

  const children = parsed.children as Record<string, unknown>[] | undefined
  if (!children || children.length === 0) return null

  return (
    <div className={className} style={wrapperStyle}>
      {children.map((child, i) => renderNode(child, i))}
    </div>
  )
}
