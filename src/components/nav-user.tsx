'use client'

import {
  BadgeCheck,
  ChevronsUpDown,
  LogOut,
} from 'lucide-react'

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { trpc } from '@/trpc/react-provider'
import { authClient } from '@/lib/better-auth/auth-client'
import { useState } from 'react'

export function NavUser() {
  const { isMobile } = useSidebar()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Get prefetched user data - no loading state!
  // This will automatically update when profile changes are invalidated
  const { data: user, isLoading } = trpc.user.getProfile.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes - allow refetch after profile updates
    gcTime: Infinity, // Keep in cache indefinitely
  })

  async function handleLogout() {
    setIsLoggingOut(true)

    try {
      // Use Better Auth client to sign out
      await authClient.signOut()

      // Wait a bit for cookies to be cleared, then redirect
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Force hard navigation to trigger server-side redirect check
      // This follows the same pattern as sign-in
      window.location.href = '/sign-in'
    } catch (err) {
      console.error('Sign out error:', err)
      setIsLoggingOut(false)
    }
  }

  if (isLoading || !user) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.image ?? ''} alt={user.name ?? ''} />
                <AvatarFallback className="rounded-lg">
                  {user.name?.charAt(0).toUpperCase() ?? 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.image ?? ''} alt={user.name ?? ''} />
                  <AvatarFallback className="rounded-lg">
                    {user.name?.charAt(0).toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <BadgeCheck />
                Account
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} disabled={isLoggingOut}>
              <LogOut />
              {isLoggingOut ? 'Logging out...' : 'Log out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
