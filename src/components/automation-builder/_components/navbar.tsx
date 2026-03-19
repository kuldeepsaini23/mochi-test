/**
 * ============================================================================
 * AUTOMATION BUILDER NAVBAR
 * ============================================================================
 *
 * Top navigation bar for the automation builder.
 * Matches the form builder navbar UI pattern.
 *
 * LAYOUT (3-section grid for perfect centering):
 * - LEFT: Back button, Workflow icon, Editable title
 * - CENTER: Build/Activity tabs
 * - RIGHT: Undo/Redo, Auto-save toggle, Save button, Status dropdown
 *
 * SOURCE OF TRUTH: AutomationBuilderState
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ArrowLeftIcon,
  SaveIcon,
  Loader2Icon,
  CheckIcon,
  Undo2,
  Redo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAutoSave } from '@/hooks/use-auto-save'
import { getStatusDisplay } from '../_lib/utils'
import type { AutomationStatus, AutomationSchema } from '../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface AutomationNavbarProps {
  name: string
  /** URL slug for the automation */
  slug?: string
  status: AutomationStatus
  activeTab: 'build' | 'activity'
  isDirty: boolean
  schema: AutomationSchema
  autoSaveEnabled: boolean
  /** Whether undo is available */
  canUndo: boolean
  /** Whether redo is available */
  canRedo: boolean
  onAutoSaveChange: (enabled: boolean) => void
  onNameChange: (name: string) => void
  /** Callback when slug changes */
  onSlugChange?: (slug: string) => void | Promise<void>
  onTabChange: (tab: 'build' | 'activity') => void
  onSave: () => Promise<void>
  onStatusChange: (status: AutomationStatus) => Promise<void>
  onUndo: () => void
  onRedo: () => void
  onClose: () => void
}

// ============================================================================
// EDITABLE SLUG COMPONENT
// ============================================================================

interface EditableSlugProps {
  slug: string
  onSlugChange?: (slug: string) => void | Promise<void>
}

/**
 * Editable slug component (reused pattern from form builder).
 * Shows the automation URL slug with edit capability.
 * Validates slug format (lowercase, numbers, hyphens only).
 */
