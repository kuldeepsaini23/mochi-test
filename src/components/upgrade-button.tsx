'use client'

/**
 * Upgrade Button — Reusable glow-border CTA for plan upgrades
 *
 * A premium-styled button with a gradient glow border that opens the
 * UpgradeModal when clicked. Works in both dark and light mode.
 *
 * USAGE:
 *   import { UpgradeButton } from '@/components/upgrade-button'
 *
 *   <UpgradeButton />
 *   <UpgradeButton size="sm" label="Unlock Feature" />
 *   <UpgradeButton size="lg" icon={<Zap />} label="Go Pro" />
 *
 * SOURCE OF TRUTH KEYWORDS: UpgradeButton, GlowButton, PlanUpgradeCTA
 */

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Crown } from 'lucide-react'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import dynamic from 'next/dynamic'

/* Lazy-load the upgrade modal to avoid pulling the heavy pricing UI into every bundle */
const UpgradeModal = dynamic(
  () => import('@/components/upgrade-modal').then((m) => m.UpgradeModal),
  { ssr: false }
)

type UpgradeButtonSize = 'sm' | 'default' | 'lg'

interface UpgradeButtonProps {
  /** Button label text (default: "Upgrade") */
  label?: string
  /** Custom icon to show before the label (default: Crown) */
  icon?: ReactNode
  /** Button size preset */
  size?: UpgradeButtonSize
  /** Additional className for the outer wrapper */
  className?: string
}

/* Size presets for the outer glow wrapper and inner content area */
const sizeConfig: Record<
  UpgradeButtonSize,
  { outer: string; inner: string; text: string; iconSize: string }
> = {
  sm: {
    outer: 'h-9 px-[2px] py-[2px] rounded-lg',
    inner: 'h-full rounded-[6px] px-3 gap-1.5 text-xs',
    text: 'text-xs font-semibold',
    iconSize: 'size-3.5',
  },
  default: {
    outer: 'h-11 px-[2px] py-[2px] rounded-xl',
    inner: 'h-full rounded-[10px] px-4 gap-2 text-sm',
    text: 'text-sm font-semibold',
    iconSize: 'size-4',
  },
  lg: {
    outer: 'h-[51px] px-[2px] py-[2px] rounded-[15px]',
    inner: 'h-full rounded-[13px] px-5 gap-3 text-base',
    text: 'text-base font-semibold',
    iconSize: 'size-5',
  },
}

export function UpgradeButton({
  label = 'Upgrade',
  icon,
  size = 'default',
  className,
}: UpgradeButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const { activeOrganization } = useActiveOrganization()
  const config = sizeConfig[size]

  return (
    <>
      {/* Outer glow wrapper — gradient border + hover intensification */}
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={cn(
          'group relative cursor-pointer transition-all duration-300',
          'bg-gradient-to-br from-blue-500 via-blue-500/40 to-transparent',
          'hover:from-blue-500 hover:via-blue-500/70 hover:to-blue-500/20',
          'hover:shadow-[0_0_15px_rgba(59,130,246,0.5)]',
          'focus-visible:outline-none focus-visible:shadow-[0_0_15px_rgba(59,130,246,0.5)]',
          config.outer,
          className
        )}
      >
        {/* Inner content area — dark bg in dark mode, light bg in light mode */}
        <div
          className={cn(
            'flex items-center justify-center',
            'bg-card text-card-foreground',
            'transition-colors duration-300',
            config.inner
          )}
        >
          {/* Icon — defaults to Crown if not provided */}
          <span className={cn(config.iconSize, 'shrink-0 text-blue-500')}>
            {icon ?? <Crown className="size-full" />}
          </span>

          {/* Label */}
          <span className={cn(config.text, 'whitespace-nowrap')}>{label}</span>
        </div>
      </button>

      {/* Upgrade modal — lazy loaded, opens on click */}
      {showModal && activeOrganization && (
        <UpgradeModal
          open={showModal}
          onOpenChange={setShowModal}
          organizationId={activeOrganization.id}
        />
      )}
    </>
  )
}
