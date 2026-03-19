/**
 * Form Submission Module
 *
 * Handles form submission processing, field mapping, and lead creation/updates.
 */

export * from './types'

// Re-export the main service function
export { processFormSubmission } from '@/services/form-submission.service'
