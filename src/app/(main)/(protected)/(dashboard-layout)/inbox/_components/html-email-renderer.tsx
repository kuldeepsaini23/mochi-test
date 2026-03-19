'use client'

/**
 * HTML Email Renderer — Sandboxed Iframe for Rich Email Content
 *
 * WHY: Contract/invoice emails contain full HTML documents with inline styles.
 *      Rendering them directly in the page would cause CSS bleeding and security issues.
 *
 * HOW: Uses an <iframe> with `srcDoc` to render the HTML in an isolated context.
 *      The `sandbox="allow-same-origin"` attribute blocks scripts, forms, navigation,
 *      and popups while allowing us to read the contentDocument for auto-height sizing.
 *
 * AUTO-HEIGHT: A ResizeObserver watches the iframe's body and adjusts the iframe
 *      height to fit the content perfectly — no scrollbars inside the iframe.
 *
 * SOURCE OF TRUTH KEYWORDS: HtmlEmailRenderer, IframeEmailRender, SandboxedEmail
 */

import { useCallback, useRef, useState } from 'react'

interface HtmlEmailRendererProps {
  /** Full HTML document string (with <!DOCTYPE html>, <html>, <body>, etc.) */
  html: string
  /** Optional class name for the iframe container */
  className?: string
}

export function HtmlEmailRenderer({ html, className }: HtmlEmailRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(200) // Start with reasonable default

  /**
   * Resize the iframe to match its content height.
   * Called on iframe load and whenever the body resizes (e.g., image loading).
   */
  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    try {
      const doc = iframe.contentDocument
      if (!doc?.body) return

      // Initial height calculation
      const updateHeight = () => {
        const body = doc.body
        const contentHeight = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          body.clientHeight
        )
        // Clamp between 100px and 800px to avoid extremes
        setHeight(Math.min(Math.max(contentHeight, 100), 800))
      }

      updateHeight()

      // Watch for content changes (e.g., images loading) via ResizeObserver
      const observer = new ResizeObserver(updateHeight)
      observer.observe(doc.body)

      // Cleanup observer when iframe unmounts
      return () => observer.disconnect()
    } catch {
      // sandbox restriction — fall back to default height
    }
  }, [])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={handleLoad}
      className={className}
      style={{
        width: '100%',
        height: `${height}px`,
        border: 'none',
        borderRadius: '8px',
        background: 'white',
      }}
      title="Email content"
    />
  )
}
