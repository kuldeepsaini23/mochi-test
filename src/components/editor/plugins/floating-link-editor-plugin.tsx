'use client'

/**
 * Floating Link Editor Plugin
 *
 * A floating toolbar that appears when a link is selected,
 * allowing users to edit or remove the link.
 *
 * Features:
 * - Edit link URL
 * - Open link in new tab
 * - Remove link
 *
 * SOURCE OF TRUTH: FloatingLinkEditorConfig from @/components/editor/types
 * Keywords: FLOATING_LINK_EDITOR, LINK_TOOLBAR, LEXICAL_LINK
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { $isLinkNode, TOGGLE_LINK_COMMAND, $isAutoLinkNode } from '@lexical/link'
import { mergeRegister } from '@lexical/utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExternalLink, Pencil, Trash2, Check, X } from 'lucide-react'

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Gets the DOM element for a link node
 */
function getSelectedLinkNode(selection: ReturnType<typeof $getSelection>) {
  if (!$isRangeSelection(selection)) return null

  const node = selection.anchor.getNode()
  const parent = node.getParent()

  if ($isLinkNode(parent)) return parent
  if ($isLinkNode(node)) return node

  return null
}

/**
 * Positions the floating editor below the link element
 */
function positionFloatingEditor(
  editor: HTMLDivElement,
  rect: DOMRect | null,
  rootElement: HTMLElement
) {
  if (rect === null) {
    editor.style.opacity = '0'
    editor.style.transform = 'translate(-10000px, -10000px)'
    return
  }

  const rootRect = rootElement.getBoundingClientRect()
  const top = rect.bottom - rootRect.top + 8
  const left = rect.left - rootRect.left

  editor.style.opacity = '1'
  editor.style.transform = `translate(${left}px, ${top}px)`
}

// ============================================================================
// FLOATING LINK EDITOR COMPONENT
// ============================================================================

interface FloatingLinkEditorProps {
  anchorElement: HTMLElement
}

/**
 * The actual floating editor that appears when a link is selected
 */
function FloatingLinkEditor({ anchorElement }: FloatingLinkEditorProps) {
  const [editor] = useLexicalComposerContext()
  const editorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [linkUrl, setLinkUrl] = useState('')
  const [editedUrl, setEditedUrl] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [lastSelection, setLastSelection] = useState<ReturnType<
    typeof $getSelection
  > | null>(null)

  // ============================================================================
  // UPDATE LINK EDITOR POSITION AND STATE
  // ============================================================================

  const updateLinkEditor = useCallback(() => {
    const selection = $getSelection()

    if ($isRangeSelection(selection)) {
      const linkNode = getSelectedLinkNode(selection)

      if (linkNode) {
        setLinkUrl(linkNode.getURL())
        setLastSelection(selection)
      } else {
        setLinkUrl('')
        setLastSelection(null)
      }
    }

    const editorElem = editorRef.current
    const nativeSelection = window.getSelection()
    const rootElement = editor.getRootElement()

    if (
      editorElem === null ||
      nativeSelection === null ||
      rootElement === null ||
      !rootElement.contains(nativeSelection.anchorNode)
    ) {
      return
    }

    const domRange = nativeSelection.getRangeAt(0)
    let rect: DOMRect | null = null

    if (nativeSelection.anchorNode === rootElement) {
      let inner = rootElement
      while (inner.firstElementChild != null) {
        inner = inner.firstElementChild as HTMLElement
      }
      rect = inner.getBoundingClientRect()
    } else {
      rect = domRange.getBoundingClientRect()
    }

    positionFloatingEditor(editorElem, rect, rootElement)
  }, [editor])

  // ============================================================================
  // REGISTER LISTENERS
  // ============================================================================

  useEffect(() => {
    const scrollElement = anchorElement.parentElement

    const update = () => {
      editor.getEditorState().read(() => {
        updateLinkEditor()
      })
    }

    window.addEventListener('resize', update)
    scrollElement?.addEventListener('scroll', update)

    return () => {
      window.removeEventListener('resize', update)
      scrollElement?.removeEventListener('scroll', update)
    }
  }, [anchorElement, editor, updateLinkEditor])

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateLinkEditor()
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          // Must wrap in read() to access editor state
          editor.getEditorState().read(() => {
            updateLinkEditor()
          })
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (isEditing) {
            setIsEditing(false)
            return true
          }
          return false
        },
        COMMAND_PRIORITY_HIGH
      )
    )
  }, [editor, updateLinkEditor, isEditing])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleLinkSubmission = useCallback(() => {
    if (lastSelection !== null && editedUrl.trim()) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, editedUrl.trim())
    }
    setIsEditing(false)
    setEditedUrl('')
  }, [editor, editedUrl, lastSelection])

  const handleEditClick = useCallback(() => {
    setEditedUrl(linkUrl)
    setIsEditing(true)
  }, [linkUrl])

  const handleRemoveLink = useCallback(() => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
  }, [editor])

  const handleOpenLink = useCallback(() => {
    if (linkUrl) {
      window.open(linkUrl, '_blank', 'noopener,noreferrer')
    }
  }, [linkUrl])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleLinkSubmission()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsEditing(false)
        setEditedUrl('')
      }
    },
    [handleLinkSubmission]
  )

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!linkUrl) return null

  return createPortal(
    <div
      ref={editorRef}
      className={cn(
        'absolute z-50 -translate-y-1 opacity-0 transition-opacity',
        'bg-popover border border-border rounded-lg shadow-lg',
        'flex items-center gap-1 p-1'
      )}
    >
      {isEditing ? (
        // Edit Mode
        <>
          <Input
            ref={inputRef}
            value={editedUrl}
            onChange={(e) => setEditedUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL..."
            className="h-8 w-64 text-sm"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLinkSubmission}
            className="h-8 w-8 p-0"
            title="Save"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsEditing(false)
              setEditedUrl('')
            }}
            className="h-8 w-8 p-0"
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        // View Mode
        <>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-sm text-primary hover:underline truncate max-w-[200px]"
          >
            {linkUrl}
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenLink}
            className="h-8 w-8 p-0"
            title="Open link"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEditClick}
            className="h-8 w-8 p-0"
            title="Edit link"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemoveLink}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            title="Remove link"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>,
    anchorElement
  )
}

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

interface FloatingLinkEditorPluginProps {
  anchorElement?: HTMLElement | null
}

/**
 * Floating Link Editor Plugin
 * WHY: Provides inline link editing when a link is selected
 */
export function FloatingLinkEditorPlugin({
  anchorElement,
}: FloatingLinkEditorPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [isLink, setIsLink] = useState(false)

  // Track if the current selection is a link
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const linkNode = getSelectedLinkNode(selection)
          setIsLink(linkNode !== null && !$isAutoLinkNode(linkNode))
        } else {
          setIsLink(false)
        }
      })
    })
  }, [editor])

  if (!isLink || !anchorElement) return null

  return <FloatingLinkEditor anchorElement={anchorElement} />
}
