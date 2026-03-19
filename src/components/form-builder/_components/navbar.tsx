/**
 * ============================================================================
 * FORM BUILDER NAVBAR
 * ============================================================================
 *
 * Top navigation bar for the form builder.
 *
 * LAYOUT (3-section grid for perfect centering):
 * - LEFT: Back button, Form icon, Editable title
 * - CENTER: Mobile/Desktop viewport toggle (perfectly centered)
 * - RIGHT: Undo/Redo, Auto-save toggle, Preview, Save button
 *
 * FEATURES:
 * - Editable form title (click to edit)
 * - Back button for navigation
 * - Viewport toggle (desktop/mobile preview)
 * - Undo/Redo with keyboard shortcuts
 * - Auto-save toggle with debounced saving
 * - Manual save button (disabled when auto-save is on)
 * - Preview mode toggle
 */

'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAutoSave } from '@/hooks/use-auto-save'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Save,
  FileText,
  Loader2,
  ArrowLeft,
  Monitor,
  Smartphone,
  Check,
  Share2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFormBuilder } from '../_lib/form-builder-context'
import type { FormSchema } from '../_lib/types'
import { ShareFormModal } from '@/app/(main)/(protected)/(dashboard-layout)/sites/forms/_components/share-form-modal'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Form publication status type.
 * Mirrors the Prisma FormStatus enum.
 */
type FormStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED'

interface FormBuilderNavbarProps {
  formSlug?: string
  formName?: string
  formStatus?: FormStatus
  onSave?: () => Promise<void>
  onPublish?: (status: FormStatus) => void | Promise<void>
  onSlugChange?: (newSlug: string) => void | Promise<void>
  onClose?: () => void
  isModal?: boolean
}

// ============================================================================
// EDITABLE TITLE COMPONENT
// ============================================================================

interface EditableTitleProps {
  title: string
  onTitleChange: (title: string) => void
}

/**
 * Editable title component.
 * Click to edit, press Enter or blur to save.
 */
function EditableTitle({ title, onTitleChange }: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Sync edit value when title prop changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(title)
    }
  }, [title, isEditing])

  const handleStartEdit = () => {
    setIsEditing(true)
    setEditValue(title)
  }

  const handleSave = () => {
    const trimmedValue = editValue.trim()
    if (trimmedValue && trimmedValue !== title) {
      onTitleChange(trimmedValue)
    } else {
      setEditValue(title) // Reset to original if empty
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(title)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 w-48 text-sm font-medium"
        placeholder="Form name"
      />
    )
  }

  return (
    <button
      onClick={handleStartEdit}
      className={cn(
        'text-sm font-medium text-left truncate max-w-48',
        'hover:text-primary transition-colors cursor-text',
        'focus:outline-none focus:text-primary'
      )}
      title="Click to edit form name"
    >
      {title || 'Untitled Form'}
    </button>
  )
}

// ============================================================================
// EDITABLE SLUG COMPONENT
// ============================================================================

interface EditableSlugProps {
  slug: string
  onSlugChange?: (slug: string) => void | Promise<void>
}

/**
 * Editable slug component.
 * Shows the form URL slug with edit capability.
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
      .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
  }

  const handleSave = async () => {
    const sanitizedValue = sanitizeSlug(editValue.trim())

    if (!sanitizedValue) {
      setEditValue(slug) // Reset if empty
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
      setEditValue(slug) // Reset to original
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
          placeholder="form-slug"
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
// VIEWPORT TOGGLE COMPONENT
// ============================================================================

interface ViewportToggleProps {
  viewportMode: 'desktop' | 'mobile'
  onViewportChange: (mode: 'desktop' | 'mobile') => void
}

/**
 * Toggle between desktop and mobile viewport modes.
 * Uses a segmented control style for clear visual feedback.
 */
