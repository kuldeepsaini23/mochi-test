/**
 * Lead Tags Select Component
 * Multi-select for assigning tags to a lead with inline edit/delete
 */

'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { TagsInput, type Tag } from '@/components/ui/tags-input'

interface LeadTagsSelectProps {
  organizationId: string
  leadId: string
  selectedTagIds: string[]
  onTagsChange?: (tags: Tag[]) => void
  disabled?: boolean
}

export function LeadTagsSelect({
  organizationId,
  leadId,
  selectedTagIds: initialSelectedTagIds,
  onTagsChange,
  disabled = false,
}: LeadTagsSelectProps) {
  const utils = trpc.useUtils()
  // Local state for optimistic UI updates
  const [localSelectedTagIds, setLocalSelectedTagIds] = useState(initialSelectedTagIds)

  // Sync local state when prop changes (e.g., when lead changes)
  useEffect(() => {
    setLocalSelectedTagIds(initialSelectedTagIds)
  }, [initialSelectedTagIds])

  // Fetch all tags
  const { data: tags = [] } = trpc.leads.listTags.useQuery({ organizationId })

  // Get full tag objects for selected IDs
  const getSelectedTags = (tagIds: string[]) => {
    return tags.filter((tag) => tagIds.includes(tag.id))
  }

  // Helper to notify parent of tag changes with full objects
  const notifyTagsChange = (newTagIds: string[]) => {
    if (onTagsChange) {
      onTagsChange(getSelectedTags(newTagIds))
    }
  }

  // Add tag to lead
  const addTagMutation = trpc.leads.addTagToLead.useMutation({
    onMutate: async ({ tagId }) => {
      // Optimistic update
      const newTagIds = [...localSelectedTagIds, tagId]
      setLocalSelectedTagIds(newTagIds)
      notifyTagsChange(newTagIds)
    },
    onSuccess: () => {
      utils.leads.list.invalidate()
      utils.leads.getById.invalidate()
    },
    onError: (error, { tagId }) => {
      // Revert optimistic update
      const revertedTagIds = localSelectedTagIds.filter((id) => id !== tagId)
      setLocalSelectedTagIds(revertedTagIds)
      notifyTagsChange(revertedTagIds)
      toast.error(error.message || 'Failed to add tag')
    },
  })

  // Remove tag from lead
  const removeTagMutation = trpc.leads.removeTagFromLead.useMutation({
    onMutate: async ({ tagId }) => {
      // Optimistic update - immediately remove from local state
      const newTagIds = localSelectedTagIds.filter((id) => id !== tagId)
      setLocalSelectedTagIds(newTagIds)
      notifyTagsChange(newTagIds)
    },
    onSuccess: () => {
      utils.leads.list.invalidate()
      utils.leads.getById.invalidate()
    },
    onError: (error, { tagId }) => {
      // Revert optimistic update
      const revertedTagIds = [...localSelectedTagIds, tagId]
      setLocalSelectedTagIds(revertedTagIds)
      notifyTagsChange(revertedTagIds)
      toast.error(error.message || 'Failed to remove tag')
    },
  })

  // Create tag
  const createTagMutation = trpc.leads.createTag.useMutation({
    onSuccess: (newTag) => {
      utils.leads.listTags.invalidate()
      // Automatically add the new tag to the lead
      addTagMutation.mutate({
        organizationId,
        leadId,
        tagId: newTag.id,
      })
      toast.success('Tag created and added')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create tag')
    },
  })

  // Update tag
  const updateTagMutation = trpc.leads.updateTag.useMutation({
    onSuccess: () => {
      utils.leads.listTags.invalidate()
      utils.leads.list.invalidate()
      utils.leads.getById.invalidate()
      toast.success('Tag updated')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update tag')
    },
  })

  // Delete tag
  const deleteTagMutation = trpc.leads.deleteTag.useMutation({
    onMutate: async ({ tagId }) => {
      // Optimistic update - remove from local selection if present
      const newTagIds = localSelectedTagIds.filter((id) => id !== tagId)
      setLocalSelectedTagIds(newTagIds)
      notifyTagsChange(newTagIds)
    },
    onSuccess: () => {
      utils.leads.listTags.invalidate()
      utils.leads.list.invalidate()
      utils.leads.getById.invalidate()
      toast.success('Tag deleted')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete tag')
    },
  })

  const handleTagSelect = (tagId: string) => {
    addTagMutation.mutate({
      organizationId,
      leadId,
      tagId,
    })
  }

  const handleTagRemove = (tagId: string) => {
    removeTagMutation.mutate({
      organizationId,
      leadId,
      tagId,
    })
  }

  const handleCreateTag = (name: string) => {
    createTagMutation.mutate({
      organizationId,
      name,
      color: '#3b82f6', // Default blue
    })
  }

  const handleUpdateTag = (tagId: string, name: string, color: string) => {
    updateTagMutation.mutate({
      organizationId,
      tagId,
      name,
      color,
    })
  }

  const handleDeleteTag = (tagId: string) => {
    deleteTagMutation.mutate({
      organizationId,
      tagId,
    })
  }

  return (
    <div className="space-y-2">
      <Label>Tags</Label>
      <TagsInput
        tags={tags}
        selectedTagIds={localSelectedTagIds}
        onTagSelect={handleTagSelect}
        onTagRemove={handleTagRemove}
        onCreateTag={handleCreateTag}
        onUpdateTag={handleUpdateTag}
        onDeleteTag={handleDeleteTag}
        disabled={
          disabled ||
          addTagMutation.isPending ||
          removeTagMutation.isPending ||
          createTagMutation.isPending ||
          updateTagMutation.isPending ||
          deleteTagMutation.isPending
        }
        placeholder="Select or create tags..."
      />
    </div>
  )
}
