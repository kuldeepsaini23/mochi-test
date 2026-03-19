'use client'

/**
 * Help Page Component
 *
 * WHY: FAQ section for common questions
 * HOW: Search bar filters FAQ items, Accordion displays them
 *
 * SOURCE OF TRUTH: ChatWidgetPreview, ChatWidgetThemeContext
 */

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { ChatWidgetThemeColors, FAQItem } from '../chat-widget-theme-context'

// ============================================================================
// TYPES
// ============================================================================

interface HelpPageProps {
  /** Theme colors from context */
  theme: ChatWidgetThemeColors
  /** FAQ items from context */
  faqItems: FAQItem[]
}

// ============================================================================
// COMPONENT
// ============================================================================

export function HelpPage({ theme, faqItems }: HelpPageProps) {
  const [search, setSearch] = useState('')

  /** Filter FAQ items by question or answer content */
  const filteredItems = useMemo(() => {
    if (!search.trim()) return faqItems
    const searchLower = search.toLowerCase()
    return faqItems.filter(
      (item) =>
        item.question.toLowerCase().includes(searchLower) ||
        item.answer.toLowerCase().includes(searchLower)
    )
  }, [faqItems, search])

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <p className="text-xs mb-3" style={{ color: theme.secondaryText }}>
        Frequently asked questions
      </p>

      {/* Search Input */}
      <div
        className="flex items-center gap-2 px-3 h-9 rounded-lg border mb-3 shrink-0"
        style={{ borderColor: theme.border, backgroundColor: theme.secondaryBackground }}
      >
        <Search className="size-4 shrink-0" style={{ color: theme.secondaryText }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search FAQs..."
          className="flex-1 h-full bg-transparent text-sm outline-none"
          style={{ color: theme.primaryText }}
        />
      </div>

      {/* FAQ List */}
      <div className="flex-1 overflow-y-auto">
        {filteredItems.length > 0 ? (
          <div className="rounded-lg border" style={{ borderColor: theme.border }}>
            <Accordion type="single" collapsible className="w-full">
              {filteredItems.map((item, index) => (
                <AccordionItem
                  key={item.id}
                  value={item.id}
                  className={index === filteredItems.length - 1 ? 'border-b-0' : 'border-b'}
                  style={{ borderColor: theme.border }}
                >
                  <AccordionTrigger
                    className="px-3 py-3 text-sm font-medium hover:no-underline transition-colors"
                    style={{ color: theme.primaryText }}
                  >
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent style={{ backgroundColor: theme.secondaryBackground }}>
                    <div className="rounded-lg p-3">
                      <p className="text-sm" style={{ color: theme.secondaryText }}>
                        {item.answer}
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ) : search.trim() ? (
          /* No results from search */
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: theme.secondaryText }}>
              No matching questions found
            </p>
          </div>
        ) : (
          /* No FAQ items configured */
          <div className="flex items-center justify-center py-8">
            <p className="text-sm" style={{ color: theme.secondaryText }}>
              No FAQ items configured
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
