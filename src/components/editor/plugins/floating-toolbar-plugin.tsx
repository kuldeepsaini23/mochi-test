'use client'

/**
 * Floating Toolbar Plugin for Lexical Editor
 *
 * An inline floating toolbar that appears when text is selected.
 * Similar to Notion/Medium - shows only when you select text.
 *
 * Features:
 * - Bold, Italic, Underline, Strikethrough
 * - Code formatting
 * - Link insertion
 * - Text alignment (left, center, right, justify)
 * - Appears above selected text
 *
 * SOURCE OF TRUTH: Lexical FloatingTextFormatToolbarPlugin pattern
 * Keywords: FLOATING_TOOLBAR, INLINE_TOOLBAR, TEXT_FORMAT_TOOLBAR
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $isElementNode,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type ElementFormatType,
} from 'lexical'
import { $findMatchingParent, mergeRegister } from '@lexical/utils'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $isCodeHighlightNode } from '@lexical/code'
import { $patchStyleText, $getSelectionStyleValueForProperty } from '@lexical/selection'
import { cn } from '@/lib/utils'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Palette,
  Plus,
  X,
} from 'lucide-react'
import { FontFamilyPicker } from '@/components/website-builder/builder-v1.2/_components/properties-panel/controls/font-family-picker'
import { GoogleFontsService } from '@/components/website-builder/builder-v1.2/_lib/google-fonts-service'

// ============================================================================
// SAVED COLOR TYPE
// ============================================================================

/**
 * A user-saved color with a custom name.
 * Persisted by the consumer (e.g. contract builder uses localStorage).
 *
 * SOURCE OF TRUTH: SavedColor type for color picker
 * Keywords: SAVED_COLOR, COLOR_PRESET, USER_COLOR
 */
export interface SavedColor {
  name: string
  value: string
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the DOM rect for the current selection
 * WHY: We need the position to place the floating toolbar
 */
function getSelectionRect(): DOMRect | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  if (range.collapsed) return null

  return range.getBoundingClientRect()
}

/**
 * Check if selection contains a link
 */
function getSelectedLinkNode() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null

  const node = selection.anchor.getNode()
  const parent = node.getParent()

  if ($isLinkNode(parent)) return parent
  if ($isLinkNode(node)) return node

  return null
}

// ============================================================================
// TOOLBAR BUTTON COMPONENT
// ============================================================================

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  title: string
  children: React.ReactNode
}

/**
 * Individual toolbar button with active state
 */
function ToolbarButton({ onClick, isActive, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded hover:bg-accent transition-colors',
        isActive && 'bg-accent text-accent-foreground'
      )}
    >
      {children}
    </button>
  )
}

// ============================================================================
// TEXT COLOR PALETTE (matches website builder color-picker-control.tsx)
// ============================================================================

/**
 * Same palette used in the website builder color picker.
 * First entry is 'none' (remove color), then grayscale, warm, cool, purple/pink.
 */
const TEXT_COLOR_PALETTE = [
  '', '#000000', '#334155', '#64748b', '#94a3b8', '#cbd5e1',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fb7185',
]

// ============================================================================
// COLOR PICKER DROPDOWN
// ============================================================================

/**
 * Inline color picker dropdown for the floating toolbar.
 * Reuses the same palette + native <input type="color"> pattern
 * from the website builder's ColorPickerControl.
 *
 * Optionally shows user-saved colors with names for quick reuse.
 */
