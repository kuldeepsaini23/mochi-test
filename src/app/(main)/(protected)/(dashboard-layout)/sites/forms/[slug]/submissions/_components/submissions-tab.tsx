/**
 * Submissions Tab Component
 *
 * WHY: Main container for form submissions management with data fetching and state
 * HOW: Manages all local state (pagination, filters, selection), fetches data via tRPC,
 *      and delegates rendering to SubmissionsTable and SubmissionDetailSheet
 *
 * SOURCE OF TRUTH: FormSubmissionWithDetails, FormSubmissionPaginatedResult
 */

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { SubmissionsTable, type SubmissionRowData } from './submissions-table'
import { SubmissionDetailSheet } from './submission-detail-sheet'
import { permissions } from '@/lib/better-auth/permissions'

interface SubmissionsTabProps {
  organizationId: string
  formId: string
  userRole: string
  userPermissions: string[]
}

export function SubmissionsTab({
  organizationId,
  formId,
  userRole,
  userPermissions,
}: SubmissionsTabProps) {
  const utils = trpc.useUtils()

  const canDelete = useMemo(
    () =>
      userRole === 'owner' ||
      userPermissions.includes(permissions.FORMS_DELETE),
    [userRole, userPermissions]
  )

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRowData | null>(null)
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)

  // Reset page when search or date filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, dateFrom, dateTo])

  // Query submissions with pagination and filters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading, isFetching } = (trpc.forms.listSubmissions as any).useQuery(
    {
      organizationId,
      formId,
      search: debouncedSearch || undefined,
      dateFrom: dateFrom?.toISOString(),
      dateTo: dateTo?.toISOString(),
      page,
      pageSize,
    },
    {
      enabled: !!organizationId && !!formId,
      placeholderData: (previousData: unknown) => previousData,
    }
  )

  const submissions = useMemo(
    () => (data?.submissions ?? []) as SubmissionRowData[],
    [data?.submissions]
  )
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  // Delete single submission mutation
  const deleteMutation = trpc.forms.deleteSubmission.useMutation({
    onSuccess: () => {
      toast.success('Submission deleted')
      setDetailSheetOpen(false)
      setSelectedSubmission(null)
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete submission')
    },
    onSettled: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(utils.forms.listSubmissions as any).invalidate()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(utils.forms.list as any).invalidate()
    },
  })

  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  const handleSearch = useCallback((value: string) => { setSearch(value) }, [])
  const handlePageChange = useCallback((newPage: number) => { setPage(newPage) }, [])
  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize)
    setPage(1)
  }, [])
  const handleSelectionChange = useCallback((ids: string[]) => { setSelectedIds(ids) }, [])

  const handleSubmissionClick = useCallback((submission: SubmissionRowData) => {
    setSelectedSubmission(submission)
    setDetailSheetOpen(true)
  }, [])

  const handleDelete = useCallback(
    (submissionId: string) => {
      deleteMutation.mutate({ organizationId, submissionId })
    },
    [deleteMutation, organizationId]
  )

  /** Bulk delete submissions sequentially (no bulk endpoint) */
  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      setIsBulkDeleting(true)
      let successCount = 0
      for (const id of ids) {
        try {
          await deleteMutation.mutateAsync({ organizationId, submissionId: id })
          successCount++
        } catch { /* individual errors handled by onError */ }
      }
      setIsBulkDeleting(false)
      setSelectedIds([])
      if (successCount > 0) {
        toast.success(`${successCount} submission${successCount > 1 ? 's' : ''} deleted`)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(utils.forms.listSubmissions as any).invalidate()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(utils.forms.list as any).invalidate()
    },
    [deleteMutation, organizationId, utils]
  )

  return (
    <>
      <SubmissionsTable
        submissions={submissions}
        isLoading={isLoading}
        isFetching={isFetching}
        search={search}
        onSearchChange={handleSearch}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        total={total}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onSubmissionClick={handleSubmissionClick}
        onBulkDelete={canDelete ? handleBulkDelete : undefined}
        onDelete={canDelete ? handleDelete : undefined}
        isBulkDeleting={isBulkDeleting}
        canDelete={canDelete}
      />
      <SubmissionDetailSheet
        submission={selectedSubmission}
        open={detailSheetOpen}
        onOpenChange={(open) => {
          setDetailSheetOpen(open)
          if (!open) setSelectedSubmission(null)
        }}
        onDelete={canDelete ? handleDelete : undefined}
        canDelete={canDelete}
        isDeleting={deleteMutation.isPending}
      />
    </>
  )
}
