'use client'

/**
 * Slash Command Plugin for Lexical Editor
 *
 * Provides Notion-like slash commands for quick content insertion.
 * Type "/" to trigger the command menu.
 *
 * Features:
 * - Type "/" to open command menu
 * - Filter commands by typing
 * - Insert headings, lists, code blocks, images, etc.
 * - Keyboard navigation
 * - Image insertion via URL or Storage
 *
 * SOURCE OF TRUTH: SlashCommandConfig from @/components/editor/types
 * Keywords: SLASH_COMMAND, COMMAND_MENU, NOTION_SLASH, IMAGE_COMMAND
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  TextNode,
  LexicalEditor,
} from 'lexical'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from '@lexical/list'
import { $createCodeNode } from '@lexical/code'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode'
import { $setBlocksType } from '@lexical/selection'
import { mergeRegister } from '@lexical/utils'

import { cn } from '@/lib/utils'
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Quote,
  Minus,
  Type,
  Image,
  Link,
  FolderOpen,
} from 'lucide-react'
import { INSERT_IMAGE_COMMAND } from './image-plugin'
import { StorageBrowserModal, type SelectedFile } from '@/components/storage-browser'

// ============================================================================
// TYPES
// ============================================================================

/**
 * SlashCommand - Definition for a slash command option
 * WHY: Allows flexible command definitions with optional sub-menus
 *      Exported so consumers (like contract-slash-commands) can define custom commands.
 *
 * SOURCE OF TRUTH: SlashCommand interface
 * Keywords: SLASH_COMMAND_TYPE, COMMAND_DEFINITION
 */
export interface SlashCommand {
  id: string
  title: string
  description: string
  icon: React.ElementType
  keywords: string[]
  /**
   * Called when command is selected
   * Return 'submenu' to indicate this command opens a sub-menu
   * The sub-menu handling is done separately via hasSubMenu
   */
  onSelect: (editor: LexicalEditor) => void | 'submenu'
  /**
   * If true, this command shows a sub-menu instead of executing immediately
   */
  hasSubMenu?: boolean
}

/**
 * Props for the SlashCommandPlugin
 * organizationId is needed for storage browser when inserting images
 * extraCommands allows consumers to inject additional slash commands (non-breaking)
 */
interface SlashCommandPluginProps {
  organizationId?: string
  /** Additional slash commands to merge after the built-in commands */
  extraCommands?: SlashCommand[]
}

// ============================================================================
// COMMANDS DEFINITION
// ============================================================================

/**
 * All available slash commands
 * WHY: Centralized command definitions for easy extension
 */
const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'paragraph',
    title: 'Text',
    description: 'Just start typing with plain text',
    icon: Type,
    keywords: ['paragraph', 'text', 'plain'],
    onSelect: (editor) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createParagraphNode())
        }
      })
    },
  },
  {
    id: 'h1',
    title: 'Heading 1',
    description: 'Large section heading',
    icon: Heading1,
    keywords: ['heading', 'h1', 'title', 'large'],
    onSelect: (editor) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode('h1'))
        }
      })
    },
  },
  {
    id: 'h2',
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: Heading2,
    keywords: ['heading', 'h2', 'subtitle', 'medium'],
    onSelect: (editor) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode('h2'))
        }
      })
    },
  },
  {
    id: 'h3',
    title: 'Heading 3',
    description: 'Small section heading',
    icon: Heading3,
    keywords: ['heading', 'h3', 'small'],
    onSelect: (editor) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode('h3'))
        }
      })
    },
  },
  {
    id: 'bullet',
    title: 'Bullet List',
    description: 'Create a simple bullet list',
    icon: List,
    keywords: ['bullet', 'list', 'unordered', 'ul'],
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
    },
  },
  {
    id: 'numbered',
    title: 'Numbered List',
    description: 'Create a numbered list',
    icon: ListOrdered,
    keywords: ['numbered', 'list', 'ordered', 'ol'],
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
    },
  },
  {
    id: 'checklist',
    title: 'To-do List',
    description: 'Track tasks with a to-do list',
    icon: CheckSquare,
    keywords: ['todo', 'checklist', 'checkbox', 'task'],
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
    },
  },
  {
    id: 'quote',
    title: 'Quote',
    description: 'Capture a quote',
    icon: Quote,
    keywords: ['quote', 'blockquote', 'callout'],
    onSelect: (editor) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createQuoteNode())
        }
      })
    },
  },
  {
    id: 'code',
    title: 'Code Block',
    description: 'Add a code block',
    icon: Code,
    keywords: ['code', 'codeblock', 'programming'],
    onSelect: (editor) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createCodeNode())
        }
      })
    },
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Visually divide blocks',
    icon: Minus,
    keywords: ['divider', 'hr', 'horizontal', 'line', 'separator'],
    onSelect: (editor) => {
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
    },
  },
  {
    id: 'image',
    title: 'Image',
    description: 'Insert image from URL or storage',
    icon: Image,
    keywords: ['image', 'picture', 'photo', 'img', 'media'],
    hasSubMenu: true,
    onSelect: () => {
      // Handled via sub-menu, returns 'submenu' to indicate special handling
      return 'submenu'
    },
  },
]