function ViewportToggle({ viewportMode, onViewportChange }: ViewportToggleProps) {
  return (
    <div className="flex items-center bg-muted rounded-lg p-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onViewportChange('desktop')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              viewportMode === 'desktop'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">Desktop</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Desktop view</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onViewportChange('mobile')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              viewportMode === 'mobile'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Smartphone className="h-4 w-4" />
            <span className="hidden sm:inline">Mobile</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Mobile view (375px)</TooltipContent>
      </Tooltip>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FormBuilderNavbar({
  formSlug,
  formName,
  formStatus,
  onSave,
  onPublish,
  onSlugChange,
  onClose,
  isModal = false,
}: FormBuilderNavbarProps) {
  const { state, actions, canUndo, canRedo } = useFormBuilder()
  const [isSaving, setIsSaving] = useState(false)
  const [manualJustSaved, setManualJustSaved] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  // Determine if form is published
  const isPublished = formStatus === 'PUBLISHED'

  /**
   * Auto-save hook (shared with automation builder).
   * Watches schema changes with 2-second debounce.
   */
  const { isAutoSaving, justSaved } = useAutoSave({
    data: state.schema,
    isDirty: state.isDirty,
    autoSaveEnabled: state.autoSaveEnabled,
    onSave,
  })

  // ========================================
  // HANDLERS
  // ========================================

  /**
   * Manual save handler.
   * Only works when auto-save is disabled.
   * Shows "Saved" feedback briefly after successful save.
   */
  const handleSave = useCallback(async () => {
    if (!onSave || state.autoSaveEnabled) return

    setIsSaving(true)
    try {
      await onSave()
      // Show "Saved" feedback briefly
      setManualJustSaved(true)
      setTimeout(() => setManualJustSaved(false), 2000)
    } finally {
      setIsSaving(false)
    }
  }, [onSave, state.autoSaveEnabled])

  /**
   * Publish/Unpublish handler.
   * Toggles between PUBLISHED and DRAFT status.
   * Called by Switch component with the new checked state.
   */
  const handlePublishToggle = useCallback(async (checked: boolean) => {
    if (!onPublish) return

    setIsPublishing(true)
    try {
      // Set status based on switch state
      const newStatus: FormStatus = checked ? 'PUBLISHED' : 'DRAFT'
      await onPublish(newStatus)
    } finally {
      setIsPublishing(false)
    }
  }, [onPublish])


  // ========================================
  // RENDER
  // ========================================

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'h-14 border-b border-border bg-background/95 backdrop-blur-sm',
          'shrink-0'
        )}
      >
        {/*
         * Three-column grid layout for perfect centering.
         * Left and right sections take equal space, center is perfectly centered.
         */}
        <div className="h-full grid grid-cols-3 items-center px-4">
          {/* ======================================== */}
          {/* LEFT SECTION - Back, Icon, Title */}
          {/* ======================================== */}
          <div className="flex items-center gap-3 justify-start">
            {/*
             * Back button - renders differently based on context:
             * - Page mode: Link for optimistic UI navigation
             * - Modal mode: Button that calls onClose callback
             */}
            <Tooltip>
              <TooltipTrigger asChild>
                {isModal ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-8 w-8"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                ) : (
                  <Link
                    href="/sites/forms"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                )}
              </TooltipTrigger>
              <TooltipContent>{isModal ? 'Close' : 'Back to Forms'}</TooltipContent>
            </Tooltip>

            {/* Form icon and editable title */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col min-w-0">
                <EditableTitle
                  title={state.schema.title}
                  onTitleChange={actions.setTitle}
                />
                {/* Editable slug - click to change the form URL */}
                {formSlug && (
                  <EditableSlug
                    slug={formSlug}
                    onSlugChange={onSlugChange}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ======================================== */}
          {/* CENTER SECTION - Viewport Toggle */}
          {/* ======================================== */}
          <div className="flex items-center justify-center">
            <ViewportToggle
              viewportMode={state.viewportMode}
              onViewportChange={actions.setViewportMode}
            />
          </div>

          {/* ======================================== */}
          {/* RIGHT SECTION - Undo/Redo, Auto-save, Preview, Save */}
          {/* ======================================== */}
          <div className="flex items-center gap-2 justify-end">
            {/* Undo/Redo buttons */}
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={actions.undo}
                    disabled={!canUndo}
                    className="h-8 w-8"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo (⌘Z)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={actions.redo}
                    disabled={!canRedo}
                    className="h-8 w-8"
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo (⌘⇧Z)</TooltipContent>
              </Tooltip>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Auto-save toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="auto-save"
                checked={state.autoSaveEnabled}
                onCheckedChange={actions.setAutoSave}
                className="data-[state=checked]:bg-primary"
              />
              <Label
                htmlFor="auto-save"
                className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
              >
                Auto-save
              </Label>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Share button - only show if form has a slug */}
            {formSlug && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsShareModalOpen(true)}
                    className="gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share form</TooltipContent>
              </Tooltip>
            )}

            {/* Preview toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={state.isPreviewMode ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={actions.togglePreviewMode}
                  className="gap-2"
                >
                  {state.isPreviewMode ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      Edit
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      Preview
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {state.isPreviewMode ? 'Exit preview (⌘P)' : 'Preview form (⌘P)'}
              </TooltipContent>
            </Tooltip>

            {/*
             * Save button with state indicators:
             * - Saving (auto or manual): Shows spinner
             * - Just saved: Shows checkmark with "Saved"
             * - Unsaved changes: Shows red dot indicator
             * - Default: Shows "Save"
             */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || isAutoSaving || !state.isDirty || state.autoSaveEnabled}
                  className="gap-2 relative"
                >
                  {/* Red dot indicator for unsaved changes */}
                  {state.isDirty && !isSaving && !isAutoSaving && !justSaved && !manualJustSaved && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-destructive rounded-full" />
                  )}

                  {/* Button content based on state */}
                  {isSaving || isAutoSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : justSaved || manualJustSaved ? (
                    <>
                      <Check className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {state.autoSaveEnabled
                  ? 'Auto-save is enabled'
                  : state.isDirty
                  ? 'Save changes (⌘S)'
                  : 'No unsaved changes'}
              </TooltipContent>
            </Tooltip>

            {/* Divider before publish toggle */}
            {onPublish && <div className="w-px h-6 bg-border" />}

            {/* Publish toggle - switch form visibility */}
            {onPublish && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="publish-toggle"
                      checked={isPublished}
                      onCheckedChange={handlePublishToggle}
                      disabled={isPublishing}
                    />
                    <Label
                      htmlFor="publish-toggle"
                      className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
                    >
                      {isPublishing ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {isPublished ? 'Unpublishing...' : 'Publishing...'}
                        </span>
                      ) : isPublished ? (
                        'Published'
                      ) : (
                        'Draft'
                      )}
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {isPublished
                    ? 'Click to unpublish (make private)'
                    : 'Click to publish (make public)'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Share Form Modal */}
      {formSlug && (
        <ShareFormModal
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
          formName={formName || state.schema.title}
          formSlug={formSlug}
          formStatus={formStatus}
        />
      )}
    </TooltipProvider>
  )
}
