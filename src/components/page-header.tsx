/**
 * Page Header Component
 *
 * WHY: Shared header for all protected pages with dynamic breadcrumbs
 * HOW: Uses pathname to generate breadcrumbs dynamically
 *      Accepts children for right-side content (buttons, actions, etc.)
 */

'use client'

import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationBell } from '@/components/notifications/notification-bell'

type PageHeaderProps = {
  children?: React.ReactNode
}

export function PageHeader({ children }: PageHeaderProps) {
  const pathname = usePathname()

  // Generate breadcrumbs from pathname
  const generateBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean)

    return segments.map((segment, index) => {
      const href = '/' + segments.slice(0, index + 1).join('/')
      const label = segment.charAt(0).toUpperCase() + segment.slice(1)
      const isLast = index === segments.length - 1

      return {
        href,
        label,
        isLast,
      }
    })
  }

  const breadcrumbs = generateBreadcrumbs()

  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2 justify-between flex-wrap">
      {/* Left side: sidebar trigger + breadcrumbs */}
      <div className="flex items-center gap-2 px-4 min-w-0">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <div
                key={crumb.href}
                className="flex items-center"
              >
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={crumb.href}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </div>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Right side: header actions (date picker etc.) + notification bell + theme toggle */}
      <div className="flex items-center gap-2 px-4 flex-shrink-0">
        {children}
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  )
}
