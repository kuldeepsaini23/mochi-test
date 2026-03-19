/**
 * ============================================================================
 * CMS ROW SHEET - Sheet-Based Row Editor for CMS Tables
 * ============================================================================
 *
 * A right-side Sheet panel for creating and editing CMS table rows.
 * Replaces inline editing with a dedicated form surface that slides in
 * from the right when a user clicks a table row.
 *
 * Key features:
 * - Type-aware field rendering via shared FieldRenderer from cms-field-renderers
 * - Dirty tracking with discard confirmation dialog
 * - System column metadata (DATE_CREATED/DATE_UPDATED) shown as read-only
 * - Create mode (row=null) and Edit mode (row=CmsRow)
 *
 * SOURCE OF TRUTH KEYWORDS: CmsRowSheet, CmsRowSheetProps
 * ============================================================================
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, FileText, Clock } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { FieldRenderer, getDefaultValue } from './cms-field-renderers'
import type { CmsColumn, CmsRow } from './types'

// ============================================================================
// PROPS INTERFACE
// ============================================================================

/**
 * Props for CmsRowSheet.
 * - row=null triggers create mode
 * - row=CmsRow triggers edit mode
 *
 * SOURCE OF TRUTH: CmsRowSheetProps
 */
export interface CmsRowSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean
  /** Callback to close the sheet */
  onClose: () => void
  /** Table ID the row belongs to */
  tableId: string
  /** Organization ID for mutations and storage browser access */
  organizationId: string
  /** Column definitions for generating form fields */
  columns: CmsColumn[]
  /** Row to edit, or null for create mode */
  row: CmsRow | null
  /**
   * Whether this table is a system table (synced from ecommerce store).
   * When true, system columns (isSystem=true) are rendered as read-only,
   * while custom columns remain editable.
   */
  isSystemTable?: boolean
}

// ============================================================================
// CMS ROW SHEET COMPONENT
// ============================================================================

/**
 * Sheet-based row editor that slides in from the right.
 * Handles both creating new rows and editing existing ones.
 *
 * Tracks dirty state by comparing initialValues snapshot with currentValues.
 * When the user tries to close with unsaved changes, a confirmation dialog
 * is shown to prevent accidental data loss.
 */
