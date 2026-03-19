'use client'

/**
 * SignatureNode - Lexical DecoratorNode for contract signature fields
 *
 * Renders a visual signature placeholder within the contract editor.
 * Supports signer name, role, required flag, and optional date line.
 * Users can click to select and delete via keyboard.
 *
 * SOURCE OF TRUTH: Lexical DecoratorNode pattern (mirrors ImageNode)
 * Keywords: SIGNATURE_NODE, CONTRACT_SIGNATURE, LEXICAL_SIGNATURE
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
 * Serialized format for SignatureNode
 * WHY: Enables storage and restoration of signature field state in JSON
 */
export type SerializedSignatureNode = Spread<
  {
    signerName: string
    signerRole: string
    required: boolean
    showDate: boolean
  },
  SerializedLexicalNode
>

// ============================================================================
// SIGNATURE NODE CLASS
// ============================================================================

/**
 * SignatureNode - Decorator node for contract signature fields
 * WHY: DecoratorNode allows rendering a React component (signature placeholder)
 *      within the Lexical editor content
 */
export class SignatureNode extends DecoratorNode<JSX.Element> {
  __signerName: string
  __signerRole: string
  __required: boolean
  __showDate: boolean

  static getType(): string {
    return 'signature'
  }

  static clone(node: SignatureNode): SignatureNode {
    return new SignatureNode(
      node.__signerName,
      node.__signerRole,
      node.__required,
      node.__showDate,
      node.__key
    )
  }

  constructor(
    signerName: string,
    signerRole: string,
    required: boolean,
    showDate: boolean,
    key?: NodeKey
  ) {
    super(key)
    this.__signerName = signerName
    this.__signerRole = signerRole
    this.__required = required
    this.__showDate = showDate
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  static importJSON(serializedNode: SerializedSignatureNode): SignatureNode {
    const { signerName, signerRole, required, showDate } = serializedNode
    return $createSignatureNode({ signerName, signerRole, required, showDate })
  }

  exportJSON(): SerializedSignatureNode {
    return {
      type: 'signature',
      version: 1,
      signerName: this.__signerName,
      signerRole: this.__signerRole,
      required: this.__required,
      showDate: this.__showDate,
    }
  }

  // ============================================================================
  // DOM HANDLING
  // ============================================================================

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'editor-signature'
    return div
  }

  updateDOM(): false {
    return false
  }

  // ============================================================================
  // GETTERS / SETTERS
  // ============================================================================

  getSignerName(): string {
    return this.getLatest().__signerName
  }

  setSignerName(name: string): void {
    const writable = this.getWritable()
    writable.__signerName = name
  }

  getSignerRole(): string {
    return this.getLatest().__signerRole
  }

  setSignerRole(role: string): void {
    const writable = this.getWritable()
    writable.__signerRole = role
  }

  getRequired(): boolean {
    return this.getLatest().__required
  }

  setRequired(required: boolean): void {
    const writable = this.getWritable()
    writable.__required = required
  }

  getShowDate(): boolean {
    return this.getLatest().__showDate
  }

  setShowDate(showDate: boolean): void {
    const writable = this.getWritable()
    writable.__showDate = showDate
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  decorate(): JSX.Element {
    return (
      <SignatureComponent
        nodeKey={this.__key}
        signerName={this.__signerName}
        signerRole={this.__signerRole}
        required={this.__required}
        showDate={this.__showDate}
      />
    )
  }
}

// ============================================================================
// SIGNATURE COMPONENT — Cursive text signature + agreement modal
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
import { useSigningContext } from '@/app/(main)/(public)/contract/view/[accessToken]/_lib/signing-context'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { createPortal } from 'react-dom'

/**
 * Signature font CSS style — uses the Licorice Google Font for realistic handwriting.
 * WHY: We load the font via a <link> tag in the component instead of next/font/google
 *      at module scope, because next/font causes the module to be evaluated twice
 *      (server + client), which creates two distinct SignatureNode class instances
 *      and breaks Lexical's node registration ("does not match registered node").
 */
const SIGNATURE_FONT_FAMILY = "'Licorice', cursive"
const GOOGLE_FONT_URL = 'https://fonts.googleapis.com/css2?family=Licorice&display=swap'

/** Default placeholder name shown in the builder when no signer name is set */
const DEFAULT_SIGNATURE_NAME = 'Example Name'

interface SignatureComponentProps {
  nodeKey: NodeKey
  signerName: string
  signerRole: string
  required: boolean
  showDate: boolean
}

/**
 * SignatureComponent — Renders a realistic cursive text signature.
 *
 * INLINE: Dotted border box with the signer's name in handwriting font.
 *         Shows "Example Name" when no name is provided.
 *         Clicking opens the agreement modal.
 * MODAL:  Shows signature preview + agreement switch + "Adopt and Sign" button.
 *         No canvas drawing, no image storage — just text-based signatures.
 *
 * WHY text instead of drawn signatures:
 * - Security: user's actual drawn signature is sensitive data that shouldn't be stored
 * - Simplicity: no image storage, no canvas export, no theme issues
 * - Legal: text-based electronic signatures are equally valid
 */
function SignatureComponent({
  nodeKey,
  signerName,
  signerRole,
  required,
  showDate,
}: SignatureComponentProps) {
  const { isSigningMode, isCompleted, signerDisplayName, signatureStates, onSignatureComplete, registerSignature, unregisterSignature } = useSigningContext()
  const [editor] = useLexicalComposerContext()
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * Whether the editor is in editable mode.
   * WHY: Selection ring, keyboard delete, and modal opening must be disabled
   * in read-only mode (SENT/COMPLETED) to prevent any manipulation.
   * Same pattern as ImageNode.
   */
  const isEditable = editor.isEditable()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)

