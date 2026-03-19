/**
 * ============================================================================
 * MOCHI AI - TYPE DEFINITIONS
 * ============================================================================
 *
 * Types for the Mochi AI streaming chat system.
 * Used by the API route, client hook, and widget components.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiAITypes, MochiMessage, MochiToolCall, MochiAIStatus,
 *   MochiImageAttachment, ChatImageAttachment
 * ============================================================================
 */

// ============================================================================
// IMAGE ATTACHMENT TYPES
// ============================================================================

/**
 * An image attached to a user message for AI vision analysis.
 * Stored as base64 for inline transmission to the AI model.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiImageAttachment, ChatImageAttachment
 */
export type MochiImageAttachment = {
  /** Unique ID for this attachment */
  id: string
  /** Base64-encoded image data (WITHOUT the data URI prefix) */
  base64: string
  /** IANA media type (e.g., 'image/png', 'image/jpeg') */
  mediaType: string
  /** Original filename */
  filename: string
  /** File size in bytes (for validation/display) */
  size: number
}

/** Allowed image MIME types for chat attachments */
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

/** Maximum number of images per message */
export const MAX_IMAGES_PER_MESSAGE = 5

/** Maximum single image size in bytes (4MB) */
export const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024

// ============================================================================
// STATUS TYPES
// ============================================================================

/**
 * Status of the streaming AI connection.
 *
 * Flow: idle → connecting → streaming → complete
 * Error path: any → error
 * Abort path: streaming → aborted
 */
export type MochiAIStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'aborted'

/**
 * Top-level state for the Mochi AI hook.
 * Tracks connection status and any error message.
 */
export type MochiAIState = {
  /** Current connection/streaming status */
  status: MochiAIStatus
  /** Error message if status is 'error' */
  error: string | null
  /** The prompt currently being processed */
  currentPrompt: string | null
}

// ============================================================================
// TOOL CALL TYPES
// ============================================================================

/**
 * Status of a single tool call within a message.
 *
 * Flow: pending → executing → complete
 * Error path: executing → error
 * Abort path: executing → cancelled (user clicked Stop mid-tool-call)
 */
export type MochiToolCallStatus = 'pending' | 'executing' | 'complete' | 'error' | 'cancelled'

/**
 * Represents a single tool call made by the AI during a response.
 * Each tool call has its own lifecycle tracked by status.
 */
export type MochiToolCall = {
  /** Unique ID for this tool invocation (from the AI SDK) */
  toolCallId: string
  /** Name of the tool being called (e.g., 'createLead', 'listTags') */
  toolName: string
  /** Arguments passed to the tool */
  args: Record<string, unknown>
  /** Result returned by the tool (populated when status is 'complete') */
  result?: Record<string, unknown>
  /** Current execution status */
  status: MochiToolCallStatus
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

/**
 * A single message in the Mochi AI conversation.
 *
 * User messages have just content.
 * Assistant messages may also include tool calls and streaming state.
 */
export type MochiMessage = {
  /** Unique message ID */
  id: string
  /** Who sent this message */
  role: 'user' | 'assistant'
  /** Text content of the message */
  content: string
  /** Tool calls made during this assistant message */
  toolCalls?: MochiToolCall[]
  /** Whether this message is currently being streamed */
  isStreaming?: boolean
  /** When this message was created */
  timestamp: Date
  /**
   * Flag indicating this assistant message generated ui-spec content.
   * NOT displayed in the chat — only used when building API messages
   * to remind the AI it previously generated JSONL patches so it
   * continues using ui-spec fences on subsequent messages.
   *
   * SOURCE OF TRUTH KEYWORDS: UISpecGeneratedFlag
   */
  _uiSpecGenerated?: boolean
  /**
   * Image attachments on user messages for AI vision analysis.
   * Only present on user-role messages when the user attached images.
   */
  imageAttachments?: MochiImageAttachment[]
}

// ============================================================================
// HUMAN-IN-THE-LOOP TYPES
// ============================================================================

/**
 * When the AI needs user input, it returns this shape via the askUser tool.
 * The UI renders option buttons + a custom text input.
 */
export type MochiHumanInput = {
  /** The question being asked */
  question: string
  /** Quick-select options the user can click */
  options?: string[]
}

// ============================================================================
// HOOK RETURN TYPE
// ============================================================================

/**
 * Return type of the useMochiAI hook.
 * Provides state, message history, and control functions.
 */
export type UseMochiAIResult = {
  /** Current AI status and error state */
  state: MochiAIState
  /** Full conversation message history */
  messages: MochiMessage[]
  /** Send a new message to the AI, with optional extra context and image attachments */
  send: (prompt: string, extraContext?: string, images?: MochiImageAttachment[]) => Promise<void>
  /**
   * Abort the current streaming response.
   * @param options.silent - When true, suppresses state updates from the abort
   *   so they don't interfere with concurrent React transitions (e.g., router.push).
   */
  abort: (options?: { silent?: boolean }) => void
  /** Reset state to idle (does not clear messages) */
  reset: () => void
  /** Clear all messages and reset state */
  clearMessages: () => void
  /**
   * Synchronously update the hook's internal backgroundMode ref.
   * Call this BEFORE send() when background mode changes to ensure the
   * streaming loop has the correct value immediately, without waiting
   * for React's next re-render cycle.
   */
  setBackgroundModeImmediate: (active: boolean) => void
}
