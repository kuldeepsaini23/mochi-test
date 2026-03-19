'use client'

/**
 * Chat Widget Theme Context
 *
 * WHY: Share theme settings between sidebar controls and widget preview
 * HOW: React context with theme colors, behavior settings, and page-specific configs
 *      All changes are persisted to DB via TRPC mutations (debounced for config)
 *
 * SOURCE OF TRUTH: ChatWidgetEditor, EditorSidebar, ChatWidgetPreview
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { trpc } from '@/trpc/react-provider'
import type { EmailGradientConfig } from '@/types/email-templates'

// ============================================================================
// TYPES
// ============================================================================

export type ThemeMode = 'light' | 'dark'

export interface ChatWidgetThemeColors {
  mode: ThemeMode
  primaryText: string
  primaryTextGradient?: EmailGradientConfig
  secondaryText: string
  secondaryTextGradient?: EmailGradientConfig
  background: string
  backgroundGradient?: EmailGradientConfig
  secondaryBackground: string
  accent: string
  accentGradient?: EmailGradientConfig
  border: string
}

export interface ChatWidgetBehavior {
  autoOpen: boolean
  enableSounds: boolean
  showBranding: boolean
  /**
   * Welcome message shown when user opens the chat widget for the first time.
   * If not set, defaults to "Hi there! How can I help you today?"
   * SOURCE OF TRUTH: ChatWidgetWelcomeMessage
   */
  chatWelcomeMessage?: string
}

/**
 * Toggle button configuration for the chat widget launcher
 * SOURCE OF TRUTH: ChatWidgetToggleConfig
 */
export interface ChatWidgetToggleConfig {
  /** Whether to show image or icon in the toggle */
  type: 'image' | 'icon'
  /** Custom image URL - defaults to organization square logo if not set */
  image?: string | null
  /** Icon name from the icon picker (when type is 'icon') */
  icon?: string | null
}

export interface WelcomPageConfig {
  title: string
  subtitle: string
}

export interface FAQItem {
  id: string
  question: string
  answer: string
}

export interface HelpPageConfig {
  faqItems: FAQItem[]
}

export interface UpdateItem {
  id: string
  title: string
  content: string
  featuredImage?: string | null
  featuredImageFileId?: string | null
  createdAt: Date
}

export interface UpdatesPageConfig {
  updates: UpdateItem[]
}

export interface ChatWidgetConfig {
  theme: ChatWidgetThemeColors
  behavior: ChatWidgetBehavior
  toggle: ChatWidgetToggleConfig
  welcomePage: WelcomPageConfig
  helpPage: HelpPageConfig
  updatesPage: UpdatesPageConfig
}

