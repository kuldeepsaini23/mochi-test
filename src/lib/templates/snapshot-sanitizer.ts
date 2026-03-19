/**
 * ============================================================================
 * TEMPLATE SYSTEM — SNAPSHOT SANITIZER
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: SnapshotSanitizer, CreateFeatureSnapshot,
 * TemplateSnapshot, SanitizedSnapshot, FeatureSnapshotCreator
 *
 * WHY: When a feature is bundled into a template, we need to capture a
 * "snapshot" of its data that is safe to share with other organizations.
 * The snapshot must NEVER contain:
 * - PII (lead data, messages, customer info)
 * - Stripe IDs (product IDs, price IDs — regenerated on install)
 * - Team member info (assignees, calendar assignments)
 * - User-generated data (form submissions, CMS rows, pipeline tickets)
 * - Org-specific references (domain IDs, folder IDs)
 *
 * HOW: Each feature type has a dedicated snapshot function that selects
 * only the safe, structural fields from the database.
 */

import { prisma } from '@/lib/config'
import type {
  TemplateCategory,
  FeatureSnapshotMap,
  WebsiteSnapshot,
  EmailSnapshot,
  AutomationSnapshot,
  FormSnapshot,
  ContractSnapshot,
  PipelineSnapshot,
  BookingSnapshot,
  ChatWidgetSnapshot,
  CmsSchemaSnapshot,
  ProductSnapshot,
} from './types'

// ============================================================================
// MAIN DISPATCHER — Routes to the correct snapshot function
// ============================================================================

/**
 * Creates a sanitized snapshot of a feature for inclusion in a template.
 * Dispatches to the appropriate per-type snapshot function based on featureType.
 *
 * @param orgId - Organization ID for scoped queries
 * @param featureType - The TemplateCategory of the feature to snapshot
 * @param featureId - The database ID of the feature
 * @returns Sanitized snapshot data matching the feature's snapshot interface
 * @throws Error if the feature is not found or the type is unsupported
 */
export async function createFeatureSnapshot<T extends TemplateCategory>(
  orgId: string,
  featureType: T,
  featureId: string,
  /** Optional flags for snapshot behavior */
  options?: { includeCmsRows?: boolean }
): Promise<FeatureSnapshotMap[T]> {
  switch (featureType) {
    case 'WEBSITE':
      return (await snapshotWebsite(orgId, featureId)) as FeatureSnapshotMap[T]
    case 'EMAIL':
      return (await snapshotEmailTemplate(
        orgId,
        featureId
      )) as FeatureSnapshotMap[T]
    case 'AUTOMATION':
      return (await snapshotAutomation(
        orgId,
        featureId
      )) as FeatureSnapshotMap[T]
    case 'FORM':
      return (await snapshotForm(orgId, featureId)) as FeatureSnapshotMap[T]
    case 'CONTRACT':
      return (await snapshotContract(orgId, featureId)) as FeatureSnapshotMap[T]
    case 'PIPELINE':
      return (await snapshotPipeline(orgId, featureId)) as FeatureSnapshotMap[T]
    case 'BOOKING':
      return (await snapshotBooking(orgId, featureId)) as FeatureSnapshotMap[T]
    case 'CHAT_WIDGET':
      return (await snapshotChatWidget(
        orgId,
        featureId
      )) as FeatureSnapshotMap[T]
    case 'CMS_SCHEMA':
      return (await snapshotCmsSchema(
        orgId,
        featureId,
        options?.includeCmsRows
      )) as FeatureSnapshotMap[T]
    case 'PRODUCT':
      return (await snapshotProduct(orgId, featureId)) as FeatureSnapshotMap[T]
    case 'BLUEPRINT':
      return {} as FeatureSnapshotMap[T]
    default:
      throw new Error(`Unsupported feature type for snapshot: ${featureType}`)
  }
}

// ============================================================================
// PER-TYPE SNAPSHOT FUNCTIONS
// ============================================================================

