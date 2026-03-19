'use client'

/**
 * ============================================================================
 * SHARE FORM MODAL
 * ============================================================================
 *
 * Beautiful modal for sharing forms via different methods:
 * - Iframe embed (for websites)
 * - Direct link (shareable URL)
 * - Email (work in progress)
 *
 * Design inspired by Simple Poll's placement modal with:
 * - Left sidebar with title, description, and use cases
 * - Right content area with tabs and visual previews
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Code2,
  Link2,
  Mail,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Layout,
  Smartphone,
  FileText,
  Megaphone,
  Users,
  Briefcase,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { FormStatus } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

interface ShareFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  formName: string
  formSlug: string
  /** Optional form status - if not PUBLISHED, shows a warning */
  formStatus?: FormStatus
}

type ShareMethod = 'embed' | 'link' | 'email'

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Copy text to clipboard
 * Uses modern Clipboard API which requires user gesture context
 * @param text - The text to copy
 * @param successMessage - Custom success message to show
 */
/**
 * Copy text to clipboard
 * Handles Dialog focus trap by blurring first and using correct element placement
 */
function copyToClipboard(text: string, successMessage: string = 'Link copied to clipboard'): void {
  // Blur any focused element first (helps with Dialog focus trap)
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }

  // Small delay to let blur take effect
  setTimeout(() => {
    // Create textarea (handles multiline) outside any portal/focus trap
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '') // Prevent keyboard popup on mobile

    // Position it in a way that bypasses focus traps
    textarea.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 2em;
      height: 2em;
      padding: 0;
      border: none;
      outline: none;
      box-shadow: none;
      background: transparent;
      opacity: 0;
      z-index: 99999;
    `

    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)

    let success = false
    try {
      success = document.execCommand('copy')
    } catch {
      success = false
    }

    document.body.removeChild(textarea)

    if (success) {
      toast.success(successMessage)
    } else {
      // Try Clipboard API as final fallback
      navigator.clipboard?.writeText(text)
        .then(() => toast.success(successMessage))
        .catch(() => toast.error('Failed to copy link'))
    }
  }, 50)
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * Website preview mockup showing embedded form
 * Creates a visual representation of how the form appears on a website
 * Uses purple accent colors for form elements to make them stand out
 */
function WebsitePreview({ type }: { type: 'embed' | 'link' }) {
  return (
    <div className="relative w-full rounded-xl border border-border/50 bg-muted/30 overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
          <div className="w-3 h-3 rounded-full bg-green-400/80" />
        </div>
        <div className="flex-1 mx-4 md:mx-12">
          <div className="h-6 md:h-7 rounded-lg bg-background/20 border border-border/50 flex items-center px-3">
            <Globe className="w-3.5 h-3.5 text-muted-foreground mr-2" />
            <span className="text-xs text-muted-foreground truncate">
              {type === 'embed' ? 'yourwebsite.com/contact' : 'forms/your-form'}
            </span>
          </div>
        </div>
      </div>

      {/* Website content mockup */}
      <div className="p-5 md:p-6 min-h-[200px] md:min-h-[220px]">
        {type === 'embed' ? (
          /* Embedded form preview */
          <div className="flex gap-5 md:gap-8">
            {/* Left content (website content) */}
            <div className="flex-1 space-y-3">
              <div className="h-3.5 w-3/4 rounded bg-muted-foreground/20" />
              <div className="h-3 w-full rounded bg-muted-foreground/15" />
              <div className="h-3 w-5/6 rounded bg-muted-foreground/15" />
              <div className="h-3 w-2/3 rounded bg-muted-foreground/10" />
              <div className="mt-5 space-y-2">
                <div className="h-2.5 w-full rounded bg-muted-foreground/10" />
                <div className="h-2.5 w-4/5 rounded bg-muted-foreground/10" />
                <div className="h-2.5 w-3/4 rounded bg-muted-foreground/10" />
              </div>
            </div>

            {/* Embedded form card - purple accent styling */}
            <div className="w-32 md:w-44 shrink-0">
              <div className="rounded-xl border-2 border-violet-500/40 p-3 md:p-4 shadow-sm shadow-violet-500/10">
                <div className="h-3 w-16 md:w-20 rounded bg-violet-500/50 mb-3" />
                <div className="space-y-2">
                  <div className="h-6 md:h-7 rounded-md border border-violet-400/30 bg-violet-500/5" />
                  <div className="h-6 md:h-7 rounded-md border border-violet-400/30 bg-violet-500/5" />
                  <div className="h-7 md:h-8 rounded-md bg-violet-500 mt-3" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Full page form preview - purple accent styling */
          <div className="flex items-center justify-center h-full min-h-[160px]">
            <div className="w-52 md:w-64 rounded-xl border-2 border-violet-500/40  p-5 md:p-6 shadow-sm shadow-violet-500/10">
              <div className="h-4 w-28 md:w-32 rounded bg-violet-500/50 mb-3 mx-auto" />
              <div className="h-2.5 w-36 md:w-40 rounded bg-violet-400/20 mb-5 mx-auto" />
              <div className="space-y-2.5">
                <div className="h-7 md:h-8 rounded-md border border-violet-400/30 bg-violet-500/5" />
                <div className="h-7 md:h-8 rounded-md border border-violet-400/30 bg-violet-500/5" />
                <div className="h-7 md:h-8 rounded-md border border-violet-400/30 bg-violet-500/5" />
                <div className="h-8 md:h-9 rounded-md bg-violet-500 mt-4" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Email preview mockup (placeholder for future functionality)
 */
function EmailPreview() {
  return (
    <div className="relative w-full rounded-xl border border-border/50 bg-muted/30 overflow-hidden">
      {/* Email client chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/50">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Email Preview</span>
      </div>

      {/* Email content mockup */}
      <div className="p-5 md:p-6 min-h-[200px] md:min-h-[220px] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <Badge variant="outline" className="text-xs font-normal">
              Work in Progress
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-[240px]">
            Email sharing will allow you to send forms directly to recipients
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Use case list item with icon
 */
function UseCase({ icon: Icon, text }: { icon: typeof Globe; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
      <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-3 h-3 text-primary" />
      </div>
      <span>{text}</span>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ShareFormModal({
  open,
  onOpenChange,
  formName,
  formSlug,
  formStatus,
}: ShareFormModalProps) {
  const [activeTab, setActiveTab] = useState<ShareMethod>('link')
  const [copied, setCopied] = useState(false)

  // Check if form is published (public links only work for published forms)
  const isPublished = formStatus === 'PUBLISHED'

  // Generate the public form URL
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = `${baseUrl}/forms/${formSlug}`

  // Generate iframe embed code
  const iframeCode = `<iframe
  src="${publicUrl}"
  width="100%"
  height="600"
  frameborder="0"
  style="border: none; border-radius: 8px;"
></iframe>`

  /**
   * Handle copy - tries Clipboard API directly first (best for Mac)
   */
  const handleCopy = async (text: string, label: string) => {
    try {
      // Try Clipboard API directly - most reliable on modern Mac
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(`${label} copied to clipboard`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback to the utility function
      copyToClipboard(text, `${label} copied to clipboard`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  /**
   * Open the public form URL in a new tab
   */
  const handleOpenLink = () => {
    window.open(publicUrl, '_blank')
  }

  // Content configuration for each tab
  const tabConfig = {
    embed: {
      title: 'Embed in an external Website',
      description: 'Add this form directly to your website using an iframe. Perfect for contact pages, signup flows, or feedback sections.',
      useCases: [
        { icon: Layout, text: 'Landing pages & marketing sites' },
        { icon: Briefcase, text: 'Business websites & portfolios' },
        { icon: Globe, text: 'WordPress, Webflow, Squarespace' },
      ],
    },
    link: {
      title: 'Share as Link',
      description: 'Get a direct link to your form that anyone can access. Great for sharing on social media, in messages, or anywhere you need a quick link.',
      useCases: [
        { icon: Megaphone, text: 'Social media & announcements' },
        { icon: Users, text: 'Team collaboration & surveys' },
        { icon: Smartphone, text: 'QR codes & mobile sharing' },
      ],
    },
    email: {
      title: 'Send via Email',
      description: 'Send form invitations directly to recipients via email. They will receive a button to access your form.',
      useCases: [
        { icon: FileText, text: 'Customer feedback requests' },
        { icon: Users, text: 'Event registration invites' },
        { icon: Briefcase, text: 'Job application forms' },
      ],
    },
  }

  const currentConfig = tabConfig[activeTab]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[900px] w-[95vw] p-0 gap-0 overflow-y-auto max-h-[90vh] bg-sidebar rounded-2xl"
        showCloseButton={false}
      >
        <div className="flex flex-col lg:flex-row lg:min-h-[560px]">
          {/* ================================================================
              LEFT SIDEBAR - Title, description, and use cases
              Stacks on top on mobile/tablet, sidebar on desktop
              ================================================================ */}
          <div className="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 p-5 sm:p-6 lg:p-8 flex flex-col">
            {/* Form indicator */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">Sharing</p>
                  {formStatus && !isPublished && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-amber-600 dark:text-amber-400 border-amber-500/30">
                      Not Published
                    </Badge>
                  )}
                </div>
                <p className="text-base font-medium truncate">{formName}</p>
              </div>
            </div>

            {/* Dynamic title and description based on selected tab */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-3">{currentConfig.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {currentConfig.description}
              </p>
            </div>

            {/* Use cases list - hidden on mobile/tablet to save space */}
            <div className="hidden lg:block space-y-4 mt-auto">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Perfect for
              </p>
              {currentConfig.useCases.map((useCase, index) => (
                <UseCase key={index} icon={useCase.icon} text={useCase.text} />
              ))}
            </div>
          </div>

          {/* ================================================================
              RIGHT CONTENT - Tabs, preview, and actions
              Wrapped in inset container for Apple-like partition effect
              ================================================================ */}
          <div className="flex-1 flex flex-col min-w-0 p-1.5 sm:p-2">
            {/* Inset container with rounded border - creates partition effect */}
            <div className="flex-1 flex flex-col rounded-xl border border-border overflow-hidden">
              {/* Header with tabs and close button */}
              <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5  shrink-0">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as ShareMethod)}
                className="w-auto"
              >
                <TabsList className="h-10">
                  <TabsTrigger value="embed" className="gap-1.5 px-3 sm:px-4 text-sm">
                    <Code2 className="w-4 h-4" />
                    Embed
                  </TabsTrigger>
                  <TabsTrigger value="link" className="gap-1.5 px-3 sm:px-4 text-sm">
                    <Link2 className="w-4 h-4" />
                    Link
                  </TabsTrigger>
                  <TabsTrigger value="email" className="gap-1.5 px-3 sm:px-4 text-sm">
                    <Mail className="w-4 h-4" />
                    Email
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Tab content */}
            <div className="flex-1 p-4 sm:p-6 lg:p-8">
              {/* Embed Tab */}
              {activeTab === 'embed' && (
                <div className="space-y-6">
                  <WebsitePreview type="embed" />

                  {/* Code snippet */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-muted-foreground">
                      Embed Code
                    </label>
                    <div className="relative">
                      <pre className="p-4 rounded-xl bg-muted/50 border border-border text-xs sm:text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all">
                        {iframeCode}
                      </pre>
                    </div>
                  </div>

                </div>
              )}

              {/* Link Tab */}
              {activeTab === 'link' && (
                <div className="space-y-6">
                  <WebsitePreview type="link" />

                  {/* URL input */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-muted-foreground">
                      Public URL
                    </label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={publicUrl}
                        className="font-mono text-sm bg-muted/30 h-11"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 h-11 w-11"
                        onClick={handleOpenLink}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                </div>
              )}

              {/* Email Tab */}
              {activeTab === 'email' && (
                <div className="space-y-6">
                  <EmailPreview />

                  {/* Work in progress notice */}
                  <div className="rounded-xl border border-dashed border-border p-6 text-center">
                    <Badge variant="secondary" className="mb-3">
                      Coming Soon
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      Email sharing functionality is currently in development.
                    </p>
                  </div>
                </div>
              )}
            </div>

              {/* Footer with action buttons */}
              <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 shrink-0">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10 rounded-xl">
                  Cancel
                </Button>
                {activeTab !== 'email' && (
                  <Button
                    onClick={() =>
                      handleCopy(
                        activeTab === 'embed' ? iframeCode : publicUrl,
                        activeTab === 'embed' ? 'Embed code' : 'Link'
                      )
                    }
                    className="gap-2 h-10  rounded-xl"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy {activeTab === 'embed' ? 'Code' : 'Link'}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
