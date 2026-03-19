/**
 * ============================================================================
 * UI RENDER - BARREL EXPORTS
 * ============================================================================
 *
 * NOTE: catalog.ts and registry.ts are CLIENT-ONLY (they import
 * @json-render/shadcn which uses React.createContext). Do NOT re-export
 * them here — import them directly where needed in client components.
 *
 * This barrel is safe for server imports (API routes, strategies).
 *
 * SOURCE OF TRUTH KEYWORDS: UIRenderExports
 * ============================================================================
 */

export { getUIRenderPrompt } from './prompts'
export { specToCanvas, IncrementalSpecConverter } from './spec-to-canvas'
export { canvasBridge, createAIContainer } from './canvas-bridge'
export type { SpecToCanvasResult, SpecToCanvasOptions } from './spec-to-canvas'
export type { CanvasBridgePageInfo } from './canvas-bridge'
export type {
  UIRenderStatus,
  UIRenderState,
  UseJsonRenderAIOptions,
  UseJsonRenderAIResult,
} from './types'
