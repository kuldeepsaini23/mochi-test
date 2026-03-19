/**
 * USE AUTO-SAVE HOOK
 *
 * SOURCE OF TRUTH KEYWORDS: useAutoSave, AutoSaveHook
 *
 * Debounced auto-save. Watches `data` to reset the debounce timer
 * on every change, and only fires when `isDirty` is true.
 *
 * Used by: Automation Builder, Form Builder, Contract Builder, Invoice Builder.
 *
 * No initial-load guard needed — the caller's reducer/state must ensure
 * isDirty is false on mount (only real user edits set it to true).
 */

'use client'

import { useState, useRef, useEffect } from 'react'

interface UseAutoSaveOptions {
  /** Watched value — changing it resets the debounce timer */
  data: unknown
  /** Whether there are unsaved changes */
  isDirty: boolean
  /** Whether auto-save is enabled */
  autoSaveEnabled: boolean
  /** Async save function */
  onSave?: () => Promise<void>
  /** Debounce delay in ms (default 2000) */
  debounceMs?: number
}

interface UseAutoSaveReturn {
  isAutoSaving: boolean
  justSaved: boolean
}

export function useAutoSave({
  data,
  isDirty,
  autoSaveEnabled,
  onSave,
  debounceMs = 2000,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null)
  const savingRef = useRef(false)

  /**
   * Core auto-save effect.
   * Runs when data or isDirty changes. Resets debounce on every data change.
   * Only saves when enabled, dirty, and not already saving.
   */
  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || !onSave || savingRef.current) return

    // Reset debounce timer on each data change
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      if (savingRef.current) return
      savingRef.current = true
      setIsAutoSaving(true)

      try {
        // Run save + minimum delay in parallel so the spinner is visible
        // long enough for the user to notice (prevents instant flash)
        await Promise.all([
          onSave(),
          new Promise((r) => setTimeout(r, 800)),
        ])
        setJustSaved(true)
        feedbackTimerRef.current = setTimeout(() => setJustSaved(false), 2000)
      } catch (err) {
        console.error('Auto-save failed:', err)
      } finally {
        setIsAutoSaving(false)
        savingRef.current = false
      }
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [data, isDirty, autoSaveEnabled, onSave, debounceMs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  return { isAutoSaving, justSaved }
}
