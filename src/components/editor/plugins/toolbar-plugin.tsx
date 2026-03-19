'use client'

/**
 * Toolbar Plugin for Lexical Editor
 *
 * A floating/fixed toolbar that provides text formatting, block formatting,
 * and content insertion options. Inspired by Notion's clean toolbar design.
 *
 * Features:
 * - Text formatting (bold, italic, underline, strikethrough, code)
 * - Block formatting (headings, quotes, code blocks)
 * - List formatting (bullet, numbered, checklist)
 * - Link insertion
 * - Undo/Redo
 *
 * SOURCE OF TRUTH: ToolbarState from @/components/editor/types
 * Keywords: EDITOR_TOOLBAR, LEXICAL_TOOLBAR, RICH_TEXT_TOOLBAR
 */

import { useCallback, useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  $createParagraphNode,
} from 'lexical'
import {
  $isHeadingNode,
  $createHeadingNode,
  $createQuoteNode,
  HeadingTagType,
} from '@lexical/rich-text'
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  ListNode,
} from '@lexical/list'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $isCodeNode, $createCodeNode } from '@lexical/code'
import {
  $findMatchingParent,
  $getNearestNodeOfType,
  mergeRegister,
} from '@lexical/utils'
import { $setBlocksType } from '@lexical/selection'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  List,
  ListOrdered,
  CheckSquare,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Undo2,
  Redo2,
  ChevronDown,
  Minus,
  Type,
  Highlighter,
} from 'lucide-react'

import type { BlockFormatType, ToolbarState, ListType } from '../types'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Block type display names and icons
 */
const BLOCK_TYPES: Record<BlockFormatType, { label: string; icon: React.ElementType }> = {
  paragraph: { label: 'Paragraph', icon: Type },
  h1: { label: 'Heading 1', icon: Heading1 },
  h2: { label: 'Heading 2', icon: Heading2 },
  h3: { label: 'Heading 3', icon: Heading3 },
  h4: { label: 'Heading 4', icon: Heading3 },
  h5: { label: 'Heading 5', icon: Heading3 },
  h6: { label: 'Heading 6', icon: Heading3 },
  quote: { label: 'Quote', icon: Quote },
  code: { label: 'Code Block', icon: Code },
}

// ============================================================================
// TOOLBAR BUTTON COMPONENT
// ============================================================================

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  icon: React.ElementType
  title: string
  className?: string
}

/**
 * Individual toolbar button with active state styling
 */
function ToolbarButton({
  onClick,
  isActive,
  disabled,
  icon: Icon,
  title,
  className,
}: ToolbarButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'h-8 w-8 p-0',
        isActive && 'bg-muted text-foreground',
        className
      )}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}

// ============================================================================
// BLOCK FORMAT DROPDOWN
// ============================================================================

interface BlockFormatDropdownProps {
  blockType: BlockFormatType
  onChange: (type: BlockFormatType) => void
}

/**
 * Dropdown for selecting block format (paragraph, headings, quote, code)
 */