function EditableSlug({ slug, onSlugChange }: EditableSlugProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(slug)
  const [isUpdating, setIsUpdating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Sync edit value when slug prop changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(slug)
    }
  }, [slug, isEditing])

  const handleStartEdit = () => {
    if (!onSlugChange) return
    setIsEditing(true)
    setEditValue(slug)
  }

  /**
   * Sanitize slug to be URL-safe.
   * - Lowercase only
   * - Numbers and hyphens allowed
   * - No consecutive hyphens
   * - Must start/end with letter or number
   */
  const sanitizeSlug = (value: string): string => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleSave = async () => {
    const sanitizedValue = sanitizeSlug(editValue.trim())

    if (!sanitizedValue) {
      setEditValue(slug)
      setIsEditing(false)
      return
    }

    if (sanitizedValue !== slug && onSlugChange) {
      setIsUpdating(true)
      try {
        await onSlugChange(sanitizedValue)
      } finally {
        setIsUpdating(false)
      }
    } else {
      setEditValue(slug)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(slug)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">/</span>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={isUpdating}
          className="h-5 w-32 text-xs px-1.5 py-0"
          placeholder="automation-slug"
        />
      </div>
    )
  }

  return (
    <button
      onClick={handleStartEdit}
      disabled={!onSlugChange}
      className={cn(
        'text-xs text-muted-foreground flex items-center gap-0.5',
        onSlugChange && 'hover:text-foreground transition-colors cursor-text',
        !onSlugChange && 'cursor-default'
      )}
      title={onSlugChange ? 'Click to edit URL slug' : 'URL slug'}
    >
      <span>/</span>
      <span className="truncate max-w-32">{slug}</span>
    </button>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AutomationNavbar({
  name,
  slug,
  status,
  activeTab,
  isDirty,
  schema,
  autoSaveEnabled,
  canUndo,
  canRedo,
  onAutoSaveChange,
  onNameChange,
  onSlugChange,
  onTabChange,
  onSave,
  onStatusChange,
  onUndo,
  onRedo,
  onClose,
}: AutomationNavbarProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [manualJustSaved, setManualJustSaved] = useState(false)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(name)

  const statusDisplay = getStatusDisplay(status)

  /**
   * Auto-save hook (shared with form builder).
   * Watches schema changes with 4-second debounce so rapid edits
   * don't trigger saves too frequently.
   */
  const { isAutoSaving, justSaved } = useAutoSave({
    data: schema,
    isDirty,
    autoSaveEnabled,
    onSave,
    debounceMs: 4000,
  })

  /**
   * Handle manual save button click.
   * Works regardless of auto-save state — user can always manually save.
   * Shows "Saved" feedback briefly after successful save.
   */
  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      // Run save + minimum delay in parallel so spinner is visible
      const MIN_SPINNER_MS = 800
      await Promise.all([
        onSave(),
        new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS)),
      ])
      // Show "Saved" feedback briefly
      setManualJustSaved(true)
      setTimeout(() => setManualJustSaved(false), 2000)
    } finally {
      setIsSaving(false)
    }
  }, [onSave])

  /**
   * Handle status change from dropdown
   */
  const handleStatusChange = useCallback(async (newStatus: AutomationStatus) => {
    if (newStatus === status) return
    setIsChangingStatus(true)
    try {
      await onStatusChange(newStatus)
    } finally {
      setIsChangingStatus(false)
    }
  }, [status, onStatusChange])

  /**
   * Handle name edit submission
   */
  const handleNameSubmit = useCallback(() => {
    if (editName.trim() && editName !== name) {
      onNameChange(editName.trim())
    } else {
      setEditName(name)
    }
    setIsEditingName(false)
  }, [editName, name, onNameChange])

  /**
   * Handle name input key events
   */
  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit()
    } else if (e.key === 'Escape') {
      setEditName(name)
      setIsEditingName(false)
    }
  }, [handleNameSubmit, name])

  return (
    <TooltipProvider delayDuration={300}>
      {/* Floating toolbar — overlays the canvas with no background separation */}
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 h-12">
        {/* Left — Back button, name, and status badge */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-7 w-7 shrink-0"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to Automations</TooltipContent>
          </Tooltip>

          {/* Editable name + slug inline */}
          <div className="flex items-center gap-2 min-w-0">
            {isEditingName ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={handleNameKeyDown}
                autoFocus
                className="h-6 w-40 text-sm font-medium px-1.5"
              />
            ) : (
              <button
                onClick={() => {
                  setEditName(name)
                  setIsEditingName(true)
                }}
                className="text-sm font-medium text-left truncate max-w-44 hover:text-primary transition-colors cursor-text focus:outline-none"
                title="Click to edit automation name"
              >
                {name || 'Untitled Automation'}
              </button>
            )}

            {/* Status badge — compact pill next to name */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={isChangingStatus}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer',
                    statusDisplay.bgClass,
                    statusDisplay.colorClass
                  )}
                >
                  {isChangingStatus && <Loader2Icon className="h-2.5 w-2.5 animate-spin" />}
                  {statusDisplay.label}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => handleStatusChange('active')}
                  disabled={status === 'active'}
                >
                  Activate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStatusChange('paused')}
                  disabled={status === 'paused'}
                >
                  Pause
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStatusChange('draft')}
                  disabled={status === 'draft'}
                >
                  Set as Draft
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Slug — subtle, secondary info */}
          {slug && (
            <EditableSlug slug={slug} onSlugChange={onSlugChange} />
          )}
        </div>

        {/* Center — Build/Activity tabs */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as 'build' | 'activity')}>
            <TabsList className="h-8">
              <TabsTrigger value="build" className="text-xs px-3 h-6">Build</TabsTrigger>
              <TabsTrigger value="activity" className="text-xs px-3 h-6">Activity</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Right — Undo/Redo, Auto-save, Save */}
        <div className="flex items-center gap-1">
          {/* Undo/Redo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} className="h-7 w-7">
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} className="h-7 w-7">
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>

          {/* Auto-save toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 ml-1">
                <Switch
                  id="auto-save"
                  checked={autoSaveEnabled}
                  onCheckedChange={onAutoSaveChange}
                  className="data-[state=checked]:bg-primary scale-75"
                />
                <Label
                  htmlFor="auto-save"
                  className="text-[11px] text-muted-foreground cursor-pointer whitespace-nowrap"
                >
                  Auto
                </Label>
              </div>
            </TooltipTrigger>
            <TooltipContent>{autoSaveEnabled ? 'Auto-save is on' : 'Auto-save is off'}</TooltipContent>
          </Tooltip>

          {/* Save button — compact with state indicators */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSave}
                disabled={isSaving || isAutoSaving || !isDirty}
                className="h-7 w-7 relative"
              >
                {/* Red dot for unsaved changes */}
                {isDirty && !isSaving && !isAutoSaving && !justSaved && !manualJustSaved && (
                  <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 bg-destructive rounded-full" />
                )}
                {isSaving || isAutoSaving ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : justSaved || manualJustSaved ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <SaveIcon className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isSaving || isAutoSaving
                ? 'Saving...'
                : justSaved || manualJustSaved
                ? 'Saved'
                : autoSaveEnabled
                ? 'Auto-save is enabled'
                : isDirty
                ? 'Save changes (Ctrl+S)'
                : 'No unsaved changes'}
            </TooltipContent>
          </Tooltip>

          {/* Theme toggle — scaled to match toolbar button sizing */}
          <div className="[&_button]:h-7 [&_button]:w-7 [&_button]:border-0 [&_button]:bg-transparent">
            <ThemeToggle />
          </div>
        </div>
      </header>
    </TooltipProvider>
  )
}