interface ChatWidgetThemeContextValue {
  config: ChatWidgetConfig
  organizationId: string
  chatWidgetId: string
  /** 'idle' | 'saving' | 'saved' */
  saveStatus: 'idle' | 'saving' | 'saved'
  toggleThemeMode: () => void
  setThemeColor: (key: keyof Omit<ChatWidgetThemeColors, 'mode'>, value: string, gradient?: EmailGradientConfig) => void
  setBehavior: (key: keyof ChatWidgetBehavior, value: boolean) => void
  setToggleConfig: (updates: Partial<ChatWidgetToggleConfig>) => void
  setWelcomePageConfig: (key: keyof WelcomPageConfig, value: string) => void
  /** Set the welcome message shown when user first opens the chat */
  setChatWelcomeMessage: (message: string) => void
  addFAQItem: (item: Omit<FAQItem, 'id'>) => void
  updateFAQItem: (id: string, updates: Partial<Omit<FAQItem, 'id'>>) => void
  removeFAQItem: (id: string) => void
  addUpdate: (update: Omit<UpdateItem, 'id' | 'createdAt'>) => Promise<void>
  updateUpdate: (id: string, updates: Partial<Omit<UpdateItem, 'id' | 'createdAt'>>) => void
  removeUpdate: (id: string) => void
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const LIGHT_THEME: ChatWidgetThemeColors = {
  mode: 'light',
  primaryText: '#000000',
  secondaryText: '#6b7280',
  background: '#ffffff',
  secondaryBackground: '#f5f5f5',
  accent: '#2a2a2a',
  border: '#e5e7eb',
}

export const DARK_THEME: ChatWidgetThemeColors = {
  mode: 'dark',
  primaryText: '#ffffff',
  secondaryText: '#a1a1aa',
  background: '#171717',
  secondaryBackground: '#212121',
  accent: '#2a2a2a',
  border: '#2a2a2a',
}

const DEFAULT_CONFIG: ChatWidgetConfig = {
  theme: LIGHT_THEME,
  behavior: { autoOpen: false, enableSounds: false, showBranding: true, chatWelcomeMessage: 'Hi there! How can I help you today?' },
  toggle: { type: 'image', image: null, icon: 'message-circle' },
  welcomePage: { title: 'Hi there 👋', subtitle: 'How can we help you today?' },
  helpPage: { faqItems: [] },
  updatesPage: { updates: [] },
}

// ============================================================================
// CONTEXT
// ============================================================================

const ChatWidgetThemeContext = createContext<ChatWidgetThemeContextValue | null>(null)

// ============================================================================
// PROVIDER
// ============================================================================

interface InitialData {
  config: unknown
  faqItems: Array<{ id: string; question: string; answer: string }>
  updates: Array<{
    id: string
    title: string
    content: string
    featuredImage?: string | null
    featuredImageFileId?: string | null
    createdAt: Date | string
  }>
}

interface ChatWidgetThemeProviderProps {
  children: ReactNode
  organizationId: string
  chatWidgetId: string
  initialData: InitialData
}

export function ChatWidgetThemeProvider({
  children,
  organizationId,
  chatWidgetId,
  initialData,
}: ChatWidgetThemeProviderProps) {
  // Parse initial config
  const parsedConfig = initialData.config as Partial<{
    theme: Partial<ChatWidgetThemeColors>
    behavior: Partial<ChatWidgetBehavior>
    toggle: Partial<ChatWidgetToggleConfig>
    welcomePage: Partial<WelcomPageConfig>
  }> | null

  const [config, setConfig] = useState<ChatWidgetConfig>(() => ({
    theme: { ...DEFAULT_CONFIG.theme, ...parsedConfig?.theme },
    behavior: { ...DEFAULT_CONFIG.behavior, ...parsedConfig?.behavior },
    toggle: { ...DEFAULT_CONFIG.toggle, ...parsedConfig?.toggle },
    welcomePage: { ...DEFAULT_CONFIG.welcomePage, ...parsedConfig?.welcomePage },
    helpPage: {
      faqItems: initialData.faqItems.map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
      })),
    },
    updatesPage: {
      updates: initialData.updates.map((u) => ({
        id: u.id,
        title: u.title,
        content: u.content,
        featuredImage: u.featuredImage,
        featuredImageFileId: u.featuredImageFileId,
        createdAt: u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt),
      })),
    },
  }))

  // Save status for UI feedback
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // TRPC mutations - use mutate directly, not in callbacks
  const updateConfigMutation = trpc.chatWidgets.updateConfig.useMutation({
    onMutate: () => {
      setSaveStatus('saving')
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    },
    onSuccess: () => {
      setSaveStatus('saved')
      savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    },
    onError: () => setSaveStatus('idle'),
  })
  // Helper for save status handlers
  const saveHandlers = {
    onMutate: () => {
      setSaveStatus('saving')
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    },
    onSuccess: () => {
      setSaveStatus('saved')
      savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    },
    onError: () => setSaveStatus('idle'),
  }

  const createFAQMutation = trpc.chatWidgets.createFAQ.useMutation() // manual status in callback
  const updateFAQMutation = trpc.chatWidgets.updateFAQ.useMutation(saveHandlers)
  const deleteFAQMutation = trpc.chatWidgets.deleteFAQ.useMutation(saveHandlers)
  const createUpdateMutation = trpc.chatWidgets.createUpdate.useMutation() // manual status in callback
  const updateUpdateMutation = trpc.chatWidgets.updateUpdate.useMutation(saveHandlers)
  const deleteUpdateMutation = trpc.chatWidgets.deleteUpdate.useMutation(saveHandlers)

  // Debounce ref for config saves
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Simple debounced save - no dependencies that change
  const saveConfig = useCallback((newConfig: Partial<ChatWidgetConfig>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateConfigMutation.mutate({
        organizationId,
        chatWidgetId,
        config: {
          theme: newConfig.theme,
          behavior: newConfig.behavior,
          toggle: newConfig.toggle,
          welcomePage: newConfig.welcomePage,
        },
      })
    }, 800)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, chatWidgetId])

  const toggleThemeMode = useCallback(() => {
    setConfig((prev) => {
      const newMode = prev.theme.mode === 'light' ? 'dark' : 'light'
      const baseTheme = newMode === 'light' ? LIGHT_THEME : DARK_THEME
      const newTheme = { ...baseTheme, accent: prev.theme.accent, accentGradient: prev.theme.accentGradient }
      const newConfig = { ...prev, theme: newTheme }
      saveConfig(newConfig)
      return newConfig
    })
  }, [saveConfig])

  const setThemeColor = useCallback(
    (key: keyof Omit<ChatWidgetThemeColors, 'mode'>, value: string, gradient?: EmailGradientConfig) => {
      setConfig((prev) => {
        const newTheme = { ...prev.theme, [key]: value, [`${key}Gradient`]: gradient }
        const newConfig = { ...prev, theme: newTheme }
        saveConfig(newConfig)
        return newConfig
      })
    },
    [saveConfig]
  )

  const setBehavior = useCallback(
    (key: keyof ChatWidgetBehavior, value: boolean) => {
      setConfig((prev) => {
        const newBehavior = { ...prev.behavior, [key]: value }
        const newConfig = { ...prev, behavior: newBehavior }
        saveConfig(newConfig)
        return newConfig
      })
    },
    [saveConfig]
  )

  /**
   * Update toggle button configuration
   * WHY: Allows customizing the chat widget launcher button
   */
  const setToggleConfig = useCallback(
    (updates: Partial<ChatWidgetToggleConfig>) => {
      setConfig((prev) => {
        const newToggle = { ...prev.toggle, ...updates }
        const newConfig = { ...prev, toggle: newToggle }
        saveConfig(newConfig)
        return newConfig
      })
    },
    [saveConfig]
  )

  const setWelcomePageConfig = useCallback(
    (key: keyof WelcomPageConfig, value: string) => {
      setConfig((prev) => {
        const newWelcomePage = { ...prev.welcomePage, [key]: value }
        const newConfig = { ...prev, welcomePage: newWelcomePage }
        saveConfig(newConfig)
        return newConfig
      })
    },
    [saveConfig]
  )

  /**
   * Set the chat welcome message shown when user first opens the chat
   * WHY: Allows customizing the greeting message in the chat view
   */
  const setChatWelcomeMessage = useCallback(
    (message: string) => {
      setConfig((prev) => {
        const newBehavior = { ...prev.behavior, chatWelcomeMessage: message }
        const newConfig = { ...prev, behavior: newBehavior }
        saveConfig(newConfig)
        return newConfig
      })
    },
    [saveConfig]
  )

  const addFAQItem = useCallback(
    (item: Omit<FAQItem, 'id'>) => {
      const tempId = `temp-${Date.now()}`
      setConfig((prev) => ({
        ...prev,
        helpPage: { faqItems: [...prev.helpPage.faqItems, { ...item, id: tempId }] },
      }))
      setSaveStatus('saving')
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
      createFAQMutation.mutate(
        { organizationId, chatWidgetId, question: item.question, answer: item.answer },
        {
          onSuccess: (newFaq) => {
            setConfig((prev) => ({
              ...prev,
              helpPage: {
                faqItems: prev.helpPage.faqItems.map((f) =>
                  f.id === tempId ? { id: newFaq.id, question: newFaq.question, answer: newFaq.answer } : f
                ),
              },
            }))
            setSaveStatus('saved')
            savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
          },
          onError: () => setSaveStatus('idle'),
        }
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId, chatWidgetId]
  )

  const updateFAQItem = useCallback(
    (id: string, updates: Partial<Omit<FAQItem, 'id'>>) => {
      setConfig((prev) => ({
        ...prev,
        helpPage: { faqItems: prev.helpPage.faqItems.map((f) => (f.id === id ? { ...f, ...updates } : f)) },
      }))
      updateFAQMutation.mutate({ organizationId, chatWidgetId, faqId: id, ...updates })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId, chatWidgetId]
  )

  const removeFAQItem = useCallback(
    (id: string) => {
      setConfig((prev) => ({
        ...prev,
        helpPage: { faqItems: prev.helpPage.faqItems.filter((f) => f.id !== id) },
      }))
      deleteFAQMutation.mutate({ organizationId, chatWidgetId, faqId: id })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId, chatWidgetId]
  )

  const addUpdate = useCallback(
    async (update: Omit<UpdateItem, 'id' | 'createdAt'>) => {
      const tempId = `temp-${Date.now()}`
      setConfig((prev) => ({
        ...prev,
        updatesPage: { updates: [{ ...update, id: tempId, createdAt: new Date() }, ...prev.updatesPage.updates] },
      }))
      setSaveStatus('saving')
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
      try {
        const newUpdate = await createUpdateMutation.mutateAsync({
          organizationId,
          chatWidgetId,
          title: update.title,
          content: update.content,
          featuredImage: update.featuredImage,
          featuredImageFileId: update.featuredImageFileId,
        })
        setConfig((prev) => ({
          ...prev,
          updatesPage: {
            updates: prev.updatesPage.updates.map((u) =>
              u.id === tempId
                ? {
                    id: newUpdate.id,
                    title: newUpdate.title,
                    content: newUpdate.content,
                    featuredImage: newUpdate.featuredImage,
                    featuredImageFileId: newUpdate.featuredImageFileId,
                    createdAt: new Date(newUpdate.createdAt),
                  }
                : u
            ),
          },
        }))
        setSaveStatus('saved')
        savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('idle')
      }
    },
    // eslint-disable-next-line react-hooks-exhaustive-deps
    [organizationId, chatWidgetId]
  )

  const updateUpdate = useCallback(
    (id: string, updates: Partial<Omit<UpdateItem, 'id' | 'createdAt'>>) => {
      setConfig((prev) => ({
        ...prev,
        updatesPage: { updates: prev.updatesPage.updates.map((u) => (u.id === id ? { ...u, ...updates } : u)) },
      }))
      updateUpdateMutation.mutate({ organizationId, chatWidgetId, updateId: id, ...updates })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId, chatWidgetId]
  )

  const removeUpdate = useCallback(
    (id: string) => {
      setConfig((prev) => ({
        ...prev,
        updatesPage: { updates: prev.updatesPage.updates.filter((u) => u.id !== id) },
      }))
      deleteUpdateMutation.mutate({ organizationId, chatWidgetId, updateId: id })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId, chatWidgetId]
  )

  return (
    <ChatWidgetThemeContext.Provider
      value={{
        config,
        organizationId,
        chatWidgetId,
        saveStatus,
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
      }}
    >
      {children}
    </ChatWidgetThemeContext.Provider>
  )
}

export function useChatWidgetTheme() {
  const context = useContext(ChatWidgetThemeContext)
  if (!context) {
    throw new Error('useChatWidgetTheme must be used within ChatWidgetThemeProvider')
  }
  return context
}
