/**
 * ============================================================================
 * AI WIDGET SHELL - SHARED TYPES
 * ============================================================================
 *
 * Shared type definitions for the AI widget shell used by both the Mochi
 * dashboard widget and the Builder AI widget. These are the canonical types
 * for widget state, dimensions, and shell props.
 *
 * SOURCE OF TRUTH KEYWORDS: AIWidgetShellTypes, WidgetState, WidgetDimensions,
 *   WidgetDimensionConfig, AIWidgetShellProps, WidgetInputProps
 * ============================================================================
 */

import type { ReactNode } from 'react'

// ============================================================================
// WIDGET STATE
// ============================================================================

/**
 * Widget expansion state.
 * - 'minimal': Compact bar with icon + simple input
 * - 'expanded': Full resizable panel with header, conversation, textarea input
 */
export type WidgetState = 'minimal' | 'expanded'

/**
 * Widget dimensions for the resizable expanded panel
 */
export interface WidgetDimensions {
  width: number
  height: number
}

// ============================================================================
// DIMENSION CONFIG
// ============================================================================

/**
 * Dimension configuration with default, min, and max values.
 * Consumers can override to change the resize constraints.
 */
export interface WidgetDimensionConfig {
  default: WidgetDimensions
  min: WidgetDimensions
  max: WidgetDimensions
}

/** Default dimension config — matches both Mochi and Builder widgets */
export const DEFAULT_DIMENSION_CONFIG: WidgetDimensionConfig = {
  default: { width: 400, height: 500 },
  min: { width: 320, height: 300 },
  max: { width: 600, height: 800 },
}

// ============================================================================
// SHELL PROPS
// ============================================================================

/**
 * Props for the AIWidgetShell — the shared UI container for AI widgets.
 *
 * The shell handles fixed positioning, minimal/expanded toggle, resize handles,
 * header bar, and glass styling. Domain-specific content (conversation, input,
 * submit handlers) is injected via slot props.
 */
export interface AIWidgetShellProps {
  /** Header text displayed in expanded mode ("Mochi AI", "AI Designer", etc.) */
  title: string
  /** Icon rendered in the header and minimal mode button (defaults to Sparkles) */
  icon?: ReactNode
  /** Extra action buttons in the header (e.g. "Clear Chat") — rendered before minimize/close */
  headerActions?: ReactNode
  /** Main content area — conversation component fills the scrollable middle */
  children: ReactNode
  /** Content rendered below conversation but above the input (e.g. suggested prompts) */
  preInputContent?: ReactNode
  /** Input component rendered in expanded mode (full textarea with controls) */
  expandedInput: ReactNode
  /** Input component for minimal mode (not currently rendered — kept for API compat) */
  minimalInput?: ReactNode
  /** Controlled widget state — 'minimal' or 'expanded' */
  widgetState: WidgetState
  /** Callback to change the widget state */
  onWidgetStateChange: (state: WidgetState) => void
  /** Close button handler — hides the widget entirely */
  onClose: () => void
  /** Whether to render the widget at all (default true) */
  visible?: boolean
  /** Override dimension config (default/min/max) */
  dimensions?: WidgetDimensionConfig
  /** Fixed-position CSS classes (default: 'bottom-4 right-4') */
  positionClassName?: string
  /** Width classes for the minimal container (default: 'w-fit') */
  minimalClassName?: string
  /** Optional extra className on the outermost wrapper */
  className?: string
  /**
   * Whether AI generation is actively in progress.
   * When true, renders a rotating rainbow gradient border with a subtle
   * glow effect around the expanded chat window.
   */
  isGenerating?: boolean
}

// ============================================================================
// WIDGET INPUT PROPS
// ============================================================================

/**
 * Props for the shared WidgetInput component.
 * Accepts a maxLength param instead of importing from domain modules.
 */
export interface WidgetInputProps {
  /** Current input value (controlled) */
  value: string
  /** Callback when value changes (controlled) */
  onChange: (value: string) => void
  /** Callback when prompt is submitted */
  onSubmit: (prompt: string) => void
  /** Whether the input is disabled (e.g. during streaming) */
  disabled?: boolean
  /** Placeholder text */
  placeholder?: string
  /** Whether to render the minimal (compact bar) variant */
  isMinimal?: boolean
  /** Currently selected AI gateway model ID */
  selectedModel?: string
  /** Callback when the user picks a different model */
  onModelChange?: (modelId: string) => void
  /** Max prompt character length (default 2000) */
  maxLength?: number
  /**
   * Callback to stop/abort the current AI generation.
   * When provided AND disabled is true, a stop button replaces the send button.
   */
  onStop?: () => void
  /** Optional className */
  className?: string
  /**
   * Currently attached images (controlled by parent).
   * Displayed as thumbnails above the action buttons.
   */
  imageAttachments?: ImageAttachmentPreview[]
  /** Callback when images are added or removed */
  onImagesChange?: (images: ImageAttachmentPreview[]) => void
}

/**
 * Lightweight image preview data for the widget input.
 * Matches MochiImageAttachment shape for pass-through to the AI hook.
 *
 * SOURCE OF TRUTH KEYWORDS: ImageAttachmentPreview, WidgetImagePreview
 */
export interface ImageAttachmentPreview {
  /** Unique ID for this attachment */
  id: string
  /** Base64-encoded image data (without data URI prefix) */
  base64: string
  /** IANA media type */
  mediaType: string
  /** Original filename */
  filename: string
  /** File size in bytes */
  size: number
}
