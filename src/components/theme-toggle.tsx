'use client'

/**
 * Theme Toggle Component
 *
 * WHY: Allows users to switch between light, dark, and system themes
 * HOW: Uses next-themes with keyboard shortcut (Cmd/Ctrl + M)
 */

import * as React from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  // Stable callback for toggling between light and dark only
  const toggleTheme = React.useCallback(() => {
    setTheme((current) => {
      // Toggle between light and dark only (skip system)
      if (current === 'dark') return 'light'
      return 'dark'
    })
  }, [setTheme])

  // Keyboard shortcut: Cmd/Ctrl + M (toggles between light and dark only)
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'm' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleTheme()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleTheme])

  const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const shortcutKey = isMac ? '⌘' : 'Ctrl'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            <span>Light</span>
          </div>
          {theme === 'light' && <span className="text-xs text-muted-foreground">{shortcutKey} M</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            <span>Dark</span>
          </div>
          {theme === 'dark' && <span className="text-xs text-muted-foreground">{shortcutKey} M</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            <span>System</span>
          </div>
          {theme === 'system' && <span className="text-xs text-muted-foreground">{shortcutKey} M</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
