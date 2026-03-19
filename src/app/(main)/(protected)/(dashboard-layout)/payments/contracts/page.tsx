/**
 * Contracts Page - Client-Side Caching Pattern
 *
 * WHY: Manages contract templates with signature and input field capabilities
 * HOW: Client-side data fetching with TanStack Query caching
 *
 * URL STRUCTURE:
 * - /payments/contracts - Root level (all contracts)
 * - /payments/contracts?folder=xxx - Inside a specific folder
 * - /payments/contracts?contract=xxx - Opens contract builder overlay
 *
 * FEATURES:
 * - Folder organization (nested folders)
 * - Contract CRUD operations
 * - Search with debouncing
 * - Grid/list view toggle
 * - Full-screen contract builder
 *
 * PERMISSION: contracts:read required
 *
 * SOURCE OF TRUTH: Contract, ContractFolder from Prisma
 * Keywords: CONTRACTS_PAGE, CONTRACT_LISTING
 */

import { ContractsPageContent } from './_components/contracts-page-content'

export default function ContractsPage() {
  return <ContractsPageContent />
}

export const metadata = {
  title: 'Contracts | Mochi',
  description: 'Create and manage contract templates with signature fields',
}
