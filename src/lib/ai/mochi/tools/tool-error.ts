/**
 * ============================================================================
 * MOCHI AI TOOLS - SHARED ERROR HANDLER
 * ============================================================================
 *
 * Centralized error handling for all Mochi AI tool execute() functions.
 * Extracts structured error codes from tRPC errors and maps them to
 * human-friendly messages the AI can reason about and relay to users.
 *
 * WHY: Without this, raw Prisma/tRPC errors propagate into the chat
 * (e.g. "Foreign key constraint violated") which are meaningless to users.
 * This handler normalizes every error into a consistent ToolErrorResult
 * with a categorized errorCode and a plain-English message.
 *
 * SOURCE OF TRUTH KEYWORDS: ToolErrorHandler, MochiToolError, HandleToolError
 * ============================================================================
 */

import type { StructuredErrorCause, ErrorCode } from '@/lib/errors/error-codes'
import { ERROR_CODES } from '@/lib/errors/error-codes'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Categorized error codes that the AI can use to decide next steps.
 * Maps from the granular ErrorCode (20+ codes) to a smaller set
 * the AI can reliably branch on.
 */
export type ToolErrorCode =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'VALIDATION_ERROR'
  | 'LIMIT_REACHED'
  | 'STRIPE_REQUIRED'
  | 'UNKNOWN'

/**
 * Standardized error result returned from every tool's catch block.
 * The AI sees { success: false, message, errorCode } and can
 * generate an appropriate user-facing explanation.
 */
export interface ToolErrorResult {
  success: false
  message: string
  errorCode: ToolErrorCode
}

// ============================================================================
// ERROR CODE MAPPING
// ============================================================================

/**
 * Maps structured tRPC error codes to the simplified ToolErrorCode categories.
 * Grouped by domain so new error codes are easy to slot in.
 */