function ColorPickerDropdown({
  currentColor,
  onColorChange,
  savedColors,
  onSaveColor,
  onRemoveColor,
}: {
  currentColor: string
  onColorChange: (color: string) => void
  /** User-saved colors to show in a dedicated section */
  savedColors?: SavedColor[]
  /** Called when the user saves the current color with a name */
  onSaveColor?: (color: SavedColor) => void
  /** Called when the user removes a saved color */
  onRemoveColor?: (value: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  /** Controls whether the "save color" mini-form is visible */
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveColorName, setSaveColorName] = useState('')
  const saveInputRef = useRef<HTMLInputElement>(null)

  /** Close dropdown when clicking outside */
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowSaveForm(false)
        setSaveColorName('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  /** Auto-focus the name input when save form opens */
  useEffect(() => {
    if (showSaveForm && saveInputRef.current) {
      saveInputRef.current.focus()
    }
  }, [showSaveForm])

  /** For the native color input, need a valid hex (not empty) */
  const nativePickerValue = currentColor || '#000000'

  /** Handle saving the current color */
  const handleSaveColor = () => {
    if (!saveColorName.trim() || !currentColor || !onSaveColor) return
    onSaveColor({ name: saveColorName.trim(), value: currentColor })
    setSaveColorName('')
    setShowSaveForm(false)
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button — shows current color as underline bar */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Text Color"
        className={cn(
          'p-1.5 rounded hover:bg-accent transition-colors flex flex-col items-center gap-0',
          isOpen && 'bg-accent'
        )}
      >
        <Palette className="h-4 w-4" />
        <span
          className="h-0.5 w-4 rounded-full"
          style={{ backgroundColor: currentColor || 'currentColor' }}
        />
      </button>

      {/* Dropdown: saved colors + palette grid + native color wheel */}
      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-[60]',
            'bg-popover border border-border rounded-lg shadow-lg p-3',
            'animate-in fade-in-0 zoom-in-95 duration-100',
            'w-[220px]'
          )}
        >
          {/* Saved colors section — only shows when savedColors prop is provided */}
          {savedColors && savedColors.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                Saved
              </p>
              <div className="flex flex-wrap gap-1.5">
                {savedColors.map((saved) => (
                  <div key={saved.value} className="group relative">
                    <button
                      type="button"
                      title={saved.name}
                      onClick={() => {
                        onColorChange(saved.value)
                        setIsOpen(false)
                      }}
                      className={cn(
                        'h-6 w-6 min-w-6 rounded-md border transition-transform hover:scale-110 shrink-0',
                        currentColor === saved.value
                          ? 'border-primary border-2'
                          : 'border-border/50'
                      )}
                      style={{ backgroundColor: saved.value }}
                    />
                    {/* Remove button — shows on hover */}
                    {onRemoveColor && (
                      <button
                        type="button"
                        title={`Remove "${saved.name}"`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveColor(saved.value)
                        }}
                        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="h-2 w-2" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preset palette grid — same 6-col layout as website builder */}
          {savedColors && savedColors.length > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
              Palette
            </p>
          )}
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {TEXT_COLOR_PALETTE.map((color, index) => {
              const isNone = color === ''
              const isSelected = currentColor === color

              return (
                <button
                  key={`${color}-${index}`}
                  type="button"
                  title={isNone ? 'Default' : color}
                  onClick={() => {
                    onColorChange(color)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'h-6 w-6 min-w-6 rounded-md border transition-transform hover:scale-110 shrink-0 relative overflow-hidden',
                    isSelected ? 'border-primary border-2' : 'border-border/50'
                  )}
                  style={isNone ? undefined : { backgroundColor: color }}
                >
                  {/* "No color" swatch — white with red diagonal slash */}
                  {isNone && (
                    <div className="w-full h-full bg-white relative">
                      <div className="absolute inset-0">
                        <div
                          className="absolute bg-destructive"
                          style={{
                            width: '141%',
                            height: '2px',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%) rotate(45deg)',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Native color picker + save button */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground shrink-0">Custom:</span>
            <input
              type="color"
              value={nativePickerValue}
              onChange={(e) => onColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 p-0 shrink-0"
            />
            {currentColor && (
              <span className="text-xs text-muted-foreground font-mono truncate flex-1">
                {currentColor.toUpperCase()}
              </span>
            )}
            {/* Save current color button — only if onSaveColor is provided and a color is active */}
            {onSaveColor && currentColor && (
              <button
                type="button"
                title="Save this color"
                onClick={() => setShowSaveForm(true)}
                className="p-1 rounded hover:bg-accent transition-colors shrink-0"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Save color mini-form — appears when user clicks the + button */}
          {showSaveForm && (
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
              <div
                className="h-6 w-6 min-w-6 rounded-md border border-border/50 shrink-0"
                style={{ backgroundColor: currentColor }}
              />
              <input
                ref={saveInputRef}
                type="text"
                value={saveColorName}
                onChange={(e) => setSaveColorName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveColor()
                  if (e.key === 'Escape') {
                    setShowSaveForm(false)
                    setSaveColorName('')
                  }
                }}
                placeholder="Color name..."
                className="flex-1 min-w-0 h-6 text-xs bg-transparent border border-border rounded px-1.5 outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleSaveColor}
                disabled={!saveColorName.trim()}
                className="text-xs px-1.5 h-6 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// FLOATING TOOLBAR COMPONENT
// ============================================================================

interface FloatingToolbarProps {
  /** User-saved colors for quick reuse in the color picker */
  savedColors?: SavedColor[]
  /** Called when user saves a new color with a name */
  onSaveColor?: (color: SavedColor) => void
  /** Called when user removes a saved color */
  onRemoveColor?: (value: string) => void
  /**
   * Hides the color picker section (separator + ColorPickerDropdown) from the toolbar
   * WHY: Some editor contexts should not allow font color changes
   *
   * SOURCE OF TRUTH: Threaded from RichTextEditorProps.hideColor
   * Keywords: HIDE_COLOR, FLOATING_TOOLBAR_COLOR
   */
  hideColor?: boolean
  /**
   * Shows the font-family picker in the floating toolbar.
   * WHY: Only the website builder rich text element needs inline font changes —
   * other contexts (template descriptions, email content) use document-level fonts.
   *
   * SOURCE OF TRUTH: Threaded from RichTextEditorProps.showFontFamily
   * Keywords: SHOW_FONT_FAMILY, FLOATING_TOOLBAR_FONT, INLINE_FONT_PICKER
   */
  showFontFamily?: boolean
}

/**
 * The floating toolbar that appears when text is selected
 * WHY: Provides quick access to common formatting options inline
 */
function FloatingToolbar({ savedColors, onSaveColor, onRemoveColor, hideColor, showFontFamily }: FloatingToolbarProps) {
  const [editor] = useLexicalComposerContext()
  const toolbarRef = useRef<HTMLDivElement>(null)

  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  // Format state
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrikethrough, setIsStrikethrough] = useState(false)
  const [isCode, setIsCode] = useState(false)
  const [isHighlight, setIsHighlight] = useState(false)
  const [isLink, setIsLink] = useState(false)

  /** Current text alignment of the selected block */
  const [elementFormat, setElementFormat] = useState<ElementFormatType>('')

  /** Current text color of the selection */
  const [fontColor, setFontColor] = useState('')

  /** Current font-family of the selection (only tracked when showFontFamily is true) */
  const [currentFontFamily, setCurrentFontFamily] = useState('')

  // ============================================================================
  // UPDATE TOOLBAR STATE
  // ============================================================================

  const updateToolbar = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()

      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        setIsVisible(false)
        return
      }

      // Don't show toolbar in code blocks
      const anchorNode = selection.anchor.getNode()
      if ($isCodeHighlightNode(anchorNode)) {
        setIsVisible(false)
        return
      }

      // Check if we have actual text selected
      const selectedText = selection.getTextContent()
      if (!selectedText || selectedText.trim().length === 0) {
        setIsVisible(false)
        return
      }

      // Update format states
      setIsBold(selection.hasFormat('bold'))
      setIsItalic(selection.hasFormat('italic'))
      setIsUnderline(selection.hasFormat('underline'))
      setIsStrikethrough(selection.hasFormat('strikethrough'))
      setIsCode(selection.hasFormat('code'))
      setIsHighlight(selection.hasFormat('highlight'))
      setIsLink(getSelectedLinkNode() !== null)

      // Detect current block alignment (reuses anchorNode from above)
      let blockElement = anchorNode.getKey() === 'root'
        ? anchorNode
        : $findMatchingParent(anchorNode, (e) => {
            const parent = e.getParent()
            return parent !== null && $isRootOrShadowRoot(parent)
          })

      if (blockElement === null) {
        blockElement = anchorNode.getTopLevelElementOrThrow()
      }

      if ($isElementNode(blockElement)) {
        setElementFormat(blockElement.getFormatType())
      }

      // Detect current text color from selection
      setFontColor(
        $getSelectionStyleValueForProperty(selection, 'color', '')
      )

      // Detect current font-family from selection (only when font picker is enabled)
      if (showFontFamily) {
        setCurrentFontFamily(
          $getSelectionStyleValueForProperty(selection, 'font-family', '')
        )
      }

      // Get position after a short delay to ensure DOM is updated
      setTimeout(() => {
        const rect = getSelectionRect()
        if (rect) {
          const toolbarWidth = 440 // Approximate toolbar width (format + color + alignment)
          const toolbarHeight = 40 // Approximate toolbar height

          // Position above the selection, centered
          let left = rect.left + rect.width / 2 - toolbarWidth / 2
          let top = rect.top - toolbarHeight - 8

          // Keep within viewport bounds
          if (left < 10) left = 10
          if (left + toolbarWidth > window.innerWidth - 10) {
            left = window.innerWidth - toolbarWidth - 10
          }
          if (top < 10) {
            // Show below selection if not enough space above
            top = rect.bottom + 8
          }

          setPosition({ top, left })
          setIsVisible(true)
        }
      }, 0)
    })
  }, [editor, showFontFamily])

  // ============================================================================
  // REGISTER LISTENERS
  // ============================================================================

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => {
        updateToolbar()
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar()
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, updateToolbar])

  // Close on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        // Small delay to allow click to register on buttons
        setTimeout(() => {
          const selection = window.getSelection()
          if (!selection || selection.isCollapsed) {
            setIsVisible(false)
          }
        }, 100)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // ============================================================================
  // FORMAT HANDLERS
  // ============================================================================

  const formatBold = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')
  }, [editor])

  const formatItalic = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')
  }, [editor])

  const formatUnderline = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')
  }, [editor])

  const formatStrikethrough = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
  }, [editor])

  const formatCode = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')
  }, [editor])

  const formatHighlight = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'highlight')
  }, [editor])

  const toggleLink = useCallback(() => {
    if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    } else {
      const url = window.prompt('Enter URL:')
      if (url) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
      }
    }
  }, [editor, isLink])

  /** Apply text alignment to the current block */
  const formatAlignment = useCallback(
    (alignment: ElementFormatType) => {
      editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment)
    },
    [editor]
  )

  /** Apply text color to selected text via inline styles */
  const applyFontColor = useCallback(
    (color: string) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { color: color || null })
        }
      })
    },
    [editor]
  )

  /**
   * Apply font-family to selected text via inline styles.
   * Loads the Google Font CSS first so the browser can render the typeface,
   * then patches the selection with the font-family CSS property.
   */
  const applyFontFamily = useCallback(
    (family: string) => {
      if (family) GoogleFontsService.loadFont(family)
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { 'font-family': family || null })
        }
      })
    },
    [editor]
  )

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!isVisible) return null

  return createPortal(
    <div
      ref={toolbarRef}
      className={cn(
        'fixed z-50 flex items-center gap-0.5 p-1',
        'bg-popover border border-border rounded-lg shadow-lg',
        'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <ToolbarButton onClick={formatBold} isActive={isBold} title="Bold (⌘B)">
        <Bold className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton onClick={formatItalic} isActive={isItalic} title="Italic (⌘I)">
        <Italic className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton onClick={formatUnderline} isActive={isUnderline} title="Underline (⌘U)">
        <Underline className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton onClick={formatStrikethrough} isActive={isStrikethrough} title="Strikethrough">
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>

      <div className="w-px h-5 bg-border mx-1" />

      <ToolbarButton onClick={formatCode} isActive={isCode} title="Inline Code">
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton onClick={formatHighlight} isActive={isHighlight} title="Highlight">
        <Highlighter className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton onClick={toggleLink} isActive={isLink} title="Link (⌘K)">
        <Link className="h-4 w-4" />
      </ToolbarButton>

      {/* Font-family picker — only shown when showFontFamily is true (website builder) */}
      {showFontFamily && (
        <>
          <div className="w-px h-5 bg-border mx-1" />
          <FontFamilyPicker
            value={currentFontFamily}
            onChange={applyFontFamily}
            variant="toolbar"
            side="bottom"
            align="center"
          />
        </>
      )}

      {/* Text color picker — conditionally hidden via hideColor prop */}
      {!hideColor && (
        <>
          <div className="w-px h-5 bg-border mx-1" />

          <ColorPickerDropdown
            currentColor={fontColor}
            onColorChange={applyFontColor}
            savedColors={savedColors}
            onSaveColor={onSaveColor}
            onRemoveColor={onRemoveColor}
          />
        </>
      )}

      {/* Alignment separator and buttons */}
      <div className="w-px h-5 bg-border mx-1" />

      <ToolbarButton
        onClick={() => formatAlignment('left')}
        isActive={elementFormat === 'left' || elementFormat === ''}
        title="Align Left"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => formatAlignment('center')}
        isActive={elementFormat === 'center'}
        title="Align Center"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => formatAlignment('right')}
        isActive={elementFormat === 'right'}
        title="Align Right"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => formatAlignment('justify')}
        isActive={elementFormat === 'justify'}
        title="Justify"
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>
    </div>,
    document.body
  )
}

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

