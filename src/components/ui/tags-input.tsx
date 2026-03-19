'use client'

import * as React from 'react'
import { X, Check, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button' // Used in edit mode
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { getTextColorForBackground } from '@/constants/colors'
import { ColorPicker } from '@/components/ui/color-picker'

export interface Tag {
  id: string
  name: string
  color: string
}

interface TagsInputProps {
  tags: Tag[]
  selectedTagIds: string[]
  onTagSelect: (tagId: string) => void
  onTagRemove: (tagId: string) => void
  onCreateTag?: (name: string) => void
  onUpdateTag?: (tagId: string, name: string, color: string) => void
  onDeleteTag?: (tagId: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function TagsInput({
  tags,
  selectedTagIds,
  onTagSelect,
  onTagRemove,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  placeholder = 'Select tags...',
  disabled = false,
  className,
}: TagsInputProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState('')
  const [editingTag, setEditingTag] = React.useState<{
    id: string
    name: string
    color: string
  } | null>(null)
  const [hoveredTagId, setHoveredTagId] = React.useState<string | null>(null)

  const selectedTags = React.useMemo(
    () => tags.filter((tag) => selectedTagIds.includes(tag.id)),
    [tags, selectedTagIds]
  )

  const handleSelect = (tagId: string) => {
    // Don't toggle if we're in edit mode
    if (editingTag) return

    if (selectedTagIds.includes(tagId)) {
      onTagRemove(tagId)
    } else {
      onTagSelect(tagId)
    }
  }

  const handleCreateTag = () => {
    if (onCreateTag && searchValue.trim()) {
      onCreateTag(searchValue.trim())
      setSearchValue('')
    }
  }

  const handleStartEdit = (e: React.MouseEvent, tag: Tag) => {
    e.stopPropagation()
    setEditingTag({ id: tag.id, name: tag.name, color: tag.color })
  }

  const handleCancelEdit = () => {
    setEditingTag(null)
  }

  const handleSaveEdit = () => {
    if (editingTag && onUpdateTag && editingTag.name.trim()) {
      onUpdateTag(editingTag.id, editingTag.name.trim(), editingTag.color)
      setEditingTag(null)
    }
  }

  const handleDeleteTag = (e: React.MouseEvent, tagId: string) => {
    e.stopPropagation()
    if (onDeleteTag) {
      onDeleteTag(tagId)
    }
  }

  const showCreateOption =
    onCreateTag &&
    searchValue.trim() &&
    !tags.some(
      (tag) => tag.name.toLowerCase() === searchValue.trim().toLowerCase()
    )

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) {
        setEditingTag(null)
        setHoveredTagId(null)
      }
    }}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          aria-expanded={open}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          className={cn(
            'flex items-center w-full justify-between min-h-10 h-auto py-2 px-3 rounded-md border border-input bg-background text-sm ring-offset-background cursor-pointer',
            'hover:bg-accent hover:text-accent-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            disabled && 'pointer-events-none opacity-50',
            !selectedTags.length && 'text-muted-foreground',
            className
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setOpen(true)
            }
          }}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedTags.length > 0 ? (
              selectedTags.map((tag) => {
                const textColor = getTextColorForBackground(tag.color)
                return (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-xs px-2 py-0.5 font-medium border-0"
                    style={{ backgroundColor: tag.color, color: textColor }}
                  >
                    {tag.name}
                    <button
                      type="button"
                      className="ml-1 rounded-full outline-none hover:opacity-70"
                      onClick={(e) => {
                        e.stopPropagation()
                        onTagRemove(tag.id)
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              })
            ) : (
              <span>{placeholder}</span>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[var(--radix-popper-anchor-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search tags..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>
              {showCreateOption ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer"
                  onClick={handleCreateTag}
                >
                  <Plus className="h-4 w-4" />
                  Create &quot;{searchValue.trim()}&quot;
                </button>
              ) : (
                'No tags found.'
              )}
            </CommandEmpty>
            {tags.length > 0 && (
              <CommandGroup heading="Tags">
                {tags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id)
                  const isEditing = editingTag?.id === tag.id
                  const isHovered = hoveredTagId === tag.id

                  // Editing mode for this tag
                  if (isEditing) {
                    return (
                      <div key={tag.id} className="p-2 space-y-2">
                        <Input
                          value={editingTag.name}
                          onChange={(e) =>
                            setEditingTag((prev) =>
                              prev ? { ...prev, name: e.target.value } : null
                            )
                          }
                          placeholder="Tag name"
                          className="h-8 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleSaveEdit()
                            } else if (e.key === 'Escape') {
                              handleCancelEdit()
                            }
                          }}
                        />
                        <ColorPicker
                          value={editingTag.color}
                          onChange={(color) =>
                            setEditingTag((prev) =>
                              prev ? { ...prev, color } : null
                            )
                          }
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 h-7"
                            onClick={handleSaveEdit}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )
                  }

                  const textColor = getTextColorForBackground(tag.color)
                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => handleSelect(tag.id)}
                      className="cursor-pointer group"
                      onMouseEnter={() => setHoveredTagId(tag.id)}
                      onMouseLeave={() => setHoveredTagId(null)}
                    >
                      <div
                        className="w-3 h-3 rounded-full mr-2 shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1">{tag.name}</span>

                      {/* Show edit/delete on hover or checkmark when selected */}
                      {isHovered && (onUpdateTag || onDeleteTag) ? (
                        <div className="flex items-center gap-0.5">
                          {onUpdateTag && (
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-accent"
                              onClick={(e) => handleStartEdit(e, tag)}
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          )}
                          {onDeleteTag && (
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-destructive/10"
                              onClick={(e) => handleDeleteTag(e, tag.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          )}
                        </div>
                      ) : isSelected ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : null}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            {showCreateOption && tags.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={handleCreateTag}
                    className="cursor-pointer"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create &quot;{searchValue.trim()}&quot;
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