/**
 * Snapshots a website with its pages and local components.
 * Excludes: domain references, organization ID, published data, preview images.
 * Includes: page canvas data, slugs, CMS table refs, local component trees.
 */
async function snapshotWebsite(
  orgId: string,
  websiteId: string
): Promise<WebsiteSnapshot> {
  const website = await prisma.website.findFirst({
    where: { id: websiteId, organizationId: orgId, deletedAt: null },
    select: {
      name: true,
      description: true,
      enableEcommerce: true,
      chatWidgetId: true,
      pages: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          /** Include the ID so we can build old→new page mappings during install */
          id: true,
          name: true,
          slug: true,
          canvasData: true,
          cmsTableId: true,
          cmsSlugColumnSlug: true,
          order: true,
          isEcommercePage: true,
        },
      },
      localComponents: {
        select: {
          /** Include the ID so we can build old→new mappings during install */
          id: true,
          name: true,
          description: true,
          sourceTree: true,
          exposedProps: true,
          tags: true,
          skeletonStyles: true,
        },
      },
    },
  })

  if (!website) throw new Error(`Website not found: ${websiteId}`)

  /**
   * Fetch the organization's saved color palette.
   * These are org-scoped reusable colors used in the website builder.
   * Without them, installed templates would have broken color references.
   */
  const savedColors = await prisma.savedColor.findMany({
    where: { organizationId: orgId },
    orderBy: { sortOrder: 'asc' },
    select: { name: true, color: true, sortOrder: true },
  })

  return {
    name: website.name,
    description: website.description,
    enableEcommerce: website.enableEcommerce,
    chatWidgetId: website.chatWidgetId,
    savedColors: savedColors.map((c) => ({
      name: c.name,
      color: c.color,
      sortOrder: c.sortOrder,
    })),
    pages: website.pages.map((page) => ({
      sourceId: page.id,
      name: page.name,
      slug: page.slug,
      canvasData: (page.canvasData as Record<string, unknown>) ?? null,
      cmsTableId: page.cmsTableId,
      cmsSlugColumnSlug: page.cmsSlugColumnSlug,
      order: page.order,
      isEcommercePage: page.isEcommercePage,
    })),
    localComponents: website.localComponents.map((comp) => ({
      sourceId: comp.id,
      name: comp.name,
      description: comp.description,
      sourceTree: comp.sourceTree as Record<string, unknown>,
      exposedProps: comp.exposedProps as Record<string, unknown>,
      tags: comp.tags,
      skeletonStyles:
        (comp.skeletonStyles as Record<string, unknown>) ?? null,
    })),
  }
}

/**
 * Snapshots an email template with its content blocks and settings.
 * Excludes: organization ID, folder, usage stats, timestamps.
 */
async function snapshotEmailTemplate(
  orgId: string,
  templateId: string
): Promise<EmailSnapshot> {
  const template = await prisma.emailTemplate.findFirst({
    where: { id: templateId, organizationId: orgId, deletedAt: null },
    select: {
      name: true,
      description: true,
      subject: true,
      content: true,
    },
  })

  if (!template) throw new Error(`Email template not found: ${templateId}`)

  return {
    name: template.name,
    description: template.description,
    subject: template.subject,
    content: template.content as Record<string, unknown>,
  }
}

/**
 * Snapshots an automation with its trigger config and workflow schema.
 * Excludes: organization ID, folder, run statistics, timestamps, slug.
 * NOTE: triggerConfig and schema may contain cross-feature ID references
 * that the remapper will handle during installation.
 */
async function snapshotAutomation(
  orgId: string,
  automationId: string
): Promise<AutomationSnapshot> {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, organizationId: orgId },
    select: {
      name: true,
      description: true,
      triggerType: true,
      triggerConfig: true,
      schema: true,
    },
  })

  if (!automation) throw new Error(`Automation not found: ${automationId}`)

  return {
    name: automation.name,
    description: automation.description,
    triggerType: automation.triggerType,
    triggerConfig:
      (automation.triggerConfig as Record<string, unknown>) ?? null,
    schema: automation.schema as Record<string, unknown>,
  }
}

