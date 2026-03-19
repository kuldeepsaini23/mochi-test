/**
 * ============================================================================
 * ECOMMERCE CAROUSEL SETTINGS - Image gallery configuration panel
 * ============================================================================
 *
 * SOURCE OF TRUTH: EcommerceCarouselElement settings in the Properties Panel
 *
 * Renders the Settings tab content for EcommerceCarousel elements, allowing
 * users to manage product images and configure display behavior.
 *
 * ============================================================================
 * SECTIONS
 * ============================================================================
 *
 * 1. IMAGES MANAGER
 *    - Add images via StorageBrowserModal (organization media bucket)
 *    - Each image row: thumbnail preview, alt text input, move up/down, delete
 *    - Images array stored as { id, src, alt }[]
 *
 * 2. NAVIGATION
 *    - Navigation Style dropdown: thumbnails / dots / arrows
 *    - Controls which carousel variant is rendered
 *
 * 3. DISPLAY OPTIONS
 *    - Show More toggle: truncates thumbnails with "+X more" when ON (thumbnails only)
 *    - Object Fit: how the featured image fills its container (cover/contain/fill)
 *
 * 4. SIZING CONTROLS
 *    - Thumbnail Size (px): width/height of each thumbnail square (thumbnails only)
 *    - Thumbnail Gap (px): spacing between thumbnails (thumbnails only)
 *    - Border Radius (px): corner rounding for all images (all variants)
 *
 * ============================================================================
 */

'use client'

