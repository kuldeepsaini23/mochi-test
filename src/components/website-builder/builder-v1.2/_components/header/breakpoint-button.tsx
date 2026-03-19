/**
 * ============================================================================
 * BREAKPOINT BUTTON - Create responsive breakpoint previews for Pages
 * ============================================================================
 *
 * Renders a "+ Create Breakpoint" button on PAGE elements (top-right corner,
 * opposite to the label which is on the top-left).
 *
 * FEATURES:
 * - Same zoom/grab protection as the label and dimension pill
 * - Muted appearance by default, blue highlight on hover
 * - Dropdown menu to select breakpoint type (mobile)
 * - Dispatches togglePageBreakpoint action when a breakpoint is selected
 *
 * DESIGN:
 * - Styled similar to the dimension pill but positioned at top-right
 * - Uses the same inverse zoom scaling to remain readable at any zoom level
 *
 * ============================================================================
 */

'use client'

import React, { useState, useRef, useEffect, memo, useCallback } from 'react'
import { useAppDispatch } from '../../_lib/store'
import { togglePageBreakpoint } from '../../_lib/canvas-slice'
import type { PageElement } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

interface BreakpointButtonProps {
  /** The page element this button belongs to */
  pageElement: PageElement

  /** Current zoom level for inverse scaling */
  zoom: number

  /** Whether the page is currently selected (affects initial color) */
  isSelected: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Mobile breakpoint viewport width (iPhone 14/15 Pro width) */
const MOBILE_WIDTH = 390

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * BreakpointButton - Shows dropdown to create responsive breakpoint previews.
 *
 * Positioned at the top-right of PAGE elements, with same zoom compensation
 * as the label (top-left) and dimension pill (bottom-center).
 */
export const BreakpointButton = memo(function BreakpointButton({
  pageElement,
  zoom,
  isSelected: _isSelected,
}: BreakpointButtonProps) {
  const dispatch = useAppDispatch()

  /** Track hover state for button styling */
  const [isHovered, setIsHovered] = useState(false)

  /** Track whether dropdown is open */
  const [isOpen, setIsOpen] = useState(false)

  /** Ref for click-outside detection */
  const dropdownRef = useRef<HTMLDivElement>(null)

  /** Check if mobile breakpoint is currently enabled */
  const isMobileEnabled = pageElement.breakpoints?.mobile === true

  /**
   * Handle click outside to close dropdown.
   * Uses mousedown event to close before any click handlers fire.
   */
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  /**
   * Handle button click - toggle dropdown.
   * Stops propagation to prevent page selection/drag.
   */
  const handleButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsOpen((prev) => !prev)
  }, [])

  /**
   * Handle mobile breakpoint selection.
   * Dispatches the toggle action and closes dropdown.
   */
  const handleMobileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      dispatch(togglePageBreakpoint({ pageId: pageElement.id, breakpoint: 'mobile' }))
      setIsOpen(false)
    },
    [dispatch, pageElement.id]
  )

  /**
   * Prevent pointer events from bubbling to parent (drag handlers).
   */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <div
      ref={dropdownRef}
      data-breakpoint-button="true"
      style={{
        position: 'absolute',
        // Position at top-right, opposite to the label at top-left
        top: -24,
        right: 0,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        // Allow pointer events for dropdown interaction
        pointerEvents: 'auto',
        userSelect: 'none',
        zIndex: 10,
        // Same inverse zoom scaling as the label
        // Clamp minimum scale to prevent text from becoming too small
        transform: `scale(${Math.max(1 / zoom, 1)})`,
        transformOrigin: 'bottom right',
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Main button */}
      <button
        onClick={handleButtonClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          height: 18,
          paddingLeft: 6,
          paddingRight: 6,
          borderRadius: 4,
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          // Muted by default (theme-aware), blue when hovered/open
          backgroundColor: isHovered || isOpen ? '#3b82f6' : 'var(--popover)',
          color: isHovered || isOpen ? '#ffffff' : 'var(--muted-foreground)',
          transition: 'background-color 150ms, color 150ms',
          fontSize: 10,
          fontWeight: 500,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Plus icon */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          style={{ flexShrink: 0 }}
        >
          <path
            d="M5 1V9M1 5H9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Breakpoint
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            minWidth: 160,
            /* Theme-aware dropdown surface and border */
            backgroundColor: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            overflow: 'hidden',
            zIndex: 100,
          }}
        >
          {/* Mobile breakpoint option */}
          <button
            onClick={handleMobileClick}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '8px 12px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 11,
              fontWeight: 500,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              /* Theme-aware text color for dropdown items */
              color: 'var(--foreground)',
              transition: 'background-color 100ms',
            }}
            onMouseEnter={(e) => {
              /* Theme-aware hover background */
              e.currentTarget.style.backgroundColor = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Mobile phone icon */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              Mobile ({MOBILE_WIDTH}px)
            </span>

            {/* Checkmark when enabled */}
            {isMobileEnabled && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  )
})
