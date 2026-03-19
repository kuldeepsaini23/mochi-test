/**
 * ============================================================================
 * CART THEME STYLES — Shared Theme Utility
 * ============================================================================
 *
 * SOURCE OF TRUTH: CartThemeStyles, GetThemeStyles
 *
 * Centralized theme palette for all cart-related UI components:
 * - CartSummaryContent (shared cart items + totals + billing messages)
 * - Unified Checkout element (payment form styling)
 * - Cart Sheet (slide-out panel)
 *
 * Both light and dark themes use blue-tinted grays with blue accents
 * to match the payment element's visual language.
 *
 * ============================================================================
 */

/**
 * Theme-aware color palette for cart/checkout UI.
 *
 * SOURCE OF TRUTH: ThemeStyles, CartThemeColors
 */
export interface ThemeStyles {
  containerBg: string
  containerBorder: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  inputBg: string
  inputBorder: string
  inputFocusBorder: string
  mutedBg: string
  buttonBg: string
  buttonText: string
  successBg: string
  successText: string
  errorBg: string
  errorText: string
  checkColor: string
  cartBg: string
}

/**
 * Returns theme-aware color palette for cart/checkout UI.
 * Matches the payment element palette (blue-tinted grays + blue accents).
 *
 * SOURCE OF TRUTH: GetThemeStyles, CartThemeStyles
 */
export function getThemeStyles(theme: 'light' | 'dark'): ThemeStyles {
  if (theme === 'light') {
    return {
      containerBg: '#ffffff',
      containerBorder: '#e5e7eb',
      textPrimary: '#111827',
      textSecondary: '#6b7280',
      textMuted: '#9ca3af',
      inputBg: '#ffffff',
      inputBorder: '#d1d5db',
      inputFocusBorder: '#6366f1',
      mutedBg: 'rgba(107, 114, 128, 0.1)',
      buttonBg: '#3b82f6',
      buttonText: '#ffffff',
      successBg: 'rgba(16, 185, 129, 0.1)',
      successText: '#10b981',
      errorBg: 'rgba(239, 68, 68, 0.1)',
      errorText: '#ef4444',
      checkColor: '#3b82f6',
      cartBg: '#f9fafb',
    }
  }
  return {
    containerBg: '#0a0a0a',
    containerBorder: '#27272a',
    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    inputBg: '#18181b',
    inputBorder: '#3f3f46',
    inputFocusBorder: '#6366f1',
    mutedBg: 'rgba(161, 161, 170, 0.1)',
    buttonBg: '#3b82f6',
    buttonText: '#ffffff',
    successBg: 'rgba(16, 185, 129, 0.1)',
    successText: '#10b981',
    errorBg: 'rgba(239, 68, 68, 0.1)',
    errorText: '#ef4444',
    checkColor: '#3b82f6',
    cartBg: '#18181b',
  }
}