/**
 * Snapshots a form with its field configuration and settings.
 * Excludes: organization ID, folder, submission data, view/submission counts.
 */
async function snapshotForm(
  orgId: string,
  formId: string
): Promise<FormSnapshot> {
  const form = await prisma.form.findFirst({
    where: { id: formId, organizationId: orgId },
    select: {
      name: true,
      description: true,
      config: true,
      submitButtonText: true,
      successMessage: true,
      redirectUrl: true,
      enableCaptcha: true,
      submissionLimit: true,
    },
  })

  if (!form) throw new Error(`Form not found: ${formId}`)

  return {
    name: form.name,
    description: form.description,
    config: (form.config as Record<string, unknown>) ?? null,
    submitButtonText: form.submitButtonText,
    successMessage: form.successMessage,
    redirectUrl: form.redirectUrl,
    enableCaptcha: form.enableCaptcha,
    submissionLimit: form.submissionLimit,
  }
}

/**
 * Snapshots a contract with its Lexical content and local variables.
 * Excludes: organization ID, folder, recipient, access token, signed data, timestamps.
 */
async function snapshotContract(
  orgId: string,
  contractId: string
): Promise<ContractSnapshot> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId: orgId },
    select: {
      name: true,
      description: true,
      content: true,
      variables: true,
    },
  })

  if (!contract) throw new Error(`Contract not found: ${contractId}`)

  return {
    name: contract.name,
    description: contract.description,
    content: (contract.content as Record<string, unknown>) ?? null,
    variables: (contract.variables as Record<string, unknown>) ?? null,
  }
}

/**
 * Snapshots a pipeline with its lane definitions only.
 * Excludes: organization ID, tickets, assignees, lead references, timestamps.
 */
