/**
 * Folder Breadcrumb Component
 *
 * WHY: Show folder navigation path
 * HOW: Clickable breadcrumb items for navigation
 */

'use client'

import { ChevronRight, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface FolderBreadcrumbProps {
  breadcrumb: { id: string; name: string }[]
  onNavigateToRoot: () => void
  onBreadcrumbClick: (folderId: string | null) => void
  currentFolderId: string | null
}

export function FolderBreadcrumb({
  breadcrumb,
  onNavigateToRoot,
  onBreadcrumbClick,
  currentFolderId,
}: FolderBreadcrumbProps) {
  // Only show breadcrumb if we're inside a folder
  if (!currentFolderId) {
    return null
  }

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {/* Root/Home */}
        <BreadcrumbItem>
          <BreadcrumbLink
            asChild
            className="cursor-pointer hover:text-foreground"
          >
            <button
              onClick={onNavigateToRoot}
              className="flex items-center gap-1"
            >
              <Home className="h-4 w-4" />
              <span>All Forms</span>
            </button>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {/* Folder path */}
        {breadcrumb.map((folder, index) => {
          const isLast = index === breadcrumb.length - 1

          return (
            <BreadcrumbItem key={folder.id}>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              {isLast ? (
                <BreadcrumbPage>{folder.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  asChild
                  className="cursor-pointer hover:text-foreground"
                >
                  <button onClick={() => onBreadcrumbClick(folder.id)}>
                    {folder.name}
                  </button>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
