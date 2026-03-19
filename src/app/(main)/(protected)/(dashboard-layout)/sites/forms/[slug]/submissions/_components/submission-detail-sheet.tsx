/**
 * Submission Detail Sheet
 *
 * WHY: Displays full submission data in a slide-over panel
 * HOW: Uses Sheet component to show all key-value pairs from the submission JSON.
 *      Follows the app's established Sheet pattern: SheetContent p-6 + SheetHeader p-0.
 *
 * SOURCE OF TRUTH: FormSubmissionWithDetails from form-submission.service.ts
 */

'use client'

import { format } from 'date-fns'
import { Trash2, User, Globe, Monitor } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import type { SubmissionRowData } from './submissions-table'

interface SubmissionDetailSheetProps {
  submission: SubmissionRowData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete?: (id: string) => void
  canDelete: boolean
  isDeleting?: boolean
}

/** Converts a submission value to a human-readable string */
function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value || '-'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ') || '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Converts generated field names (e.g. "checkbox_group_f3393f88") into readable labels.
 *  Strips trailing hex UUID suffixes and normalizes separators. */
function formatFieldKey(key: string): string {
  return key
    .replace(/_[a-f0-9]{6,}$/i, '')    // strip trailing UUID suffix like _f3393f88
    .replace(/([A-Z])/g, ' $1')        // camelCase → spaced
    .replace(/[_-]/g, ' ')             // snake_case / kebab → spaced
    .replace(/\b\w/g, (c) => c.toUpperCase()) // capitalize each word
    .trim()
}

export function SubmissionDetailSheet({
  submission,
  open,
  onOpenChange,
  onDelete,
  canDelete,
  isDeleting,
}: SubmissionDetailSheetProps) {
  if (!submission) return null

  const dataEntries =
    submission.data && typeof submission.data === 'object'
      ? Object.entries(submission.data as Record<string, unknown>)
      : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col sm:max-w-md overflow-hidden p-0"
      >
        {/* Header — pinned at top */}
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Submission Details</SheetTitle>
          <SheetDescription>
            Submitted on{' '}
            {format(
              new Date(submission.createdAt),
              "MMMM d, yyyy 'at' h:mm a"
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Contact Info — only shown when a lead is linked */}
          {submission.lead && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium">Contact</h4>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  {(submission.lead.firstName || submission.lead.lastName) && (
                    <p className="text-sm font-medium">
                      {[submission.lead.firstName, submission.lead.lastName]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {submission.lead.email}
                  </p>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Form Response Data — the key-value pairs from the submission JSON */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Form Response</h4>
            {dataEntries.length > 0 ? (
              <div className="space-y-3">
                {dataEntries.map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {formatFieldKey(key)}
                    </label>
                    <p className="text-sm break-words">
                      {formatFieldValue(value)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No data available
              </p>
            )}
          </div>

          <Separator />

          {/* Metadata — form name, referrer, user agent, IP */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Metadata</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Form:</span>
                <Badge variant="secondary" className="text-xs">
                  {submission.form.name}
                </Badge>
              </div>
              {submission.referrerUrl && (
                <div className="flex items-start gap-2">
                  <Globe className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground break-all">
                    {submission.referrerUrl}
                  </span>
                </div>
              )}
              {submission.userAgent && (
                <div className="flex items-start gap-2">
                  <Monitor className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground break-all line-clamp-2">
                    {submission.userAgent}
                  </span>
                </div>
              )}
              {submission.ipAddress && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    IP: {submission.ipAddress}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer — pinned at bottom, only shown when user can delete */}
        {canDelete && onDelete && (
          <SheetFooter className="border-t px-6 py-4">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => onDelete(submission.id)}
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? 'Deleting...' : 'Delete Submission'}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
