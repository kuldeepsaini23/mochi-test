/**
 * Trigger.dev Exports
 *
 * Contains task definitions for background jobs:
 * - Storage: Video processing (HLS transcoding), scheduled trash deletion
 * - Automation: Workflow execution, appointment scheduling
 * - Pages: Screenshot capture for website previews
 *
 * SOURCE OF TRUTH KEYWORDS: TriggerExports, TriggerTasks
 */

// ============================================================================
// STORAGE TASKS
// ============================================================================
// Scheduled deletion tasks for trash functionality
// These are triggered by storage router, not AI agent

export {
  scheduledFolderDeletionTask,
  scheduledFileDeletionTask,
} from './storage/scheduled-deletion'

// Video processing task for HLS transcoding
// Converts uploaded videos to adaptive bitrate HLS format
export { videoProcessingTask } from './storage/video-processing'

// ============================================================================
// AUTOMATION TASKS
// ============================================================================
// Automation workflow execution for the automation builder feature
// Triggered when automation events fire (form submitted, lead created, etc.)

export { automationExecutionTask } from './automation/execution-task'

// Event-driven delayed task for APPOINTMENT_STARTED trigger
// Scheduled per-booking at creation time, fires at the booking's startTime
export { appointmentStartedTask } from './automation/appointment-started-scheduler'
