/**
 * ============================================================================
 * BUILDER SETTINGS DIALOG - Website & Page Settings
 * ============================================================================
 *
 * A settings dialog for the website builder with three main sections:
 * - Website Settings: Domain, name, chatbot widget, E-commerce toggle
 * - Page Settings: Dynamic page configuration, SEO settings
 * - Metrics: Website analytics (views, visitors, per-page breakdown)
 *
 * WHY: Users need to configure website settings without leaving the builder.
 * HOW: Uses a sidebar navigation pattern with content panels for each section.
 */

'use client'

import * as React from 'react'
import { useAppDispatch, updatePageDynamicSettings } from '../../_lib'
import {
  Globe,
  FileText,
  Loader2,
  Check,
  ChevronsUpDown,
  Plus,
  X,
  ShoppingCart,
  AlertTriangle,
  MessageCircle,
  Info,
  BarChart3,
  CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ImageIcon,
  Type,
  FileSearch,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Calendar } from '@/components/ui/calendar'
import type { DateRange } from 'react-day-picker'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FeatureGate } from '@/components/feature-gate'
import { ImageSourceControl } from '../properties-panel/controls'

/** Navigation items for the settings sidebar */
const settingsNav = [
  { id: 'website', name: 'Website Settings', icon: Globe },
  { id: 'page', name: 'Page Settings', icon: FileText },
  { id: 'metrics', name: 'Metrics', icon: BarChart3 },
] as const

type SettingsSection = (typeof settingsNav)[number]['id']

interface BuilderSettingsDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** Organization ID for data fetching */
  organizationId: string
  /** Website ID for settings */
  websiteId: string
  /** Current page ID for page-specific settings */
  pageId: string
  /** Current website name */
  websiteName: string
  /** Current domain ID (if assigned) */
  currentDomainId?: string | null
}

/**
 * Settings dialog for the website builder.
 *
 * Provides configuration for:
 * - Website Settings: Assign/change domain, update website name
 * - Payments: Configure payment providers (coming soon)
 * - Page Settings: SEO metadata for the current page
 */
