'use client'

/**
 * Editor Sidebar Component
 *
 * WHY: Settings panel for the chat widget editor
 * HOW: Two main sections:
 *      1. Themes & Settings - All theme colors, behavior toggles, toggle button config
 *      2. Page - Tab menu for page-specific settings (Welcome, Help, Updates)
 *
 * Design principles:
 * - Clean, minimal UX with clear visual hierarchy
 * - No collapsibles or separators within sections
 * - Pill-style tabs for page selection (ChannelToggle pattern)
 * - MarqueeFade for scroll overflow indication
 * - All settings wired to context (no floating state)
 *
 * SOURCE OF TRUTH: ChatWidgetThemeContext, ChatWidgetEditor
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Plus, Trash2, ImageIcon, Pencil, X, Copy, Check, Globe } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { IconPicker } from '@/components/ui/icon-picker'
import { IconRenderer } from '@/lib/icons'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { GradientControl } from '@/components/email-builder/_components/gradient-control'
import { RichTextEditor } from '@/components/editor'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import { getEmbedBaseUrl } from '@/lib/config/embed'
import { useChatWidgetTheme, type UpdateItem } from './chat-widget-theme-context'

// ============================================================================
// TYPES
// ============================================================================

export type SettingsTab = 'general' | 'appearance' | 'behavior' | 'embed'
type PageTab = 'welcome' | 'help' | 'updates'

interface EditorSidebarProps {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

// ============================================================================
// SECTION HEADER COMPONENT
// Simple section header with title
// ============================================================================

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
    </div>
  )
}

// ============================================================================
// SETTING ROW COMPONENT
// Toggle switch with label
// ============================================================================

interface SettingRowProps {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function SettingRow({ label, checked, onCheckedChange }: SettingRowProps) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </label>
  )
}

// ============================================================================
// PAGE TAB TOGGLE COMPONENT
// Pill-style tab buttons for page selection (matches ChannelToggle pattern)
// ============================================================================

interface PageTabToggleProps {
  selected: PageTab
  onSelect: (page: PageTab) => void
}

const PAGE_TABS: { id: PageTab; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'help', label: 'Help' },
  { id: 'updates', label: 'Updates' },
]

function PageTabToggle({ selected, onSelect }: PageTabToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-muted/50 p-1 gap-0.5">
      {PAGE_TABS.map((tab) => {
        const isSelected = selected === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border-t border-transparent',
              isSelected
                ? 'bg-muted border-t border-accent ring-1 ring-background text-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function EditorSidebar({ activeTab, onTabChange }: EditorSidebarProps) {
  // Suppress unused vars - these are for future tab functionality
  void activeTab
  void onTabChange

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Toggle image is set during widget creation - no fallback needed
  const {
    config,
    organizationId,
    chatWidgetId,
    toggleThemeMode,
    setThemeColor,
    setBehavior,
    setToggleConfig,
    setWelcomePageConfig,
    setChatWelcomeMessage,
    addFAQItem,
    updateFAQItem,
    removeFAQItem,
    addUpdate,
    updateUpdate,
    removeUpdate,
  } = useChatWidgetTheme()

  // ============================================
  // EMBED SETTINGS - Allowed Domains
  // ============================================

  /**
   * Fetch current allowed domains for this widget
   * WHY: Load saved domains when editor opens
   */
  const widgetQuery = trpc.chatWidgets.getById.useQuery(
    { organizationId, chatWidgetId },
    { enabled: !!chatWidgetId }
  )

  /**
   * Mutation for updating allowed domains
   * WHY: Persist domain changes to database
   */
  const updateDomainsMutation = trpc.chatWidgets.updateAllowedDomains.useMutation({
    onSuccess: () => {
      widgetQuery.refetch()
    },
  })

  /**
   * Local state for domain management
   * WHY: Track domains being edited before saving
   */
  const [domains, setDomains] = useState<string[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [domainError, setDomainError] = useState<string | null>(null)
  const [copiedEmbed, setCopiedEmbed] = useState(false)

  /**
   * Sync local domains with fetched data
   * WHY: Initialize domains when widget data loads
   * NOTE: allowedDomains is a new field - run `npx prisma generate` if types are missing
   */
  useEffect(() => {
    if (widgetQuery.data) {
      // Access allowedDomains via indexed access for compatibility until prisma generate
      const widgetData = widgetQuery.data as Record<string, unknown>
      const savedDomains = widgetData.allowedDomains as string[] | null
      if (Array.isArray(savedDomains)) {
        setDomains(savedDomains)
      }
    }
  }, [widgetQuery.data])

  /**
   * Validate domain format
   * WHY: Ensure domains are in correct format before adding
   */
  const validateDomain = (domain: string): boolean => {
    const pattern = /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/
    return pattern.test(domain.trim())
  }

  /**
   * Add a new domain to the list
   * WHY: Allow users to add domains that can embed the widget
   */
  const handleAddDomain = useCallback(() => {
    const domain = newDomain.trim().toLowerCase()
    if (!domain) return

    if (!validateDomain(domain)) {
      setDomainError('Invalid domain format. Use "example.com" or "*.example.com"')
      return
    }

    if (domains.includes(domain)) {
      setDomainError('Domain already added')
      return
    }

    const updatedDomains = [...domains, domain]
    setDomains(updatedDomains)
    setNewDomain('')
    setDomainError(null)

    // Save to database
    updateDomainsMutation.mutate({
      organizationId,
      chatWidgetId,
      allowedDomains: updatedDomains,
    })
  }, [newDomain, domains, organizationId, chatWidgetId, updateDomainsMutation])

  /**
   * Remove a domain from the list
   * WHY: Allow users to revoke embed access from a domain
   */
  const handleRemoveDomain = useCallback((domain: string) => {
    const updatedDomains = domains.filter(d => d !== domain)
    setDomains(updatedDomains)

    // Save to database
    updateDomainsMutation.mutate({
      organizationId,
      chatWidgetId,
      allowedDomains: updatedDomains,
    })
  }, [domains, organizationId, chatWidgetId, updateDomainsMutation])

  /**
   * Generate embed script code
   * WHY: Provide users with copy-paste code for embedding
   * HOW: Uses centralized getEmbedBaseUrl() from config
   */
  const embedCode = `<script src="${getEmbedBaseUrl()}/api/chat-widget/embed/${organizationId}/${chatWidgetId}" async></script>`

  /**
   * Copy embed code to clipboard
   * WHY: Use modern clipboard API with fallback for non-secure contexts
   * HOW: Try navigator.clipboard first, fall back to execCommand for HTTP localhost
   */
  const handleCopyEmbed = useCallback(async () => {
    try {
      // Modern clipboard API (requires secure context)
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(embedCode)
      } else {
        // Fallback for non-secure contexts (like localhost HTTP)
        const textArea = document.createElement('textarea')
        textArea.value = embedCode
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        textArea.style.top = '-9999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopiedEmbed(true)
      setTimeout(() => setCopiedEmbed(false), 2000)
    } catch (err) {
      console.error('Failed to copy embed code:', err)
    }
  }, [embedCode])

  // Page tab state
  const [selectedPage, setSelectedPage] = useState<PageTab>('welcome')

  // ============================================
  // SCROLL INDICATOR STATE
  // ============================================
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const updateScrollIndicators = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    setCanScrollUp(scrollTop > 5)
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 5)
  }, [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const initialCheck = setTimeout(updateScrollIndicators, 50)
    const resizeObserver = new ResizeObserver(updateScrollIndicators)
    resizeObserver.observe(container)
    const scrollContent = container.firstElementChild
    if (scrollContent) resizeObserver.observe(scrollContent)
    return () => {
      clearTimeout(initialCheck)
      resizeObserver.disconnect()
    }
  }, [updateScrollIndicators])

  // ============================================
  // NEW FAQ ITEM STATE
  // ============================================
  const [newQuestion, setNewQuestion] = useState('')
  const [newAnswer, setNewAnswer] = useState('')

  const handleAddFAQ = () => {
    if (newQuestion.trim() && newAnswer.trim()) {
      addFAQItem({ question: newQuestion.trim(), answer: newAnswer.trim() })
      setNewQuestion('')
      setNewAnswer('')
    }
  }

  // ============================================
  // THEME RESET CONFIRMATION DIALOG
  // ============================================
  const [showThemeResetDialog, setShowThemeResetDialog] = useState(false)

  const handleThemeModeToggle = () => {
    setShowThemeResetDialog(true)
  }

  const confirmThemeModeChange = () => {
    toggleThemeMode()
    setShowThemeResetDialog(false)
  }

  // ============================================
  // UPDATE EDITOR DIALOG STATE
  // ============================================
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [editingUpdate, setEditingUpdate] = useState<UpdateItem | null>(null)
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateContent, setUpdateContent] = useState('')
  const [updateFeaturedImage, setUpdateFeaturedImage] = useState<string | undefined>()
  const [updateFeaturedImageFileId, setUpdateFeaturedImageFileId] = useState<string | undefined>()
  const [storageBrowserOpen, setStorageBrowserOpen] = useState(false)

  // Toggle button image storage browser state
  const [toggleImageBrowserOpen, setToggleImageBrowserOpen] = useState(false)

  const handleCreateUpdate = () => {
    setEditingUpdate(null)
    setUpdateTitle('')
    setUpdateContent('')
    setUpdateFeaturedImage(undefined)
    setUpdateFeaturedImageFileId(undefined)
    setUpdateDialogOpen(true)
  }

  /**
   * Handle editing an existing update/announcement.
   * Converts null values to undefined for React state compatibility.
   */
  const handleEditUpdate = (update: UpdateItem) => {
    setEditingUpdate(update)
    setUpdateTitle(update.title)
    setUpdateContent(update.content)
    // Convert null to undefined for React state (null not assignable to string | undefined)
    setUpdateFeaturedImage(update.featuredImage ?? undefined)
    setUpdateFeaturedImageFileId(update.featuredImageFileId ?? undefined)
    setUpdateDialogOpen(true)
  }

  const handleSaveUpdate = () => {
    if (!updateTitle.trim()) return

    if (editingUpdate) {
      updateUpdate(editingUpdate.id, {
        title: updateTitle.trim(),
        content: updateContent,
        featuredImage: updateFeaturedImage,
        featuredImageFileId: updateFeaturedImageFileId,
      })
    } else {
      addUpdate({
        title: updateTitle.trim(),
        content: updateContent,
        featuredImage: updateFeaturedImage,
        featuredImageFileId: updateFeaturedImageFileId,
      })
    }

    setUpdateDialogOpen(false)
  }

  const handleImageSelect = (file: { accessUrl: string | null; publicUrl: string | null; id: string }) => {
    const imageUrl = file.publicUrl ?? file.accessUrl
    if (imageUrl) {
      setUpdateFeaturedImage(imageUrl)
      setUpdateFeaturedImageFileId(file.id)
    }
    setStorageBrowserOpen(false)
  }

  const handleToggleImageSelect = (file: { accessUrl: string | null; publicUrl: string | null; id: string }) => {
    const imageUrl = file.publicUrl ?? file.accessUrl
    if (imageUrl) {
      setToggleConfig({ image: imageUrl })
    }
    setToggleImageBrowserOpen(false)
  }


  return (
    <>
    <aside className="w-72 border-r flex flex-col h-full overflow-hidden bg-muted/50">
      {/* Back Button */}
      <div className="p-3 border-b shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/sites/chat-widgets">
            <ArrowLeft className="size-4" />
            <span>Back to widgets</span>
          </Link>
        </Button>
      </div>

      {/* Scrollable Content with MarqueeFade */}
      <MarqueeFade
        showTopFade={canScrollUp}
        showBottomFade={canScrollDown}
        fadeHeight={82}
        className="flex-1 min-h-0"
      >
        <div
          ref={scrollContainerRef}
          onScroll={updateScrollIndicators}
          className="h-full overflow-y-auto"
        >
          <div className="px-4">
            {/* ============================================== */}
            {/* THEMES & SETTINGS SECTION */}
            {/* All theme colors, behavior toggles, toggle button config */}
            {/* ============================================== */}
            <SectionHeader title="Themes & Settings" />

            <div className="space-y-4 pb-6">
              {/* Dark Mode Toggle */}
              <SettingRow
                label="Dark mode"
                checked={config.theme.mode === 'dark'}
                onCheckedChange={handleThemeModeToggle}
              />

              {/* Theme Colors */}
              <GradientControl
                label="Primary Text"
                solidColor={config.theme.primaryText}
                gradient={config.theme.primaryTextGradient}
                onSolidColorChange={(color) => setThemeColor('primaryText', color)}
                onGradientChange={(gradient) =>
                  setThemeColor('primaryText', config.theme.primaryText, gradient)
                }
                allowTransparent={false}
                showColorCode={false}
              />

              <GradientControl
                label="Secondary Text"
                solidColor={config.theme.secondaryText}
                gradient={config.theme.secondaryTextGradient}
                onSolidColorChange={(color) => setThemeColor('secondaryText', color)}
                onGradientChange={(gradient) =>
                  setThemeColor('secondaryText', config.theme.secondaryText, gradient)
                }
                allowTransparent={false}
                showColorCode={false}
              />

              <GradientControl
                label="Background"
                solidColor={config.theme.background}
                gradient={config.theme.backgroundGradient}
                onSolidColorChange={(color) => setThemeColor('background', color)}
                onGradientChange={(gradient) =>
                  setThemeColor('background', config.theme.background, gradient)
                }
                allowTransparent={false}
                showColorCode={false}
              />

              <GradientControl
                label="Secondary BG"
                solidColor={config.theme.secondaryBackground}
                gradient={undefined}
                onSolidColorChange={(color) => setThemeColor('secondaryBackground', color)}
                onGradientChange={() => {}}
                allowTransparent={false}
                showColorCode={false}
              />

              <GradientControl
                label="Accent"
                solidColor={config.theme.accent}
                gradient={config.theme.accentGradient}
                onSolidColorChange={(color) => setThemeColor('accent', color)}
                onGradientChange={(gradient) =>
                  setThemeColor('accent', config.theme.accent, gradient)
                }
                allowTransparent={false}
                showColorCode={false}
              />

              <GradientControl
                label="Border"
                solidColor={config.theme.border}
                gradient={undefined}
                onSolidColorChange={(color) => setThemeColor('border', color)}
                onGradientChange={() => {}}
                allowTransparent={false}
                showColorCode={false}
              />

              {/* Behavior Toggles */}
              <SettingRow
                label="Auto-open on page load"
                checked={config.behavior.autoOpen}
                onCheckedChange={(v) => setBehavior('autoOpen', v)}
              />
              <SettingRow
                label="Sound notifications"
                checked={config.behavior.enableSounds}
                onCheckedChange={(v) => setBehavior('enableSounds', v)}
              />
              <SettingRow
                label="Show 'Powered by Mochi'"
                checked={config.behavior.showBranding}
                onCheckedChange={(v) => setBehavior('showBranding', v)}
              />

              {/* Chat Welcome Message */}
              <div className="pt-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  Chat Welcome Message
                </label>
                <Input
                  value={config.behavior.chatWelcomeMessage ?? ''}
                  onChange={(e) => setChatWelcomeMessage(e.target.value)}
                  placeholder="Hi there! How can I help you today?"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Message shown when user opens chat for the first time
                </p>
              </div>

              {/* Toggle Button Config */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm">Toggle type</Label>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      'transition-colors',
                      config.toggle.type === 'image' ? 'text-foreground font-medium' : 'text-muted-foreground'
                    )}>
                      Image
                    </span>
                    <Switch
                      checked={config.toggle.type === 'icon'}
                      onCheckedChange={(checked) => setToggleConfig({ type: checked ? 'icon' : 'image' })}
                    />
                    <span className={cn(
                      'transition-colors',
                      config.toggle.type === 'icon' ? 'text-foreground font-medium' : 'text-muted-foreground'
                    )}>
                      Icon
                    </span>
                  </div>
                </div>

                {/* Image Mode */}
                {config.toggle.type === 'image' && (
                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <div
                        className="w-12 h-12 rounded-full overflow-hidden border-2 flex items-center justify-center"
                        style={{ backgroundColor: config.theme.accent, borderColor: config.theme.border }}
                      >
                        {config.toggle.image ? (
                          <Image
                            src={config.toggle.image}
                            alt="Toggle"
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <IconRenderer name="message-circle" size={20} className="text-white" />
                        )}
                      </div>
                      {config.toggle.image && (
                        <button
                          type="button"
                          onClick={() => setToggleConfig({ image: null })}
                          className="absolute -top-1 -right-1 p-0.5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => setToggleImageBrowserOpen(true)}
                    >
                      {config.toggle.image ? 'Change' : 'Add Image'}
                    </Button>
                  </div>
                )}

                {/* Icon Mode */}
                {config.toggle.type === 'icon' && (
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: config.theme.accent }}
                    >
                      <IconRenderer
                        name={config.toggle.icon || 'message-circle'}
                        size={20}
                        className="text-white"
                      />
                    </div>
                    <div className="flex-1">
                      <IconPicker
                        value={config.toggle.icon || 'message-circle'}
                        onValueChange={(icon) => setToggleConfig({ icon })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ============================================== */}
            {/* PAGE SECTION */}
            {/* Tab menu for page-specific settings */}
            {/* ============================================== */}
            <div className="border-t -mx-4 px-4">
              <SectionHeader title="Page" />

              {/* Page Tab Toggle */}
              <div className="mb-4">
                <PageTabToggle selected={selectedPage} onSelect={setSelectedPage} />
              </div>

              {/* Page-specific content */}
              <div className="pb-6">
                {/* Welcome Page Settings */}
                {selectedPage === 'welcome' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Title</label>
                      <Input
                        value={config.welcomePage.title}
                        onChange={(e) => setWelcomePageConfig('title', e.target.value)}
                        placeholder="Hi there 👋"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Subtitle</label>
                      <Input
                        value={config.welcomePage.subtitle}
                        onChange={(e) => setWelcomePageConfig('subtitle', e.target.value)}
                        placeholder="How can we help?"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Help Page Settings (FAQ) */}
                {selectedPage === 'help' && (
                  <div className="space-y-3">
                    {/* Existing FAQ items */}
                    {config.helpPage.faqItems.map((item) => (
                      <div key={item.id} className="p-2 rounded-lg border bg-background/50">
                        <div className="flex items-start justify-between gap-2">
                          <Input
                            value={item.question}
                            onChange={(e) => updateFAQItem(item.id, { question: e.target.value })}
                            className="h-7 text-xs font-medium border-0 p-0 focus-visible:ring-0"
                            placeholder="Question"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeFAQItem(item.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                        <Textarea
                          value={item.answer}
                          onChange={(e) => updateFAQItem(item.id, { answer: e.target.value })}
                          className="mt-1 text-xs min-h-[50px] border-0 p-0 focus-visible:ring-0 resize-none"
                          placeholder="Answer"
                        />
                      </div>
                    ))}

                    {/* Add new FAQ */}
                    <div className="p-2 rounded-lg border border-dashed">
                      <Input
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        className="h-7 text-xs border-0 p-0 focus-visible:ring-0"
                        placeholder="New question..."
                      />
                      <Textarea
                        value={newAnswer}
                        onChange={(e) => setNewAnswer(e.target.value)}
                        className="mt-1 text-xs min-h-10 border-0 p-0 focus-visible:ring-0 resize-none"
                        placeholder="Answer..."
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 h-7 text-xs"
                        onClick={handleAddFAQ}
                        disabled={!newQuestion.trim() || !newAnswer.trim()}
                      >
                        <Plus className="size-3 mr-1" />
                        Add FAQ
                      </Button>
                    </div>
                  </div>
                )}

                {/* Updates Page Settings */}
                {selectedPage === 'updates' && (
                  <div className="space-y-2">
                    {/* Existing updates */}
                    {config.updatesPage.updates.map((update) => (
                      <div
                        key={update.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-background/50 group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{update.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {update.createdAt.toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleEditUpdate(update)}
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeUpdate(update.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* Add new update button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs border-dashed"
                      onClick={handleCreateUpdate}
                    >
                      <Plus className="size-3 mr-1" />
                      Add Update
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* ============================================== */}
            {/* EMBED SETTINGS SECTION */}
            {/* Domain whitelist and embed code for external sites */}
            {/* ============================================== */}
            <SectionHeader title="Embed Settings" />

            <div className="space-y-4 pb-6">
              {/* Embed Code */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Embed Code</Label>
                <div className="relative">
                  <div className="p-2.5 pr-10 rounded-lg border bg-muted/50 text-[10px] font-mono break-all text-muted-foreground leading-relaxed">
                    {embedCode}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                    onClick={handleCopyEmbed}
                  >
                    {copiedEmbed ? (
                      <Check className="size-3.5 text-green-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Paste this code before the closing {`</body>`} tag
                </p>
              </div>

              {/* Allowed Domains */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Allowed Domains</Label>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Only these domains can embed this widget. Leave empty to disable external embedding.
                </p>

                {/* Domain input */}
                <div className="flex gap-1.5">
                  <Input
                    placeholder="example.com or *.example.com"
                    value={newDomain}
                    onChange={(e) => {
                      setNewDomain(e.target.value)
                      setDomainError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddDomain()
                      }
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 shrink-0"
                    onClick={handleAddDomain}
                    disabled={!newDomain.trim()}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                {domainError && (
                  <p className="text-[10px] text-destructive">{domainError}</p>
                )}

                {/* Domain list */}
                {domains.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    {domains.map((domain) => (
                      <div
                        key={domain}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border bg-background/50 group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Globe className="size-3 text-muted-foreground shrink-0" />
                          <span className="text-xs truncate">{domain}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => handleRemoveDomain(domain)}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-center border rounded-lg bg-muted/30">
                    <Globe className="size-5 text-muted-foreground/50 mb-2" />
                    <p className="text-[10px] text-muted-foreground">
                      No domains added yet
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      External embedding is disabled
                    </p>
                  </div>
                )}
              </div>

              {/* Saving indicator */}
              {updateDomainsMutation.isPending && (
                <p className="text-[10px] text-muted-foreground">Saving...</p>
              )}
            </div>
          </div>
        </div>
      </MarqueeFade>
    </aside>

    {/* Theme Reset Confirmation Dialog */}
    <AlertDialog open={showThemeResetDialog} onOpenChange={setShowThemeResetDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset theme colors?</AlertDialogTitle>
          <AlertDialogDescription>
            Switching to {config.theme.mode === 'dark' ? 'light' : 'dark'} mode will reset all
            your custom theme colors to the default preset. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmThemeModeChange}>
            Reset Colors
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Update Editor Dialog */}
    <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-sm font-medium">
            {editingUpdate ? 'Edit Update' : 'New Update'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Featured Image */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Image (optional)</label>
            {updateFeaturedImage ? (
              <div className="relative w-full h-28 rounded-lg overflow-hidden border group">
                <Image
                  src={updateFeaturedImage}
                  alt=""
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setStorageBrowserOpen(true)}
                  >
                    Change
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setUpdateFeaturedImage(undefined)
                      setUpdateFeaturedImageFileId(undefined)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setStorageBrowserOpen(true)}
                className="w-full h-20 rounded-lg border border-dashed flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors text-xs"
              >
                <ImageIcon className="size-4" />
                <span>Add image</span>
              </button>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Title</label>
            <Input
              value={updateTitle}
              onChange={(e) => setUpdateTitle(e.target.value)}
              placeholder="Update title..."
              className="h-9"
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Content</label>
            <div className="border rounded-lg overflow-hidden">
              <RichTextEditor
                key={editingUpdate?.id ?? 'new'}
                initialContent={updateContent}
                onChange={setUpdateContent}
                placeholder="Write content..."
                variant="minimal"
                readOnly={false}
                className="min-h-[120px]"
                organizationId={organizationId}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          <Button variant="ghost" size="sm" onClick={() => setUpdateDialogOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveUpdate} disabled={!updateTitle.trim()}>
            {editingUpdate ? 'Save' : 'Create'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Storage Browser Modal for featured images */}
    <StorageBrowserModal
      open={storageBrowserOpen}
      onOpenChange={setStorageBrowserOpen}
      organizationId={organizationId}
      mode="select"
      fileFilter="image"
      onSelect={(file) => {
        if (!Array.isArray(file)) {
          handleImageSelect(file)
        }
      }}
    />

    {/* Storage Browser Modal for toggle button image */}
    <StorageBrowserModal
      open={toggleImageBrowserOpen}
      onOpenChange={setToggleImageBrowserOpen}
      organizationId={organizationId}
      mode="select"
      fileFilter="image"
      title="Select Toggle Image"
      subtitle="Choose an image for your chat widget launcher"
      onSelect={(file) => {
        if (!Array.isArray(file)) {
          handleToggleImageSelect(file)
        }
      }}
    />
    </>
  )
}
