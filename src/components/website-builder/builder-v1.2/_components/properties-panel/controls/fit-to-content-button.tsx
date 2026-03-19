/**
 * ========================================
 * FIT TO CONTENT BUTTON - Properties Panel
 * ========================================
 *
 * A helper button that snaps a text element's dimensions to perfectly
 * fit its content. Measures the natural size of the text and updates
 * the element's width and height accordingly.
 *
 * HOW IT WORKS:
 * 1. Creates a temporary off-screen element with identical styles
 * 2. Measures the scrollWidth and scrollHeight of the content
 * 3. Updates the element's width/height to match
 *
 * This is useful when users draw a text box too large and want to
 * quickly shrink it to fit the actual text content.
 */

'use client'

import { useCallback } from 'react'
import { Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TextElement } from '../../../_lib/types'

interface FitToContentButtonProps {
  /** The text element to fit */
  element: TextElement
  /** Callback to update the element's dimensions */
  onFit: (width: number, height: number) => void
}

/**
 * Button that calculates and applies the optimal size for a text element
 * based on its content and typography settings.
 */
export function FitToContentButton({ element, onFit }: FitToContentButtonProps) {
  /**
   * Measure the natural dimensions of the text content and update the element.
   *
   * APPROACH:
   * - Create a temporary div with the same typography settings
   * - Use 'auto' width to let text flow naturally (for width fit)
   * - Measure the resulting dimensions
   * - Add small padding to ensure text isn't clipped
   */
  const handleFitToContent = useCallback(() => {
    // Create a temporary measurement container
    const measureEl = document.createElement('div')

    // Get element styles with backwards compatibility
    const styles = element.styles ?? {}
    const padding = styles.padding ?? 0
    const paddingValue = typeof padding === 'number' ? padding : 0

    /**
     * Get typography values from styles with backwards compatibility.
     * MIGRATION NOTE: Typography has moved from element properties to styles.
     * - New location: element.styles.fontFamily, fontSize, etc.
     * - Legacy location: element.fontFamily, fontSize, etc. (deprecated)
     *
     * We cast to Record<string, unknown> to access deprecated properties without
     * triggering TypeScript deprecation warnings during the transition period.
     */
    const legacyProps = element as unknown as Record<string, unknown>
    const fontFamily = (styles.fontFamily ?? legacyProps.fontFamily ?? 'Inter') as string
    const fontSize = (styles.fontSize ?? legacyProps.fontSize ?? 16) as number
    const fontWeight = (styles.fontWeight ?? legacyProps.fontWeight ?? 400) as number | string
    const lineHeight = (styles.lineHeight ?? legacyProps.lineHeight ?? 1.5) as number
    const letterSpacing = (styles.letterSpacing ?? legacyProps.letterSpacing ?? 0) as number

    // Apply the same typography styles as the text element
    Object.assign(measureEl.style, {
      // Make it invisible but measurable
      position: 'absolute',
      visibility: 'hidden',
      // Use auto width to measure natural text width
      width: 'auto',
      height: 'auto',
      // Typography settings from styles (with backwards compatibility fallback)
      fontFamily: `"${fontFamily}", sans-serif`,
      fontSize: `${fontSize}px`,
      fontWeight: String(fontWeight),
      lineHeight: String(lineHeight),
      letterSpacing: `${letterSpacing}px`,
      // Text rendering
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word',
      // Padding from styles
      padding: `${paddingValue}px`,
      // Prevent any browser defaults from affecting measurement
      boxSizing: 'border-box',
      margin: '0',
    })

    // Set the text content
    measureEl.textContent = element.content || 'Text'

    // Add to document for measurement
    document.body.appendChild(measureEl)

    // Measure the natural dimensions
    const rect = measureEl.getBoundingClientRect()

    // Add a small buffer (2px) to prevent any edge clipping
    const newWidth = Math.ceil(rect.width) + 2
    const newHeight = Math.ceil(rect.height) + 2

    // Clean up
    document.body.removeChild(measureEl)

    // Apply the new dimensions (minimum 20px for usability)
    onFit(Math.max(newWidth, 20), Math.max(newHeight, 20))
  }, [element, onFit])

  return (
    <div className="flex items-center gap-2">
      <p className="text-sm text-muted-foreground w-10 shrink-0">Fit</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleFitToContent}
        className="flex-1 h-7 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground justify-start gap-2 px-2"
        title="Fit element size to content"
      >
        <Minimize2 className="h-3.5 w-3.5" />
        <span className="text-xs">Fit to Content</span>
      </Button>
    </div>
  )
}
