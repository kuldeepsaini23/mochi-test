'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Product } from './types'

interface ProductInfoProps {
  product: Product
}

export function ProductInfo({ product }: ProductInfoProps) {
  return (
    <div className="flex items-start gap-4">
      <Avatar className="h-16 w-16 rounded-xl shrink-0">
        {product.imageUrl && (
          <AvatarImage src={product.imageUrl} alt={product.name} className="object-cover" />
        )}
        <AvatarFallback className="rounded-xl bg-muted text-lg">
          {product.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-1 min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        {product.description && (
          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
            {product.description}
          </p>
        )}
      </div>
    </div>
  )
}
