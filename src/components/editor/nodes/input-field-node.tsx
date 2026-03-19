'use client'

/**
 * InputFieldNode - Lexical DecoratorNode for contract input fields
 *
 * Renders a minimal input field placeholder within the contract editor.
 * Supports different field types (text, date, number, email) with label,
 * placeholder, required flag, and resizable width/height.
 *
 * Design: Super minimal — label + thin underline, like a printed form field.
 * Resize: 4-corner handles copied from ImageNode pattern (free resize, no aspect ratio lock).
 *
 * SOURCE OF TRUTH: Lexical DecoratorNode pattern (mirrors ImageNode)
 * Keywords: INPUT_FIELD_NODE, CONTRACT_INPUT, LEXICAL_INPUT_FIELD
 */

import type { JSX } from 'react'
import {
  $applyNodeReplacement,
  DecoratorNode,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported input field types for contract fields
 * WHY: Constrains the field type to valid options that map to HTML input types
 */
export type InputFieldType = 'text' | 'date' | 'number' | 'email'

/**
 * Serialized format for InputFieldNode
 * WHY: Enables storage and restoration of input field state in JSON
 * Includes width/height for resize persistence
 */
export type SerializedInputFieldNode = Spread<
  {
    label: string
    fieldType: InputFieldType
    placeholder: string
    required: boolean
    width: number | 'inherit'
    height: number | 'inherit'
  },
  SerializedLexicalNode
>

/**
 * Direction type for resize handles
 * WHY: Identifies which corner is being dragged for resize calculations
 */
type ResizeDirection = 'nw' | 'ne' | 'sw' | 'se'

// ============================================================================
// INPUT FIELD NODE CLASS
// ============================================================================

/**
 * InputFieldNode - Decorator node for contract input fields
 * WHY: DecoratorNode allows rendering a React component (input placeholder)
 *      within the Lexical editor content. Supports resizable dimensions.
 */
export class InputFieldNode extends DecoratorNode<JSX.Element> {
  __label: string
  __fieldType: InputFieldType
  __placeholder: string
  __required: boolean
  __width: number | 'inherit'
  __height: number | 'inherit'

  static getType(): string {
    return 'input-field'
  }

  static clone(node: InputFieldNode): InputFieldNode {
    return new InputFieldNode(
      node.__label,
      node.__fieldType,
      node.__placeholder,
      node.__required,
      node.__width,
      node.__height,
      node.__key
    )
  }

  constructor(
    label: string,
    fieldType: InputFieldType,
    placeholder: string,
    required: boolean,
    width?: number | 'inherit',
    height?: number | 'inherit',
    key?: NodeKey
  ) {
    super(key)
    this.__label = label
    this.__fieldType = fieldType
    this.__placeholder = placeholder
    this.__required = required
    this.__width = width || 'inherit'
    this.__height = height || 'inherit'
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  static importJSON(serializedNode: SerializedInputFieldNode): InputFieldNode {
    const { label, fieldType, placeholder, required, width, height } =
      serializedNode
    return $createInputFieldNode({
      label,
      fieldType,
      placeholder,
      required,
      width,
      height,
    })
  }

  exportJSON(): SerializedInputFieldNode {
    return {
      type: 'input-field',
      version: 1,
      label: this.__label,
      fieldType: this.__fieldType,
      placeholder: this.__placeholder,
      required: this.__required,
      width: this.__width,
      height: this.__height,
    }
  }

  // ============================================================================
  // DOM HANDLING
  // ============================================================================

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'editor-input-field'
    return div
  }

  updateDOM(): false {
    return false
  }

  // ============================================================================
  // GETTERS / SETTERS
  // ============================================================================

  getLabel(): string {
    return this.getLatest().__label
  }

  setLabel(label: string): void {
    const writable = this.getWritable()
    writable.__label = label
  }

  getFieldType(): InputFieldType {
    return this.getLatest().__fieldType
  }

  setFieldType(fieldType: InputFieldType): void {
    const writable = this.getWritable()
    writable.__fieldType = fieldType
  }

  getPlaceholder(): string {
    return this.getLatest().__placeholder
  }

  setPlaceholder(placeholder: string): void {
    const writable = this.getWritable()
    writable.__placeholder = placeholder
  }

  getRequired(): boolean {
    return this.getLatest().__required
  }

  setRequired(required: boolean): void {
    const writable = this.getWritable()
    writable.__required = required
  }

  /** Get the current width (pixel value or 'inherit') */
  getWidth(): number | 'inherit' {
    return this.__width
  }

  /** Get the current height (pixel value or 'inherit') */
  getHeight(): number | 'inherit' {
    return this.__height
  }

  /**
   * Set both width and height at once
   * WHY: Resize operations update both dimensions simultaneously
   */
  setWidthAndHeight(
    width: number | 'inherit',
    height: number | 'inherit'
  ): void {
    const writable = this.getWritable()
    writable.__width = width
    writable.__height = height
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  decorate(): JSX.Element {
    return (
      <InputFieldComponent
        nodeKey={this.__key}
        label={this.__label}
        fieldType={this.__fieldType}
        placeholder={this.__placeholder}
        required={this.__required}
        width={this.__width}
        height={this.__height}
      />
    )
  }
}

// ============================================================================
// INPUT FIELD COMPONENT
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
import { Input } from '@/components/ui/input'
import { useSigningContext } from '@/app/(main)/(public)/contract/view/[accessToken]/_lib/signing-context'

/** Default width when 'inherit' — reasonable size for a form field */
const DEFAULT_WIDTH_PX = 200

/** Minimum dimensions to prevent the field from collapsing */
const MIN_WIDTH = 60
const MIN_HEIGHT = 28

interface InputFieldComponentProps {
  nodeKey: NodeKey
  label: string
  fieldType: InputFieldType
  placeholder: string
  required: boolean
  width: number | 'inherit'
  height: number | 'inherit'
}

/**
 * InputFieldComponent - Minimal React component for input field placeholders
 * WHY: Renders a clean, form-like field placeholder in the editor.
 *      Label above + thin underline below. Corner resize handles when selected.
 *      Follows the exact same resize pattern as ImageNode.
 */
function InputFieldComponent({
  nodeKey,
  label,
  fieldType,
  placeholder,
  required,
  width,
  height,
}: InputFieldComponentProps) {
  const { isSigningMode, isCompleted, fieldValues, onFieldChange, registerField, unregisterField } = useSigningContext()
  const [editor] = useLexicalComposerContext()
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * Whether the editor is in editable mode.
   * WHY: Resize handles, keyboard delete, and selection ring must be disabled
   * in read-only mode (SENT/COMPLETED) to prevent any manipulation of the node.
   * Same pattern as ImageNode.
   */
  const isEditable = editor.isEditable()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)

  // ============================================================================
  // RESIZE STATE (mirrors ImageNode pattern)
  // ============================================================================

  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef<{
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    direction: ResizeDirection
  } | null>(null)

  // ============================================================================
  // KEYBOARD DELETION
  // ============================================================================

  /**
   * Handle deletion via keyboard (backspace/delete)
   * WHY: Allows users to remove input fields with keyboard shortcuts
   */
  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      /** Block deletion when editor is read-only (SENT/COMPLETED) */
      if (!editor.isEditable()) return false
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        const node = $getNodeByKey(nodeKey)
        if ($isInputFieldNode(node)) {
          node.remove()
        }
      }
      return false
    },
    [editor, isSelected, nodeKey]
  )

  // ============================================================================
  // CLICK SELECTION
  // ============================================================================

  /**
   * Handle click selection
   * WHY: Clicking an input field should select it for editing/deletion.
   *      Ignores clicks on resize handles (they have their own handler).
   */
  const onClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement

      if (
        containerRef.current &&
        (event.target === containerRef.current ||
          containerRef.current.contains(target))
      ) {
        // Don't interfere with resize handle clicks
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

  // Register command handlers for click and keyboard deletion
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, onClick, onDelete])

  // ============================================================================
  // RESIZE HANDLERS (copied from ImageNode pattern)
  // ============================================================================

  /**
   * Start resize operation
   * WHY: Captures initial container dimensions when user starts dragging a corner handle
   */
  const handleResizeStart = useCallback(
    (event: React.MouseEvent, direction: ResizeDirection) => {
      event.preventDefault()
      event.stopPropagation()

      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()

      resizeStartRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        direction,
      }

      setIsResizing(true)
    },
    []
  )

  /**
   * Handle resize mouse move + mouse up
   * WHY: Updates container dimensions as user drags, then commits to Lexical node.
   *      For input fields we allow FREE resize (no aspect ratio lock).
   */
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeStartRef.current || !containerRef.current) return

      const { startX, startY, startWidth, startHeight, direction } =
        resizeStartRef.current

      const deltaX = event.clientX - startX
      const deltaY = event.clientY - startY

      let newWidth = startWidth
      let newHeight = startHeight

      // Calculate new dimensions based on which corner is being dragged
      // WHY: Each corner affects dimensions differently — free resize, no aspect ratio
      switch (direction) {
        case 'se':
          newWidth = Math.max(MIN_WIDTH, startWidth + deltaX)
          newHeight = Math.max(MIN_HEIGHT, startHeight + deltaY)
          break
        case 'sw':
          newWidth = Math.max(MIN_WIDTH, startWidth - deltaX)
          newHeight = Math.max(MIN_HEIGHT, startHeight + deltaY)
          break
        case 'ne':
          newWidth = Math.max(MIN_WIDTH, startWidth + deltaX)
          newHeight = Math.max(MIN_HEIGHT, startHeight - deltaY)
          break
        case 'nw':
          newWidth = Math.max(MIN_WIDTH, startWidth - deltaX)
          newHeight = Math.max(MIN_HEIGHT, startHeight - deltaY)
          break
      }

      // Apply dimensions directly to container for smooth preview
      containerRef.current.style.width = `${newWidth}px`
      containerRef.current.style.height = `${newHeight}px`
    }

    const handleMouseUp = () => {
      if (!resizeStartRef.current || !containerRef.current) {
        setIsResizing(false)
        return
      }

      // Get final dimensions and commit to Lexical node
      const finalWidth = containerRef.current.offsetWidth
      const finalHeight = containerRef.current.offsetHeight

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isInputFieldNode(node)) {
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

  // ============================================================================
  // STYLES
  // ============================================================================

  /** Dynamic container style based on width/height props */
  const containerStyle: React.CSSProperties = {
    width: width === 'inherit' ? DEFAULT_WIDTH_PX : width,
    height: height === 'inherit' ? 'auto' : height,
  }

  // ============================================================================
  // RESIZE HANDLE COMPONENT
  // ============================================================================

  /**
   * ResizeHandle - Draggable corner handle for resizing
   * WHY: Renders a small square on each corner that initiates resize on drag.
   *      Copied from ImageNode pattern.
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

  // ============================================================================
  // SIGNING MODE — render an actual editable input
  // ============================================================================

  /**
   * In signing mode, render a real Input component instead of the placeholder.
   * Uses the same styling as contract-node-settings-panel inputs.
   */
  /**
   * Register this input field with the signing context on mount.
   * WHY: Lexical read-only mode does NOT add data-lexical-node-key to the DOM,
   * so the toolbar can't discover fields via DOM scanning. Each field self-registers.
   *
   * KEY: Uses the node's `label` as the stable identifier instead of Lexical's
   * ephemeral nodeKey. Labels persist across serialization and are identical
   * between the public view and builder Lexical instances, so signeeData values
   * can be looked up correctly in both contexts.
   */
  useEffect(() => {
    if (!isSigningMode) return
    registerField(label)
    return () => unregisterField(label)
  }, [isSigningMode, label, registerField, unregisterField])

  if (isSigningMode) {
    /** Look up the submitted value by label (stable across Lexical instances) */
    const currentValue = fieldValues[label] ?? ''

    /**
     * COMPLETED state — render the baked value as plain text, fully locked.
     * WHY: Once signed, field values are frozen. No editing allowed on re-view.
     * Shows the saved value with the same label styling but no interactive input.
     */
    if (isCompleted) {
      return (
        <div className="inline-block my-1 py-1 px-1" style={{ width: width === 'inherit' ? DEFAULT_WIDTH_PX : width }}>
          <div className="mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {label}
              {required && <span className="ml-0.5 text-destructive">*</span>}
            </span>
          </div>
          <div className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm flex items-center px-3 text-foreground">
            {currentValue || <span className="text-muted-foreground/50">—</span>}
          </div>
        </div>
      )
    }

    /**
     * ACTIVE SIGNING state — render an editable Input for the recipient to fill.
     * Uses the same styling as contract-node-settings-panel inputs.
     */
    return (
      <div className="inline-block my-1 py-1 px-1" style={{ width: width === 'inherit' ? DEFAULT_WIDTH_PX : width }}>
        <div className="mb-1">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </span>
        </div>
        <Input
          type={fieldType}
          value={currentValue}
          onChange={(e) => onFieldChange(label, e.target.value)}
          placeholder={placeholder || `Enter ${fieldType}...`}
          className="h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
        />
      </div>
    )
  }

  // ============================================================================
  // RENDER — styled input field matching settings panel design (edit mode)
  // ============================================================================

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative inline-block my-1 py-1 px-1',
        isSelected && isEditable && 'ring-2 ring-primary ring-offset-2 rounded',
        isResizing && 'select-none'
      )}
      style={containerStyle}
    >
      {/* Label row — small text with optional required asterisk */}
      <div className="mb-1">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
      </div>

      {/* Input preview — matches the settings panel input style (h-9, rounded-xl, bg-background) */}
      <div className="h-9 rounded-xl bg-background border-0 text-sm flex items-center px-3 text-muted-foreground/50">
        {placeholder || `Enter ${fieldType}...`}
      </div>

      {/* Resize handles — shown on all 4 corners when selected AND editable */}
      {isSelected && isEditable && (
        <>
          <ResizeHandle direction="nw" className="-top-1.5 -left-1.5" />
          <ResizeHandle direction="ne" className="-top-1.5 -right-1.5" />
          <ResizeHandle direction="sw" className="-bottom-1.5 -left-1.5" />
          <ResizeHandle direction="se" className="-bottom-1.5 -right-1.5" />
        </>
      )}
    </div>
  )
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Type guard for InputFieldNode
 */
export function $isInputFieldNode(
  node: LexicalNode | null | undefined
): node is InputFieldNode {
  return node instanceof InputFieldNode
}

/**
 * Create a new InputFieldNode with the given parameters
 * WHY: Factory function that applies Lexical node replacement for proper registration.
 *      Accepts optional width/height for resize persistence.
 */
export function $createInputFieldNode({
  label,
  fieldType,
  placeholder,
  required,
  width,
  height,
  key,
}: {
  label: string
  fieldType: InputFieldType
  placeholder: string
  required: boolean
  width?: number | 'inherit'
  height?: number | 'inherit'
  key?: NodeKey
}): InputFieldNode {
  return $applyNodeReplacement(
    new InputFieldNode(label, fieldType, placeholder, required, width, height, key)
  )
}
