'use client'

/**
 * ============================================================================
 * CONTRACT VIEW CLIENT — Public Read-Only Signing View
 * ============================================================================
 *
 * Renders the contract in a read-only Lexical editor wrapped in SigningProvider.
 * Layout is 100% identical to the contract builder: same bg colors, padding,
 * max-width, MarqueeFade scroll fades. No header — just a fixed theme toggle
 * in the top-right corner.
 *
 * Variable pills show interpolated values (not editable names).
 * InputFieldNodes render as real inputs. SignatureNodes are signable.
 * Floating toolbar at bottom tracks required fields (impersonation banner style).
 *
 * SOURCE OF TRUTH KEYWORDS: ContractViewClient, PublicContractView
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { cn } from '@/lib/utils'
import { contractNodes } from '@/components/editor/nodes'
import { editorTheme } from '@/components/editor/theme'
import {
  ContractVariableLabelProvider,
  ContractVariableValueProvider,
} from '@/components/editor/nodes/variable-node'
import { ThemeToggle } from '@/components/theme-toggle'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { SigningProvider, remapSigneeDataKeys } from '../_lib/signing-context'
import { FloatingSigningToolbar } from './floating-signing-toolbar'
import type { ContractStatus } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

interface ContractViewClientProps {
  /** Contract display name */
  contractName: string
  /** Serialized Lexical editor state (JSON string or object) */
  contractContent: string | null
  /** Current contract status (SENT, COMPLETED, etc.) */
  contractStatus: ContractStatus
  /** Access token for submitting the signature */
  accessToken: string
  /** Pre-computed variable key → value map for pill interpolation */
  variableValues: Record<string, string>
  /** Pre-computed variable key → label map for pill label display */
  variableLabels: Record<string, string>
  /** Previously submitted signee data (if contract is already signed) */
  signeeData?: Record<string, unknown> | null
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ContractViewClient({
  contractName,
  contractContent,
  contractStatus,
  accessToken,
  variableValues,
  variableLabels,
  signeeData,
}: ContractViewClientProps) {
  /** Whether this contract has already been completed/signed */
  const isCompleted = contractStatus === 'COMPLETED'

  /** Convert record maps to Map for the context providers */
  const labelMap = useMemo(() => new Map(Object.entries(variableLabels)), [variableLabels])
  const valueMap = useMemo(() => new Map(Object.entries(variableValues)), [variableValues])

  /**
   * Extract initial signee data for pre-populating a completed contract.
   * WHY: When re-viewing a signed contract, the fields and signatures
   * must show the values the user entered — not start empty.
   */
  const initialSigneeData = useMemo(() => {
    if (!signeeData) return null
    const raw = {
      fieldValues: (signeeData.fieldValues as Record<string, string>) ?? {},
      signatureStates: (signeeData.signatureStates as Record<string, boolean>) ?? {},
    }
    /**
     * Remap old numeric keys (Lexical node keys) → stable label-based keys.
     * WHY: Contracts signed before the label-key migration stored values
     * with ephemeral node keys. This ensures they display correctly.
     */
    return remapSigneeDataKeys(raw, contractContent)
  }, [signeeData, contractContent])

  /**
   * Resolve the actual signer's display name from variable values.
   * WHY: SignatureNode uses a placeholder name set by the contract author (e.g., "Example Name").
   * The real signer name must come from lead data — either `lead.fullName` or
   * a combination of `lead.firstName` + `lead.lastName`.
   */
  const signerDisplayName = useMemo(() => {
    if (variableValues['lead.fullName']) return variableValues['lead.fullName']
    const parts = [variableValues['lead.firstName'], variableValues['lead.lastName']].filter(Boolean)
    return parts.join(' ') || ''
  }, [variableValues])

  /**
   * MarqueeFade scroll tracking — identical to builder pattern
   * WHY: Smooth top/bottom fade effects that match the builder exactly
   */
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(true)

  const handleScroll = useCallback(() => {
    const el = editorContainerRef.current
    if (!el) return
    setShowTopFade(el.scrollTop > 20)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 20)
  }, [])

  /** Lexical editor config — read-only, contract nodes, pre-populated content */
  const initialConfig = useMemo(
    () => ({
      namespace: 'ContractView',
      theme: editorTheme,
      nodes: contractNodes,
      editable: false,
      onError: (error: Error) => {
        console.error('Contract view error:', error)
      },
      editorState: contractContent
        ? (editor: import('lexical').LexicalEditor) => {
            try {
              const contentStr =
                typeof contractContent === 'string'
                  ? contractContent
                  : JSON.stringify(contractContent)
              const state = editor.parseEditorState(contentStr)
              editor.setEditorState(state)
            } catch {
              console.warn('Failed to parse contract content')
            }
          }
        : undefined,
    }),
    [contractContent]
  )

  return (
    <SigningProvider
      isCompleted={isCompleted}
      signerDisplayName={signerDisplayName}
      initialSigneeData={initialSigneeData}
    >
      <ContractVariableLabelProvider labels={labelMap}>
        <ContractVariableValueProvider values={valueMap}>
          {/**
           * Full-screen container — matches builder layout exactly:
           * dark:bg-sidebar bg-muted background, same rounded corners approach.
           *
           * PRINT MODE: h-screen and overflow-hidden are removed via print: overrides
           * so content flows naturally across pages. Background colors use print-color-adjust.
           */}
          <div className="relative h-screen overflow-hidden dark:bg-sidebar bg-muted print:h-auto print:overflow-visible">
            {/* Fixed theme toggle — tiny, top-right corner, hidden in print */}
            <div className="fixed top-4 right-4 z-20 [&_button]:h-8 [&_button]:w-8 print:hidden">
              <ThemeToggle />
            </div>

            {/* Completed badge — top-left, hidden in print mode */}
            {isCompleted && (
              <div className="fixed top-4 left-4 z-20 print:hidden">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                  Signed
                </span>
              </div>
            )}

            {/**
             * MarqueeFade + scrollable editor area
             * WHY: Exact same structure as the contract builder —
             * same padding, max-width, fade effects
             */}
            <MarqueeFade
              showTopFade={showTopFade}
              showBottomFade={showBottomFade}
              fadeHeight={100}
              className="h-full"
            >
              <div
                ref={editorContainerRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto pt-16 px-4 sm:px-8 md:px-16 lg:px-24 pb-32"
              >
                <div className="max-w-3xl mx-auto">
                  <div className="relative">
                    <LexicalComposer initialConfig={initialConfig}>
                      <RichTextPlugin
                        contentEditable={
                          <ContentEditable
                            className={cn(
                              'min-h-[calc(100vh-200px)] outline-none',
                              'text-foreground text-base leading-relaxed'
                            )}
                          />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                      />
                      <ListPlugin />
                      <LinkPlugin />
                      <CheckListPlugin />
                      <HorizontalRulePlugin />
                    </LexicalComposer>
                  </div>
                </div>
              </div>
            </MarqueeFade>

            {/**
             * Floating toolbar — always visible.
             * SIGNING: tracks fields + submit button.
             * COMPLETED: shows "Completed" text + download button.
             */}
            <FloatingSigningToolbar
              accessToken={accessToken}
              variableValues={variableValues}
              isCompleted={isCompleted}
            />
          </div>
        </ContractVariableValueProvider>
      </ContractVariableLabelProvider>
    </SigningProvider>
  )
}
