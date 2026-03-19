/**
 * Portal Users Page
 *
 * SOURCE OF TRUTH: Portal Users List
 * Lists all users on the platform with search, pagination, and impersonation.
 *
 * IMPERSONATION:
 * - Uses better-auth's admin plugin for user impersonation
 * - Portal admins can click "Impersonate" to log in as any user
 * - Redirects to dashboard after impersonation starts
 */

'use client'

import { useState } from 'react'
import { trpc } from '@/trpc/react-provider'
import { Users, Search, Building2, Ban, CheckCircle, UserCog, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { authClient } from '@/lib/better-auth/auth-client'
import { PortalPagination } from '@/components/portal/portal-pagination'

export default function PortalUsersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null)

  /**
   * Fetch users with caching
   * - staleTime: 60s - data stays fresh for 1 minute
   * - refetchOnWindowFocus: false - don't refetch when switching tabs
   */
  const { data, isLoading, isFetching } = trpc.portal.getUsers.useQuery(
    {
      search: search || undefined,
      page,
      pageSize,
    },
    {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  /**
   * Impersonate User
   * WHY: Allow portal admins to log in as any user for support/debugging
   * HOW: Uses better-auth's admin.impersonateUser() to create a session
   *      Then redirects to the user's organization subdomain
   */
  const handleImpersonate = async (
    userId: string,
    userName: string,
    organizationSlug: string | null
  ) => {
    setImpersonatingUserId(userId)

    try {
      const { error } = await authClient.admin.impersonateUser({
        userId,
      })

      if (error) {
        toast.error('Failed to impersonate user', {
          description: error.message || 'An error occurred while impersonating',
        })
        return
      }

      toast.success(`Now impersonating ${userName}`, {
        description: 'Redirecting to their organization...',
      })

      // Build subdomain URL and redirect
      // Uses window.location to navigate cross-subdomain (router.push can't do this)
      // IMPORTANT: Must handle port for local dev (mochi.test:3000)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://mochi.test:3000'
      const url = new URL(appUrl)
      const rootDomain = url.hostname
      const port = url.port ? `:${url.port}` : ''
      const protocol = url.protocol

      if (organizationSlug) {
        // Redirect to user's organization subdomain
        window.location.href = `${protocol}//${organizationSlug}.${rootDomain}${port}/`
      } else {
        // User has no organizations - redirect to root domain dashboard
        window.location.href = `${protocol}//${rootDomain}${port}/dashboard`
      }
    } catch (err) {
      console.error('[Portal] Impersonation error:', err)
      toast.error('Impersonation failed', {
        description: 'An unexpected error occurred',
      })
      setImpersonatingUserId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage all users on the platform
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isFetching && !isLoading && (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          {data && <span>{data.total} found</span>}
        </div>
      </div>

      {/* Users List */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading users...
            </div>
          </div>
        ) : !data?.users.length ? (
          <div className="p-8 text-center text-muted-foreground">
            No users found
          </div>
        ) : (
          <div className="divide-y">
            {data.users.map((user) => (
              <div key={user.id} className="p-4">
                <div className="flex items-center justify-between">
                  {/* User Info */}
                  <div className="flex items-center gap-3">
                    {user.image ? (
                      <img
                        src={user.image}
                        alt={user.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>

                  {/* Meta Info & Actions */}
                  <div className="flex items-center gap-6">
                    {/* Organizations */}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      <span>{user.organizationCount}</span>
                    </div>

                    {/* Status */}
                    <div className="w-20">
                      {user.banned ? (
                        <Badge className="bg-red-500/20 text-red-600">
                          <Ban className="h-3 w-3 mr-1" />
                          Banned
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </div>

                    {/* Email Verified */}
                    <div className="w-24">
                      {user.emailVerified ? (
                        <Badge variant="outline" className="text-green-600">
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-yellow-600">
                          Unverified
                        </Badge>
                      )}
                    </div>

                    {/* Date */}
                    <span className="text-sm text-muted-foreground w-24">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>

                    {/* Impersonate Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleImpersonate(user.id, user.name, user.firstOrganizationSlug)}
                      disabled={impersonatingUserId === user.id || user.banned}
                      className="gap-1.5"
                    >
                      {impersonatingUserId === user.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Impersonating...
                        </>
                      ) : (
                        <>
                          <UserCog className="h-3.5 w-3.5" />
                          Impersonate
                        </>
                      )}
                    </Button>
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
          page={data.page}
          pageSize={pageSize}
          totalPages={data.totalPages}
          total={data.total}
          currentCount={data.users.length}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize)
            setPage(1)
          }}
          itemLabel="users"
        />
      )}
    </div>
  )
}
