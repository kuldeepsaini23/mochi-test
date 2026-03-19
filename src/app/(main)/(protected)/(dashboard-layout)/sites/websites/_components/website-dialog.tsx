/**
 * Website Dialog Component
 *
 * WHY: Modal for creating new websites (categories) or editing existing ones
 * HOW: Form with validation using react-hook-form and zod
 *
 * ============================================================================
 * ARCHITECTURE: Website → Pages (Domain is optional)
 * ============================================================================
 *
 * KEY CONCEPT: A "Website" is NOT a single page - it's a CATEGORY/GROUPING.
 *
 * HIERARCHY:
 * - Website: A category/grouping that contains multiple pages (gets auto-generated previewId)
 * - Domain: Optional custom domain for production URLs (can be connected later)
 * - Page: An actual page with a URL slug (e.g., "/home", "/about", "/contact")
 *
 * PREVIEW ID SYSTEM (Webflow-style):
 * - Each website gets an auto-generated previewId (e.g., "a7x9k2m5")
 * - Preview URLs use this ID: /{previewId}/{page.slug}
 * - This is clearly temporary/development, not a broken domain
 * - Domain can be connected later for production URLs
 *
 * CREATION FLOW:
 * 1. User provides website name (category name shown in dashboard)
 * 2. User optionally selects existing domain OR creates new one inline
 * 3. User provides initial page slug and name (optional, defaults to "home"/"Home")
 * 4. System creates website with auto-generated previewId
 *
 * URL STRUCTURE:
 * - Preview: /{previewId}/{page.slug} (auto-generated, clearly temporary)
 * - Production: {customDomain}/{page.slug} (when domain is connected)
 *
 * NOTE: This dialog only creates/edits website metadata.
 * To add more pages, use the builder's pages panel.
 *
 * SOURCE OF TRUTH: WebsiteDialogPreviewId, WebsiteCreation, PreviewUrlFlow
 */

'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Globe, Plus, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { trpc } from '@/trpc/react-provider'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sanitizeSlugSegment } from '@/components/website-builder/builder-v1.2/_lib/slug-utils'
import { FeatureGate } from '@/components/feature-gate'

/**
 * Form validation schema for website creation/editing.
 *
 * WHY: Ensures data integrity before submission.
 * HOW: Uses zod for type-safe validation.
 *
 * FIELDS:
 * - name: Website display name (category name shown in dashboard)
 * - domainId: Optional - selected domain ID, "new" to create, or empty for "connect later"
 * - newDomainName: Domain name when creating new (required if domainId === "new")
 * - initialPageSlug: URL path for the first page (e.g., "home")
 * - initialPageName: Display name for the first page (e.g., "Home")
 * - description: Optional website description
 *
 * NOTE: Domain is now OPTIONAL. Websites get an auto-generated previewId for
 * preview URLs. Domains can be connected later for production URLs.
 *
 * SOURCE OF TRUTH: WebsiteFormSchema, WebsiteCreationValidation
 */
const websiteFormSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Website name is required')
      .max(100, 'Name must be less than 100 characters'),
    // Domain is now OPTIONAL - websites can be created without a domain
    // and the domain connected later for production
    domainId: z.string().optional(),
    // newDomainName: The actual custom domain (e.g., "webprodigies.com")
    // Empty is valid when user selects existing domain (not "new").
    // VALIDATION: No protocol (http/https), no www., plain domain only
    newDomainName: z
      .string()
      .refine(
        (val) => val === '' || !val.includes('://'),
        'Do not include http:// or https:// - just enter the domain'
      )
      .refine(
        (val) => val === '' || !val.startsWith('www.'),
        'Do not include www. - just enter the domain'
      )
      .refine(
        (val) => val === '' || /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(\.[a-z]{2,})?$/.test(val),
        'Domain must be lowercase (e.g., webprodigies.com)'
      )
      .optional(),
    // Initial page slug for the first page (stored in canvasData.pages)
    initialPageSlug: z
      .string()
      .min(1, 'Page slug is required')
      .max(63, 'Slug must be less than 63 characters')
      .regex(
        /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
        'Slug must be lowercase, start/end with letter or number, and can contain hyphens'
      ),
    // Initial page name for the first page (stored in canvasData.pages)
    initialPageName: z
      .string()
      .min(1, 'Page name is required')
      .max(100, 'Page name must be less than 100 characters'),
    description: z
      .string()
      .max(500, 'Description must be less than 500 characters')
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      // If creating new domain, newDomainName is required
      if (data.domainId === 'new') {
        return !!data.newDomainName && data.newDomainName.length > 0
      }
      return true
    },
    {
      message: 'Domain name is required when creating a new domain',
      path: ['newDomainName'],
    }
  )

