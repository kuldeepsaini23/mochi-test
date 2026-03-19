/**
 * ============================================================================
 * TEMPLATE BROWSE — DETAIL VIEW
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateDetailView, TemplateDetailPage,
 * TemplatePublicDetail, TemplateDetailPrice
 *
 * WHY: Full template detail layout used inline within the browse component
 * and by the public /templates/[id] route. Centered single-column design with
 * all template info: thumbnail, name, creator, tags, rich-text description
 * (Lexical), "What's Included" items, and install action.
 *
 * HOW: Centered max-w-4xl layout. The description renders through the Lexical
 * RichTextEditor in readOnly mode (falls back to plain text paragraph if the
 * description is not valid JSON). The Edit button opens a full-screen
 * TemplateWizardLayout overlay in edit mode for editing metadata.
 *
 * PRICING: Price is displayed prominently near the template name. For paid
 * templates, the formatted price is shown; for free templates, "Free" is
 * displayed in muted text. Uses usePlatformCurrency() — never hardcodes $ or USD.
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Pencil, Trash2, AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { LexicalStaticContent } from '@/components/editor/lexical-static-content'

import { TEMPLATE_CATEGORY_META } from '@/lib/templates/constants'
import type { TemplateDetail } from '@/lib/templates/types'
import { TemplateInstallButton } from './template-install-button'
import { TemplateWizardLayout } from '@/components/templates/template-wizard'
import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'
import { trpc } from '@/trpc/react-provider'
import Image from 'next/image'

// ============================================================================
// PROPS
// ============================================================================

interface TemplateDetailViewProps {
  /** Full template detail data including items list */
  template: TemplateDetail
  /** Template price in cents — null or 0 means free */
  price?: number | null
  /** Whether the current user is authenticated */
  isAuthenticated?: boolean
  /** Current organization ID — for install checks and owner actions */
  organizationId?: string
  /** URL to navigate back to (defaults to /templates for public route) */
  backHref?: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Centered detail page for a template.
 * Shows thumbnail, metadata, price, description via Lexical editor, and items list.
 */
