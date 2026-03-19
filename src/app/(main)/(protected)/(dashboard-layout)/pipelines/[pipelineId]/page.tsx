/**
 * Dynamic Pipeline Page - Shows a specific pipeline by ID
 *
 * URL: /pipelines/[pipelineId]
 *
 * This page displays a specific pipeline identified by its ID in the URL.
 * The pipelineId is passed to PipelineBoard which handles data fetching.
 *
 * SOURCE OF TRUTH: Pipeline URL routing
 */

import { PipelineBoard } from '@/components/pipelines/pipeline-board'

interface PipelinePageProps {
  params: Promise<{
    pipelineId: string
  }>
}

export async function generateMetadata({ params }: PipelinePageProps) {
  const { pipelineId } = await params
  return {
    title: `Pipeline - ${pipelineId}`,
    description: 'Manage your pipeline and workflows',
  }
}

export default async function PipelinePage({ params }: PipelinePageProps) {
  const { pipelineId } = await params

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Pipeline Board - Takes remaining space, relative for absolute child */}
      <div className="flex-1 min-h-0 relative">
        <PipelineBoard pipelineId={pipelineId} />
      </div>
    </div>
  )
}