  /** Load the Licorice Google Font via a <link> tag (once per mount) */
  useEffect(() => {
    if (document.querySelector(`link[href="${GOOGLE_FONT_URL}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = GOOGLE_FONT_URL
    document.head.appendChild(link)
  }, [])

  /**
   * Stable key for signing context registration and value lookup.
   * WHY: Lexical node keys are ephemeral (different per editor instance).
   * Using the node's signerName property ensures the same key is used in
   * both the public view and builder, so signeeData values map correctly.
   */
  const signatureKey = signerName || 'signature'

  /**
   * Register this signature with the signing context on mount.
   * WHY: Lexical read-only mode does NOT add data-lexical-node-key to the DOM,
   * so the toolbar can't discover signatures via DOM scanning. Each signature self-registers.
   */
  useEffect(() => {
    if (!isSigningMode) return
    registerSignature(signatureKey)
    return () => unregisterSignature(signatureKey)
  }, [isSigningMode, signatureKey, registerSignature, unregisterSignature])

  /** Whether the agreement modal is open */
  const [isModalOpen, setIsModalOpen] = useState(false)

  /**
   * Whether the user has completed the signing flow (agreed + adopted).
   * In signing mode, also check the signing context for pre-existing state.
   */
  const [isSigned, setIsSigned] = useState(false)
  const isSignedFinal = isSigned || (isSigningMode && signatureStates[signatureKey])

  /**
   * The display name for the signature text.
   * WHY: In signing mode, use the actual recipient's name from the signing context
   * (resolved from lead data). In edit mode (builder), use the node's signerName
   * property which is a placeholder the author sets. Falls back to DEFAULT_SIGNATURE_NAME.
   */
  const displayName = isSigningMode
    ? (signerDisplayName || signerName || DEFAULT_SIGNATURE_NAME)
    : (signerName || DEFAULT_SIGNATURE_NAME)

  // ============================================================================
  // LEXICAL NODE SELECTION & DELETION
  // ============================================================================

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      /** Block deletion when editor is read-only (SENT/COMPLETED) */
      if (!editor.isEditable()) return false
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        const node = $getNodeByKey(nodeKey)
        if ($isSignatureNode(node)) {
          node.remove()
        }
      }
      return false
    },
    [editor, isSelected, nodeKey]
  )

  const onClick = useCallback(
    (event: MouseEvent) => {
      if (
        containerRef.current &&
        (event.target === containerRef.current ||
          containerRef.current.contains(event.target as Node))
      ) {
        const target = event.target as HTMLElement
        /** Don't select if clicking the sign trigger — that opens the modal */
        if (target.closest('[data-sign-trigger]')) return false

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

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW)
    )
  }, [editor, onClick, onDelete])

  /** Called when the user completes the agreement flow in the modal */
  const handleSignComplete = useCallback(() => {
    setIsSigned(true)
    setIsModalOpen(false)
    /** Report completion to signing context so the floating toolbar can track it */
    if (isSigningMode) {
      onSignatureComplete(signatureKey)
    }
  }, [isSigningMode, onSignatureComplete, signatureKey])

  // ============================================================================
  // RENDER — Cursive signature text with dotted border
  // ============================================================================

  /**
   * COMPLETED state — render the baked signature as a static, non-interactive element.
   * WHY: Once signed, the signature is frozen. No clicking, no re-signing.
   * Always shows the real signer's name in cursive font with role + date.
   */
  if (isSigningMode && isCompleted) {
    return (
      <div className="my-3 max-w-xs">
        <div className="w-full border border-dashed rounded-lg border-primary/40 py-4 px-5">
          <p
            className="text-3xl leading-tight text-foreground"
            style={{ fontFamily: SIGNATURE_FONT_FAMILY }}
          >
            {displayName}
          </p>
          <div className="mt-2 border-t border-muted-foreground/20" />
          <div className="mt-1.5 flex items-center gap-2">
            {signerRole && (
              <span className="text-[10px] text-muted-foreground">{signerRole}</span>
            )}
            {showDate && (
              <span className="text-[10px] text-muted-foreground">
                {new Date().toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          'my-3 max-w-xs',
          isSelected && isEditable && !isSigningMode && 'ring-2 ring-primary ring-offset-2 rounded-lg'
        )}
      >
        <button
          type="button"
          data-sign-trigger
          /**
           * Clickable ONLY in signing mode (public view) and only when not already signed.
           * In the builder (isSigningMode=false), signatures are non-interactive placeholders.
           * WHY reversed from isEditable: the public view sets editor to read-only (editable=false)
           * but signatures MUST be clickable there for recipients to sign.
           */
          onClick={isSigningMode && !isSignedFinal ? () => setIsModalOpen(true) : undefined}
          className={cn(
            'w-full border border-dashed rounded-lg transition-colors text-left',
            isSigningMode && !isSignedFinal ? 'cursor-pointer' : 'cursor-default',
            isSignedFinal
              ? 'border-primary/40 hover:border-primary/60 py-4 px-5'
              : 'border-muted-foreground/40 hover:border-muted-foreground/60 py-6 px-5'
          )}
        >
          {isSignedFinal ? (
            <>
              {/* Signature text — only rendered after user adopts */}
              <p
                className="text-3xl leading-tight text-foreground"
                style={{ fontFamily: SIGNATURE_FONT_FAMILY }}
              >
                {displayName}
              </p>

              {/* Thin signature line */}
              <div className="mt-2 border-t border-muted-foreground/20" />

              {/* Signer info below the line */}
              <div className="mt-1.5 flex items-center gap-2">
                {signerRole && (
                  <span className="text-[10px] text-muted-foreground">{signerRole}</span>
                )}
                {showDate && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date().toLocaleDateString()}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Empty placeholder — just the signature line */}
              <div className="border-b border-muted-foreground/20" />

              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/50">Sign here</span>
                {required && (
                  <span className="text-[10px] text-muted-foreground/40">Required</span>
                )}
              </div>
            </>
          )}
        </button>
      </div>

      {/* Agreement modal — rendered via portal to escape editor overflow */}
      {isModalOpen && createPortal(
        <SignatureAgreementModal
          onClose={() => setIsModalOpen(false)}
          onComplete={handleSignComplete}
          displayName={displayName}
          signerName={signerName}
          signerRole={signerRole}
        />,
        document.body
      )}
    </>
  )
}

// ============================================================================
// SIGNATURE AGREEMENT MODAL — Preview + agreement toggle
// ============================================================================

interface SignatureAgreementModalProps {
  onClose: () => void
  onComplete: () => void
  displayName: string
  signerName: string
  signerRole: string
}

/**
 * SignatureAgreementModal — Shows the signature text preview and agreement toggle.
 * User must accept the agreement before they can adopt the signature.
 * No canvas, no image storage — purely text-based.
 */
function SignatureAgreementModal({
  onClose,
  onComplete,
  displayName,
  signerName,
  signerRole,
}: SignatureAgreementModalProps) {
  /** Agreement toggle — must be checked before the user can sign */
  const [hasAgreed, setHasAgreed] = useState(false)

  /** Close modal on Escape key */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal card — bg-background in light, bg-muted in dark */}
      <div className="relative z-10 w-full max-w-md mx-4 rounded-xl bg-background dark:bg-muted shadow-2xl overflow-hidden">
        {/* Header — use displayName (resolved from signing context) instead of raw signerName */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="text-sm font-semibold">Adopt your signature</h3>
            {displayName && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {displayName}{signerRole ? ` — ${signerRole}` : ''}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Signature preview — large cursive text in a bordered area */}
        <div className="px-5">
          <div className="rounded-lg border border-border bg-background dark:bg-background/50 py-8 px-6 text-center">
            <p
              className="text-4xl text-foreground"
              style={{ fontFamily: SIGNATURE_FONT_FAMILY }}
            >
              {displayName}
            </p>
          </div>
        </div>

        {/* Agreement toggle */}
        <div className="flex items-start gap-3 px-5 pt-4">
          <Switch
            id="signature-agreement"
            checked={hasAgreed}
            onCheckedChange={setHasAgreed}
            className="mt-0.5 shrink-0"
          />
          <Label
            htmlFor="signature-agreement"
            className="text-[11px] leading-relaxed text-muted-foreground cursor-pointer"
          >
            By selecting Adopt and Sign, I acknowledge that this signature
            serves as my electronic representation and will apply to all
            documents where I use it, including legally binding agreements.
          </Label>
        </div>

        {/* Footer — Cancel + Adopt and Sign */}
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!hasAgreed}
            onClick={onComplete}
          >
            Adopt and Sign
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Type guard for SignatureNode
 */
export function $isSignatureNode(
  node: LexicalNode | null | undefined
): node is SignatureNode {
  return node instanceof SignatureNode
}

/**
 * Create a new SignatureNode with the given parameters
 */
export function $createSignatureNode({
  signerName,
  signerRole,
  required,
  showDate,
  key,
}: {
  signerName: string
  signerRole: string
  required: boolean
  showDate: boolean
  key?: NodeKey
}): SignatureNode {
  return $applyNodeReplacement(
    new SignatureNode(signerName, signerRole, required, showDate, key)
  )
}
