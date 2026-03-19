'use client'

/**
 * PipelineSelector Component - Dropdown for selecting and creating pipelines
 *
 * Features:
 * - Search through existing pipelines
 * - Create new pipeline inline (if user has create permission)
 * - Switch between pipelines
 *
 * PERMISSIONS:
 * - onCreate is optional - if not provided, create functionality is hidden
 * - This supports permission-based UI where users without pipelines:create
 *   can still switch between existing pipelines
 *
 * SOURCE OF TRUTH: Uses types from @/types/pipeline
 */

import { useState } from 'react'
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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

interface Pipeline {
  id: string
  name: string
}

interface PipelineSelectorProps {
  pipelines: Pipeline[]
  selectedPipelineId: string | null
  onSelect: (pipelineId: string) => void
  /**
   * Handler for creating new pipelines
   * Optional - if not provided, create functionality is hidden
   * WHY: Users without pipelines:create permission can still switch pipelines
   */
  onCreate?: (name: string) => Promise<void>
  isCreating?: boolean
}

/**
 * Pipeline selector with search and create functionality
 */
export function PipelineSelector({
  pipelines,
  selectedPipelineId,
  onSelect,
  onCreate,
  isCreating = false,
}: PipelineSelectorProps) {
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newPipelineName, setNewPipelineName] = useState('')

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId)

  /**
   * Handle creating a new pipeline
   * WHY: Only executes if onCreate handler is provided (user has create permission)
   */
  const handleCreate = async () => {
    if (!newPipelineName.trim() || !onCreate) return

    await onCreate(newPipelineName.trim())
    setNewPipelineName('')
    setShowCreate(false)
    setOpen(false)
  }

  /**
   * Handle key press in create input
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreate()
    }
    if (e.key === 'Escape') {
      setShowCreate(false)
      setNewPipelineName('')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-60 justify-between"
        >
          {selectedPipeline?.name ?? 'Select pipeline...'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0">
        <Command>
          <CommandInput placeholder="Search pipelines..." />
          <CommandList>
            <CommandEmpty>No pipeline found.</CommandEmpty>
            <CommandGroup>
              {pipelines.map((pipeline) => (
                <CommandItem
                  key={pipeline.id}
                  value={pipeline.name}
                  onSelect={() => {
                    onSelect(pipeline.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedPipelineId === pipeline.id
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  {pipeline.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {/* Only show create UI if user has create permission (onCreate is provided) */}
            {onCreate && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {showCreate ? (
                    <div className="flex items-center gap-2 p-2">
                      <Input
                        placeholder="Pipeline name..."
                        value={newPipelineName}
                        onChange={(e) => setNewPipelineName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        className="h-8"
                      />
                      <Button
                        size="sm"
                        onClick={handleCreate}
                        disabled={!newPipelineName.trim() || isCreating}
                      >
                        {isCreating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Add'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <CommandItem
                      onSelect={() => setShowCreate(true)}
                      className="cursor-pointer"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create pipeline
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