export function TemplateDetailView({
  template,
  price,
  isAuthenticated,
  organizationId,
  backHref = '/templates',
}: TemplateDetailViewProps) {
  const categoryMeta = TEMPLATE_CATEGORY_META[template.category]
  const CategoryIcon = categoryMeta.icon
  const { formatCurrency } = usePlatformCurrency()

  /**
   * Parallax window effect — pure DOM, no framer-motion overhead.
   * Finds the nearest scrollable ancestor (dashboard uses overflow-auto)
   * and shifts the image via GPU-accelerated translate3d on each frame.
   */
  const parallaxRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLDivElement>(null)

  const updateParallax = useCallback(() => {
    const el = parallaxRef.current
    const img = imgRef.current
    if (!el || !img) return

    const rect = el.getBoundingClientRect()
    const viewportH = window.innerHeight
    /** -1 to 1 range: how far the element has traveled through the viewport */
    const ratio = (viewportH - rect.top) / (viewportH + rect.height)
    const clamped = Math.max(0, Math.min(1, ratio))
    /** Map 0→1 to -150px→150px offset */
    const offset = (clamped - 0.5) * 300 + 60
    img.style.transform = `translate3d(0, ${offset}px, 0)`
  }, [])

  useEffect(() => {
    const el = parallaxRef.current
    if (!el) return

    /** Walk up DOM to find the scrollable ancestor */
    let scrollParent: HTMLElement | null = el.parentElement
    while (scrollParent) {
      const { overflow, overflowY } = getComputedStyle(scrollParent)
      if (/(auto|scroll)/.test(overflow + overflowY)) break
      scrollParent = scrollParent.parentElement
    }
    const scroller = scrollParent || window

    let raf: number
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(updateParallax)
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    /** Run immediately so image starts in the right position */
    updateParallax()

    return () => {
      scroller.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [updateParallax])

  /** Whether this template requires payment */
  const isPaid = price != null && price > 0

  /** Check if the viewer owns this template */
  const isOwner =
    !!organizationId && template.organizationId === organizationId

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Back navigation — always a Link to the parent browse page */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to templates
      </Link>

      {/* Thumbnail — parallax window effect: image moves slower than scroll */}
      <div
        ref={parallaxRef}
        className="aspect-[16/9] overflow-hidden rounded-lg bg-muted relative"
      >
        {template.thumbnailUrl ? (
          <div
            ref={imgRef}
            className="absolute inset-0 w-full"
            style={{ height: '160%', top: '-30%', willChange: 'transform' }}
          >
            <Image
              src={template.thumbnailUrl}
              alt={template.name}
              fill
              sizes="(max-width: 896px) 100vw, 896px"
              className="object-cover object-top"
            />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CategoryIcon className="h-16 w-16 text-muted-foreground/15" />
          </div>
        )}
      </div>

      {/* Template header — name, price, creator, category, version */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {template.name}
          </h1>
          {/* Price indicator — formatted price for paid, "Free" for free templates */}
          {isPaid ? (
            <span className="text-lg font-semibold text-primary">
              {formatCurrency(price)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Free</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {categoryMeta.label} · by {template.organizationName} · v
          {template.version}
        </p>

        {/* Tags — clean rounded pills */}
        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Rejection reason — visible to the template owner after portal admin rejects */}
        {isOwner && template.rejectionReason && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Template rejected</p>
              <p className="text-sm text-destructive/80 mt-0.5">
                {template.rejectionReason}
              </p>
            </div>
          </div>
        )}

        {/* Install/Buy button + owner controls */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <TemplateInstallButton
            template={template}
            price={price}
            isAuthenticated={isAuthenticated}
            organizationId={organizationId}
          />
          {isOwner && (
            <OwnerControls
              template={template}
              organizationId={organizationId!}
              backHref={backHref}
            />
          )}
        </div>
      </div>

      {/* Description — LexicalStaticContent for truly instant rendering (zero Lexical runtime) */}
      {template.description && (
        <div>
          <h2 className="text-lg font-medium mb-3">Description</h2>
          <LexicalStaticContent
            content={template.description}
            className="text-sm"
          />
        </div>
      )}

      {/* What's included — list of bundled items */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">
          What&apos;s included ({template.items.length})
        </h2>
        <div className="space-y-1.5">
          {template.items.map((item, index) => {
            const itemMeta = TEMPLATE_CATEGORY_META[item.featureType]
            const isMain = index === 0

            return (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-md bg-muted/40 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.sourceName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {itemMeta.label}
                  </p>
                </div>
                {isMain && (
                  <span className="text-xs text-muted-foreground shrink-0 ml-3">
                    Primary
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// OWNER CONTROLS — Edit + Delete buttons for template owners
// ============================================================================

interface OwnerControlsProps {
  template: TemplateDetail
  organizationId: string
  /** URL to navigate to after delete (parent browse page) */
  backHref: string
}

/**
 * Edit and delete buttons shown only when the viewer owns the template.
 * Edit opens a full-screen TemplateWizardLayout overlay in edit mode.
 * Delete uses a two-click confirmation to prevent accidents.
 */
function OwnerControls({ template, organizationId, backHref }: OwnerControlsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const router = useRouter()
  const utils = trpc.useUtils()

  /** Delete mutation — invalidates browse cache and navigates to browse page */
  const deleteMutation = trpc.templates.delete.useMutation({
    onSuccess: () => {
      utils.templates.browseLibrary.invalidate()
      utils.templates.getLibraryDetail.invalidate()
      router.push(backHref)
    },
  })

  /** Two-click delete: first click sets confirm, second click executes */
  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteMutation.mutate({ organizationId, templateId: template.id })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => setShowEditDialog(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Button
        variant={confirmDelete ? 'destructive' : 'ghost'}
        size="sm"
        className="gap-1.5"
        onClick={handleDelete}
        disabled={deleteMutation.isPending}
      >
        {deleteMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        {confirmDelete ? 'Confirm' : 'Delete'}
      </Button>

      {/* Edit Wizard — always mounted, visibility controlled by open prop */}
      <TemplateWizardLayout
        open={showEditDialog}
        mode="edit"
        editTemplate={template}
        organizationId={organizationId}
        onClose={() => {
          setShowEditDialog(false)
          utils.templates.getLibraryDetail.invalidate()
        }}
      />
    </>
  )
}


// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if a string is valid JSON (used by child components).
 * Returns false for null/undefined/plain text strings.
 */
function isValidJsonString(value: string | null): boolean {
  if (!value) return false
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}
