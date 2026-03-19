/**
 * ============================================================================
 * AI WIDGET SHELL - WIDGET INPUT
 * ============================================================================
 *
 * Shared text input for AI widgets with auto-resize and scrolling.
 * Supports two modes:
 * - Minimal: compact single-line <input> with inline send button
 * - Expanded: auto-resizing <textarea> with model selector + action buttons
 *
 * Uses a `maxLength` prop (default 2000) instead of importing from domain
 * modules, making it reusable across Mochi and Builder widgets.
 *
 * SOURCE OF TRUTH KEYWORDS: WidgetInput, AIWidgetInput, SharedPromptInput
 * ============================================================================
 */

'use client'

import React, { useCallback, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react'
import { Send, Paperclip, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getModelsByProvider } from '@/lib/ai/gateway/models'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WidgetInputProps, ImageAttachmentPreview } from './types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default max prompt length — matches both Mochi and Builder constants */
const DEFAULT_MAX_LENGTH = 2000

/** App name from environment variable, fallback to "Mochi" */
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'

/** Max single image size (4MB) */
const MAX_IMAGE_SIZE = 4 * 1024 * 1024

/** Max images per message */
const MAX_IMAGES = 5

/** Accepted image MIME types */
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif'

/**
 * Reads a File as base64 (without the data URI prefix).
 * Used for inline transmission of image attachments to the AI model.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip "data:image/png;base64," prefix — send raw base64
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * WidgetInput — Text area for entering prompts.
 * Uses controlled state (value/onChange) to preserve text between minimal/expanded modes.
 * Minimal mode renders a simple <input>, expanded mode renders a <textarea> with controls.
 */
export function WidgetInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Ask AI anything...',
  isMinimal = false,
  selectedModel,
  onModelChange,
  maxLength = DEFAULT_MAX_LENGTH,
  onStop,
  className,
  imageAttachments,
  onImagesChange,
}: WidgetInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Handles text change with max length validation
   */
  const handleChange = useCallback(
    (newValue: string) => {
      if (newValue.length <= maxLength) {
        onChange(newValue)
      }
    },
    [onChange, maxLength]
  )

  /**
   * Handles form submission — trims input, calls onSubmit, then clears
   */
  /**
   * Handles form submission — submits text (or image-only prompt), then clears input.
   * When images are attached but no text, sends a default prompt for the AI.
   */
  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    const hasAttachedImages = (imageAttachments?.length ?? 0) > 0
    if ((trimmed || hasAttachedImages) && !disabled) {
      onSubmit(trimmed || 'Analyze this image and generate a matching UI section.')
      onChange('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }, [value, disabled, onSubmit, onChange, imageAttachments])

  /**
   * Handles keyboard events for textarea.
   * Enter without Shift: Submit. Shift+Enter: Newline (default behavior).
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  /**
   * Auto-resize textarea based on content
   */
  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const maxHeight = isMinimal ? 44 : 120
      const newHeight = Math.min(textarea.scrollHeight, maxHeight)
      textarea.style.height = `${newHeight}px`
    }
  }, [isMinimal])

  /**
   * Auto-resize on value change (needed when switching modes)
   */
  useEffect(() => {
    if (!isMinimal) {
      handleInput()
    }
  }, [value, isMinimal, handleInput])

  /**
   * Handles file selection from the hidden input.
   * Reads selected images as base64, validates size/type, and passes to parent.
   */
  const handleFileSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (!files.length || !onImagesChange) return

      const current = imageAttachments ?? []
      const newImages: ImageAttachmentPreview[] = []

      for (const file of files) {
        if (current.length + newImages.length >= MAX_IMAGES) break
        if (!file.type.startsWith('image/')) continue
        if (file.size > MAX_IMAGE_SIZE) continue

        const base64 = await fileToBase64(file)
        newImages.push({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          base64,
          mediaType: file.type,
          filename: file.name,
          size: file.size,
        })
      }

      if (newImages.length > 0) {
        onImagesChange([...current, ...newImages])
      }
      // Reset input so the same file can be re-selected
      e.target.value = ''
    },
    [onImagesChange, imageAttachments]
  )

  /** Allow submission when there's text OR attached images */
  const hasImages = (imageAttachments?.length ?? 0) > 0
  const canSubmit = (value.trim().length > 0 || hasImages) && !disabled

  // ========================================================================
  // MINIMAL MODE — Simple input field in the compact bar
  // ========================================================================
  if (isMinimal) {
    return (
      <div className={cn('relative hidden sm:block', className)}>
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full h-10 px-4 pr-10 rounded-lg',
            'bg-muted/50 border border-border/50',
            'text-sm text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring/50',
            'transition-all duration-150',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2',
            'p-1.5 rounded-md transition-colors duration-150',
            canSubmit
              ? 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              : 'text-muted-foreground/50 cursor-not-allowed'
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // ========================================================================
  // EXPANDED MODE — Full textarea with bottom controls
  // ========================================================================
  return (
    <div className={cn('border-t border-border/50', className)}>
      {/* Input Area */}
      <div className="relative px-4 pt-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'w-full resize-none rounded-lg',
            'bg-transparent border-none',
            'text-sm text-foreground placeholder:text-muted-foreground',
            'focus:outline-none',
            'min-h-[44px] max-h-[120px]',
            'scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>

      {/* Image Preview Strip — shown when images are attached */}
      {imageAttachments && imageAttachments.length > 0 && (
        <div className="flex gap-2 px-4 pb-1 overflow-x-auto">
          {imageAttachments.map((img) => (
            <div key={img.id} className="relative group shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:${img.mediaType};base64,${img.base64}`}
                alt={img.filename}
                className="h-14 w-14 rounded-lg object-cover border border-border/50"
              />
              <button
                type="button"
                onClick={() => onImagesChange?.(imageAttachments.filter((i) => i.id !== img.id))}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input for image attachment */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Bottom Controls */}
      <div className="flex items-center justify-between px-4 py-2">
        {/* App Name + Model Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{APP_NAME}</span>
          {selectedModel && onModelChange ? (
            <Select value={selectedModel} onValueChange={onModelChange}>
              <SelectTrigger
                size="sm"
                className="h-6 min-w-0 max-w-[150px] gap-1 border-border/50 bg-muted/60 px-2 text-[11px] text-muted-foreground shadow-none hover:text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[10000] max-h-64 bg-popover border-border/50">
                {getModelsByProvider().map((group) => (
                  <SelectGroup key={group.provider}>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {group.provider}
                    </SelectLabel>
                    {group.models.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        className="text-xs text-foreground focus:bg-muted focus:text-foreground"
                      >
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">AI</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Attach image"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          {/* Stop button — shown when AI is generating, replaces send button */}
          {disabled && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="p-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/80 transition-colors"
              title="Stop generating"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                'p-2 rounded-full transition-colors',
                canSubmit
                  ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                  : 'bg-muted text-muted-foreground/50 cursor-not-allowed'
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
