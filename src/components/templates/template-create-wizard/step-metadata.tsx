/**
 * ============================================================================
 * TEMPLATE CREATE WIZARD — STEP 3: METADATA
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: StepMetadata, TemplateMetadataForm
 *
 * WHY: Collects template metadata — name, description, tags, and optional
 * thumbnail image. This info is displayed in the library when others browse.
 *
 * HOW: React Hook Form + Zod validation. Tags are added/removed dynamically.
 * Thumbnail opens the StorageBrowserModal for image selection.
 * Shows a live preview card on the right side.
 */

'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Plus, ImageIcon } from 'lucide-react'

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { RichTextEditor } from '@/components/editor'

import {
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_MAX_TAGS,
  TEMPLATE_CATEGORY_META,
} from '@/lib/templates/constants'
import { useTemplateLibrary } from '../template-library-context'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'

// ============================================================================
// FORM SCHEMA
// ============================================================================

/**
 * Zod validation schema for template metadata.
 * Enforces required name, optional description/tags/thumbnail.
 */
const templateMetadataSchema = z.object({
  name: z
    .string()
    .min(1, 'Template name is required')
    .max(TEMPLATE_NAME_MAX_LENGTH, `Name must be ${TEMPLATE_NAME_MAX_LENGTH} characters or less`),
  description: z
    .string()
    .optional()
    .or(z.literal('')),
  tags: z.array(z.string()).max(TEMPLATE_MAX_TAGS, `Maximum ${TEMPLATE_MAX_TAGS} tags`),
  thumbnailUrl: z.string().optional().or(z.literal('')),
})

export type TemplateMetadataFormValues = z.infer<typeof templateMetadataSchema>

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Step 3 — Metadata form with live preview.
 *
 * Layout:
 * - Left: Form fields (name, description, tags, thumbnail)
 * - Right: Preview card showing how it will look in the library
 */
export function StepMetadata() {
  const { wizardSelectedFeature, setCreateStep, setWizardMetadata, wizardPrice, organizationId } = useTemplateLibrary()

  /** Storage browser state for thumbnail selection */
  const [storageBrowserOpen, setStorageBrowserOpen] = useState(false)
  /** Tag input state */
  const [tagInput, setTagInput] = useState('')

  const form = useForm<TemplateMetadataFormValues>({
    resolver: zodResolver(templateMetadataSchema),
    defaultValues: {
      name: '',
      description: '',
      tags: [],
      thumbnailUrl: '',
    },
  })

  const watchedValues = form.watch()

  /** Add a tag to the list */
  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase()
    if (!trimmed) return
    const current = form.getValues('tags')
    if (current.includes(trimmed)) return
    if (current.length >= TEMPLATE_MAX_TAGS) return
    form.setValue('tags', [...current, trimmed])
    setTagInput('')
  }

  /** Remove a tag by value */
  const removeTag = (tag: string) => {
    const current = form.getValues('tags')
    form.setValue('tags', current.filter((t) => t !== tag))
  }

  /** Handle tag input keydown — add on Enter */
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  /** Handle form submission — save metadata to wizard context and advance to step 4 */
  const handleNext = form.handleSubmit((values) => {
    setWizardMetadata({
      name: values.name,
      description: values.description ?? '',
      tags: values.tags,
      thumbnailUrl: values.thumbnailUrl ?? '',
      price: wizardPrice,
    })
    setCreateStep(3)
  })

  /** Get category meta for the preview card */
  const categoryMeta = wizardSelectedFeature
    ? TEMPLATE_CATEGORY_META[wizardSelectedFeature.featureType]
    : null
  const CategoryIcon = categoryMeta?.icon

  return (
    <div className="grid grid-cols-1 gap-6 pt-4 lg:grid-cols-5">
      {/* Left: Form Fields */}
      <div className="lg:col-span-3">
        <Form {...form}>
          <form onSubmit={handleNext} className="space-y-5">
            {/* Template Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="My Awesome Template"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {field.value.length}/{TEMPLATE_NAME_MAX_LENGTH} characters
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description — Lexical rich text editor for formatted content */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <div className="rounded-md bg-muted/30 min-h-[140px]">
                      <RichTextEditor
                        initialContent={field.value || undefined}
                        onChange={(content) => field.onChange(content)}
                        variant="standard"
                        placeholder="Describe what this template includes and when to use it..."
                        organizationId={organizationId}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Use the editor toolbar to format your description with headings, lists, and links.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tags */}
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a tag..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={addTag}
                      disabled={field.value.length >= TEMPLATE_MAX_TAGS}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* Tag List */}
                  {field.value.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {field.value.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1">
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="ml-0.5 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <FormDescription>
                    {field.value.length}/{TEMPLATE_MAX_TAGS} tags
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Thumbnail */}
            <FormField
              control={form.control}
              name="thumbnailUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thumbnail</FormLabel>
                  <div className="flex items-center gap-3">
                    {field.value ? (
                      <div className="relative h-20 w-32 overflow-hidden rounded-md border">
                        <img
                          src={field.value}
                          alt="Template thumbnail"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => form.setValue('thumbnailUrl', '')}
                          className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 hover:bg-background"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStorageBrowserOpen(true)}
                        className="gap-2"
                      >
                        <ImageIcon className="h-4 w-4" />
                        Choose Image
                      </Button>
                    )}
                  </div>
                  <FormDescription>
                    Optional thumbnail shown in the template library
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <Button type="submit">Next: Review & Confirm</Button>
            </div>
          </form>
        </Form>
      </div>

      {/* Right: Preview Card */}
      <div className="lg:col-span-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Preview</p>
        <Card className="overflow-hidden p-0">
          {/* Thumbnail preview */}
          <div className="h-28 w-full bg-gradient-to-br from-muted to-muted/50">
            {watchedValues.thumbnailUrl ? (
              <img
                src={watchedValues.thumbnailUrl}
                alt="Preview"
                className="h-full w-full object-cover"
              />
            ) : CategoryIcon ? (
              <div className="flex h-full w-full items-center justify-center">
                <CategoryIcon className="h-8 w-8 text-muted-foreground/30" />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5 p-3">
            {categoryMeta && (
              <Badge variant="secondary" className="w-fit text-xs">
                {categoryMeta.label}
              </Badge>
            )}
            <p className="truncate text-sm font-semibold">
              {watchedValues.name || 'Untitled Template'}
            </p>
            {watchedValues.description && (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {watchedValues.description}
              </p>
            )}
            {watchedValues.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {watchedValues.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
                {watchedValues.tags.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{watchedValues.tags.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Storage Browser Modal — for thumbnail selection */}
      <StorageBrowserModal
        open={storageBrowserOpen}
        onOpenChange={setStorageBrowserOpen}
        organizationId={organizationId}
        mode="select"
        fileFilter="image"
        onSelect={(file) => {
          /** In single-select mode, file is always a single SelectedFile */
          const selected = Array.isArray(file) ? file[0] : file
          if (selected?.accessUrl) {
            form.setValue('thumbnailUrl', selected.accessUrl)
          }
          setStorageBrowserOpen(false)
        }}
      />
    </div>
  )
}
