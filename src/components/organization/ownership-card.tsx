'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

// Organization member type
export interface OrganizationMember {
  id: string
  user: {
    name: string
    email: string
    image: string | null
  }
  role: string
  isPending?: boolean
  permissions?: string[]
  roleName?: string
  invitationId?: string
}

interface OwnershipCardProps {
  owner: OrganizationMember | undefined
}

export function OwnershipCard({ owner }: OwnershipCardProps) {
  if (!owner) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No owner assigned</p>
      </div>
    )
  }

  const initials = owner.user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar className="size-10 shrink-0">
          <AvatarImage
            src={owner.user.image || undefined}
            alt={owner.user.name}
          />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{owner.user.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {owner.user.email}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Badge variant="secondary" className="bg-muted">
          Owner
        </Badge>
      </div>
    </div>
  )
}
