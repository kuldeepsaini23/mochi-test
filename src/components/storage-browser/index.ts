/**
 * STORAGE BROWSER - PUBLIC EXPORTS
 *
 * This is the main entry point for the StorageBrowser component.
 * Import from '@/components/storage-browser' to use.
 *
 * USAGE EXAMPLES:
 *
 * 1. Full storage page replacement:
 * ```tsx
 * import { StorageBrowser } from '@/components/storage-browser'
 *
 * export function StoragePage({ organizationId }) {
 *   return <StorageBrowser organizationId={organizationId} />
 * }
 * ```
 *
 * 2. File picker modal (single select):
 * ```tsx
 * import { StorageBrowserModal } from '@/components/storage-browser'
 *
 * export function ImagePicker({ onSelect }) {
 *   const [open, setOpen] = useState(false)
 *
 *   return (
 *     <>
 *       <Button onClick={() => setOpen(true)}>Select Image</Button>
 *       <StorageBrowserModal
 *         open={open}
 *         onOpenChange={setOpen}
 *         organizationId="org_123"
 *         mode="select"
 *         fileFilter="image"
 *         onSelect={(file) => {
 *           onSelect(file.publicUrl || file.accessUrl)
 *           setOpen(false)
 *         }}
 *       />
 *     </>
 *   )
 * }
 * ```
 *
 * 3. Multi-file picker:
 * ```tsx
 * import { StorageBrowserModal, type SelectedFile } from '@/components/storage-browser'
 *
 * export function VideoLibrary({ onConfirm }) {
 *   const [open, setOpen] = useState(false)
 *
 *   return (
 *     <StorageBrowserModal
 *       open={open}
 *       onOpenChange={setOpen}
 *       organizationId="org_123"
 *       mode="multi-select"
 *       fileFilter="video"
 *       maxSelection={10}
 *       onConfirm={(files: SelectedFile[]) => {
 *         onConfirm(files.map(f => f.id))
 *       }}
 *     />
 *   )
 * }
 * ```
 */

// Main components
export { StorageBrowser } from './storage-browser'
export { StorageBrowserModal } from './storage-browser-modal'
export { StorageBrowserHeader } from './storage-browser-header'

// Hooks
export { useStorageBrowserInvalidation } from './use-storage-browser'

// Types
export type {
  StorageBrowserProps,
  StorageBrowserModalProps,
  SelectedFile,
  FileTypeFilter,
  SelectionMode,
  ViewMode,
  Breadcrumb,
} from './types'

// Constants
export { FILE_FILTER_MAP } from './types'