export function CmsRowSheet({
  isOpen,
  onClose,
  tableId,
  organizationId,
  columns,
  row,
  isSystemTable = false,
}: CmsRowSheetProps) {
  const isEditMode = !!row

  /**
   * initialValues: Snapshot of form values when the sheet opens.
   * Used for dirty comparison — never mutated after initialization.
   */
  const [initialValues, setInitialValues] = useState<Record<string, unknown>>(
    {},
  )

  /**
   * currentValues: Live form state updated as user edits fields.
   * Compared against initialValues to determine dirty state.
   */
  const [currentValues, setCurrentValues] = useState<Record<string, unknown>>(
    {},
  )

  /** Whether the discard confirmation dialog is showing */
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  // tRPC utils for cache invalidation after mutations
  const utils = trpc.useUtils()

  // --------------------------------------------------------------------------
  // MUTATIONS
  // --------------------------------------------------------------------------

  /**
   * Create row mutation.
   * On success: invalidates row and table caches, then closes the sheet.
   */
  const createRow = trpc.cms.createRow.useMutation({
    onSuccess: () => {
      utils.cms.listRows.invalidate({ organizationId, tableId })
      utils.cms.listTables.invalidate({ organizationId })
      toast.success('Row created successfully')
      onClose()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create row')
    },
  })

  /**
   * Update row mutation.
   * On success: invalidates row cache, then closes the sheet.
   */
  const updateRow = trpc.cms.updateRow.useMutation({
    onSuccess: () => {
      utils.cms.listRows.invalidate({ organizationId, tableId })
      toast.success('Row updated successfully')
      onClose()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update row')
    },
  })

  const isPending = createRow.isPending || updateRow.isPending

  // --------------------------------------------------------------------------
  // FORM INITIALIZATION
  // --------------------------------------------------------------------------

  /**
   * Initialize form values when the sheet opens or the row/columns change.
   * Sets both initialValues (snapshot) and currentValues (live) to the same object.
   * System columns (DATE_CREATED, DATE_UPDATED) are excluded from the form —
   * they are displayed separately as read-only metadata.
   */
  useEffect(() => {
    if (isOpen) {
      const values: Record<string, unknown> = {}

      for (const col of columns) {
        /* Skip system columns — they are auto-managed by the database */
        if (
          col.columnType === 'DATE_CREATED' ||
          col.columnType === 'DATE_UPDATED'
        ) {
          continue
        }

        if (row) {
          /* Edit mode: use existing value, falling back to column default */
          values[col.slug] = row.values[col.slug] ?? getDefaultValue(col)
        } else {
          /* Create mode: start with the column's default value */
          values[col.slug] = getDefaultValue(col)
        }
      }

      setInitialValues(values)
      setCurrentValues(values)
    }
  }, [isOpen, row, columns])

  // --------------------------------------------------------------------------
  // DERIVED STATE
  // --------------------------------------------------------------------------

  /**
   * Editable columns are all columns except system-managed date columns.
   * These are the columns rendered as form fields in the sheet body.
   *
   * On system tables, this includes both store-synced columns (shown as disabled)
   * and custom user-added columns (editable).
   */
  const editableColumns = useMemo(
    () =>
      columns.filter(
        (col) =>
          col.columnType !== 'DATE_CREATED' &&
          col.columnType !== 'DATE_UPDATED',
      ),
    [columns],
  )

  /**
   * Set of column slugs that are protected on system tables.
   * These columns are rendered as disabled/read-only in the form.
   */
  const protectedColumnSlugs = useMemo(() => {
    if (!isSystemTable) return new Set<string>()
    return new Set(
      columns
        .filter((col) => col.isSystem === true)
        .map((col) => col.slug),
    )
  }, [columns, isSystemTable])

  /**
   * System columns for read-only metadata display at the bottom.
   * Only shown in edit mode when the row already exists.
   */
  const systemColumns = useMemo(
    () =>
      columns.filter(
        (col) =>
          col.columnType === 'DATE_CREATED' ||
          col.columnType === 'DATE_UPDATED',
      ),
    [columns],
  )

  /**
   * Dirty check: compares the current form state against the initial snapshot.
   * Uses JSON.stringify for deep comparison of nested values (e.g. multiselect arrays, color objects).
   */
  const isDirty = useMemo(
    () => JSON.stringify(currentValues) !== JSON.stringify(initialValues),
    [currentValues, initialValues],
  )

  /**
   * Validation: checks that all required columns have a non-empty value.
   * Prevents submission when required fields are missing.
   */
  const isValid = useMemo(
    () =>
      editableColumns.every((col) => {
        if (!col.required) return true
        const value = currentValues[col.slug]
        return value !== undefined && value !== null && value !== ''
      }),
    [editableColumns, currentValues],
  )

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  /**
   * Update a single field value by column slug.
   * Only updates currentValues — initialValues stays frozen for dirty tracking.
   */
  const updateValue = useCallback((slug: string, value: unknown) => {
    setCurrentValues((prev) => ({ ...prev, [slug]: value }))
  }, [])

  /**
   * Submit the form to create or update a row.
   * Filters out empty optional values before sending to the API
   * to keep the stored JSONB clean.
   */
  const handleSubmit = useCallback(() => {
    /* Build cleaned values — omit empty optional fields */
    const cleanedValues: Record<string, unknown> = {}
    for (const col of editableColumns) {
      const value = currentValues[col.slug]
      if (value !== undefined && value !== null && value !== '') {
        cleanedValues[col.slug] = value
      }
    }

    if (isEditMode && row) {
      updateRow.mutate({
        organizationId,
        rowId: row.id,
        values: cleanedValues,
      })
    } else {
      createRow.mutate({
        organizationId,
        tableId,
        values: cleanedValues,
      })
    }
  }, [
    currentValues,
    editableColumns,
    isEditMode,
    row,
    organizationId,
    tableId,
    createRow,
    updateRow,
  ])

  /**
   * Attempt to close the sheet.
   * If dirty, shows the discard confirmation dialog instead of closing.
   * If clean (or saving in progress), closes immediately.
   */
  const attemptClose = useCallback(() => {
    if (isDirty && !isPending) {
      setShowDiscardDialog(true)
    } else {
      onClose()
    }
  }, [isDirty, isPending, onClose])

  /**
   * Confirm discard — closes both the dialog and the sheet,
   * throwing away unsaved changes.
   */
  const handleDiscard = useCallback(() => {
    setShowDiscardDialog(false)
    onClose()
  }, [onClose])

  /**
   * Format a system column date value for display.
   * Falls back to the raw row timestamps if the column slug isn't in values.
   */
  const formatSystemDate = useCallback(
    (col: CmsColumn): string => {
      if (!row) return '-'

      /* Try the row values first (in case the system column slug maps to a stored value) */
      const storedValue = row.values[col.slug]
      if (storedValue && typeof storedValue === 'string') {
        try {
          return format(new Date(storedValue), 'PPpp')
        } catch {
          return String(storedValue)
        }
      }

      /* Fall back to top-level row timestamps */
      if (col.columnType === 'DATE_CREATED' && row.createdAt) {
        try {
          return format(new Date(row.createdAt), 'PPpp')
        } catch {
          return row.createdAt
        }
      }
      if (col.columnType === 'DATE_UPDATED' && row.updatedAt) {
        try {
          return format(new Date(row.updatedAt), 'PPpp')
        } catch {
          return row.updatedAt
        }
      }

      return '-'
    },
    [row],
  )

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={(open) => !open && attemptClose()}
      >
        <SheetContent
          side="right"
          className="sm:max-w-lg flex flex-col"
          /**
           * Intercept overlay click when dirty to show the discard dialog
           * instead of closing the sheet and losing unsaved changes.
           */
          onInteractOutside={(e) => {
            if (isDirty && !isPending) {
              e.preventDefault()
              setShowDiscardDialog(true)
            }
          }}
          /**
           * Intercept Escape key when dirty to show the discard dialog
           * instead of closing the sheet.
           */
          onEscapeKeyDown={(e) => {
            if (isDirty && !isPending) {
              e.preventDefault()
              setShowDiscardDialog(true)
            }
          }}
        >
          {/* ---- HEADER ---- */}
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <SheetTitle>{isEditMode ? 'Edit Row' : 'Add Row'}</SheetTitle>
                <SheetDescription>
                  {isEditMode
                    ? isSystemTable
                      ? 'Store fields are read-only. You can edit custom column values.'
                      : 'Update the row data below'
                    : 'Fill in the fields to add a new row'}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {/* ---- SCROLLABLE FORM BODY ---- */}
          <div className="flex-1 overflow-y-auto space-y-4 px-4 py-2">
            {editableColumns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No editable columns in this table.</p>
                <p className="text-sm">Add columns first to create rows.</p>
              </div>
            ) : (
              editableColumns.map((col) => {
                /**
                 * On system tables, store-synced columns are rendered as disabled
                 * so users can see the values but cannot modify them.
                 * Custom columns remain fully editable.
                 */
                const isFieldProtected = protectedColumnSlugs.has(col.slug)
                return (
                  <FieldRenderer
                    key={col.id}
                    column={col}
                    value={currentValues[col.slug]}
                    onChange={(value) => updateValue(col.slug, value)}
                    disabled={isPending || isFieldProtected}
                    organizationId={organizationId}
                  />
                )
              })
            )}

            {/* ---- SYSTEM COLUMN METADATA (edit mode only) ---- */}
            {isEditMode && row && systemColumns.length > 0 && (
              <div className="border-t pt-4 mt-4 space-y-3">
                {systemColumns.map((col) => (
                  <div
                    key={col.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">{col.name}:</span>
                    <span className="text-foreground">
                      {formatSystemDate(col)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- FOOTER WITH SAVE BUTTON ---- */}
          <SheetFooter className="border-t pt-4">
            <Button
              onClick={handleSubmit}
              disabled={
                !isDirty ||
                isPending ||
                !isValid ||
                editableColumns.length === 0
              }
              className="w-full"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isEditMode ? 'Saving...' : 'Adding...'}
                </>
              ) : isEditMode ? (
                'Save Changes'
              ) : (
                'Add Row'
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ---- DISCARD CONFIRMATION DIALOG ---- */}
      <AlertDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you close now, your changes will be
              lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardDialog(false)}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