type WebsiteFormValues = z.infer<typeof websiteFormSchema>

interface WebsiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  /** Website to edit (null for create mode) */
  website: {
    id: string
    name: string
    description: string | null
    domainId: string
  } | null
}

/**
 * NOTE: Slug sanitization is now handled by the shared sanitizeSlugSegment
 * function from @/components/website-builder/builder-v1.2/_lib/slug-utils.ts
 *
 * This ensures consistent slug handling across the entire application.
 */

/**
 * Convert a slug to a human-readable page name.
 *
 * @example
 * toPageName("my-landing-page") // "My Landing Page"
 * toPageName("about-us") // "About Us"
 */
function toPageName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function WebsiteDialog({
  open,
  onOpenChange,
  organizationId,
  website,
}: WebsiteDialogProps) {
  const isEditing = !!website
  const utils = trpc.useUtils()
  const queryClient = useQueryClient()

  // Track if slug was manually edited by the user
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  // Track if page name was manually edited
  const [pageNameManuallyEdited, setPageNameManuallyEdited] = useState(false)

  // Fetch domains for selection dropdown
  const { data: domainsData, isLoading: isLoadingDomains } = trpc.domains.list.useQuery(
    {
      organizationId,
      page: 1,
      pageSize: 100, // Get all domains for dropdown
    },
    {
      enabled: open, // Only fetch when dialog is open
    }
  )

  /**
   * Form setup with onChange validation mode.
   *
   * WHY: Provides real-time feedback as user types instead of waiting for submit.
   * HOW: mode: 'onChange' triggers Zod validation on every input change.
   */
  const form = useForm<WebsiteFormValues>({
    resolver: zodResolver(websiteFormSchema),
    mode: 'onChange', // Validate on change for real-time error feedback
    defaultValues: {
      name: website?.name ?? '',
      description: website?.description ?? '',
      domainId: website?.domainId ?? '',
      newDomainName: '',
      initialPageSlug: 'home',
      initialPageName: 'Home',
    },
  })

  // Reset form when dialog opens/closes or website changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: website?.name ?? '',
        description: website?.description ?? '',
        domainId: website?.domainId ?? '',
        newDomainName: '',
        initialPageSlug: 'home',
        initialPageName: 'Home',
      })
      setSlugManuallyEdited(false)
      setPageNameManuallyEdited(false)
    }
  }, [open, website, form])

  // Watch form fields for reactive behavior
  const domainId = form.watch('domainId')
  const newDomainName = form.watch('newDomainName')

  // Check domain availability in real-time (globally unique)
  // WHY: Domains are globally unique across all organizations, so we check if it's available
  const { data: domainAvailability, isFetching: isCheckingDomain } =
    trpc.domains.checkAvailability.useQuery(
      { customDomain: newDomainName || '' },
      {
        // Only check when creating new domain and name is valid (must look like a domain with a dot)
        enabled:
          domainId === 'new' &&
          !!newDomainName &&
          newDomainName.length >= 4 &&
          newDomainName.includes('.') &&
          /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(newDomainName),
        // Debounce the query
        staleTime: 1000,
      }
    )

  // Get selected domain for URL preview (used when a domain is selected)
  const selectedDomain = domainsData?.domains.find((d) => d.id === domainId)

  /**
   * Create mutation with optimistic update.
   *
   * WHY: Provides instant UI feedback when creating websites.
   * HOW: Uses queryClient.setQueriesData to update cache immediately.
   */
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - TypeScript deep type inference issue with tRPC mutation
  const createMutation = trpc.websites.create.useMutation({
    onMutate: async (newWebsite: {
      organizationId: string
      // Domain is now optional - websites can be created without a domain
      domainId?: string
      name: string
      description?: string | null
      initialPageSlug?: string
      initialPageName?: string
    }) => {
      // Cancel all website list queries
      await queryClient.cancelQueries({ queryKey: [['websites', 'list']] })

      const now = new Date().toISOString()
      // Only look up domain if domainId was provided
      const selectedDomainForOptimistic = newWebsite.domainId
        ? domainsData?.domains.find((d) => d.id === newWebsite.domainId)
        : null

      const optimisticWebsite = {
        id: `temp-${Date.now()}`,
        organizationId,
        domainId: newWebsite.domainId ?? null,
        name: newWebsite.name,
        description: newWebsite.description || null,
        canvasData: null,
        status: 'DRAFT',
        publishedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        // Domain can be null when creating without a domain
        // NOTE: Domain no longer has a name field - just customDomain
        domain: selectedDomainForOptimistic
          ? {
              id: newWebsite.domainId!,
              customDomain: selectedDomainForOptimistic.customDomain,
            }
          : null,
      }

      // Update ALL cached website list queries using setQueriesData
      queryClient.setQueriesData(
        { queryKey: [['websites', 'list']] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (old: any) => {
          if (!old) return old
          return {
            ...old,
            websites: [optimisticWebsite, ...old.websites],
            total: old.total + 1,
          }
        }
      )

      // Close dialog immediately for snappy UX
      onOpenChange(false)

      return { optimisticWebsite }
    },
    onError: (err) => {
      // Server-side feature limit errors are caught by the FeatureGate wrapper
      // on the submit button, so this is a fallback for other errors
      toast.error(err.message || 'Failed to create website')
      // Invalidate to refetch correct data
      utils.websites.list.invalidate()
    },
    onSuccess: () => {
      toast.success('Website created successfully')
    },
    onSettled: () => {
      utils.websites.list.invalidate()
    },
  })

  // Update mutation (only for metadata, not pages)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - TypeScript deep type inference issue with tRPC mutation
  const updateMutation = trpc.websites.update.useMutation({
    onSuccess: () => {
      toast.success('Website updated successfully')
      onOpenChange(false)
      utils.websites.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update website')
    },
  })

  // Create domain mutation (for inline domain creation)
  // Error handling is done in onSubmit's try/catch via mutateAsync
  const createDomainMutation = trpc.domains.create.useMutation({
    onError: (error) => {
      // This will be called if domain creation fails (e.g., name already taken globally)
      toast.error(error.message || 'Failed to create domain')
    },
  })

  const isPending =
    createMutation.isPending || updateMutation.isPending || createDomainMutation.isPending

  /**
   * Handle name change - auto-generate initial page slug if not manually edited.
   *
   * WHY: Provides a better UX by auto-filling the slug field.
   * HOW: Converts website name to URL-safe slug format.
   */
  const handleNameChange = (value: string) => {
    form.setValue('name', value)
    // For new websites, also auto-generate initial page slug from name
    if (!isEditing && !slugManuallyEdited) {
      const slug = sanitizeSlugSegment(value)
      form.setValue('initialPageSlug', slug)
      // Also update page name if not manually edited
      if (!pageNameManuallyEdited) {
        form.setValue('initialPageName', toPageName(slug))
      }
    }
  }

  /**
   * Handle slug change - mark as manually edited and update page name.
   */
  const handleSlugChange = (value: string) => {
    const sanitized = sanitizeSlugSegment(value)
    form.setValue('initialPageSlug', sanitized)
    setSlugManuallyEdited(true)
    // Also update page name if not manually edited
    if (!pageNameManuallyEdited) {
      form.setValue('initialPageName', toPageName(sanitized))
    }
  }

  /**
   * Handle page name change - mark as manually edited.
   */
  const handlePageNameChange = (value: string) => {
    form.setValue('initialPageName', value)
    setPageNameManuallyEdited(true)
  }

  /**
   * Handle form submission with optional domain creation logic.
   *
   * FLOW:
   * 1. If creating new domain: create domain first
   * 2. Create website with initial page slug/name (domain is optional)
   * 3. For edits: update website metadata only
   *
   * NOTE: Domain is now optional. If not provided, website gets an auto-generated
   * previewId for preview URLs. Domain can be connected later.
   */
  const onSubmit = async (values: WebsiteFormValues) => {
    try {
      let finalDomainId: string | undefined = values.domainId

      // Create new domain if selected
      if (values.domainId === 'new') {
        if (!values.newDomainName) {
          form.setError('newDomainName', { message: 'Domain name is required' })
          return
        }

        // Create domain with the actual domain name (customDomain)
        // WHY: Domain model no longer has a "name" field - just customDomain
        const newDomain = await createDomainMutation.mutateAsync({
          organizationId,
          customDomain: values.newDomainName,
        })
        finalDomainId = newDomain.id
      }

      // Handle "connect later" option - empty string means no domain
      if (finalDomainId === '') {
        finalDomainId = undefined
      }

      // Now create or update the website
      if (isEditing && website) {
        // Only update metadata (name, description)
        updateMutation.mutate({
          organizationId,
          websiteId: website.id,
          name: values.name,
          description: values.description,
        })
      } else {
        // Create new website with initial page (domain is optional)
        // Website will get an auto-generated previewId
        createMutation.mutate({
          organizationId,
          domainId: finalDomainId,
          name: values.name,
          description: values.description,
          initialPageSlug: values.initialPageSlug,
          initialPageName: values.initialPageName,
        })
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message || 'Failed to create domain')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Website' : 'Create New Website'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update your website details below.'
              : 'Create a new website category. You can add more pages in the builder.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Website Name - Category name shown in dashboard */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Marketing Site, Product Landing"
                      {...field}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    A friendly name to identify this website in your dashboard.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Domain Selection - Optional */}
            {/* NOTE: Using "none" as special value because Radix Select doesn't allow empty strings */}
            <FormField
              control={form.control}
              name="domainId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Domain (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                    value={field.value || 'none'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Connect domain later" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingDomains ? (
                        <SelectItem value="loading" disabled>
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading domains...
                          </div>
                        </SelectItem>
                      ) : (
                        <>
                          {/* Option to create without domain - get preview URL first */}
                          <SelectItem value="none">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Globe className="h-4 w-4" />
                              Connect domain later
                            </div>
                          </SelectItem>
                          {domainsData?.domains.map((domain) => (
                            <SelectItem key={domain.id} value={domain.id}>
                              <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                {domain.customDomain}
                              </div>
                            </SelectItem>
                          ))}
                          <SelectItem value="new">
                            <div className="flex items-center gap-2">
                              <Plus className="h-4 w-4" />
                              Create new domain
                            </div>
                          </SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    You can connect a custom domain later. A preview URL will be auto-generated.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* New Domain Name (shown when creating new domain) */}
            {domainId === 'new' && (
              <FormField
                control={form.control}
                name="newDomainName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Domain Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="webprodigies.com or courses.webprodigies.com"
                          {...field}
                          value={field.value ?? ''}
                          className={
                            domainAvailability?.available === false
                              ? 'border-destructive pr-10'
                              : domainAvailability?.available === true
                                ? 'border-green-500 pr-10'
                                : ''
                          }
                        />
                        {/* Availability indicator - only show when domain looks valid */}
                        {newDomainName && newDomainName.length >= 4 && newDomainName.includes('.') && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            {isCheckingDomain ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : domainAvailability?.available === true ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : domainAvailability?.available === false ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : null}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      {domainAvailability?.available === false ? (
                        <span className="text-destructive">
                          This domain is already taken. Choose a different domain. 
                        </span>
                      ) : (
                        <>Enter your custom domain (e.g., &quot;webprodigies.com&quot; or &quot;courses.webprodigies.com&quot;)</>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Initial Page Slug - Only shown for new websites */}
            {!isEditing && (
              <>
                <FormField
                  control={form.control}
                  name="initialPageSlug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initial Page Slug</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., home, about-us, landing"
                          {...field}
                          onChange={(e) => handleSlugChange(e.target.value)}
                        />
                      </FormControl>
                      <FormDescription>
                        {domainId && domainId !== 'new' && selectedDomain?.customDomain ? (
                          <>
                            Production URL:{' '}
                            <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
                              {selectedDomain.customDomain}/{field.value || 'home'}
                            </code>
                          </>
                        ) : (
                          <>
                            Preview URL will be:{' '}
                            <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
                              /[auto-generated]/{field.value || 'home'}
                            </code>
                            <span className="block text-xs mt-1 text-muted-foreground">
                              A unique preview ID will be generated when you create the website.
                            </span>
                          </>
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="initialPageName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initial Page Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Home, About Us, Landing Page"
                          {...field}
                          onChange={(e) => handlePageNameChange(e.target.value)}
                        />
                      </FormControl>
                      <FormDescription>
                        Display name shown in the builder&apos;s pages panel.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="A brief description of your website..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>

              {/**
               * Submit button — wrapped in FeatureGate for create mode.
               *
               * WHY: FeatureGate intercepts clicks when the organization has
               * reached its website limit and shows the upgrade modal automatically.
               * Edit mode skips the gate since editing doesn't consume a new slot.
               */}
              {isEditing ? (
                <Button
                  type="submit"
                  disabled={
                    isPending ||
                    isCheckingDomain ||
                    (domainId === 'new' && domainAvailability?.available === false)
                  }
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              ) : (
                <FeatureGate feature="websites.limit">
                  <Button
                    type="submit"
                    disabled={
                      isPending ||
                      isCheckingDomain ||
                      (domainId === 'new' && domainAvailability?.available === false)
                    }
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Website'
                    )}
                  </Button>
                </FeatureGate>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
