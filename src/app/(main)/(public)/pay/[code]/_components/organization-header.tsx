'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Organization } from './types'

interface OrganizationHeaderProps {
  organization: Organization
}

export function OrganizationHeader({ organization }: OrganizationHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8">
        {organization.logo && <AvatarImage src={organization.logo} alt={organization.name} />}
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
          {organization.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm text-muted-foreground">{organization.name}</span>
    </div>
  )
}
