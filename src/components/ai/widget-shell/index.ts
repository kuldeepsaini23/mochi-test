/**
 * ============================================================================
 * AI WIDGET SHELL - BARREL EXPORTS
 * ============================================================================
 *
 * Public API for the shared AI widget shell module.
 * Used by both the Mochi dashboard widget and the Builder AI widget.
 *
 * SOURCE OF TRUTH KEYWORDS: AIWidgetShellExports
 * ============================================================================
 */

export { AIWidgetShell } from './ai-widget-shell'
export { WidgetInput } from './widget-input'
export { ResizeHandles } from './resize-handles'
export { useResize, getCursor } from './use-resize'
export { DEFAULT_DIMENSION_CONFIG } from './types'
export type {
  WidgetState,
  WidgetDimensions,
  WidgetDimensionConfig,
  AIWidgetShellProps,
  WidgetInputProps,
} from './types'