export function BuilderSettingsDialog({
  open,
  onOpenChange,
  organizationId,
  websiteId,
  pageId,
  websiteName,
  currentDomainId,
}: BuilderSettingsDialogProps) {
  const [activeSection, setActiveSection] = React.useState<SettingsSection>('website')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px]">
        <DialogTitle className="sr-only">Website Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure your website, payments, and page settings.
        </DialogDescription>
        <SidebarProvider className="items-start">
          {/* Settings Navigation Sidebar */}
          <Sidebar collapsible="none" className="hidden md:flex border-r">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {settingsNav.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          onClick={() => setActiveSection(item.id)}
                          isActive={activeSection === item.id}
                          className="cursor-pointer"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          {/* Settings Content Area */}
          <main className="flex h-[480px] flex-1 flex-col overflow-hidden">
            {/* Section Header */}
            <header className="flex h-14 shrink-0 items-center border-b px-6">
              <h2 className="text-lg font-semibold">
                {settingsNav.find((n) => n.id === activeSection)?.name}
              </h2>
            </header>

            {/* Section Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeSection === 'website' && (
                <WebsiteSettingsSection
                  organizationId={organizationId}
                  websiteId={websiteId}
                  websiteName={websiteName}
                  currentDomainId={currentDomainId}
                />
              )}
              {activeSection === 'page' && (
                <PageSettingsSection
                  organizationId={organizationId}
                  pageId={pageId}
                />
              )}
              {activeSection === 'metrics' && (
                <MetricsSection
                  organizationId={organizationId}
                  websiteId={websiteId}
                />
              )}
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// WEBSITE SETTINGS SECTION
// ============================================================================

interface WebsiteSettingsSectionProps {
  organizationId: string
  websiteId: string
  websiteName: string
  currentDomainId?: string | null
}

/**
 * Website settings section - domain assignment and website metadata.
 *
 * WHY: Users need to assign/change domains for their websites.
 * HOW: Uses a combobox pattern that allows selecting existing domains
 *      or creating a new domain inline.
 */
function WebsiteSettingsSection({
  organizationId,
  websiteId,
  websiteName: initialWebsiteName,
  currentDomainId,
}: WebsiteSettingsSectionProps) {
  const utils = trpc.useUtils()

  // Local state for form fields
  const [websiteName, setWebsiteName] = React.useState(initialWebsiteName)
  const [selectedDomainId, setSelectedDomainId] = React.useState<string>(
    currentDomainId || ''
  )

  /**
   * Sync local state with props when they change.
   *
   * WHY: After saving, parent component re-fetches data and passes new props.
   * React's useState only uses initial value, so we need to sync manually.
   */
  React.useEffect(() => {
    setWebsiteName(initialWebsiteName)
  }, [initialWebsiteName])

  React.useEffect(() => {
    setSelectedDomainId(currentDomainId || '')
  }, [currentDomainId])

  // Combobox state
  const [comboboxOpen, setComboboxOpen] = React.useState(false)

  // Create domain inline state
  const [isCreatingDomain, setIsCreatingDomain] = React.useState(false)
  const [newDomainName, setNewDomainName] = React.useState('')

  // Fetch available domains for combobox
  const { data: domainsData, isLoading: domainsLoading } = trpc.domains.list.useQuery(
    { organizationId, page: 1, pageSize: 100 },
    { enabled: !!organizationId }
  )

  // Create domain mutation
  const createDomain = trpc.domains.create.useMutation({
    onSuccess: (newDomain) => {
      toast.success(`Domain "${newDomain.customDomain}" created`)
      // Select the newly created domain
      setSelectedDomainId(newDomain.id)
      setIsCreatingDomain(false)
      setNewDomainName('')
      // Refresh domains list - invalidate all domains.list queries to ensure UI updates
      // NOTE: Must not pass partial params, as it won't match the full query key
      utils.domains.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create domain')
    },
  })

  /**
   * Update website mutation - handles website metadata and domain assignment.
   *
   * WHY: Invalidates multiple queries to ensure UI stays in sync:
   * - websites.getById: For parent component to receive new domain info
   * - builder.getDataById: The main builder data query (used by builder-client.tsx)
   * - builder.getDataByPageSlug: URL-based builder data query (for initial page load)
   * - websites.list: For dashboard website list to show updated domain
   *
   * IMPORTANT: The builder uses getDataById (not getDataByPageSlug) for data fetching.
   * The data flows: tRPC → BuilderProvider → BuilderContext → Canvas → BuilderHeader → SettingsDialog
   */
  const updateWebsite = trpc.websites.update.useMutation({
    onSuccess: () => {
      toast.success('Website settings updated')
      utils.websites.getById.invalidate({ organizationId, websiteId })
      utils.builder.getDataById.invalidate()
      utils.builder.getDataByPageSlug.invalidate()
      utils.websites.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update website')
    },
  })

  /**
   * Handle creating a new domain inline.
   * Validates the domain name and calls the create mutation.
   */
  const handleCreateDomain = () => {
    const trimmedName = newDomainName.trim().toLowerCase()
    if (!trimmedName) {
      toast.error('Domain name is required')
      return
    }

    // Basic validation - must be lowercase alphanumeric with dots/hyphens
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(trimmedName)) {
      toast.error('Domain name must be lowercase, start/end with letter or number')
      return
    }

    createDomain.mutate({
      organizationId,
      customDomain: trimmedName,
    })
  }

  /**
   * Handle saving website settings.
   * Updates both website name and domain assignment.
   */
  const handleSave = () => {
    updateWebsite.mutate({
      organizationId,
      websiteId,
      name: websiteName,
      domainId: selectedDomainId || undefined,
    })
  }

  const availableDomains = domainsData?.domains ?? []
  const selectedDomain = availableDomains.find((d) => d.id === selectedDomainId)
  const hasChanges =
    websiteName !== initialWebsiteName || selectedDomainId !== (currentDomainId || '')

  return (
    <div className="space-y-6">
      {/* Website Name */}
      <div className="space-y-2">
        <Label htmlFor="website-name">Website Name</Label>
        <Input
          id="website-name"
          value={websiteName}
          onChange={(e) => setWebsiteName(e.target.value)}
          placeholder="My Website"
        />
        <p className="text-xs text-muted-foreground">
          The display name for your website (shown in the dashboard).
        </p>
      </div>

      {/* Domain Assignment with Combobox */}
      <div className="space-y-2">
        <Label>Domain</Label>
        {domainsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading domains...
          </div>
        ) : isCreatingDomain ? (
          /* Inline Domain Creation */
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value.toLowerCase())}
                placeholder="my-website"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreateDomain()
                  } else if (e.key === 'Escape') {
                    setIsCreatingDomain(false)
                    setNewDomainName('')
                  }
                }}
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleCreateDomain}
                disabled={createDomain.isPending || !newDomainName.trim()}
              >
                {createDomain.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsCreatingDomain(false)
                  setNewDomainName('')
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a domain name (lowercase, letters, numbers, dots, and hyphens only).
            </p>
          </div>
        ) : (
          /* Domain Combobox */
          <>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedDomain ? (
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      {selectedDomain.customDomain}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select or create a domain...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search domains..." />
                  <CommandList>
                    <CommandEmpty>No domains found.</CommandEmpty>
                    <CommandGroup heading="Available Domains">
                      {/* No domain option */}
                      <CommandItem
                        value="__none__"
                        onSelect={() => {
                          setSelectedDomainId('')
                          setComboboxOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            !selectedDomainId ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className="text-muted-foreground">No domain assigned</span>
                      </CommandItem>
                      {/* Existing domains */}
                      {availableDomains.map((domain) => (
                        <CommandItem
                          key={domain.id}
                          value={domain.customDomain}
                          onSelect={() => {
                            setSelectedDomainId(domain.id)
                            setComboboxOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedDomainId === domain.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
                          {domain.customDomain}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                      {/* Create new domain option */}
                      <CommandItem
                        onSelect={() => {
                          setComboboxOpen(false)
                          setIsCreatingDomain(true)
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create new domain
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              The domain where your website will be accessible.
            </p>
          </>
        )}
      </div>

      {/* ================================================================== */}
      {/* E-COMMERCE TOGGLE - Enable/disable E-commerce for the website */}
      {/* ================================================================== */}
      <EcommerceToggle organizationId={organizationId} websiteId={websiteId} />

      {/* ================================================================== */}
      {/* CHATBOT - Assign a chat widget to this website                     */}
      {/* ================================================================== */}
      <ChatbotInlineSection organizationId={organizationId} websiteId={websiteId} />

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={updateWebsite.isPending || !hasChanges}
          className="gap-2"
        >
          {updateWebsite.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// E-COMMERCE TOGGLE COMPONENT
// ============================================================================

interface EcommerceToggleProps {
  organizationId: string
  websiteId: string
}

/**
 * E-commerce toggle component - Enable/disable E-commerce for the website.
 *
 * WHY: Users can toggle E-commerce functionality from within Website Settings.
 * HOW: When enabled, default E-commerce pages are created.
 *      When disabled, all E-commerce pages and assets are HARD DELETED.
 *
 * CONFIRMATION: Disabling E-commerce shows a confirmation dialog
 * requiring the user to type "I agree" to prevent accidental deletion.
 */
/**
 * Installation progress steps shown during e-commerce setup.
 * These simulate the backend process to keep users informed and engaged.
 * Timings are approximate — the actual install finishes when the mutation resolves.
 */
const INSTALL_STEPS = [
  { label: 'Setting up store template...', duration: 1200 },
  { label: 'Creating product catalog...', duration: 1500 },
  { label: 'Syncing products to Stripe...', duration: 2000 },
  { label: 'Building store pages...', duration: 1500 },
  { label: 'Configuring checkout flow...', duration: 1000 },
  { label: 'Finalizing setup...', duration: 800 },
]

/**
 * Hook to drive a fake progress bar through install steps while the mutation runs.
 * Stops advancing once the real mutation completes (success or error).
 */
function useInstallProgress(isInstalling: boolean) {
  const [stepIndex, setStepIndex] = React.useState(0)
  const [progress, setProgress] = React.useState(0)

  React.useEffect(() => {
    if (!isInstalling) {
      setStepIndex(0)
      setProgress(0)
      return
    }

    /** Advance through steps on a timer */
    let currentStep = 0
    setStepIndex(0)
    setProgress(5)

    const advance = () => {
      currentStep++
      if (currentStep < INSTALL_STEPS.length) {
        setStepIndex(currentStep)
        setProgress(Math.min(90, ((currentStep + 1) / INSTALL_STEPS.length) * 90))
      }
    }

    /** Schedule each step's transition based on its duration */
    const timers: ReturnType<typeof setTimeout>[] = []
    let elapsed = 0
    for (let i = 0; i < INSTALL_STEPS.length - 1; i++) {
      elapsed += INSTALL_STEPS[i].duration
      timers.push(setTimeout(advance, elapsed))
    }

    return () => timers.forEach(clearTimeout)
  }, [isInstalling])

  return {
    stepLabel: INSTALL_STEPS[stepIndex]?.label ?? 'Setting up...',
    progress: isInstalling ? progress : 0,
  }
}

function EcommerceToggle({ organizationId, websiteId }: EcommerceToggleProps) {
  const utils = trpc.useUtils()

  // State for the confirmation dialog
  const [showConfirmDialog, setShowConfirmDialog] = React.useState(false)
  const [confirmText, setConfirmText] = React.useState('')

  // Fetch E-commerce status
  const { data: ecommerceStatus, isLoading } = trpc.websites.getEcommerceStatus.useQuery(
    { organizationId, websiteId },
    { enabled: !!organizationId && !!websiteId }
  )

  // Enable E-commerce mutation
  const enableEcommerce = trpc.websites.enableEcommerce.useMutation({
    onSuccess: () => {
      toast.success('E-commerce enabled! Default store pages have been created.')
      // Reload the page to refresh the Redux store with new E-commerce pages
      // This is lightweight and ensures all data is in sync
      setTimeout(() => window.location.reload(), 500)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to enable E-commerce')
    },
  })

  /** Simulated progress state while installation is running */
  const { stepLabel, progress } = useInstallProgress(enableEcommerce.isPending)

  // Disable E-commerce mutation
  const disableEcommerce = trpc.websites.disableEcommerce.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || 'E-commerce disabled and pages deleted')
      setShowConfirmDialog(false)
      setConfirmText('')
      // Reload the page to refresh the Redux store without E-commerce pages
      // This is lightweight and ensures all data is in sync
      setTimeout(() => window.location.reload(), 500)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to disable E-commerce')
    },
  })

  /**
   * Handle toggle change.
   * When turning ON: directly enable E-commerce.
   * When turning OFF: show confirmation dialog first.
   */
  const handleToggleChange = (checked: boolean) => {
    if (checked) {
      // Enable E-commerce
      enableEcommerce.mutate({ organizationId, websiteId })
    } else {
      // Show confirmation dialog for disabling
      setShowConfirmDialog(true)
      setConfirmText('')
    }
  }

  /**
   * Handle confirming the deletion of E-commerce pages.
   */
  const handleConfirmDisable = () => {
    if (confirmText !== 'I agree') {
      toast.error('Please type "I agree" to confirm')
      return
    }
    disableEcommerce.mutate({ organizationId, websiteId })
  }

  const isEnabled = ecommerceStatus?.enabled ?? false
  const isPending = enableEcommerce.isPending || disableEcommerce.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {/* E-commerce Toggle */}
      <div className="space-y-2">
        <Label>E-commerce</Label>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Enable E-commerce</span>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggleChange}
            disabled={isPending}
          />
        </div>

        {/* Installation progress — minimal monochrome indicator */}
        {enableEcommerce.isPending && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{stepLabel}</span>
            </div>
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/40 transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {!enableEcommerce.isPending && (
          <p className="text-xs text-muted-foreground">
            {isEnabled
              ? 'E-commerce pages (Cart, Checkout, Order Confirmation) are active.'
              : 'Add E-commerce pages to your website for online selling.'}
          </p>
        )}
      </div>

      {/* Confirmation Dialog for Disabling E-commerce */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete E-commerce Pages
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                <strong>Warning:</strong> This action cannot be undone!
              </p>
              <p>
                Disabling E-commerce will permanently delete:
              </p>
              <ul className="list-disc ml-4 space-y-1">
                <li>All E-commerce pages (Cart, Checkout, Order Confirmation)</li>
                <li>All local components created inside these pages</li>
                <li>All published content and assets in these pages</li>
              </ul>
              <p className="pt-2">
                To confirm, type <strong>&quot;I agree&quot;</strong> below:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type 'I agree' to confirm"
                className="mt-2"
                autoComplete="off"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmText('')
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisable}
              disabled={confirmText !== 'I agree' || disableEcommerce.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disableEcommerce.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Ecommerce Pages'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ============================================================================
// CHATBOT INLINE SECTION (inside Website Settings)
// ============================================================================
// SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration
//
// Compact chat widget selector rendered inline within Website Settings.
// When a widget is selected and saved, it renders in preview and live view.
// ============================================================================

interface ChatbotInlineSectionProps {
  organizationId: string
  websiteId: string
}

/**
 * Inline chatbot section — rendered inside Website Settings.
 * Allows assigning a chat widget to the website with its own save action.
 */
function ChatbotInlineSection({
  organizationId,
  websiteId,
}: ChatbotInlineSectionProps) {
  const utils = trpc.useUtils()

  const [selectedChatWidgetId, setSelectedChatWidgetId] = React.useState<string | null>(null)
  const [comboboxOpen, setComboboxOpen] = React.useState(false)
  const [isInitialized, setIsInitialized] = React.useState(false)

  // Fetch website data to get current chat widget
  const { data: websiteData } = trpc.websites.getById.useQuery(
    { organizationId, websiteId },
    { enabled: !!organizationId && !!websiteId }
  )

  // Fetch available chat widgets
  const { data: chatWidgetsData, isLoading: chatWidgetsLoading } = trpc.chatWidgets.list.useQuery(
    { organizationId, page: 1, pageSize: 100 },
    { enabled: !!organizationId }
  )

  /** Initialize local state from website data once loaded */
  const websiteDataId = websiteData?.id
  React.useEffect(() => {
    if (websiteData && !isInitialized) {
      const websiteWithChatbot = websiteData as { chatWidgetId?: string | null }
      setSelectedChatWidgetId(websiteWithChatbot.chatWidgetId ?? null)
      setIsInitialized(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteDataId, isInitialized])

  /** Save mutation for chat widget assignment */
  const updateWebsite = trpc.websites.update.useMutation({
    onSuccess: () => {
      toast.success(
        selectedChatWidgetId
          ? 'Chatbot enabled for this website'
          : 'Chatbot removed from this website'
      )
      utils.websites.getById.invalidate({ organizationId, websiteId })
      utils.builder.getDataById.invalidate()
      utils.builder.getDataByPageSlug.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update chatbot settings')
    },
  })

  const handleSave = () => {
    updateWebsite.mutate({
      organizationId,
      websiteId,
      chatWidgetId: selectedChatWidgetId,
    })
  }

  const availableChatWidgets = chatWidgetsData?.chatWidgets ?? []
  const selectedChatWidget = availableChatWidgets.find((w) => w.id === selectedChatWidgetId)
  const websiteWithChatbot = websiteData as { chatWidgetId?: string | null } | undefined
  const hasChanges = selectedChatWidgetId !== (websiteWithChatbot?.chatWidgetId ?? null)

  return (
    <div className="space-y-2">
      <Label>Chat Widget</Label>
      {chatWidgetsLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading chat widgets...
        </div>
      ) : availableChatWidgets.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-center">
          <p className="text-sm text-muted-foreground">
            No chat widgets created yet. Go to Sites → Chat Widgets to create one.
          </p>
        </div>
      ) : (
        <>
          <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={comboboxOpen}
                className="w-full justify-between font-normal"
              >
                {selectedChatWidget ? (
                  <span className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    {selectedChatWidget.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Select a chat widget...</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search chat widgets..." />
                <CommandList>
                  <CommandEmpty>No chat widgets found.</CommandEmpty>
                  <CommandGroup heading="Available Chat Widgets">
                    <CommandItem
                      value="__none__"
                      onSelect={() => {
                        setSelectedChatWidgetId(null)
                        setComboboxOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          !selectedChatWidgetId ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="text-muted-foreground">No chat widget</span>
                    </CommandItem>
                    {availableChatWidgets.map((widget) => (
                      <CommandItem
                        key={widget.id}
                        value={widget.name}
                        onSelect={() => {
                          setSelectedChatWidgetId(widget.id)
                          setComboboxOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedChatWidgetId === widget.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <MessageCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                        {widget.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Info callout when a chatbot is selected */}
          {selectedChatWidgetId && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/50">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Widget will appear in preview and on your live website.
              </p>
            </div>
          )}

          {/* Save chatbot changes independently */}
          {hasChanges && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateWebsite.isPending}
              className="gap-1.5"
            >
              {updateWebsite.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save Chat Widget
            </Button>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Add a chat widget to engage with visitors in real-time.
      </p>
    </div>
  )
}

// ============================================================================
// PAGE SETTINGS SECTION
// ============================================================================

interface PageSettingsSectionProps {
  organizationId: string
  pageId: string
}

/**
 * Page settings section - Dynamic page configuration and SEO metadata.
 *
 * DYNAMIC PAGES:
 * - Enable dynamic mode by selecting a CMS table
 * - Optionally configure a slug column for pretty URLs
 * - Page becomes a template rendering at /domain/{slug}/{rowId}
 *
 * SEO SETTINGS: Meta title, description, OG image, noIndex, dynamic CMS column mapping
 */
function PageSettingsSection({ organizationId, pageId }: PageSettingsSectionProps) {
  const utils = trpc.useUtils()
  const dispatch = useAppDispatch()

  // Local state for dynamic page settings
  const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null)
  const [selectedSlugColumn, setSelectedSlugColumn] = React.useState<string | null>(null)
  const [tableComboOpen, setTableComboOpen] = React.useState(false)
  const [slugComboOpen, setSlugComboOpen] = React.useState(false)
  const [isInitialized, setIsInitialized] = React.useState(false)

  // SEO settings local state
  const [seoTitle, setSeoTitle] = React.useState<string>('')
  const [seoDescription, setSeoDescription] = React.useState<string>('')
  const [seoOgImage, setSeoOgImage] = React.useState<string>('')
  const [seoNoIndex, setSeoNoIndex] = React.useState(false)
  const [seoTitleColumn, setSeoTitleColumn] = React.useState<string | null>(null)
  const [seoDescriptionColumn, setSeoDescriptionColumn] = React.useState<string | null>(null)
  const [seoImageColumn, setSeoImageColumn] = React.useState<string | null>(null)
  const [seoInitialized, setSeoInitialized] = React.useState(false)

  // Fetch page details to get current dynamic settings
  const { data: pageData, isLoading: pageLoading } = trpc.pages.getById.useQuery(
    { organizationId, pageId },
    { enabled: !!organizationId && !!pageId }
  )

  // Fetch CMS tables for dropdown
  const { data: tablesData, isLoading: tablesLoading } = trpc.cms.listTables.useQuery(
    { organizationId, limit: 100 },
    { enabled: !!organizationId }
  )

  // Fetch selected table details (for columns)
  const { data: tableDetails } = trpc.cms.getTable.useQuery(
    { organizationId, tableId: selectedTableId ?? '' },
    { enabled: !!organizationId && !!selectedTableId }
  )

  /**
   * Initialize local state from page data once loaded.
   * Only runs once when page data is first available.
   *
   * NOTE: We extract a stable string for the dependency to avoid
   * TypeScript's "type instantiation excessively deep" error with tRPC types.
   */
  const pageDataId = pageData?.id
  React.useEffect(() => {
    if (pageData && !isInitialized) {
      // Access cmsTableId via type assertion since Prisma types aren't regenerated yet
      const pageDynamic = pageData as { cmsTableId?: string | null; cmsSlugColumnSlug?: string | null }
      setSelectedTableId(pageDynamic.cmsTableId ?? null)
      setSelectedSlugColumn(pageDynamic.cmsSlugColumnSlug ?? null)
      setIsInitialized(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageDataId, isInitialized])

  /** Initialize SEO fields from page data */
  React.useEffect(() => {
    if (pageData && !seoInitialized) {
      const pg = pageData as Record<string, unknown>
      setSeoTitle((pg.metaTitle as string) || '')
      setSeoDescription((pg.metaDescription as string) || '')
      setSeoOgImage((pg.ogImage as string) || '')
      setSeoNoIndex(!!pg.noIndex)
      setSeoTitleColumn((pg.seoTitleColumn as string) || null)
      setSeoDescriptionColumn((pg.seoDescriptionColumn as string) || null)
      setSeoImageColumn((pg.seoImageColumn as string) || null)
      setSeoInitialized(true)
    }
  }, [pageData, seoInitialized])

  /**
   * Update dynamic settings mutation.
   * Connects or disconnects the page from a CMS table.
   *
   * NOTE: We only invalidate the specific pages.getById query, NOT builder.getDataById.
   * Invalidating builder data causes Redux to reset and may switch the active page.
   */
  const updateDynamicSettingsMutation = trpc.pages.updateDynamicSettings.useMutation({
    onSuccess: (_data, variables) => {
      toast.success('Dynamic page settings updated')
      // Only invalidate this specific page query - don't touch builder data
      utils.pages.getById.invalidate({ organizationId, pageId })
      /**
       * Sync Redux PageInfo with the saved settings immediately.
       * WHY: CMS list settings and dynamic link URL generation read
       * cmsSlugColumnSlug from PageInfo — must be up-to-date without
       * a full builder data reload.
       */
      dispatch(updatePageDynamicSettings({
        pageId,
        cmsTableId: variables.cmsTableId,
        cmsSlugColumnSlug: variables.cmsSlugColumnSlug ?? null,
      }))
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update dynamic settings')
    },
  })

  /**
   * Handle saving dynamic page settings.
   */
  const handleSaveDynamicSettings = () => {
    updateDynamicSettingsMutation.mutate({
      organizationId,
      pageId,
      cmsTableId: selectedTableId,
      cmsSlugColumnSlug: selectedSlugColumn,
    })
  }

  /** Mutation for saving SEO settings */
  const updateSeoMutation = trpc.pages.updateSeo.useMutation({
    onSuccess: () => {
      toast.success('SEO settings saved')
      utils.pages.getById.invalidate({ organizationId, pageId })
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save SEO settings')
    },
  })

  /** Save SEO settings to the database */
  const handleSaveSeo = () => {
    updateSeoMutation.mutate({
      organizationId,
      pageId,
      metaTitle: seoTitle || null,
      metaDescription: seoDescription || null,
      ogImage: seoOgImage || null,
      noIndex: seoNoIndex,
      seoTitleColumn,
      seoDescriptionColumn,
      seoImageColumn,
    })
  }

  /**
   * Handle clearing dynamic settings (disable dynamic page).
   */
  const handleClearDynamicSettings = () => {
    setSelectedTableId(null)
    setSelectedSlugColumn(null)
    updateDynamicSettingsMutation.mutate({
      organizationId,
      pageId,
      cmsTableId: null,
      cmsSlugColumnSlug: null,
    })
  }

  // Get current state for comparison
  const pageDynamic = pageData as { cmsTableId?: string | null; cmsSlugColumnSlug?: string | null } | undefined
  const hasChanges =
    selectedTableId !== (pageDynamic?.cmsTableId ?? null) ||
    selectedSlugColumn !== (pageDynamic?.cmsSlugColumnSlug ?? null)

  const availableTables = tablesData?.tables ?? []
  const selectedTable = availableTables.find((t) => t.id === selectedTableId)
  const availableColumns = tableDetails?.columns ?? []
  // Filter to text-type columns that can be used as slugs
  // Only TEXT columns can be used as slug identifiers
  const sluggableColumns = availableColumns.filter(
    (c) => c.columnType === 'TEXT'
  )

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Dynamic Page Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Dynamic Page</h3>
          <p className="text-sm text-muted-foreground">
            Connect this page to a CMS table to create dynamic URLs like /page-slug/&#123;row-id&#125;
          </p>
        </div>

        {/* CMS Table Selector */}
        <div className="space-y-2">
          <Label>CMS Table</Label>
          {tablesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tables...
            </div>
          ) : (
            <Popover open={tableComboOpen} onOpenChange={setTableComboOpen}>
              {/* FeatureGate wraps the combobox trigger — when the "dynamic_pages"
                  limit is reached, FeatureGate intercepts the click and shows the
                  upgrade modal. When within limit, the button toggles the dropdown.
                  WHY: Dynamic pages require a paid tier — FeatureGate handles
                  the upgrade modal internally, no manual state needed. */}
              <PopoverAnchor>
                <FeatureGate feature="dynamic_pages">
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={tableComboOpen}
                    className="w-full justify-between"
                    onClick={() => setTableComboOpen((prev) => !prev)}
                  >
                    {selectedTable ? selectedTable.name : 'Select a CMS table...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FeatureGate>
              </PopoverAnchor>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Search tables..." />
                  <CommandList>
                    <CommandEmpty>No tables found.</CommandEmpty>
                    <CommandGroup>
                      {availableTables.map((table) => (
                        <CommandItem
                          key={table.id}
                          value={table.name}
                          onSelect={() => {
                            setSelectedTableId(table.id)
                            setSelectedSlugColumn(null) // Reset slug column when table changes
                            setTableComboOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedTableId === table.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {table.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
          <p className="text-xs text-muted-foreground">
            Each row in this table will get its own page URL.
          </p>
        </div>

        {/* Slug Column Selector (shown only when table is selected) */}
        {selectedTableId && (
          <div className="space-y-2">
            <Label>Slug Column (Optional)</Label>
            <Popover open={slugComboOpen} onOpenChange={setSlugComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={slugComboOpen}
                  className="w-full justify-between"
                >
                  {selectedSlugColumn
                    ? sluggableColumns.find((c) => c.slug === selectedSlugColumn)?.name || selectedSlugColumn
                    : 'Use row ID (default)'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Search columns..." />
                  <CommandList>
                    <CommandEmpty>No text columns found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value=""
                        onSelect={() => {
                          setSelectedSlugColumn(null)
                          setSlugComboOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            !selectedSlugColumn ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        Use row ID (default)
                      </CommandItem>
                      {sluggableColumns.map((column) => (
                        <CommandItem
                          key={column.id}
                          value={column.name}
                          onSelect={() => {
                            setSelectedSlugColumn(column.slug)
                            setSlugComboOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedSlugColumn === column.slug ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {column.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Use a text column for URL-friendly slugs instead of row IDs.
            </p>
          </div>
        )}

        {/* URL Preview */}
        {selectedTableId && pageData && (
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground mb-1">URL Pattern:</p>
            <code className="text-sm">
              /domain/{pageData.slug}/{selectedSlugColumn ? `{${selectedSlugColumn}}` : '{row-id}'}
            </code>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleSaveDynamicSettings}
            disabled={updateDynamicSettingsMutation.isPending || !hasChanges}
          >
            {updateDynamicSettingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Dynamic Settings
          </Button>
          {selectedTableId && (
            <Button
              variant="outline"
              onClick={handleClearDynamicSettings}
              disabled={updateDynamicSettingsMutation.isPending}
            >
              <X className="mr-2 h-4 w-4" />
              Disable Dynamic
            </Button>
          )}
        </div>
      </div>

      {/* ================================================================
          SEO SETTINGS — Meta tags, Google preview, validation indicators,
          and dynamic page CMS column mapping.
          SOURCE OF TRUTH: PageSeo, PageMetadata, SeoFields, SeoValidation
          ================================================================ */}
      <div className="border-t pt-6 space-y-5">
        <div>
          <h3 className="text-base font-medium mb-1">SEO Settings</h3>
          <p className="text-xs text-muted-foreground">
            Configure how this page appears in search results and social media.
          </p>
        </div>

        {/* Google Search Preview — shows how the page will look in Google results */}
        <div className="rounded-lg border bg-white p-4 space-y-1">
          {/* Browser-like chrome header */}
          <div className="flex items-center gap-2 mb-3 pb-2 border-b">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 h-5 rounded bg-gray-100 flex items-center px-2">
              <span className="text-[10px] text-gray-400 truncate">
                {pageData?.domain?.customDomain
                  ? `${pageData.domain.customDomain}/${pageData?.slug || ''}`
                  : `yoursite.com/${pageData?.slug || ''}`}
              </span>
            </div>
          </div>
          {/* Google result preview */}
          <p className="text-xs text-[#202124] truncate" style={{ fontFamily: 'Arial, sans-serif' }}>
            {pageData?.domain?.customDomain || 'yoursite.com'}
            {' › '}
            {pageData?.slug || ''}
          </p>
          <h4
            className="text-lg leading-snug truncate"
            style={{ fontFamily: 'Arial, sans-serif', color: '#1a0dab' }}
          >
            {seoTitle || pageData?.name || 'Page Title'}
          </h4>
          <p
            className="text-sm leading-relaxed line-clamp-2"
            style={{ fontFamily: 'Arial, sans-serif', color: '#4d5156' }}
          >
            {seoDescription || 'Add a meta description to control what appears here in search results.'}
          </p>
        </div>

        {/* ================================================================
            CONTENT SECTION — Title & Description with validation checks
            ================================================================ */}
        <SeoValidationSection
          title="Content"
          icon={<Type className="h-4 w-4" />}
          checks={[
            { passed: seoTitle.length > 0, label: 'Page has a title' },
            { passed: seoTitle.length > 0 && seoTitle.length <= 70, label: 'Title is under 70 characters' },
            { passed: seoDescription.length > 0, label: 'Page has a meta description' },
            { passed: seoDescription.length > 0 && seoDescription.length <= 155, label: 'Description is under 155 characters' },
          ]}
          defaultOpen
        >
          {/* Meta Title Input */}
          <div className="space-y-1.5">
            <Label htmlFor="seo-title" className="text-sm font-medium">
              Meta Title
            </Label>
            <Input
              id="seo-title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder={pageData?.name || 'Page title'}
              maxLength={200}
            />
            <div className="flex items-center justify-between">
              <p className={cn(
                'text-xs',
                seoTitle.length > 70 ? 'text-orange-500' : 'text-muted-foreground'
              )}>
                {seoTitle.length}/70 characters
              </p>
              {seoTitle.length > 70 && (
                <p className="text-xs text-orange-500">Title may be truncated in search results</p>
              )}
            </div>

            {/* Title validation indicators */}
            <SeoCheckIndicator
              passed={seoTitle.length > 0}
              label="Page has a title"
              tooltip="Search engines display the title as the main clickable link. Without one, they'll auto-generate a title which may not represent your page well."
            />
            <SeoCheckIndicator
              passed={seoTitle.length > 0 && seoTitle.length <= 70}
              label="Title is under 70 characters"
              tooltip="Google typically displays the first 50-60 characters of a title tag. Titles longer than 70 characters risk being truncated with an ellipsis."
            />
          </div>

          {/* Meta Description Input */}
          <div className="space-y-1.5">
            <Label htmlFor="seo-description" className="text-sm font-medium">
              Meta Description
            </Label>
            <textarea
              id="seo-description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              placeholder="Describe what this page is about..."
              maxLength={500}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              <p className={cn(
                'text-xs',
                seoDescription.length > 155 ? 'text-orange-500' : 'text-muted-foreground'
              )}>
                {seoDescription.length}/155 characters
              </p>
              {seoDescription.length > 155 && (
                <p className="text-xs text-orange-500">Description may be truncated</p>
              )}
            </div>

            {/* Description validation indicators */}
            <SeoCheckIndicator
              passed={seoDescription.length > 0}
              label="Page has a meta description"
              tooltip="The meta description is a short summary shown below the title in search results. Without one, search engines auto-generate a snippet from page content."
            />
            <SeoCheckIndicator
              passed={seoDescription.length > 0 && seoDescription.length <= 155}
              label="Description is under 155 characters"
              tooltip="Google typically truncates meta descriptions to 150-160 characters. Keep it concise to ensure your full message appears in search results."
            />
          </div>
        </SeoValidationSection>

        {/* ================================================================
            IMAGES SECTION — OG image with validation
            ================================================================ */}
        <SeoValidationSection
          title="Images"
          icon={<ImageIcon className="h-4 w-4" />}
          checks={[
            { passed: seoOgImage.length > 0, label: 'Page has a social share image' },
          ]}
        >
          <div className="space-y-1.5">
            <ImageSourceControl
              label="Social Share Image"
              value={seoOgImage}
              onChange={(val) => setSeoOgImage(val)}
            />
            <p className="text-xs text-muted-foreground">
              Recommended: 1200x630px. Shows when shared on social media.
            </p>
            <SeoCheckIndicator
              passed={seoOgImage.length > 0}
              label="Page has a social share image"
              tooltip="Open Graph images appear when your page is shared on social media (Facebook, Twitter, LinkedIn). Without one, platforms may show a generic placeholder or auto-select an image from your page."
            />
          </div>
        </SeoValidationSection>

        {/* ================================================================
            INDEXING SECTION — Search engine visibility
            ================================================================ */}
        <SeoValidationSection
          title="Indexing"
          icon={<FileSearch className="h-4 w-4" />}
          checks={[
            { passed: !seoNoIndex, label: 'Page is visible to search engines' },
          ]}
        >
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Hide from search engines</p>
              <p className="text-xs text-muted-foreground">
                When enabled, search engines won&apos;t index this page.
              </p>
            </div>
            <Switch
              checked={seoNoIndex}
              onCheckedChange={setSeoNoIndex}
            />
          </div>
          <SeoCheckIndicator
            passed={!seoNoIndex}
            label="Page is visible to search engines"
            tooltip="When noindex is set, search engines like Google will not include this page in their index. Use this for private pages, staging content, or duplicated content you don't want ranked."
          />

          {/* Canonical URL preview — auto-generated, read-only.
              WHY: Every platform (Webflow, Wix, Framer) shows canonical URLs.
              Canonical URLs tell search engines the authoritative URL for a page,
              preventing duplicate content when accessible via multiple URLs. */}
          <div className="mt-2 rounded-md bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Canonical URL (auto-generated)</p>
            <code className="text-xs break-all">
              {pageData?.domain?.customDomain
                ? `https://${pageData.domain.customDomain}/${pageData?.slug || ''}`
                : `${typeof window !== 'undefined' ? window.location.origin : ''}/${pageData?.slug || ''}`}
            </code>
            <p className="text-[10px] text-muted-foreground mt-1">
              Search engines use this to identify the preferred version of this page.
            </p>
          </div>
        </SeoValidationSection>

        {/* ================================================================
            DYNAMIC PAGE SEO — CMS Column Mapping
            Only visible when page is a dynamic template (has cmsTableId)
            ================================================================ */}
        {selectedTableId && tableDetails && (() => {
          const textColumns = (tableDetails.columns || []).filter(
            (c: { columnType: string }) => c.columnType === 'TEXT' || c.columnType === 'RICH_TEXT'
          )
          const imageColumns = (tableDetails.columns || []).filter(
            (c: { columnType: string }) => c.columnType === 'IMAGE_URL'
          )

          return (
            <div className="space-y-4 rounded-md border p-4">
              <div>
                <h4 className="text-sm font-medium">Dynamic Page SEO</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Map CMS columns to SEO fields. Each dynamic page instance will use the row&apos;s data.
                </p>
              </div>

              {/* Title Column Mapping */}
              <div className="space-y-1.5">
                <Label className="text-sm">Title Column</Label>
                <select
                  value={seoTitleColumn || ''}
                  onChange={(e) => setSeoTitleColumn(e.target.value || null)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Use static meta title</option>
                  {textColumns.map((col: { slug: string; name: string }) => (
                    <option key={col.slug} value={col.slug}>{col.name}</option>
                  ))}
                </select>
              </div>

              {/* Description Column Mapping */}
              <div className="space-y-1.5">
                <Label className="text-sm">Description Column</Label>
                <select
                  value={seoDescriptionColumn || ''}
                  onChange={(e) => setSeoDescriptionColumn(e.target.value || null)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Use static meta description</option>
                  {textColumns.map((col: { slug: string; name: string }) => (
                    <option key={col.slug} value={col.slug}>{col.name}</option>
                  ))}
                </select>
              </div>

              {/* Image Column Mapping */}
              {imageColumns.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Image Column</Label>
                  <select
                    value={seoImageColumn || ''}
                    onChange={(e) => setSeoImageColumn(e.target.value || null)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Use static OG image</option>
                    {imageColumns.map((col: { slug: string; name: string }) => (
                      <option key={col.slug} value={col.slug}>{col.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )
        })()}

        {/* Save SEO Button */}
        <Button
          onClick={handleSaveSeo}
          disabled={updateSeoMutation.isPending}
        >
          {updateSeoMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save SEO Settings
        </Button>
      </div>

    </div>
  )
}

// ============================================================================
// METRICS SECTION
// ============================================================================
// SOURCE OF TRUTH: WebsiteMetricsResponse, PageMetric (from page-view.service.ts)
//
// Displays website analytics — total views, unique visitors, and a per-page
// breakdown for a user-selectable date range. Data comes from the
// pageView.getMetrics tRPC procedure.
// ============================================================================

interface MetricsSectionProps {
  organizationId: string
  websiteId: string
}

/**
 * Metrics section - Website analytics dashboard.
 *
 * WHY: Users need visibility into how their website is performing
 *      without leaving the builder or visiting a separate analytics page.
 * HOW: Fetches aggregated metrics from the pageView.getMetrics tRPC
 *      procedure and renders summary cards + a per-page breakdown table.
 */
function MetricsSection({ organizationId, websiteId }: MetricsSectionProps) {
  // Default to the last 30 days so users see meaningful data immediately
  const [dateRange, setDateRange] = React.useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  })
  const [calendarOpen, setCalendarOpen] = React.useState(false)

  const { data, isLoading } = trpc.pageView.getMetrics.useQuery(
    {
      organizationId,
      websiteId,
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
    },
    { enabled: !!organizationId && !!websiteId }
  )

  /**
   * Handle calendar range selection.
   *
   * WHY: We only close the popover when both ends of the range are selected.
   * The first click sets `from`, the second click sets `to` — closing early
   * would prevent users from completing their selection.
   */
  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range) return

    // Update from immediately so the calendar highlights the start
    if (range.from) {
      setDateRange((prev) => ({
        from: range.from!,
        to: range.to ?? prev.to,
      }))
    }

    // Auto-close only when the full range is selected
    if (range.from && range.to) {
      setDateRange({ from: range.from, to: range.to })
      setCalendarOpen(false)
    }
  }

  /** Format a date for the range picker button label */
  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Empty state — no metrics data returned at all
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No Metrics Available</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Analytics data will appear here once your website starts receiving visitors.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Date Range Picker */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium">Website Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Page views and visitor data for your website.
          </p>
        </div>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 text-sm font-normal">
              <CalendarIcon className="h-4 w-4" />
              {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={handleRangeSelect}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary Cards — total views and unique visitors side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Views</p>
          <p className="text-3xl font-semibold tabular-nums">
            {data.totalViews.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground mb-1">Unique Visitors</p>
          <p className="text-3xl font-semibold tabular-nums">
            {data.uniqueVisitors.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Per-Page Breakdown Table */}
      {data.pages.length > 0 ? (
        <div className="space-y-2">
          <Label>Pages</Label>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium px-4 py-2">Page</th>
                  <th className="text-right font-medium px-4 py-2">Views</th>
                  <th className="text-right font-medium px-4 py-2">Visitors</th>
                </tr>
              </thead>
              <tbody>
                {data.pages.map((page) => (
                  <tr key={page.pageId} className="border-b last:border-b-0">
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{page.pageName}</span>
                        <span className="text-xs text-muted-foreground">
                          /{page.pageSlug}
                        </span>
                      </div>
                    </td>
                    <td className="text-right px-4 py-2 tabular-nums">
                      {page.totalViews.toLocaleString()}
                    </td>
                    <td className="text-right px-4 py-2 tabular-nums">
                      {page.uniqueVisitors.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Empty pages state — metrics exist but no per-page data */
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No page-level data for this date range.
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SEO VALIDATION COMPONENTS
// ============================================================================
// SOURCE OF TRUTH: SeoCheckIndicator, SeoValidationSection, SeoValidationCheck
//
// Reusable components for rendering SEO validation checks with pass/fail
// indicators, info tooltips, and collapsible sections with warning badges.
// ============================================================================

/**
 * Shape of a single SEO validation check.
 * Used by SeoValidationSection to compute warning counts for section headers.
 */
interface SeoValidationCheck {
  /** Whether this check is currently passing */
  passed: boolean
  /** Human-readable label describing the check */
  label: string
}

interface SeoCheckIndicatorProps {
  /** Whether the check passed (green) or failed (orange warning) */
  passed: boolean
  /** Label text describing what the check verifies */
  label: string
  /** Tooltip explaining why this check matters for SEO */
  tooltip: string
}

/**
 * Single SEO validation indicator row.
 *
 * WHY: Shows users at a glance whether each SEO best practice is met.
 * HOW: Renders a check (green) or warning (orange) icon with a label,
 *      plus an info icon with a tooltip explaining why it matters.
 */
function SeoCheckIndicator({ passed, label, tooltip }: SeoCheckIndicatorProps) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {passed ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
      )}
      <span className={cn(
        'text-xs',
        passed ? 'text-emerald-600' : 'text-orange-600'
      )}>
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3 w-3 text-muted-foreground/60 cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px]">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

interface SeoValidationSectionProps {
  /** Section title displayed in the collapsible header */
  title: string
  /** Icon rendered before the title */
  icon: React.ReactNode
  /** Validation checks — used to compute warning count badge */
  checks: SeoValidationCheck[]
  /** Whether section starts expanded */
  defaultOpen?: boolean
  /** Section content (inputs, toggles, etc.) */
  children: React.ReactNode
}

/**
 * Collapsible SEO settings section with a warning count badge.
 *
 * WHY: Groups related SEO fields together with a visual summary of how many
 *      checks pass or fail — users can immediately see which sections need attention.
 * HOW: Counts failing checks and shows an orange warning badge on the header.
 *      When all checks pass, shows a green success badge instead.
 */
function SeoValidationSection({
  title,
  icon,
  checks,
  defaultOpen = false,
  children,
}: SeoValidationSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)
  const warningCount = checks.filter((c) => !c.passed).length
  const allPassed = warningCount === 0

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border px-3 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium">{title}</span>
            {/* Warning count badge — orange when issues exist, green when all pass */}
            {allPassed ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                All good
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600">
                <AlertTriangle className="h-3 w-3" />
                {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-1 pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
