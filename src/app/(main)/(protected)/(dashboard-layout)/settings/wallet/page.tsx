/**
 * Wallet Settings Page
 *
 * WHY: Organization wallet management for usage-based billing
 * HOW: Displays wallet balance, auto top-up info, and transaction history
 *
 * WALLET SYSTEM:
 * - Auto top-up: Minimum $10 charged when balance drops below $0
 * - Manual top-up: Users can add funds manually
 * - Transaction history: All charges and top-ups tracked
 *
 * PERMISSION: Uses billing:read permission (wallet is billing-related)
 *
 * SOURCE OF TRUTH: WalletTab, WalletTransaction
 */

import { WalletTab } from '../_components/wallet-tab'

export default function WalletPage() {
  return <WalletTab />
}
