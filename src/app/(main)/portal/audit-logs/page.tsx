/**
 * Portal Audit Logs Page
 *
 * SOURCE OF TRUTH: Portal Audit Log Viewer
 * Displays audit logs for compliance and security review.
 */

'use client'

import { useState } from 'react'
import { trpc } from '@/trpc/react-provider'
import { Filter } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PortalPagination } from '@/components/portal/portal-pagination'

/**
 * Get action badge color based on action type
 */
function getActionBadge(action: string) {
  if (action.includes('delete') || action.includes('ban')) {
    return <Badge className="bg-red-500/20 text-red-600">{action}</Badge>
  }
  if (action.includes('create') || action.includes('activate')) {
    return <Badge className="bg-green-500/20 text-green-600">{action}</Badge>
  }
  if (action.includes('update')) {
    return <Badge className="bg-blue-500/20 text-blue-600">{action}</Badge>
  }
  return <Badge variant="secondary">{action}</Badge>
}

export default function PortalAuditLogsPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [actionFilter, setActionFilter] = useState<string>('')
  const [resourceFilter, setResourceFilter] = useState<string>('')

  /**
   * Fetch audit logs with caching
   * - staleTime: 30s - logs are more time-sensitive
   * - refetchOnWindowFocus: false - don't refetch when switching tabs
   */
  const { data, isLoading, isFetching } = trpc.portal.getAuditLogs.useQuery(
    {
      page,
      pageSize,
      action: actionFilter || undefined,
      resource: resourceFilter || undefined,
    },
    {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review portal activity for compliance and security
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={actionFilter}
            onValueChange={(value) => {
              setActionFilter(value === 'all' ? '' : value)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="session.create">Session Create</SelectItem>
              <SelectItem value="session.destroy">Session Destroy</SelectItem>
              <SelectItem value="organization.view">Organization View</SelectItem>
              <SelectItem value="organization.update">Organization Update</SelectItem>
              <SelectItem value="organization.delete">Organization Delete</SelectItem>
              <SelectItem value="user.view">User View</SelectItem>
              <SelectItem value="user.update">User Update</SelectItem>
              <SelectItem value="user.ban">User Ban</SelectItem>
              <SelectItem value="admin.create">Admin Create</SelectItem>
              <SelectItem value="admin.update">Admin Update</SelectItem>
              <SelectItem value="admin.delete">Admin Delete</SelectItem>
              <SelectItem value="settings.update">Settings Update</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Select
          value={resourceFilter}
          onValueChange={(value) => {
            setResourceFilter(value === 'all' ? '' : value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            <SelectItem value="organizations">Organizations</SelectItem>
            <SelectItem value="users">Users</SelectItem>
            <SelectItem value="admins">Admins</SelectItem>
            <SelectItem value="invitations">Invitations</SelectItem>
            <SelectItem value="settings">Settings</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
          {isFetching && !isLoading && (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          {data && <span>{data.pagination.total} logs</span>}
        </div>
      </div>

      {/* Audit Logs List */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading audit logs...
            </div>
          </div>
        ) : !data?.logs.length ? (
          <div className="p-8 text-center text-muted-foreground">
            No audit logs found
          </div>
        ) : (
          <div className="divide-y">
            {data.logs.map((log) => (
              <div key={log.id} className="p-4">
                <div className="flex items-center justify-between">
                  {/* Log Info */}
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Timestamp */}
                    <span className="text-sm text-muted-foreground whitespace-nowrap w-36">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>

                    {/* Admin */}
                    <div className="w-32 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {log.portalAdmin?.displayName || log.portalAdmin?.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.portalAdmin?.role}
                      </p>
                    </div>

                    {/* Action */}
                    <div className="w-36">
                      {getActionBadge(log.action)}
                    </div>

                    {/* Resource */}
                    <div className="w-32 min-w-0">
                      <p className="text-sm">{log.resource}</p>
                      {log.resourceId && (
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {log.resourceId}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="flex items-center gap-4 shrink-0">
                    {/* IP Address */}
                    <span className="text-sm text-muted-foreground w-28 truncate">
                      {log.ipAddress}
                    </span>

                    {/* Status */}
                    <div className="w-20">
                      {log.success ? (
                        <Badge className="bg-green-500/20 text-green-600">Success</Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-600">Failed</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && (
        <PortalPagination
          page={data.pagination.page}
          pageSize={pageSize}
          totalPages={data.pagination.totalPages}
          total={data.pagination.total}
          currentCount={data.logs.length}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize)
            setPage(1)
          }}
          itemLabel="logs"
        />
      )}
    </div>
  )
}
