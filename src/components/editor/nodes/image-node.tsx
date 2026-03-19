'use client'

/**
 * ImageNode - Lexical node for images
 *
 * Handles image rendering, selection, and serialization.
 * Supports both local blob URLs (for optimistic paste) and remote URLs.
 *
 * SOURCE OF TRUTH: Lexical DecoratorNode pattern
 * Keywords: IMAGE_NODE, LEXICAL_IMAGE, EDITOR_IMAGE
 */

import type { JSX } from 'react'
import {
  $applyNodeReplacement,
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Serialized format for ImageNode
 * WHY: Enables storage and restoration of image state
 */
export type SerializedImageNode = Spread<
  {
    src: string
    altText: string
    width: number | 'inherit'
    height: number | 'inherit'
    storageFileId?: string // Links to storage file for deletion tracking
  },
  SerializedLexicalNode
>

// ============================================================================
// DOM CONVERSION
// ============================================================================

/**
 * Converts <img> HTML elements to ImageNode
 * WHY: Enables pasting images from clipboard HTML
 */
function convertImageElement(domNode: Node): null | DOMConversionOutput {
  if (domNode instanceof HTMLImageElement) {
    const { src, alt, width, height } = domNode
    const node = $createImageNode({
      src,
      altText: alt || '',
      width: width || 'inherit',
      height: height || 'inherit',
    })
    return { node }
  }
  return null
}

// ============================================================================
// IMAGE NODE CLASS
// ============================================================================

/**
 * ImageNode - Decorator node for images
 * WHY: DecoratorNode allows React component rendering within Lexical
 */
export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string
  __altText: string
  __width: number | 'inherit'
  __height: number | 'inherit'
  __storageFileId?: string

  static getType(): string {
    return 'image'
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__storageFileId,
      node.__key
    )
  }

  constructor(
    src: string,
    altText: string,
    width?: number | 'inherit',
    height?: number | 'inherit',
    storageFileId?: string,
    key?: NodeKey
  ) {
    super(key)
    this.__src = src
    this.__altText = altText
    this.__width = width || 'inherit'
    this.__height = height || 'inherit'
    this.__storageFileId = storageFileId
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    const { src, altText, width, height, storageFileId } = serializedNode
    return $createImageNode({
      src,
      altText,
      width,
      height,
      storageFileId,
    })
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width === 'inherit' ? 'inherit' : this.__width,
      height: this.__height === 'inherit' ? 'inherit' : this.__height,
      storageFileId: this.__storageFileId,
    }
  }

  // ============================================================================
  // DOM CONVERSION
  // ============================================================================

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: convertImageElement,
        priority: 0,
      }),
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('img')
    element.setAttribute('src', this.__src)
    element.setAttribute('alt', this.__altText)
    if (this.__width !== 'inherit') {
      element.setAttribute('width', String(this.__width))
    }
    if (this.__height !== 'inherit') {
      element.setAttribute('height', String(this.__height))
    }
    return { element }
  }

  // ============================================================================
  // DOM HANDLING
  // ============================================================================

  createDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'editor-image'
    return span
  }

  updateDOM(): false {
    return false
  }

  // ============================================================================
  // GETTERS/SETTERS
  // ============================================================================

  getSrc(): string {
    return this.__src
  }

  setSrc(src: string): void {
    const writable = this.getWritable()
    writable.__src = src
  }

  getAltText(): string {
    return this.__altText
  }

  setAltText(altText: string): void {
    const writable = this.getWritable()
    writable.__altText = altText
  }

  getWidth(): number | 'inherit' {
    return this.__width
  }

  getHeight(): number | 'inherit' {
    return this.__height
  }

  setWidthAndHeight(
    width: number | 'inherit',
    height: number | 'inherit'
  ): void {
    const writable = this.getWritable()
    writable.__width = width
    writable.__height = height
  }

  getStorageFileId(): string | undefined {
    return this.__storageFileId
  }

  setStorageFileId(id: string | undefined): void {
    const writable = this.getWritable()
    writable.__storageFileId = id
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  decorate(): JSX.Element {
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        width={this.__width}
        height={this.__height}
        nodeKey={this.__key}
      />
    )
  }
}

// ============================================================================
// IMAGE COMPONENT
// ============================================================================

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ImageComponentProps {
  src: string
  altText: string
  width: number | 'inherit'
  height: number | 'inherit'
  nodeKey: NodeKey
}

/**
 * Direction type for resize handles
 * WHY: Identifies which corner/edge is being dragged
 */
type ResizeDirection = 'nw' | 'ne' | 'sw' | 'se'

/**
 * ImageComponent - React component for rendering images in Lexical
 * WHY: Handles selection, focus, deletion, and RESIZING of images
 *
 * Features:
 * - Click to select
 * - Keyboard delete (backspace/delete)
 * - Corner resize handles when selected
 * - Maintains aspect ratio during resize
 */