const ERROR_CODE_MAP: Partial<Record<ErrorCode, ToolErrorCode>> = {
  /* Permission / auth errors */
  [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 'PERMISSION_DENIED',
  [ERROR_CODES.NOT_ORGANIZATION_MEMBER]: 'PERMISSION_DENIED',
  [ERROR_CODES.PORTAL_ACCESS_DENIED]: 'PERMISSION_DENIED',
  [ERROR_CODES.PORTAL_ADMIN_INACTIVE]: 'PERMISSION_DENIED',

  /* Validation errors */
  [ERROR_CODES.VALIDATION_ERROR]: 'VALIDATION_ERROR',
  [ERROR_CODES.ONBOARDING_INCOMPLETE]: 'VALIDATION_ERROR',

  /* Feature / usage limit errors */
  [ERROR_CODES.FEATURE_NOT_AVAILABLE]: 'LIMIT_REACHED',
  [ERROR_CODES.USAGE_LIMIT_REACHED]: 'LIMIT_REACHED',
  [ERROR_CODES.INSUFFICIENT_CREDITS]: 'LIMIT_REACHED',

  /* Stripe / payment errors */
  [ERROR_CODES.STRIPE_NOT_CONNECTED]: 'STRIPE_REQUIRED',
  [ERROR_CODES.PAYMENT_METHOD_REQUIRED]: 'STRIPE_REQUIRED',
}

// ============================================================================
// HELPER — EXTRACT STRUCTURED CAUSE
// ============================================================================

/**
 * Attempts to extract a StructuredErrorCause from a tRPC error.
 *
 * tRPC errors wrap the original cause in `err.cause` — our structured
 * errors include an `errorCode` field from ERROR_CODES. This function
 * safely navigates the error chain to find that structured data.
 */
function extractStructuredCause(err: unknown): StructuredErrorCause | null {
  if (!err || typeof err !== 'object') return null

  /** Direct check — err itself may be a structured cause */
  if ('errorCode' in err && typeof (err as Record<string, unknown>).errorCode === 'string') {
    return err as StructuredErrorCause
  }

  /** tRPC wraps the cause — check err.cause */
  const withCause = err as { cause?: unknown }
  if (withCause.cause && typeof withCause.cause === 'object') {
    if ('errorCode' in withCause.cause && typeof (withCause.cause as Record<string, unknown>).errorCode === 'string') {
      return withCause.cause as StructuredErrorCause
    }

    /** Double-nested: tRPC TRPCError -> cause -> cause (some middleware layers) */
    const nestedCause = withCause.cause as { cause?: unknown }
    if (nestedCause.cause && typeof nestedCause.cause === 'object') {
      if ('errorCode' in nestedCause.cause && typeof (nestedCause.cause as Record<string, unknown>).errorCode === 'string') {
        return nestedCause.cause as StructuredErrorCause
      }
    }
  }

  return null
}

// ============================================================================
// HUMAN-FRIENDLY MESSAGE BUILDERS
// ============================================================================

/**
 * Builds a human-readable error message from a structured error cause.
 * Each error code gets a specific, actionable message instead of raw DB errors.
 */
function buildHumanMessage(cause: StructuredErrorCause): string {
  switch (cause.errorCode) {
    case ERROR_CODES.INSUFFICIENT_PERMISSIONS: {
      /** Cast to access permission-specific fields */
      const permErr = cause as { required: string[]; current: string }
      return `You don't have permission to do this. Required: ${permErr.required.join(', ')}. Your current role: ${permErr.current}.`
    }

    case ERROR_CODES.NOT_ORGANIZATION_MEMBER:
      return "You're not a member of this organization."

    case ERROR_CODES.USAGE_LIMIT_REACHED: {
      const limitErr = cause as { resource: string; limit: number; current: number }
      return `You've reached your plan limit for ${limitErr.resource} (${limitErr.current}/${limitErr.limit}). Upgrade your plan to continue.`
    }

    case ERROR_CODES.FEATURE_NOT_AVAILABLE: {
      const featErr = cause as { feature: string; currentPlan: string }
      return `This feature (${featErr.feature}) is not available on your ${featErr.currentPlan} plan. Upgrade to unlock it.`
    }

    case ERROR_CODES.INSUFFICIENT_CREDITS: {
      const credErr = cause as { feature: string; required: number; available: number }
      return `Not enough credits for ${credErr.feature}. Required: ${credErr.required}, available: ${credErr.available}. Add credits to continue.`
    }

    case ERROR_CODES.STRIPE_NOT_CONNECTED:
      return 'Stripe is not connected for this organization. Connect Stripe in Settings > Payments to continue.'

    case ERROR_CODES.PAYMENT_METHOD_REQUIRED:
      return 'A payment method is required. Add one in Settings > Billing to continue.'

    case ERROR_CODES.ONBOARDING_INCOMPLETE:
      return 'Please complete onboarding before using this feature.'

    case ERROR_CODES.VALIDATION_ERROR:
      return cause.message || 'Invalid input — please check the values and try again.'

    default:
      return cause.message || 'An unexpected error occurred.'
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Centralized error handler for all Mochi AI tool execute() functions.
 *
 * Usage in any tool file:
 * ```ts
 * execute: async (params) => {
 *   try {
 *     // ... tool logic
 *   } catch (err) {
 *     return handleToolError('createLead', err)
 *   }
 * }
 * ```
 *
 * @param toolName - The tool function name (used in log prefix for debugging)
 * @param err - The caught error (typically a TRPCError with structured cause)
 * @returns ToolErrorResult with human-friendly message and categorized error code
 */
export function handleToolError(toolName: string, err: unknown): ToolErrorResult {
  /** Always log the full error for server-side debugging */
  console.error(`[Mochi AI] ${toolName} error:`, err)

  /** Attempt to extract structured error data from the tRPC error chain */
  const structuredCause = extractStructuredCause(err)

  if (structuredCause) {
    const errorCode = ERROR_CODE_MAP[structuredCause.errorCode] ?? 'UNKNOWN'
    const message = buildHumanMessage(structuredCause)
    return { success: false, message, errorCode }
  }

  /**
   * Fallback for unstructured errors (raw Prisma, network errors, etc.)
   * Detect common patterns in the error message and provide better context.
   */
  const errMessage = err instanceof Error ? err.message : String(err)

  /** Prisma FK constraint — usually means a referenced record doesn't exist */
  if (errMessage.includes('Foreign key constraint') || errMessage.includes('P2003')) {
    return {
      success: false,
      message: 'A referenced record was not found. Please verify the IDs you provided exist.',
      errorCode: 'NOT_FOUND',
    }
  }

  /** Prisma unique constraint — duplicate entry */
  if (errMessage.includes('Unique constraint') || errMessage.includes('P2002')) {
    return {
      success: false,
      message: 'A record with these details already exists. Check for duplicates and try again.',
      errorCode: 'VALIDATION_ERROR',
    }
  }

  /** Prisma record not found */
  if (errMessage.includes('Record to update not found') || errMessage.includes('P2025') || errMessage.includes('NOT_FOUND')) {
    return {
      success: false,
      message: 'The requested record was not found. It may have been deleted.',
      errorCode: 'NOT_FOUND',
    }
  }

  /**
   * Service-layer "not found" errors — e.g., "Recipient lead not found: cl_xxx".
   * These are thrown by service functions (contract.service, invoice.service) when
   * a referenced entity doesn't exist. The original message is kept because it tells
   * the AI EXACTLY what's wrong (which entity, which ID) so it can self-correct
   * by calling the appropriate list/search tool instead of retrying blindly.
   *
   * Case-insensitive check to catch variations like "Lead not found", "not found", etc.
   */
  if (errMessage.toLowerCase().includes('not found')) {
    return {
      success: false,
      message: `${errMessage}. Use the appropriate list/search tool to find a valid ID before retrying.`,
      errorCode: 'NOT_FOUND',
    }
  }

  /**
   * Feature/plan limit errors — e.g., "You have reached the maximum number of pages (1)".
   * The pages router (and others) throw FORBIDDEN TRPCErrors with descriptive messages
   * about plan limits. Pass the original message through since it already tells the
   * AI exactly what happened and suggests upgrading.
   */
  if (
    errMessage.includes('reached the maximum') ||
    errMessage.includes('limit') ||
    errMessage.includes('FORBIDDEN') ||
    errMessage.includes('Upgrade your plan')
  ) {
    return {
      success: false,
      message: errMessage,
      errorCode: 'LIMIT_REACHED',
    }
  }

  /** Generic fallback — never expose raw error messages to users */
  return {
    success: false,
    message: `Something went wrong while performing this action. Please try again or contact support if the issue persists.`,
    errorCode: 'UNKNOWN',
  }
}