import React, { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, ImageIcon, FolderOpen } from 'lucide-react'
import { PropertySection, ToggleControl, DropdownControl, InputGroupControl } from './controls'
import { useAppDispatch, updateElement } from '../../_lib'
import type { EcommerceCarouselElement, CarouselNavigationStyle } from '../../_lib/types'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import { useBuilderContext } from '../../_lib/builder-context'
import type { SelectedFile } from '@/components/storage-browser/types'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface EcommerceCarouselSettingsSectionProps {
  element: EcommerceCarouselElement
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders the Settings tab for EcommerceCarousel elements.
 * Manages the image list, display toggles, and sizing controls.
 */
export function EcommerceCarouselSettingsSection({ element }: EcommerceCarouselSettingsSectionProps) {
  const dispatch = useAppDispatch()

  /** Access organization ID from builder context for the storage browser */
  const { organizationId } = useBuilderContext()

  /** Controls whether the storage browser modal is open */
  const [isStorageOpen, setIsStorageOpen] = useState(false)

  /** Current images array from the element (defaults to empty) */
  const images = element.images ?? []

  // ==========================================================================
  // IMAGE MANAGEMENT HELPERS
  // ==========================================================================

  /**
   * Handle file selection from the storage browser.
   * Creates a new image entry with a unique ID and appends it to the array.
   */
  const handleAddImage = (file: SelectedFile) => {
    const imageUrl = file.accessUrl || file.publicUrl || ''
    if (!imageUrl) return

    const newImage = {
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      src: imageUrl,
      alt: '',
    }

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          images: [...images, newImage],
        },
      })
    )
    setIsStorageOpen(false)
  }

  /**
   * Remove an image from the array by its unique ID.
   * Also adjusts featuredIndex if the removed image was featured or
   * if the removal shifts the featured image's position.
   */
  const handleRemoveImage = (imageId: string) => {
    const removedIndex = images.findIndex((img) => img.id === imageId)
    const newImages = images.filter((img) => img.id !== imageId)

    /** Keep featuredIndex valid after removal */
    let newFeaturedIndex = element.featuredIndex ?? 0
    if (removedIndex <= newFeaturedIndex && newFeaturedIndex > 0) {
      newFeaturedIndex = newFeaturedIndex - 1
    }
    /** Clamp to valid range */
    if (newFeaturedIndex >= newImages.length) {
      newFeaturedIndex = Math.max(0, newImages.length - 1)
    }

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          images: newImages,
          featuredIndex: newFeaturedIndex,
        },
      })
    )
  }

  /**
   * Update the alt text for a specific image by its ID.
   */
  const handleAltTextChange = (imageId: string, newAlt: string) => {
    const newImages = images.map((img) =>
      img.id === imageId ? { ...img, alt: newAlt } : img
    )

    dispatch(
      updateElement({
        id: element.id,
        updates: { images: newImages },
      })
    )
  }

  /**
   * Move an image up (towards index 0) in the array.
   * Adjusts featuredIndex if the move affects the featured image's position.
   */
  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    const newImages = [...images]
    ;[newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]]

    /** Track whether the featured image was one of the swapped items */
    let newFeaturedIndex = element.featuredIndex ?? 0
    if (newFeaturedIndex === index) {
      newFeaturedIndex = index - 1
    } else if (newFeaturedIndex === index - 1) {
      newFeaturedIndex = index
    }

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          images: newImages,
          featuredIndex: newFeaturedIndex,
        },
      })
    )
  }

  /**
   * Move an image down (towards the end of array) in the array.
   * Adjusts featuredIndex if the move affects the featured image's position.
   */
  const handleMoveDown = (index: number) => {
    if (index >= images.length - 1) return
    const newImages = [...images]
    ;[newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]]

    /** Track whether the featured image was one of the swapped items */
    let newFeaturedIndex = element.featuredIndex ?? 0
    if (newFeaturedIndex === index) {
      newFeaturedIndex = index + 1
    } else if (newFeaturedIndex === index + 1) {
      newFeaturedIndex = index
    }

    dispatch(
      updateElement({
        id: element.id,
        updates: {
          images: newImages,
          featuredIndex: newFeaturedIndex,
        },
      })
    )
  }

  // ==========================================================================
  // PROPERTY UPDATE HELPERS
  // ==========================================================================

  /**
   * Generic updater for simple element properties (showMore, objectFit, etc.)
   * Dispatches a Redux updateElement action with the given partial updates.
   */
  const updateProperty = (updates: Partial<EcommerceCarouselElement>) => {
    dispatch(
      updateElement({
        id: element.id,
        updates,
      })
    )
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <>
      {/* ==================================================================
          IMAGES MANAGER - Add, remove, reorder, and edit alt text for images
          ================================================================== */}
      <PropertySection title="Images" defaultOpen>
        {/* Image list */}
        {images.length > 0 ? (
          <div className="space-y-2 px-3">
            {images.map((image, index) => (
              <div
                key={image.id}
                className={cn(
                  'flex items-start gap-2 p-2 rounded-md',
                  'border border-border bg-muted/30',
                  'group'
                )}
              >
                {/* Thumbnail preview */}
                <div className="w-10 h-10 rounded overflow-hidden bg-muted/50 border border-border flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.src}
                    alt={image.alt || 'Image preview'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                </div>

                {/* Alt text input and controls */}
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={image.alt}
                    onChange={(e) => handleAltTextChange(image.id, e.target.value)}
                    placeholder="Alt text..."
                    className={cn(
                      'w-full h-7 px-2 text-xs rounded',
                      'bg-background border border-border',
                      'focus:outline-none focus:ring-1 focus:ring-primary',
                      'placeholder:text-muted-foreground/50'
                    )}
                  />

                  {/* Action buttons row: move up, move down, delete */}
                  <div className="flex items-center gap-1">
                    {/* Move up button - disabled if first item */}
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className={cn(
                        'w-6 h-6 rounded flex items-center justify-center',
                        'text-muted-foreground hover:text-foreground hover:bg-muted',
                        'transition-colors disabled:opacity-30 disabled:cursor-not-allowed'
                      )}
                      title="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>

                    {/* Move down button - disabled if last item */}
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === images.length - 1}
                      className={cn(
                        'w-6 h-6 rounded flex items-center justify-center',
                        'text-muted-foreground hover:text-foreground hover:bg-muted',
                        'transition-colors disabled:opacity-30 disabled:cursor-not-allowed'
                      )}
                      title="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Spacer pushes delete to the right */}
                    <div className="flex-1" />

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(image.id)}
                      className={cn(
                        'w-6 h-6 rounded flex items-center justify-center',
                        'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                        'transition-colors'
                      )}
                      title="Remove image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty state when no images are added */
          <div className="px-3">
            <div
              className={cn(
                'w-full py-6 rounded-lg',
                'border border-dashed border-border',
                'flex flex-col items-center justify-center gap-2',
                'bg-muted/20'
              )}
            >
              <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground/60 text-center">
                No images added yet
              </p>
            </div>
          </div>
        )}

        {/* Add Image button - opens storage browser */}
        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => setIsStorageOpen(true)}
            className={cn(
              'w-full py-2 px-4 rounded-lg',
              'border-2 border-dashed border-border',
              'hover:border-primary/50 hover:bg-primary/5',
              'transition-all duration-200',
              'flex items-center justify-center gap-2',
              'text-sm text-muted-foreground hover:text-foreground'
            )}
          >
            <Plus className="w-4 h-4" />
            <span>Add Image</span>
          </button>
        </div>
      </PropertySection>

      {/* ==================================================================
          NAVIGATION STYLE - Choose how users navigate between carousel images
          ================================================================== */}
      <PropertySection title="Navigation" defaultOpen>
        {/* Navigation Style selector — thumbnails (classic), dots (Apple-style), or arrows */}
        <DropdownControl
          label="Style"
          value={element.navigationStyle ?? 'thumbnails'}
          options={[
            { value: 'thumbnails', label: 'Thumbnails' },
            { value: 'dots', label: 'Dots' },
            { value: 'arrows', label: 'Arrows' },
          ]}
          onChange={(val) =>
            updateProperty({ navigationStyle: val as CarouselNavigationStyle })
          }
        />
      </PropertySection>

      {/* ==================================================================
          DISPLAY OPTIONS - Show More toggle and Object Fit selector
          ================================================================== */}
      <PropertySection title="Display Options" defaultOpen>
        {/* Show More toggle — only relevant for thumbnail navigation style */}
        {(element.navigationStyle ?? 'thumbnails') === 'thumbnails' && (
          <ToggleControl
            label="Show More"
            checked={element.showMore ?? false}
            onChange={(checked) => updateProperty({ showMore: checked })}
          />
        )}

        {/* Object Fit - how the featured image fills its container */}
        <DropdownControl
          label="Object Fit"
          value={element.objectFit ?? 'cover'}
          options={[
            { value: 'cover', label: 'Cover' },
            { value: 'contain', label: 'Contain' },
            { value: 'fill', label: 'Fill' },
          ]}
          onChange={(val) =>
            updateProperty({ objectFit: val as 'cover' | 'contain' | 'fill' })
          }
        />
      </PropertySection>

      {/* ==================================================================
          SIZING CONTROLS - Thumbnail dimensions, gap, and border radius
          ================================================================== */}
      <PropertySection title="Sizing" defaultOpen>
        {/* Thumbnail Size and Gap — only apply to 'thumbnails' navigation style */}
        {(element.navigationStyle ?? 'thumbnails') === 'thumbnails' && (
          <>
            {/* Thumbnail Size - width and height of each thumbnail square */}
            <InputGroupControl
              label="Thumbnail Size"
              value={element.thumbnailSize ?? 64}
              onChange={(val) => updateProperty({ thumbnailSize: Number(val) })}
              type="number"
              min={24}
              max={200}
              unit="px"
            />

            {/* Thumbnail Gap - spacing between thumbnail images */}
            <InputGroupControl
              label="Thumbnail Gap"
              value={element.thumbnailGap ?? 8}
              onChange={(val) => updateProperty({ thumbnailGap: Number(val) })}
              type="number"
              min={0}
              max={48}
              unit="px"
            />
          </>
        )}

        {/* Border Radius - corner rounding applied to all images (all navigation variants) */}
        <InputGroupControl
          label="Border Radius"
          value={element.imageBorderRadius ?? 8}
          onChange={(val) => updateProperty({ imageBorderRadius: Number(val) })}
          type="number"
          min={0}
          max={100}
          unit="px"
        />
      </PropertySection>

      {/* Storage Browser Modal for selecting images from the org media bucket */}
      <StorageBrowserModal
        open={isStorageOpen}
        onOpenChange={setIsStorageOpen}
        organizationId={organizationId}
        mode="select"
        fileFilter="image"
        title="Select Image"
        subtitle="Choose an image from your storage"
        onSelect={(file) => handleAddImage(file as SelectedFile)}
      />
    </>
  )
}
