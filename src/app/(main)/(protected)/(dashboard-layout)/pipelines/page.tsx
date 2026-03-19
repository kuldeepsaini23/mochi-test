/**
 * Pipelines Index Page - Redirects to specific pipeline
 *
 * URL: /pipelines
 *
 * This page redirects users to their last viewed pipeline (stored in localStorage)
 * or to the default pipeline if no previous selection exists.
 *
 * WHY: Users should always land on a specific pipeline URL so they can share/bookmark it.
 * The actual pipeline ID is stored in localStorage for persistence across sessions.
 *
 * SOURCE OF TRUTH: Pipeline URL routing
 */

import { PipelineRedirect } from '@/components/pipelines/pipeline-redirect'

export const metadata = {
  title: 'Pipelines',
  description: 'Manage your project pipelines and workflows',
}

export default function PipelinesPage() {
  return <PipelineRedirect />
}
