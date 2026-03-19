/**
 * ============================================================================
 * REMOVE TAG ACTION CONFIG
 * ============================================================================
 *
 * Configuration form for the "Remove Tag" action.
 * Reuses the TagsInput component from the leads page for a rich
 * search/select experience instead of a basic dropdown.
 *
 * Supports multiple tags per action node.
 *
 * SOURCE OF TRUTH: RemoveTagActionConfig
 */

'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/trpc/react-provider'
import { TagsInput } from '@/components/ui/tags-input'
import type { RemoveTagActionConfig as RemoveTagConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// TYPES
// ============================================================================

interface ActionRemoveTagConfigProps {
  config: RemoveTagConfig
  onChange: (config: RemoveTagConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionRemoveTagConfig({
  config,
  onChange,
  errors,
}: ActionRemoveTagConfigProps) {
  const { organizationId } = useAutomationBuilder()
  const { tags, isLoading } = useAutomationBuilderData(organizationId)
  const utils = trpc.useUtils()

  /** Currently selected tag IDs derived from config.tags array */
  const selectedTagIds = (config.tags ?? []).map((t) => t.id)

  /** Handle tag selection — add to the tags array */
  const handleTagSelect = useCallback(
    (tagId: string) => {
      const tag = tags.find((t) => t.id === tagId)
      if (!tag) return
      const current = config.tags ?? []
      /* Prevent duplicates */
      if (current.some((t) => t.id === tagId)) return
      onChange({
        ...config,
        tags: [...current, { id: tag.id, name: tag.name }],
      })
    },
    [config, tags, onChange]
  )

  /** Handle tag removal — remove from the tags array */
  const handleTagRemove = useCallback(
    (tagId: string) => {
      const current = config.tags ?? []
      onChange({
        ...config,
        tags: current.filter((t) => t.id !== tagId),
      })
    },
    [config, onChange]
  )

  /** Create a new tag, then auto-select it */
  const createTagMutation = trpc.leads.createTag.useMutation({
    onSuccess: (newTag) => {
      utils.leads.listTags.invalidate()
      const current = config.tags ?? []
      onChange({
        ...config,
        tags: [...current, { id: newTag.id, name: newTag.name }],
      })
      toast.success('Tag created')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create tag')
    },
  })

  const handleCreateTag = useCallback(
    (name: string) => {
      createTagMutation.mutate({
        organizationId,
        name,
        color: '#3b82f6',
      })
    },
    [organizationId, createTagMutation]
  )

  /** Update an existing tag's name/color */
  const updateTagMutation = trpc.leads.updateTag.useMutation({
    onSuccess: (_data, variables) => {
      utils.leads.listTags.invalidate()
      /* If the updated tag is in our selection, update the display name */
      const current = config.tags ?? []
      const updated = current.map((t) =>
        t.id === variables.tagId ? { ...t, ...(variables.name != null && { name: variables.name }) } : t
      )
      onChange({ ...config, tags: updated })
      toast.success('Tag updated')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update tag')
    },
  })

  const handleUpdateTag = useCallback(
    (tagId: string, name: string, color: string) => {
      updateTagMutation.mutate({ organizationId, tagId, name, color })
    },
    [organizationId, updateTagMutation]
  )

  /** Delete a tag. If it was selected, remove it from the list */
  const deleteTagMutation = trpc.leads.deleteTag.useMutation({
    onSuccess: (_data, variables) => {
      utils.leads.listTags.invalidate()
      const current = config.tags ?? []
      onChange({
        ...config,
        tags: current.filter((t) => t.id !== variables.tagId),
      })
      toast.success('Tag deleted')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete tag')
    },
  })

  const handleDeleteTag = useCallback(
    (tagId: string) => {
      deleteTagMutation.mutate({ organizationId, tagId })
    },
    [organizationId, deleteTagMutation]
  )

  const isMutating =
    createTagMutation.isPending ||
    updateTagMutation.isPending ||
    deleteTagMutation.isPending

  return (
    <div className="space-y-4">
      {/* Tag picker — multi-select */}
      <div className="space-y-2">
        <span className="text-sm font-medium">Tags</span>
        <TagsInput
          tags={tags}
          selectedTagIds={selectedTagIds}
          onTagSelect={handleTagSelect}
          onTagRemove={handleTagRemove}
          onCreateTag={handleCreateTag}
          onUpdateTag={handleUpdateTag}
          onDeleteTag={handleDeleteTag}
          disabled={isLoading || isMutating}
          placeholder={isLoading ? 'Loading tags...' : 'Search or create tags...'}
        />
        {errors?.tags && (
          <p className="text-xs text-destructive">{errors.tags}</p>
        )}
      </div>
    </div>
  )
}
