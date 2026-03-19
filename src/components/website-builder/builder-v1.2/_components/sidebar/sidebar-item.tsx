/**
 * Sidebar Item Component
 *
 * WHY: Represents a draggable element item in the sidebar that can be added to the canvas
 * HOW: Uses native HTML5 drag-and-drop API to transfer element type to canvas
 *
 * FEATURES:
 * - Drag and drop to canvas for element creation
 * - Visual feedback on hover (opacity change)
 * - Hover effects with smooth color transitions
 * - Custom grab cursor on hover
 * - Shows illustration SVG and label
 * - Fallback click handler for accessibility
 *
 * DRAG DATA FORMAT:
 * - Transfers a JSON string containing:
 *   - elementType: 'frame' (the type of element to create)
 *   - variant: illustration name (e.g., 'frame', 'frame-h', 'frame-v', 'frame-grid')
 *
 * USAGE:
 * <SidebarItem
 *   id="sidebar-frame-basic"
 *   label="Frame"
 *   illustration="frame"
 *   description="Basic container frame"
 *   onClick={() => handleAddElement('frame')}
 * />
 */

'use client'

import { cn } from '@/lib/utils'
import { ElementIllustration } from './element-illustration'

interface SidebarItemProps {
  // Unique ID for this element
  id: string
  // Display label shown below the illustration
  label: string
  // Illustration type (matches ElementIllustration types)
  illustration: string
  // The type of element to create ('frame', 'text', 'image', etc.)
  elementType: string
  // Optional description shown as tooltip and subtitle
  description?: string
  // Click handler to add element to canvas (fallback for accessibility)
  onClick?: () => void
  // For prebuilt elements: the prebuilt type identifier (e.g., 'prebuilt-navbar')
  prebuiltType?: string
  // For prebuilt elements: the variant identifier (e.g., 'navbar-minimal')
  variantId?: string
}

export function SidebarItem({
  label,
  illustration,
  elementType,
  description,
  onClick,
  prebuiltType,
  variantId,
}: SidebarItemProps) {
  /**
   * Handle drag start - set drag data with element type and variant.
   *
   * WHY: The drag data tells the canvas what type of element to create.
   * For standard elements, it includes elementType + variant.
   * For prebuilt elements, it includes elementType='prebuilt' + prebuiltType + variantId.
   */
  const handleDragStart = (e: React.DragEvent) => {
    // Build drag data — prebuilt elements use a different format than standard elements
    const dragData = prebuiltType
      ? { elementType: 'prebuilt', prebuiltType, variantId }
      : { elementType, variant: illustration }

    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      // Enable dragging
      draggable="true"
      onDragStart={handleDragStart}
      onClick={onClick}
      className={cn(
        // Base layout and behavior
        'group relative aspect-square rounded-lg cursor-grab active:cursor-grabbing',
        'flex flex-col items- gap-2 p-4',
        // Background and border styling
        'border-muted-foreground/20 dark:bg-primary/3 bg-muted dark:border-none border',
        // Hover effects - smooth color transitions
        'hover:border-primary/50 hover:bg-accent/30 transition-all'
      )}
      title={description || label}
    >
      {/* Illustration - SVG icon for the element type */}
      <div className="w-full flex-1 flex items-center justify-center mb-1">
        <div className="w-full h-full text-muted-foreground group-hover:text-foreground transition-colors px-2">
          <ElementIllustration type={illustration} />
        </div>
      </div>

      {/* Label and Description */}
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors flex flex-col">
        {label}
        <span className="text-xs font-medium text-muted-foreground/40 group-hover:text-foreground transition-colors">
          {description}
        </span>
      </span>
    </div>
  )
}