// ============================================================================
// SLASH COMMAND MENU COMPONENT
// ============================================================================

interface SlashCommandMenuProps {
  editor: LexicalEditor
  queryString: string
  rect: DOMRect
  onClose: () => void
  organizationId?: string
  /** All available commands (built-in + any extra) */
  commands: SlashCommand[]
  /**
   * Callback to open storage modal from parent
   * WHY: Storage modal must be rendered in parent to survive menu unmount
   */
  onOpenStorageModal: () => void
}

/**
 * The floating command menu that appears when "/" is typed
 * WHY: Uses fixed positioning with viewport-relative coordinates from getBoundingClientRect
 *
 * Supports sub-menus for complex commands like Image insertion
 */
function SlashCommandMenu({
  editor,
  queryString,
  rect,
  onClose,
  organizationId,
  commands,
  onOpenStorageModal,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  // Image insertion state
  const [showImageSubMenu, setShowImageSubMenu] = useState(false)
  const [imageSubMenuIndex, setImageSubMenuIndex] = useState(0)

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!queryString) return commands

    const query = queryString.toLowerCase()
    return commands.filter(
      (command) =>
        command.title.toLowerCase().includes(query) ||
        command.keywords.some((keyword) => keyword.includes(query))
    )
  }, [queryString, commands])

  // Store previous filtered commands length to avoid setState in effect
  const prevFilteredLengthRef = useRef(filteredCommands.length)
  if (prevFilteredLengthRef.current !== filteredCommands.length) {
    prevFilteredLengthRef.current = filteredCommands.length
    // Reset selection synchronously during render instead of in effect
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(0)
    }
  }

  /**
   * Clears the slash command text from the editor
   * WHY: Need to remove "/image" etc. before inserting content
   */
  const clearSlashText = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const anchor = selection.anchor
        const node = anchor.getNode()

        if (node instanceof TextNode) {
          const text = node.getTextContent()
          const slashIndex = text.lastIndexOf('/')

          if (slashIndex !== -1) {
            const beforeSlash = text.slice(0, slashIndex)
            node.setTextContent(beforeSlash)
            selection.anchor.offset = beforeSlash.length
            selection.focus.offset = beforeSlash.length
          }
        }
      }
    })
  }, [editor])

  /**
   * Insert an image via URL
   * WHY: Allows users to paste external image URLs
   * NOTE: We clear slash text BEFORE prompt to avoid state issues
   */
  const handleImageUrl = useCallback(() => {
    // Clear slash text first before the blocking prompt
    clearSlashText()

    // Get URL from user
    const url = window.prompt('Enter image URL:')

    if (url && url.trim()) {
      // Focus editor and insert image
      editor.focus()
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
        src: url.trim(),
        altText: 'Image',
      })
    }
    onClose()
  }, [editor, clearSlashText, onClose])

  /**
   * Insert an image from storage
   * WHY: Opens storage browser modal via parent callback
   * The modal is rendered in the parent to survive menu unmount
   */
  const handleImageStorage = useCallback(() => {
    if (!organizationId) {
      console.warn('Cannot open storage: no organizationId provided')
      onClose()
      return
    }
    clearSlashText()
    onOpenStorageModal()
    onClose()
  }, [organizationId, clearSlashText, onClose, onOpenStorageModal])


  // Handle selection
  const handleSelect = useCallback(
    (command: SlashCommand) => {
      // If command has a sub-menu, show it instead of executing
      if (command.hasSubMenu && command.id === 'image') {
        setShowImageSubMenu(true)
        setImageSubMenuIndex(0)
        return
      }

      clearSlashText()
      command.onSelect(editor)
      onClose()
    },
    [editor, clearSlashText, onClose]
  )

  // Keyboard navigation
  // WHY: Handles arrow keys, enter, tab, escape for menu navigation
  // Also handles image sub-menu navigation when visible
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (event) event.preventDefault()
          if (showImageSubMenu) {
            // Image sub-menu only has 2 options: URL (0) and Storage (1)
            setImageSubMenuIndex((prev) => (prev === 0 ? 1 : 0))
          } else {
            setSelectedIndex((prev) =>
              prev < filteredCommands.length - 1 ? prev + 1 : 0
            )
          }
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (event) event.preventDefault()
          if (showImageSubMenu) {
            setImageSubMenuIndex((prev) => (prev === 0 ? 1 : 0))
          } else {
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : filteredCommands.length - 1
            )
          }
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event) event.preventDefault()
          if (showImageSubMenu) {
            if (imageSubMenuIndex === 0) {
              handleImageUrl()
            } else {
              handleImageStorage()
            }
          } else if (filteredCommands[selectedIndex]) {
            handleSelect(filteredCommands[selectedIndex])
          }
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (event) event.preventDefault()
          if (showImageSubMenu) {
            if (imageSubMenuIndex === 0) {
              handleImageUrl()
            } else {
              handleImageStorage()
            }
          } else if (filteredCommands[selectedIndex]) {
            handleSelect(filteredCommands[selectedIndex])
          }
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          // If in image sub-menu, go back to main menu
          if (showImageSubMenu) {
            setShowImageSubMenu(false)
            return true
          }
          onClose()
          return true
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [
    editor,
    filteredCommands,
    selectedIndex,
    handleSelect,
    onClose,
    showImageSubMenu,
    imageSubMenuIndex,
    handleImageUrl,
    handleImageStorage,
  ])

  // Scroll selected item into view
  useEffect(() => {
    const menu = menuRef.current
    if (menu && selectedIndex >= 0) {
      const item = menu.children[selectedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Show image sub-menu
  if (showImageSubMenu) {
    return createPortal(
      <div
        data-slash-menu
        className={cn(
          'fixed z-[60] w-72 rounded-lg border border-border bg-popover shadow-lg pointer-events-auto'
        )}
        style={{
          top: rect.bottom + 8,
          left: rect.left,
        }}
      >
        <div className="p-1">
          {/* Header with back button */}
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border mb-1">
            <button
              onClick={() => setShowImageSubMenu(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <span className="text-sm font-medium">Insert Image</span>
          </div>

          {/* URL option */}
          <button
            onClick={handleImageUrl}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-md text-left',
              'hover:bg-muted transition-colors',
              imageSubMenuIndex === 0 && 'bg-muted'
            )}
          >
            <div className="shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center">
              <Link className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">From URL</p>
              <p className="text-xs text-muted-foreground truncate">
                Paste an image URL
              </p>
            </div>
          </button>

          {/* Storage option */}
          <button
            onClick={handleImageStorage}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-md text-left',
              'hover:bg-muted transition-colors',
              imageSubMenuIndex === 1 && 'bg-muted'
            )}
          >
            <div className="shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">From Storage</p>
              <p className="text-xs text-muted-foreground truncate">
                Select from your files
              </p>
            </div>
          </button>
        </div>
      </div>,
      document.body
    )
  }

  if (filteredCommands.length === 0) {
    return createPortal(
      <div
        data-slash-menu
        className={cn(
          'fixed z-[60] w-72 rounded-lg border border-border bg-popover p-2 shadow-lg pointer-events-auto'
        )}
        style={{
          top: rect.bottom + 8,
          left: rect.left,
        }}
      >
        <p className="text-sm text-muted-foreground px-2 py-1">No results</p>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div
      ref={menuRef}
      data-slash-menu
      className={cn(
        'fixed z-[60] w-72 rounded-lg border border-border bg-popover shadow-lg pointer-events-auto',
        'max-h-[300px] overflow-y-auto'
      )}
      style={{
        top: rect.bottom + 8,
        left: rect.left,
      }}
      /**
       * Manual scroll handler to bypass Radix Sheet's scroll lock.
       * WHY: react-remove-scroll (used by Sheet) calls preventDefault() on wheel
       * events targeting elements outside the Sheet's DOM tree. Since this menu
       * is portaled to document.body, the native CSS overflow scroll is blocked.
       * We manually adjust scrollTop to bypass this.
       */
      onWheel={(e) => {
        const el = e.currentTarget
        el.scrollTop += e.deltaY
      }}
    >
      <div className="p-1">
        {filteredCommands.map((command, index) => {
          const Icon = command.icon
          return (
            <button
              key={command.id}
              onClick={() => handleSelect(command)}
              className={cn(
                'w-full flex items-center gap-3 px-2 py-2 rounded-md text-left',
                'hover:bg-muted transition-colors',
                index === selectedIndex && 'bg-muted'
              )}
            >
              <div className="shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {command.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {command.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

/**
 * Slash Command Plugin
 * WHY: Provides Notion-like "/" commands for quick content insertion
 * The menu uses fixed positioning with viewport coordinates, so no anchor element is needed
 *
 * @param organizationId - Required for storage browser when inserting images from storage
 */
export function SlashCommandPlugin({ organizationId, extraCommands }: SlashCommandPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [showMenu, setShowMenu] = useState(false)
  const [queryString, setQueryString] = useState('')
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null)

  /**
   * Merge built-in commands with any extra commands passed in
   * WHY: Allows consumers to inject domain-specific commands (e.g. contract nodes)
   *      without modifying the base plugin
   */
  const allCommands = useMemo(
    () => [...SLASH_COMMANDS, ...(extraCommands ?? [])],
    [extraCommands]
  )

  // Storage modal state - kept in parent to survive menu unmount
  const [showStorageModal, setShowStorageModal] = useState(false)

  /**
   * Handle opening the storage modal
   * WHY: Called by menu to open modal, modal rendered here to survive menu unmount
   */
  const handleOpenStorageModal = useCallback(() => {
    setShowStorageModal(true)
  }, [])

  /**
   * Handle file selection from storage browser
   * WHY: Inserts selected image from storage into editor
   */
  const handleStorageSelect = useCallback(
    (fileOrFiles: SelectedFile | SelectedFile[]) => {
      const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles
      if (!file) {
        setShowStorageModal(false)
        return
      }

      const imageUrl = file.publicUrl || file.accessUrl || ''
      if (imageUrl) {
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          src: imageUrl,
          altText: file.displayName || file.name || 'Image',
          storageFileId: file.id,
        })
      }
      setShowStorageModal(false)
    },
    [editor]
  )

  // Listen for updates to detect "/" trigger for menu
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()

        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor
          const node = anchor.getNode()

          if (node instanceof TextNode) {
            const nodeText = node.getTextContent()
            const slashIndex = nodeText.lastIndexOf('/')

            if (slashIndex !== -1 && slashIndex < anchor.offset) {
              // Extract query after slash
              const query = nodeText.slice(slashIndex + 1, anchor.offset)
              setQueryString(query)

              // Get position for menu - must be done outside of read()
              // since it accesses DOM
              setTimeout(() => {
                const nativeSelection = window.getSelection()
                if (nativeSelection && nativeSelection.rangeCount > 0) {
                  const range = nativeSelection.getRangeAt(0)
                  const rect = range.getBoundingClientRect()
                  setMenuRect(rect)
                  setShowMenu(true)
                }
              }, 0)
            } else {
              setShowMenu(false)
              setQueryString('')
            }
          } else {
            setShowMenu(false)
            setQueryString('')
          }
        } else {
          setShowMenu(false)
          setQueryString('')
        }
      })
    })
  }, [editor])

  // Close menu handler
  const handleClose = useCallback(() => {
    setShowMenu(false)
    setQueryString('')
  }, [])

  // Close menu on click outside
  // WHY: Need to check if click is outside the menu before closing
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!showMenu) return

      // Check if click was inside a slash menu element
      // Menu elements are portaled to body with specific classes
      const target = event.target as HTMLElement
      const isInsideMenu = target.closest('[data-slash-menu]')
      const isInsideModal = target.closest('[data-radix-dialog-content]')

      // Don't close if clicking inside the menu or a modal
      if (isInsideMenu || isInsideModal) {
        return
      }

      handleClose()
    }

    // Use capture phase to handle clicks before buttons
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu, handleClose])

  return (
    <>
      {/* Storage Browser Modal - rendered here to survive menu unmount */}
      {showStorageModal && organizationId && (
        <StorageBrowserModal
          open={showStorageModal}
          onOpenChange={(open) => {
            if (!open) {
              setShowStorageModal(false)
            }
          }}
          organizationId={organizationId}
          mode="select"
          fileFilter="image"
          onSelect={handleStorageSelect}
        />
      )}

      {/* Slash Command Menu */}
      {showMenu && menuRect && (
        <SlashCommandMenu
          editor={editor}
          queryString={queryString}
          rect={menuRect}
          onClose={handleClose}
          organizationId={organizationId}
          commands={allCommands}
          onOpenStorageModal={handleOpenStorageModal}
        />
      )}
    </>
  )
}