function BlockFormatDropdown({ blockType, onChange }: BlockFormatDropdownProps) {
  const [open, setOpen] = useState(false)
  const currentBlock = BLOCK_TYPES[blockType]
  const CurrentIcon = currentBlock.icon

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 font-normal"
          title="Change block type"
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="text-xs">{currentBlock.label}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        {(Object.entries(BLOCK_TYPES) as [BlockFormatType, typeof currentBlock][]).map(
          ([type, { label, icon: Icon }]) => (
            <Button
              key={type}
              variant="ghost"
              size="sm"
              className={cn(
                'w-full justify-start gap-2 font-normal',
                type === blockType && 'bg-muted'
              )}
              onClick={() => {
                onChange(type)
                setOpen(false)
              }}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Button>
          )
        )}
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// MAIN TOOLBAR PLUGIN
// ============================================================================

interface ToolbarPluginProps {
  /**
   * Whether to show the toolbar in a fixed position
   * If false, the toolbar floats above selection
   */
  fixed?: boolean
}

/**
 * Main Toolbar Plugin Component
 * WHY: Provides all formatting controls for the rich text editor
 */
export function ToolbarPlugin({ fixed = true }: ToolbarPluginProps) {
  const [editor] = useLexicalComposerContext()

  // Toolbar state tracking all active formats
  const [toolbarState, setToolbarState] = useState<ToolbarState>({
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrikethrough: false,
    isCode: false,
    isSubscript: false,
    isSuperscript: false,
    isHighlight: false,
    isLink: false,
    blockType: 'paragraph',
    listType: null,
    canUndo: false,
    canRedo: false,
  })

  // ============================================================================
  // UPDATE TOOLBAR STATE
  // ============================================================================

  /**
   * Updates toolbar state based on current selection
   * WHY: Keeps toolbar buttons in sync with the current formatting
   */
  const $updateToolbar = useCallback(() => {
    const selection = $getSelection()

    if ($isRangeSelection(selection)) {
      // Text formatting states
      setToolbarState((prev) => ({
        ...prev,
        isBold: selection.hasFormat('bold'),
        isItalic: selection.hasFormat('italic'),
        isUnderline: selection.hasFormat('underline'),
        isStrikethrough: selection.hasFormat('strikethrough'),
        isCode: selection.hasFormat('code'),
        isSubscript: selection.hasFormat('subscript'),
        isSuperscript: selection.hasFormat('superscript'),
        isHighlight: selection.hasFormat('highlight'),
      }))

      // Check for link
      const node = selection.anchor.getNode()
      const parent = node.getParent()
      const isLink = $isLinkNode(parent) || $isLinkNode(node)
      setToolbarState((prev) => ({ ...prev, isLink }))

      // Block type detection
      const anchorNode = selection.anchor.getNode()
      let element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent()
              return parent !== null && $isRootOrShadowRoot(parent)
            })

      if (element === null) {
        element = anchorNode.getTopLevelElementOrThrow()
      }

      const elementKey = element.getKey()
      const elementDOM = editor.getElementByKey(elementKey)

      if (elementDOM !== null) {
        // Detect list type
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType<ListNode>(anchorNode, ListNode)
          const type = parentList
            ? parentList.getListType()
            : element.getListType()

          const listType: ListType | null =
            type === 'bullet'
              ? 'bullet'
              : type === 'number'
                ? 'number'
                : type === 'check'
                  ? 'check'
                  : null

          setToolbarState((prev) => ({
            ...prev,
            listType,
            blockType: 'paragraph',
          }))
        } else {
          // Detect block type (heading, quote, code, paragraph)
          let blockType: BlockFormatType = 'paragraph'

          if ($isHeadingNode(element)) {
            const tag = element.getTag()
            blockType = tag as BlockFormatType
          } else if ($isCodeNode(element)) {
            blockType = 'code'
          } else if (element.getType() === 'quote') {
            blockType = 'quote'
          }

          setToolbarState((prev) => ({
            ...prev,
            blockType,
            listType: null,
          }))
        }
      }
    }
  }, [editor])

  // ============================================================================
  // REGISTER LISTENERS
  // ============================================================================

  useEffect(() => {
    return mergeRegister(
      // Update toolbar on selection change
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateToolbar()
        })
      }),
      // Track undo/redo availability
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setToolbarState((prev) => ({ ...prev, canUndo: payload }))
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setToolbarState((prev) => ({ ...prev, canRedo: payload }))
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      )
    )
  }, [editor, $updateToolbar])

  // ============================================================================
  // FORMAT HANDLERS
  // ============================================================================

  /**
   * Applies text formatting (bold, italic, etc.)
   */
  const formatText = useCallback(
    (format: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'highlight') => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
    },
    [editor]
  )

  /**
   * Changes block format (paragraph, headings, quote, code)
   */
  const formatBlock = useCallback(
    (type: BlockFormatType) => {
      editor.update(() => {
        const selection = $getSelection()

        if ($isRangeSelection(selection)) {
          if (type === 'paragraph') {
            $setBlocksType(selection, () => $createParagraphNode())
          } else if (type === 'quote') {
            $setBlocksType(selection, () => $createQuoteNode())
          } else if (type === 'code') {
            if (toolbarState.blockType !== 'code') {
              $setBlocksType(selection, () => $createCodeNode())
            }
          } else if (type.startsWith('h')) {
            $setBlocksType(selection, () =>
              $createHeadingNode(type as HeadingTagType)
            )
          }
        }
      })
    },
    [editor, toolbarState.blockType]
  )

  /**
   * Toggles list formatting
   */
  const formatList = useCallback(
    (listType: ListType) => {
      if (toolbarState.listType === listType) {
        // Remove list if clicking the same type
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
      } else {
        // Insert the appropriate list type
        if (listType === 'bullet') {
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        } else if (listType === 'number') {
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        } else if (listType === 'check') {
          editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
        }
      }
    },
    [editor, toolbarState.listType]
  )

  /**
   * Inserts or edits a link
   */
  const insertLink = useCallback(() => {
    if (!toolbarState.isLink) {
      const url = prompt('Enter URL:')
      if (url) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
      }
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    }
  }, [editor, toolbarState.isLink])

  /**
   * Inserts a horizontal rule
   */
  const insertHorizontalRule = useCallback(() => {
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
  }, [editor])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 px-2 py-1 border-b border-border bg-background',
        fixed && 'sticky top-0 z-10'
      )}
    >
      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        disabled={!toolbarState.canUndo}
        icon={Undo2}
        title="Undo (⌘Z)"
      />
      <ToolbarButton
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        disabled={!toolbarState.canRedo}
        icon={Redo2}
        title="Redo (⌘⇧Z)"
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Block Format Dropdown */}
      <BlockFormatDropdown
        blockType={toolbarState.blockType}
        onChange={formatBlock}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Text Formatting */}
      <ToolbarButton
        onClick={() => formatText('bold')}
        isActive={toolbarState.isBold}
        icon={Bold}
        title="Bold (⌘B)"
      />
      <ToolbarButton
        onClick={() => formatText('italic')}
        isActive={toolbarState.isItalic}
        icon={Italic}
        title="Italic (⌘I)"
      />
      <ToolbarButton
        onClick={() => formatText('underline')}
        isActive={toolbarState.isUnderline}
        icon={Underline}
        title="Underline (⌘U)"
      />
      <ToolbarButton
        onClick={() => formatText('strikethrough')}
        isActive={toolbarState.isStrikethrough}
        icon={Strikethrough}
        title="Strikethrough"
      />
      <ToolbarButton
        onClick={() => formatText('code')}
        isActive={toolbarState.isCode}
        icon={Code}
        title="Inline Code"
      />
      <ToolbarButton
        onClick={() => formatText('highlight')}
        isActive={toolbarState.isHighlight}
        icon={Highlighter}
        title="Highlight"
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Link */}
      <ToolbarButton
        onClick={insertLink}
        isActive={toolbarState.isLink}
        icon={Link}
        title="Insert Link"
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Lists */}
      <ToolbarButton
        onClick={() => formatList('bullet')}
        isActive={toolbarState.listType === 'bullet'}
        icon={List}
        title="Bullet List"
      />
      <ToolbarButton
        onClick={() => formatList('number')}
        isActive={toolbarState.listType === 'number'}
        icon={ListOrdered}
        title="Numbered List"
      />
      <ToolbarButton
        onClick={() => formatList('check')}
        isActive={toolbarState.listType === 'check'}
        icon={CheckSquare}
        title="Checklist"
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Insert */}
      <ToolbarButton
        onClick={insertHorizontalRule}
        icon={Minus}
        title="Horizontal Rule"
      />
    </div>
  )
}
