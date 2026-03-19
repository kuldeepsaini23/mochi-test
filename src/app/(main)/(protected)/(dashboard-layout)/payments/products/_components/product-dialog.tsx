/**
 * Product Dialog Component
 *
 * WHY: Create/edit products
 * HOW: Sheet with form for name, description
 *
 * ARCHITECTURE:
 * - Same component handles create and edit modes
 * - Uses tRPC mutations with optimistic updates
 */

'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { trpc } from '@/trpc/react-provider'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, X, Plus, FolderOpen, Images } from 'lucide-react'
import { toast } from 'sonner'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import { cn } from '@/lib/utils'

/** Form validation schema — imageUrl is the featured image, images is the gallery (max 8) */
const productFormSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  imageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  images: z.array(z.string()).max(8, 'Maximum 8 gallery images'),
  active: z.boolean(),
})

type ProductFormValues = z.infer<typeof productFormSchema>

interface Product {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  /** SOURCE OF TRUTH: ProductGalleryImages — array of gallery image URLs (max 8) */
  images: string[]
  active: boolean
}

interface ProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  product?: Product | null
}

export function ProductDialog({
  open,
  onOpenChange,
  organizationId,
  product,
}: ProductDialogProps) {
  const isEditMode = !!product
  const utils = trpc.useUtils()
  const queryClient = useQueryClient()
  // Storage browser modal states — separate for featured image and gallery
  const [featuredImageStorageOpen, setFeaturedImageStorageOpen] = useState(false)
  const [galleryStorageOpen, setGalleryStorageOpen] = useState(false)

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      description: '',
      imageUrl: '',
      images: [],
      active: true,
    },
  })

  // Reset form when dialog opens/closes or product changes
  useEffect(() => {
    if (open && product) {
      form.reset({
        name: product.name,
        description: product.description || '',
        imageUrl: product.imageUrl || '',
        images: product.images || [],
        active: product.active,
      })
    } else if (open && !product) {
      form.reset({
        name: '',
        description: '',
        imageUrl: '',
        images: [],
        active: true,
      })
    }
  }, [open, product, form])

  // Create mutation with optimistic update
  const createMutation = trpc.products.create.useMutation({
    onMutate: async (newProduct) => {
      // Cancel all product list queries
      await queryClient.cancelQueries({ queryKey: [['products', 'list']] })

      const now = new Date().toISOString()
      const optimisticProduct = {
        id: `temp-${Date.now()}`,
        organizationId,
        name: newProduct.name,
        description: newProduct.description || null,
        imageUrl: newProduct.imageUrl || null,
        stripeProductId: null,
        active: true,
        prices: [],
        createdAt: now,
        updatedAt: now,
      }

      // Update ALL cached product list queries using setQueriesData
      queryClient.setQueriesData(
        { queryKey: [['products', 'list']] },
        (old: any) => {
          if (!old) return old
          return {
            ...old,
            products: [optimisticProduct, ...old.products],
            total: old.total + 1,
          }
        }
      )

      // Close dialog immediately for snappy UX
      onOpenChange(false)

      return { optimisticProduct }
    },
    onError: (err) => {
      /**
       * Server-side feature limit errors are caught here as a fallback.
       * The parent already wraps the create button with <FeatureGate> for
       * client-side pre-checks, so this only fires if the gate was bypassed.
       */
      toast.error(err.message || 'Failed to create product')
      // Invalidate to refetch correct data
      utils.products.list.invalidate()
    },
    onSuccess: () => {
      toast.success('Product created')
    },
    onSettled: () => {
      utils.products.list.invalidate()
    },
  })

  // Update mutation with optimistic update
  const updateMutation = trpc.products.update.useMutation({
    onMutate: async (updatedProduct) => {
      // Cancel all product list queries
      await queryClient.cancelQueries({ queryKey: [['products', 'list']] })

      // Update ALL cached product list queries
      queryClient.setQueriesData(
        { queryKey: [['products', 'list']] },
        (old: any) => {
          if (!old) return old
          return {
            ...old,
            products: old.products.map((item: any) =>
              item.id === updatedProduct.productId
                ? {
                    ...item,
                    name: updatedProduct.name || item.name,
                    description: updatedProduct.description ?? item.description,
                    imageUrl: updatedProduct.imageUrl ?? item.imageUrl,
                    active: updatedProduct.active ?? item.active,
                  }
                : item
            ),
          }
        }
      )

      // Close dialog immediately for snappy UX
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update product')
      utils.products.list.invalidate()
    },
    onSuccess: () => {
      toast.success('Product updated')
    },
    onSettled: () => {
      utils.products.list.invalidate()
    },
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  const onSubmit = (values: ProductFormValues) => {
    if (isEditMode && product) {
      updateMutation.mutate({
        organizationId,
        productId: product.id,
        name: values.name,
        description: values.description || null,
        imageUrl: values.imageUrl || null,
        images: values.images,
        active: values.active,
      })
    } else {
      createMutation.mutate({
        organizationId,
        name: values.name,
        description: values.description || null,
        imageUrl: values.imageUrl || null,
        images: values.images,
      })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col border-border/40"
      >
        {/* Hidden header for accessibility */}
        <SheetHeader className="sr-only">
          <SheetTitle>
            {isEditMode ? 'Edit Product' : 'Create Product'}
          </SheetTitle>
        </SheetHeader>

        {/* Header */}
        <div className="px-6 py-5 border-b">
          <h2 className="text-lg font-semibold">
            {isEditMode ? 'Edit Product' : 'Create Product'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEditMode
              ? 'Update this product'
              : 'Create a new product to sell to your customers'}
          </p>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Premium Course" {...field} />
                    </FormControl>
                    <FormDescription>
                      The name of your product
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="A comprehensive course covering..."
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional description for your product
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Featured Image — select from storage or paste URL */}
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Featured Image</FormLabel>
                    <div className="space-y-2">
                      {/* Preview thumbnail when an image is set */}
                      {field.value && (
                        <div className="relative group w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border/30">
                          <img
                            src={field.value}
                            alt="Featured product image"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                          {/* Remove button on hover */}
                          <button
                            type="button"
                            onClick={() => form.setValue('imageUrl', '')}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* Select from Storage button */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFeaturedImageStorageOpen(true)}
                        className="gap-2"
                      >
                        <FolderOpen className="w-4 h-4" />
                        Select from Storage
                      </Button>

                      {/* Fallback URL input */}
                      <FormControl>
                        <Input
                          type="url"
                          placeholder="or paste image URL..."
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormDescription>
                      Optional featured product image
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Featured Image Storage Browser Modal — single select mode */}
              <StorageBrowserModal
                open={featuredImageStorageOpen}
                onOpenChange={setFeaturedImageStorageOpen}
                organizationId={organizationId}
                mode="select"
                fileFilter="image"
                title="Select Featured Image"
                subtitle="Choose an image for your product"
                onSelect={(file) => {
                  /* Narrow to single file — this is a single-select picker */
                  const selected = Array.isArray(file) ? file[0] : file
                  if (selected) {
                    form.setValue('imageUrl', selected.accessUrl || selected.publicUrl || '')
                  }
                  setFeaturedImageStorageOpen(false)
                }}
              />

              {/* Product Gallery — grid of up to 8 images with add/remove */}
              <FormField
                control={form.control}
                name="images"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Images className="w-4 h-4" />
                      Product Gallery
                    </FormLabel>
                    <div className="space-y-2">
                      {/* Thumbnail grid of existing gallery images */}
                      {field.value.length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
                          {field.value.map((url, index) => (
                            <div
                              key={`${url}-${index}`}
                              className="relative group aspect-square rounded-lg overflow-hidden bg-muted border border-border/30"
                            >
                              <img
                                src={url}
                                alt={`Gallery image ${index + 1}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  ;(e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                              {/* Remove button — visible on hover */}
                              <button
                                type="button"
                                onClick={() => {
                                  form.setValue(
                                    'images',
                                    field.value.filter((_, i) => i !== index)
                                  )
                                }}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Images button — opens storage browser in multi-select mode */}
                      <button
                        type="button"
                        onClick={() => setGalleryStorageOpen(true)}
                        disabled={field.value.length >= 8}
                        className={cn(
                          'w-full py-2.5 px-4 rounded-lg',
                          'border-2 border-dashed border-border',
                          'hover:border-primary/50 hover:bg-primary/5',
                          'transition-all duration-200',
                          'flex items-center justify-center gap-2',
                          'text-sm text-muted-foreground hover:text-foreground',
                          field.value.length >= 8 &&
                            'opacity-50 cursor-not-allowed hover:border-border hover:bg-transparent'
                        )}
                      >
                        <Plus className="w-4 h-4" />
                        <span>
                          {field.value.length > 0 ? 'Add More Images' : 'Add Images'}
                        </span>
                      </button>

                      {/* Image count */}
                      <p className="text-xs text-muted-foreground/60">
                        {field.value.length}/8 images
                      </p>
                    </div>
                    <FormDescription>
                      Additional product images for gallery display
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Gallery Storage Browser Modal — multi-select mode, capped at 8 total */}
              <StorageBrowserModal
                open={galleryStorageOpen}
                onOpenChange={setGalleryStorageOpen}
                organizationId={organizationId}
                mode="multi-select"
                fileFilter="image"
                title="Select Gallery Images"
                subtitle="Choose images for the product gallery"
                onConfirm={(files) => {
                  const currentImages = form.getValues('images')
                  const newUrls = (Array.isArray(files) ? files : [files])
                    .map((file) => file.accessUrl || file.publicUrl || '')
                    .filter((url) => url.length > 0)
                  // Cap at 8 total images
                  const combined = [...currentImages, ...newUrls].slice(0, 8)
                  form.setValue('images', combined)
                  setGalleryStorageOpen(false)
                }}
              />

              {isEditMode && (
                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Inactive products won't be available for purchase
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              {/* Submit button */}
              <div className="pt-4">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditMode ? 'Update Product' : 'Create Product'}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
