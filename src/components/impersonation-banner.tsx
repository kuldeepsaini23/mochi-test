/**
 * Impersonation Toolbar Component
 *
 * SOURCE OF TRUTH: User Impersonation UI
 * Displays a compact floating toolbar when a portal admin is impersonating a user.
 *
 * WHY: Provides visual feedback and controls during impersonation sessions
 * HOW: Checks session for impersonatedBy field, shows user info and pause button
 *
 * DESIGN: Minimal centered floating toolbar - non-invasive
 */

'use client'

import { useState } from 'react'
import { Pause, Loader2, Building2, Shield } from 'lucide-react'
import { toast } from 'sonner'

import { authClient } from '@/lib/better-auth/auth-client'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * ImpersonationBanner Props
 */
interface ImpersonationBannerProps {
  isImpersonating: boolean
  user?: {
    id: string
    name: string
    email: string
    image?: string | null
  }
  organization?: {
    id: string
    name: string
  } | null
  role?: string | null
}

export function ImpersonationBanner({
  isImpersonating,
  user,
  organization,
  role,
}: ImpersonationBannerProps) {
  const [isStopping, setIsStopping] = useState(false)

  /**
   * Stop Impersonating
   */
  const handleStopImpersonating = async () => {
    setIsStopping(true)

    try {
      const { error } = await authClient.admin.stopImpersonating()

      if (error) {
        toast.error('Failed to stop impersonation', {
          description: error.message || 'An error occurred',
        })
        setIsStopping(false)
        return
      }

      toast.success('Impersonation ended', {
        description: 'Returning to portal...',
      })

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://mochi.test:3000'
      const url = new URL(appUrl)
      const rootDomain = url.hostname
      const port = url.port ? `:${url.port}` : ''
      const protocol = url.protocol

      window.location.href = `${protocol}//${rootDomain}${port}/portal/users`
    } catch (err) {
      console.error('[Impersonation] Stop error:', err)
      toast.error('Failed to stop impersonation')
      setIsStopping(false)
    }
  }

  if (!isImpersonating || !user) {
    return null
  }

  return (
    <TooltipProvider>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-3 bg-muted backdrop-blur-sm border border-border rounded-full shadow-lg px-4 py-2">
          {/* User Avatar/Initial */}
          <div className="flex items-center gap-2">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name}
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium">{user.name}</span>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-border" />

          {/* Organization */}
          {organization && (
            <>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                <span>{organization.name}</span>
              </div>
              <div className="h-4 w-px bg-border" />
            </>
          )}

          {/* Role */}
          {role && (
            <>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                <span className="capitalize">{role.toLowerCase()}</span>
              </div>
              <div className="h-4 w-px bg-border" />
            </>
          )}

          {/* Pause/Stop Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleStopImpersonating}
                disabled={isStopping}
                className="flex items-center justify-center h-8 w-8 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors disabled:opacity-50"
              >
                {isStopping ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 fill-current" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Stop impersonating</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
