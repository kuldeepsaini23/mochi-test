/**
 * Structured Error Codes for tRPC
 *
 * WHY: Machine-readable error codes for frontend/AI to handle errors appropriately
 * HOW: All tRPC errors include cause.errorCode from here for structured handling
 */

import type { FeatureKey } from '@/lib/config'

/**
 * ============================================================================
 * ERROR CODES (single source of truth)
 * ============================================================================
 */
export const ERROR_CODES = {
  // Auth/Onboarding
  ONBOARDING_INCOMPLETE: 'ONBOARDING_INCOMPLETE',

  // Authorization
  NOT_ORGANIZATION_MEMBER: 'NOT_ORGANIZATION_MEMBER',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Feature gates
  FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE',
  USAGE_LIMIT_REACHED: 'USAGE_LIMIT_REACHED',

  // Payments
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  PAYMENT_METHOD_REQUIRED: 'PAYMENT_METHOD_REQUIRED',
  STUDIO_ONBOARDING_COMPLETED: 'STUDIO_ONBOARDING_COMPLETED',

  // Stripe Connect
  STRIPE_NOT_CONNECTED: 'STRIPE_NOT_CONNECTED',

  // Invitations
  PENDING_INVITATION: 'PENDING_INVITATION',
  INVITATION_NOT_FOUND: 'INVITATION_NOT_FOUND',
  INVITATION_ALREADY_USED: 'INVITATION_ALREADY_USED',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',

  // Portal (Client Portal)
  PORTAL_DISABLED: 'PORTAL_DISABLED',
  PORTAL_ACCESS_DENIED: 'PORTAL_ACCESS_DENIED',
  PORTAL_ADMIN_INACTIVE: 'PORTAL_ADMIN_INACTIVE',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/**
 * ============================================================================
 * STRUCTURED ERROR CAUSES
 * ============================================================================
 */

export type OnboardingIncompleteError = {
  errorCode: typeof ERROR_CODES.ONBOARDING_INCOMPLETE
  requiredStep: 'onboarding'
  message: string
}

export type NotOrganizationMemberError = {
  errorCode: typeof ERROR_CODES.NOT_ORGANIZATION_MEMBER
  organizationId: string
  message: string
}

export type InsufficientPermissionsError = {
  errorCode: typeof ERROR_CODES.INSUFFICIENT_PERMISSIONS
  required: string[]
  current: string
  message: string
}

export type FeatureNotAvailableError = {
  errorCode: typeof ERROR_CODES.FEATURE_NOT_AVAILABLE
  feature: FeatureKey
  currentPlan: string
  upgradeRequired: true
  message: string
}

export type UsageLimitReachedError = {
  errorCode: typeof ERROR_CODES.USAGE_LIMIT_REACHED
  resource: string
  limit: number
  current: number
  upgradeRequired: true
  message: string
}

export type InsufficientCreditsError = {
  errorCode: typeof ERROR_CODES.INSUFFICIENT_CREDITS
  feature: FeatureKey
  required: number
  available: number
  message: string
}

export type PaymentMethodRequiredError = {
  errorCode: typeof ERROR_CODES.PAYMENT_METHOD_REQUIRED
  entityType: 'organization'
  entityId: string
  message: string
}

export type OnboardingAlreadyCompleted = {
  errorCode: typeof ERROR_CODES.STUDIO_ONBOARDING_COMPLETED
  entityType: 'organization'
  message: string
}

export type ValidationError = {
  errorCode: typeof ERROR_CODES.VALIDATION_ERROR
  message: string
}

export type PendingInvitationError = {
  errorCode: typeof ERROR_CODES.PENDING_INVITATION
  invitationId: string
  organizationId: string
  organizationName: string
  role: string
  message: string
}

export type StripeNotConnectedError = {
  errorCode: typeof ERROR_CODES.STRIPE_NOT_CONNECTED
  organizationId: string
  message: string
}

export type InvitationNotFoundError = {
  errorCode: typeof ERROR_CODES.INVITATION_NOT_FOUND
  message: string
}

export type InvitationAlreadyUsedError = {
  errorCode: typeof ERROR_CODES.INVITATION_ALREADY_USED
  status: string
  message: string
}

export type InvitationExpiredError = {
  errorCode: typeof ERROR_CODES.INVITATION_EXPIRED
  message: string
}

// ============================================================================
// PORTAL ERROR CAUSES
// ============================================================================

/**
 * Portal feature is disabled via ENV configuration
 */
export type PortalDisabledError = {
  errorCode: typeof ERROR_CODES.PORTAL_DISABLED
  message: string
}

/**
 * User does not have access to the portal (not a portal admin)
 */
export type PortalAccessDeniedError = {
  errorCode: typeof ERROR_CODES.PORTAL_ACCESS_DENIED
  message: string
}

/**
 * Portal admin account has been deactivated
 */
export type PortalAdminInactiveError = {
  errorCode: typeof ERROR_CODES.PORTAL_ADMIN_INACTIVE
  message: string
}

/**
 * Union of all structured error causes
 */
export type StructuredErrorCause =
  | OnboardingIncompleteError
  | NotOrganizationMemberError
  | InsufficientPermissionsError
  | FeatureNotAvailableError
  | UsageLimitReachedError
  | InsufficientCreditsError
  | OnboardingAlreadyCompleted
  | PaymentMethodRequiredError
  | ValidationError
  | PendingInvitationError
  | StripeNotConnectedError
  | InvitationNotFoundError
  | InvitationAlreadyUsedError
  | InvitationExpiredError
  | PortalDisabledError
  | PortalAccessDeniedError
  | PortalAdminInactiveError