function ImageComponent({
  src,
  altText,
  width,
  height,
  nodeKey,
}: ImageComponentProps) {
  const [editor] = useLexicalComposerContext()
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Resize state
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef<{
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    direction: ResizeDirection
    aspectRatio: number
  } | null>(null)

  /**
   * Handle image deletion via keyboard
   * WHY: Allows users to delete images with backspace/delete keys
   */
  /**
   * Whether the editor is in editable mode
   * WHY: Resize handles, keyboard delete, and drag must be disabled in read-only/SENT mode
   */
  const isEditable = editor.isEditable()

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (!editor.isEditable()) return false
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        const node = $getNodeByKey(nodeKey)
        if ($isImageNode(node)) {
          node.remove()
        }
      }
      return false
    },
    [isSelected, nodeKey, editor]
  )

  /**
   * Handle click selection
   * WHY: Clicking an image should select it
   */
  const onClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement
      // Check if clicking on image or container (but not resize handles)
      if (
        target === imageRef.current ||
        target === containerRef.current ||
        containerRef.current?.contains(target)
      ) {
        // Don't handle if clicking on resize handle
        if (target.dataset.resizeHandle) return false

        if (event.shiftKey) {
          setSelected(!isSelected)
        } else {
          clearSelection()
          setSelected(true)
        }
        return true
      }
      return false
    },
    [isSelected, setSelected, clearSelection]
  )

  // Register event handlers
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        onClick,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, onClick, onDelete])

  /**
   * Start resize operation
   * WHY: Captures initial state when user starts dragging a resize handle
   */
  const handleResizeStart = useCallback(
    (event: React.MouseEvent, direction: ResizeDirection) => {
      event.preventDefault()
      event.stopPropagation()

      const img = imageRef.current
      if (!img) return

      const rect = img.getBoundingClientRect()
      const aspectRatio = rect.width / rect.height

      resizeStartRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        direction,
        aspectRatio,
      }

      setIsResizing(true)
    },
    []
  )

  /**
   * Handle resize mouse move
   * WHY: Updates image dimensions as user drags resize handle
   */
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeStartRef.current || !imageRef.current) return

      const { startX, startY, startWidth, startHeight, direction, aspectRatio } =
        resizeStartRef.current

      const deltaX = event.clientX - startX
      const deltaY = event.clientY - startY

      let newWidth = startWidth
      let newHeight = startHeight

      // Calculate new dimensions based on which handle is being dragged
      // WHY: Each corner affects dimensions differently
      switch (direction) {
        case 'se': // Bottom-right - most common
          newWidth = Math.max(50, startWidth + deltaX)
          newHeight = newWidth / aspectRatio
          break
        case 'sw': // Bottom-left
          newWidth = Math.max(50, startWidth - deltaX)
          newHeight = newWidth / aspectRatio
          break
        case 'ne': // Top-right
          newWidth = Math.max(50, startWidth + deltaX)
          newHeight = newWidth / aspectRatio
          break
        case 'nw': // Top-left
          newWidth = Math.max(50, startWidth - deltaX)
          newHeight = newWidth / aspectRatio
          break
      }

      // Apply dimensions directly to image for smooth preview
      imageRef.current.style.width = `${newWidth}px`
      imageRef.current.style.height = `${newHeight}px`
    }

    const handleMouseUp = () => {
      if (!resizeStartRef.current || !imageRef.current) {
        setIsResizing(false)
        return
      }

      // Get final dimensions
      const finalWidth = imageRef.current.offsetWidth
      const finalHeight = imageRef.current.offsetHeight

      // Update the Lexical node with new dimensions
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isImageNode(node)) {
          node.setWidthAndHeight(finalWidth, finalHeight)
        }
      })

      resizeStartRef.current = null
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, editor, nodeKey])

  // Calculate dimensions
  const imageStyle: React.CSSProperties = {
    width: width === 'inherit' ? 'auto' : width,
    height: height === 'inherit' ? 'auto' : height,
    maxWidth: '100%',
  }

  /**
   * Resize handle component
   * WHY: Renders a draggable corner handle for resizing
   */
  const ResizeHandle = ({
    direction,
    className,
  }: {
    direction: ResizeDirection
    className: string
  }) => (
    <div
      data-resize-handle={direction}
      className={cn(
        'absolute w-3 h-3 bg-primary border-2 border-background rounded-sm cursor-pointer z-10',
        'hover:bg-primary/80 transition-colors',
        className
      )}
      style={{
        cursor:
          direction === 'nw' || direction === 'se'
            ? 'nwse-resize'
            : 'nesw-resize',
      }}
      onMouseDown={(e) => handleResizeStart(e, direction)}
    />
  )

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative inline-block my-2',
        isSelected && 'ring-2 ring-primary ring-offset-2 rounded',
        isResizing && 'select-none'
      )}
    >
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {hasError ? (
        <div className="flex items-center justify-center p-4 bg-muted/50 text-muted-foreground rounded">
          Failed to load image
        </div>
      ) : (
        <>
          <img
            ref={imageRef}
            src={src}
            alt={altText}
            style={imageStyle}
            className={cn(
              'rounded block',
              isLoading && 'opacity-0',
              isResizing && 'pointer-events-none'
            )}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false)
              setHasError(true)
            }}
            draggable={isEditable}
          />
          {/* Resize handles — only show when selected, editable, and not loading */}
          {isSelected && isEditable && !isLoading && !hasError && (
            <>
              <ResizeHandle direction="nw" className="-top-1.5 -left-1.5" />
              <ResizeHandle direction="ne" className="-top-1.5 -right-1.5" />
              <ResizeHandle direction="sw" className="-bottom-1.5 -left-1.5" />
              <ResizeHandle direction="se" className="-bottom-1.5 -right-1.5" />
            </>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Type guard for ImageNode
 */
export function $isImageNode(
  node: LexicalNode | null | undefined
): node is ImageNode {
  return node instanceof ImageNode
}

/**
 * Create a new ImageNode
 */
export function $createImageNode({
  src,
  altText,
  width,
  height,
  storageFileId,
  key,
}: {
  src: string
  altText: string
  width?: number | 'inherit'
  height?: number | 'inherit'
  storageFileId?: string
  key?: NodeKey
}): ImageNode {
  return $applyNodeReplacement(
    new ImageNode(src, altText, width, height, storageFileId, key)
  )
}
