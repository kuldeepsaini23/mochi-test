/**
 * ============================================================================
 * AUTOMATION BUILDER DATA HOOK
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: AutomationBuilderData, UseAutomationBuilderData
 *
 * Fetches real data from the database for use in automation builder config forms.
 * Provides forms, email templates, tags, and pipelines for dropdown selections.
 *
 * USAGE:
 * const { forms, emailTemplates, tags, pipelines, isLoading } = useAutomationBuilderData()
 */

'use client'

import { useMemo } from 'react'
import { trpc } from '@/trpc/react-provider'

/**
 * Simplified form type for automation builder dropdowns.
 * SOURCE OF TRUTH: FormSelectOption
 */
export interface FormSelectOption {
  id: string
  name: string
}

/**
 * Simplified email template type for automation builder dropdowns.
 * SOURCE OF TRUTH: EmailTemplateSelectOption
 */
export interface EmailTemplateSelectOption {
  id: string
  name: string
}

/**
 * Simplified tag type for automation builder dropdowns.
 * SOURCE OF TRUTH: TagSelectOption
 */
export interface TagSelectOption {
  id: string
  name: string
  color: string
}

/**
 * Simplified pipeline type for automation builder dropdowns.
 * SOURCE OF TRUTH: PipelineSelectOption
 */
export interface PipelineSelectOption {
  id: string
  name: string
  lanes: {
    id: string
    name: string
  }[]
}

/**
 * Simplified booking calendar type for automation builder dropdowns.
 * SOURCE OF TRUTH: CalendarSelectOption
 */
export interface CalendarSelectOption {
  id: string
  name: string
}

/**
 * Simplified product type for automation builder dropdowns.
 * Includes prices so users can filter by specific price (e.g., "Monthly Plan").
 * billingType, trialDays, and interval are used to filter products/prices
 * contextually per trigger type (e.g., trial_started only shows trial prices).
 * SOURCE OF TRUTH: ProductSelectOption
 */
export interface ProductSelectOption {
  id: string
  name: string
  prices: {
    id: string
    name: string
    billingType: string
    /** Trial duration in days — null means no trial */
    trialDays: number | null
    /** Billing interval for RECURRING prices (e.g. 'MONTH', 'YEAR') */
    interval: string | null
  }[]
}

/**
 * Return type for the useAutomationBuilderData hook.
 * SOURCE OF TRUTH: AutomationBuilderDataResult
 */
export interface AutomationBuilderDataResult {
  /** List of forms for form-submitted trigger */
  forms: FormSelectOption[]
  /** List of email templates for send-email action */
  emailTemplates: EmailTemplateSelectOption[]
  /** List of tags for add-tag/remove-tag actions and tag triggers */
  tags: TagSelectOption[]
  /** List of pipelines with lanes for pipeline actions */
  pipelines: PipelineSelectOption[]
  /** List of booking calendars for appointment triggers */
  calendars: CalendarSelectOption[]
  /** List of products with prices for payment-completed trigger */
  products: ProductSelectOption[]
  /** Whether any data is still loading */
  isLoading: boolean
  /** Combined error message if any fetch failed */
  error: string | null
}

/**
 * Hook to fetch all data needed by automation builder config forms.
 *
 * @param organizationId - The organization to fetch data for
 * @returns Object containing forms, email templates, tags, pipelines, and loading state
 */
export function useAutomationBuilderData(organizationId: string): AutomationBuilderDataResult {
  // Fetch forms
  const formsQuery = trpc.forms.list.useQuery(
    { organizationId, page: 1, pageSize: 100 },
    { enabled: !!organizationId }
  )

  // Fetch email templates
  const templatesQuery = trpc.emailTemplates.list.useQuery(
    { organizationId, page: 1, pageSize: 100 },
    { enabled: !!organizationId }
  )

  // Fetch tags
  const tagsQuery = trpc.leads.listTags.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  )

  // Fetch pipelines
  const pipelinesQuery = trpc.pipeline.list.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  )

  // Fetch booking calendars
  const calendarsQuery = trpc.bookingCalendar.list.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  )

  // Fetch products with prices for payment-completed trigger
  const productsQuery = trpc.products.list.useQuery(
    { organizationId, page: 1, pageSize: 100 },
    { enabled: !!organizationId }
  )

  // Transform forms to simplified format
  const forms = useMemo<FormSelectOption[]>(() => {
    if (!formsQuery.data?.forms) return []
    return formsQuery.data.forms.map((form) => ({
      id: form.id,
      name: form.name,
    }))
  }, [formsQuery.data])

  // Transform email templates to simplified format
  const emailTemplates = useMemo<EmailTemplateSelectOption[]>(() => {
    if (!templatesQuery.data?.templates) return []
    return templatesQuery.data.templates.map((template) => ({
      id: template.id,
      name: template.name,
    }))
  }, [templatesQuery.data])

  // Transform tags to simplified format
  const tags = useMemo<TagSelectOption[]>(() => {
    if (!tagsQuery.data) return []
    return tagsQuery.data.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color ?? '#6366f1',
    }))
  }, [tagsQuery.data])

  // Transform pipelines to simplified format with lanes
  const pipelines = useMemo<PipelineSelectOption[]>(() => {
    if (!pipelinesQuery.data) return []
    return pipelinesQuery.data.map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
      lanes: pipeline.lanes?.map((lane) => ({
        id: lane.id,
        name: lane.name,
      })) ?? [],
    }))
  }, [pipelinesQuery.data])

  // Transform booking calendars to simplified format
  const calendars = useMemo<CalendarSelectOption[]>(() => {
    if (!calendarsQuery.data?.length) return []
    return calendarsQuery.data.map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
    }))
  }, [calendarsQuery.data])

  // Transform products with their prices for payment trigger filter
  const products = useMemo<ProductSelectOption[]>(() => {
    if (!productsQuery.data?.products) return []
    return productsQuery.data.products.map((product) => ({
      id: product.id,
      name: product.name,
      prices: (product.prices ?? []).map((price) => ({
        id: price.id,
        name: price.name,
        billingType: price.billingType,
        trialDays: price.trialDays ?? null,
        interval: price.interval ?? null,
      })),
    }))
  }, [productsQuery.data])

  // Combined loading state
  const isLoading =
    formsQuery.isLoading ||
    templatesQuery.isLoading ||
    tagsQuery.isLoading ||
    pipelinesQuery.isLoading ||
    calendarsQuery.isLoading ||
    productsQuery.isLoading

  // Combined error
  const error =
    formsQuery.error?.message ||
    templatesQuery.error?.message ||
    tagsQuery.error?.message ||
    pipelinesQuery.error?.message ||
    calendarsQuery.error?.message ||
    productsQuery.error?.message ||
    null

  return {
    forms,
    emailTemplates,
    tags,
    pipelines,
    calendars,
    products,
    isLoading,
    error,
  }
}