async function snapshotPipeline(
  orgId: string,
  pipelineId: string
): Promise<PipelineSnapshot> {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, organizationId: orgId, deletedAt: null },
    select: {
      name: true,
      description: true,
      lanes: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          name: true,
          color: true,
          order: true,
        },
      },
    },
  })

  if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`)

  return {
    name: pipeline.name,
    description: pipeline.description,
    lanes: pipeline.lanes.map((lane) => ({
      name: lane.name,
      color: lane.color,
      order: lane.order,
    })),
  }
}

/**
 * Snapshots a booking calendar with its availability schedule.
 * Excludes: organization ID, team assignments, bookings, default assignee.
 */
async function snapshotBooking(
  orgId: string,
  calendarId: string
): Promise<BookingSnapshot> {
  const calendar = await prisma.bookingCalendar.findFirst({
    where: { id: calendarId, organizationId: orgId },
    select: {
      name: true,
      description: true,
      duration: true,
      bufferBefore: true,
      bufferAfter: true,
      color: true,
      locationType: true,
      locationDetails: true,
      availability: {
        orderBy: { dayOfWeek: 'asc' },
        select: {
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          isEnabled: true,
        },
      },
    },
  })

  if (!calendar) throw new Error(`Booking calendar not found: ${calendarId}`)

  return {
    name: calendar.name,
    description: calendar.description,
    duration: calendar.duration,
    bufferBefore: calendar.bufferBefore,
    bufferAfter: calendar.bufferAfter,
    color: calendar.color,
    locationType: calendar.locationType,
    locationDetails: calendar.locationDetails,
    availability: calendar.availability.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isEnabled: slot.isEnabled,
    })),
  }
}

/**
 * Snapshots a chat widget with its config and FAQ items.
 * Excludes: organization ID, conversations, guest sessions, website linkages, updates.
 */
async function snapshotChatWidget(
  orgId: string,
  widgetId: string
): Promise<ChatWidgetSnapshot> {
  const widget = await prisma.chatWidget.findFirst({
    where: { id: widgetId, organizationId: orgId },
    select: {
      name: true,
      description: true,
      config: true,
      faqItems: {
        orderBy: { sortOrder: 'asc' },
        select: {
          question: true,
          answer: true,
          sortOrder: true,
        },
      },
    },
  })

  if (!widget) throw new Error(`Chat widget not found: ${widgetId}`)

  return {
    name: widget.name,
    description: widget.description,
    config: (widget.config as Record<string, unknown>) ?? null,
    faqs: widget.faqItems.map((faq) => ({
      question: faq.question,
      answer: faq.answer,
      sortOrder: faq.sortOrder,
    })),
  }
}

/**
 * Snapshots a CMS table with column definitions and optional row data.
 * Excludes: organization ID, system table flags, store references.
 * Row data is only included when the user explicitly opts in during template creation.
 *
 * @param includeCmsRows - When true, fetches and includes row data in the snapshot
 */
async function snapshotCmsSchema(
  orgId: string,
  tableId: string,
  includeCmsRows?: boolean
): Promise<CmsSchemaSnapshot> {
  const table = await prisma.cmsTable.findFirst({
    where: { id: tableId, organizationId: orgId, deletedAt: null },
    select: {
      name: true,
      description: true,
      icon: true,
      isPublic: true,
      columns: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          name: true,
          slug: true,
          columnType: true,
          required: true,
          defaultValue: true,
          options: true,
          order: true,
        },
      },
    },
  })

  if (!table) throw new Error(`CMS table not found: ${tableId}`)

  const result: CmsSchemaSnapshot = {
    name: table.name,
    description: table.description,
    icon: table.icon,
    isPublic: table.isPublic,
    columns: table.columns.map((col) => ({
      name: col.name,
      slug: col.slug,
      columnType: col.columnType,
      required: col.required,
      defaultValue: col.defaultValue,
      options: (col.options as Record<string, unknown>) ?? null,
      order: col.order,
    })),
  }

  /** Optionally include row data when the user chose to bundle it.
   *  Rows are keyed by column slug so they can be re-created in the target org. */
  if (includeCmsRows) {
    const rows = await prisma.cmsRow.findMany({
      where: { tableId, deletedAt: null },
      orderBy: { order: 'asc' },
      select: { values: true, order: true },
    })
    result.rows = rows.map((row) => ({
      values: (row.values as Record<string, unknown>) ?? {},
      order: row.order,
    }))
  }

  return result
}

/**
 * Snapshots a product with its prices and price features.
 * Excludes: Stripe IDs (stripeProductId, stripePriceId), organization ID,
 * inventory quantity (reset on install), payment links, store listings.
 */
async function snapshotProduct(
  orgId: string,
  productId: string
): Promise<ProductSnapshot> {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId: orgId, deletedAt: null },
    select: {
      name: true,
      description: true,
      imageUrl: true,
      images: true,
      trackInventory: true,
      allowBackorder: true,
      lowStockThreshold: true,
      prices: {
        where: { deletedAt: null, active: true },
        select: {
          name: true,
          amount: true,
          currency: true,
          billingType: true,
          interval: true,
          intervalCount: true,
          installments: true,
          installmentInterval: true,
          installmentIntervalCount: true,
          active: true,
          features: {
            orderBy: { order: 'asc' },
            select: {
              name: true,
              description: true,
              order: true,
            },
          },
        },
      },
    },
  })

  if (!product) throw new Error(`Product not found: ${productId}`)

  return {
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    images: (product.images as string[] | null) ?? [],
    trackInventory: product.trackInventory,
    allowBackorder: product.allowBackorder,
    lowStockThreshold: product.lowStockThreshold,
    prices: product.prices.map((price) => ({
      name: price.name,
      amount: price.amount,
      currency: price.currency,
      billingType: price.billingType,
      interval: price.interval,
      intervalCount: price.intervalCount,
      installments: price.installments,
      installmentInterval: price.installmentInterval,
      installmentIntervalCount: price.installmentIntervalCount,
      active: price.active,
      features: price.features.map((feat) => ({
        name: feat.name,
        description: feat.description,
        order: feat.order,
      })),
    })),
  }
}
