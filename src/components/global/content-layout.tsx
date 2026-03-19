/**
 * Content Layout
 *
 * WHY: Reusable layout wrapper for protected pages with consistent header and spacing
 * HOW: Wraps content with PageHeader and provides slot for header actions
 *
 * @example
 * ```tsx
 * <ContentLayout headerActions={<Button>Action</Button>}>
 *   <YourContent />
 * </ContentLayout>
 * ```
 */

import { PageHeader } from '@/components/page-header'
import { cn } from '@/lib/utils'

type ContentLayoutProps = {
  /** Main content to display below the header */
  children: React.ReactNode
  /** Optional actions/buttons to display on the right side of the header */
  headerActions?: React.ReactNode
  className?: string
}

export function ContentLayout({
  children,
  headerActions,
  className,
}: ContentLayoutProps) {
  return (
    <div className="sm:px-4 md:px-6 lg:px-8 p-2 @container relative">
      <div className={cn('w-full max-w-6xl mx-auto', className)}>
        <PageHeader>{headerActions}</PageHeader>
        {children}
      </div>
    </div>
  )
}