export interface FloatingToolbarPluginProps {
  /** User-saved colors for quick reuse in the color picker */
  savedColors?: SavedColor[]
  /** Called when user saves a new color with a name */
  onSaveColor?: (color: SavedColor) => void
  /** Called when user removes a saved color */
  onRemoveColor?: (value: string) => void
  /**
   * Hides the color picker section from the floating toolbar
   * WHY: Some editor contexts should not allow font color changes
   *
   * SOURCE OF TRUTH: Threaded from RichTextEditorProps.hideColor
   * Keywords: HIDE_COLOR, FLOATING_TOOLBAR_PLUGIN_COLOR
   */
  hideColor?: boolean
  /**
   * Shows the font-family picker in the floating toolbar.
   * WHY: Only the website builder rich text element needs inline font changes —
   * other contexts use document-level fonts.
   *
   * SOURCE OF TRUTH: Threaded from RichTextEditorProps.showFontFamily
   * Keywords: SHOW_FONT_FAMILY, FLOATING_TOOLBAR_PLUGIN_FONT
   */
  showFontFamily?: boolean
}

/**
 * Floating Toolbar Plugin
 * WHY: Provides inline text formatting when text is selected
 * Shows Bold, Italic, Underline, Strikethrough, Code, Color, Font, and Alignment options
 */
export function FloatingToolbarPlugin({
  savedColors,
  onSaveColor,
  onRemoveColor,
  hideColor,
  showFontFamily,
}: FloatingToolbarPluginProps = {}) {
  return (
    <FloatingToolbar
      savedColors={savedColors}
      onSaveColor={onSaveColor}
      onRemoveColor={onRemoveColor}
      hideColor={hideColor}
      showFontFamily={showFontFamily}
    />
  )
}
