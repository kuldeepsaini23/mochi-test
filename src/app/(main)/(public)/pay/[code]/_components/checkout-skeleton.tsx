/**
 * Checkout Skeleton
 *
 * Minimal loading skeleton for checkout page
 */

export function CheckoutSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Left side - Product info */}
          <div className="space-y-8">
            {/* Org header */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
              <div className="h-5 w-32 rounded bg-muted animate-pulse" />
            </div>

            {/* Product */}
            <div className="space-y-4">
              <div className="h-8 w-48 rounded bg-muted animate-pulse" />
              <div className="h-4 w-full max-w-md rounded bg-muted animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
            </div>

            {/* Price options */}
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-xl border bg-muted/30 animate-pulse" />
              ))}
            </div>
          </div>

          {/* Right side - Checkout form */}
          <div className="space-y-6">
            <div className="h-6 w-24 rounded bg-muted animate-pulse" />

            {/* Form fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="h-10 rounded-lg bg-muted animate-pulse" />
                <div className="h-10 rounded-lg bg-muted animate-pulse" />
              </div>
              <div className="h-10 rounded-lg bg-muted animate-pulse" />
              <div className="h-12 rounded-lg bg-muted animate-pulse" />
            </div>

            {/* Button */}
            <div className="h-12 rounded-lg bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
