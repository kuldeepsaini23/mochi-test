# Wallet System Documentation

## Overview

The wallet system enables usage-based billing for organizations. Each organization has a wallet that tracks balance, handles charges for various services (AI, SMS, email, storage), and automatically tops up when funds run low.

**Key Features:**
- Organizations start with **$1.00 free credit**
- **Auto top-up** triggers when balance drops below $0 (charges $10 minimum)
- **Manual top-up** available at any time (minimum $10)
- Full **transaction history** with audit trail
- **Single source of truth** service for all wallet operations

---

## Architecture

### Database Models

Located in `prisma/schema.prisma`:

```
┌─────────────────────────┐       ┌─────────────────────────┐
│    Organization         │       │   OrganizationWallet    │
├─────────────────────────┤       ├─────────────────────────┤
│ id                      │──────▶│ id                      │
│ name                    │  1:1  │ organizationId (unique) │
│ slug                    │       │ balance (millicents)         │
│ ...                     │       │ currency                │
│ wallet                  │       │ autoTopUpEnabled        │
└─────────────────────────┘       │ autoTopUpThreshold      │
                                  │ autoTopUpAmount         │
                                  │ transactions[]          │
                                  └───────────┬─────────────┘
                                              │ 1:N
                                              ▼
                                  ┌─────────────────────────┐
                                  │   WalletTransaction     │
                                  ├─────────────────────────┤
                                  │ id                      │
                                  │ walletId                │
                                  │ type (TOP_UP/CHARGE)    │
                                  │ status                  │
                                  │ category                │
                                  │ amount (millicents)          │
                                  │ balanceAfter            │
                                  │ description             │
                                  │ metadata (JSON)         │
                                  │ stripePaymentIntentId   │
                                  └─────────────────────────┘
```

### Enums

#### WalletTransactionType
- `TOP_UP` - Adding funds (manual or auto)
- `CHARGE` - Deducting funds (usage)
- `REFUND` - Refunding a charge

#### WalletTransactionStatus
- `PENDING` - Transaction initiated
- `COMPLETED` - Transaction completed successfully
- `FAILED` - Transaction failed

#### WalletChargeCategory
Top-up categories:
- `AUTO_TOP_UP` - Automatic top-up when balance < $0
- `MANUAL_TOP_UP` - Manual top-up by user
- `FREE_CREDIT` - Free credit (e.g., initial $1)
- `REFUND` - Refund of a previous charge

Usage categories:
- `AI_USAGE` - AI model usage (GPT, Claude, etc.)
- `SMS` - SMS messages sent
- `EMAIL` - Emails sent
- `STORAGE` - Storage overage
- `API_CALLS` - API calls beyond free tier
- `OTHER` - Miscellaneous charges

---

## Service Layer (Single Source of Truth)

**File:** `src/services/wallet.service.ts`

This is the **ONLY** place wallet operations should happen. All routers and other services must use this service for wallet operations.

### Key Functions

#### Creating Wallets

```typescript
import { createWallet, getWallet } from '@/services/wallet.service'

// Create a new wallet (usually done automatically on org creation)
const wallet = await createWallet(organizationId)

// Get wallet (auto-creates if doesn't exist for backwards compatibility)
const wallet = await getWallet(organizationId)

// Get wallet with formatted details for display
const walletDetails = await getWalletWithDetails(organizationId)
// Returns: { id, balance, balanceFormatted: "$47.52", currency, ... }
```

#### Charging the Wallet (Main Function for Usage)

```typescript
import { chargeWallet } from '@/services/wallet.service'

// Charge for AI usage
const result = await chargeWallet({
  organizationId: 'org_123',
  amount: 2500,              // Amount in MILLICENTS (2500 = $2.50)
  category: 'AI_USAGE',
  description: 'GPT-4 API usage',
  metadata: {               // Optional - stored as JSON
    tokens: 15000,
    model: 'gpt-4'
  }
})

// Result structure
{
  success: true,
  transaction: WalletTransaction,
  newBalance: 47500,                   // New balance in millicents
  autoTopUpTriggered: false,           // True if auto top-up was triggered
  autoTopUpTransaction?: WalletTransaction  // Present if auto top-up occurred
}
```

**Important:** The `chargeWallet` function automatically handles auto-top-up when the balance drops below the threshold. You don't need to check or trigger it manually.

#### Manual Top-Up

```typescript
import { topUpWallet } from '@/services/wallet.service'

const result = await topUpWallet({
  organizationId: 'org_123',
  amount: 20000,                   // Amount in MILLICENTS (20000 = $20.00)
  paymentMethodId: 'pm_xxx'        // Optional - uses default if not provided
})

// Result structure
{
  transaction: WalletTransaction,
  newBalance: 67500,               // Balance in millicents
  clientSecret?: string  // Present if payment requires additional action (3DS)
}
```

#### Listing Transactions

```typescript
import { getTransactionsByOrganization } from '@/services/wallet.service'

const result = await getTransactionsByOrganization(organizationId, {
  page: 1,
  pageSize: 10,
  type: 'CHARGE',        // Optional filter
  search: 'GPT'          // Optional search
})

// Result structure
{
  transactions: WalletTransaction[],
  total: 45,
  page: 1,
  pageSize: 10,
  totalPages: 5
}
```

#### Updating Settings

```typescript
import { updateAutoTopUpSettings } from '@/services/wallet.service'

await updateAutoTopUpSettings(organizationId, {
  autoTopUpEnabled: true,
  autoTopUpAmount: 20000,     // $20.00 in millicents (minimum 10000 = $10)
  autoTopUpThreshold: 5000    // Trigger when balance < $5.00 (5000 millicents)
})
```

---

## TRPC Router

**File:** `src/trpc/routers/wallet.ts`

All endpoints require `billing:read` or `billing:update` permissions.

### Endpoints

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `wallet.getWallet` | Query | billing:read | Get wallet balance and settings |
| `wallet.getTransactions` | Query | billing:read | Get paginated transaction history |
| `wallet.topUp` | Mutation | billing:update | Manual top-up |
| `wallet.updateAutoTopUpSettings` | Mutation | billing:update | Update auto-top-up settings |
| `wallet.createWallet` | Mutation | billing:update | Manually create wallet |

### Usage Examples (Frontend)

```typescript
// Get wallet data
const { data: wallet } = trpc.wallet.getWallet.useQuery({
  organizationId: 'org_123'
})

// Get transactions with filtering
const { data: transactions } = trpc.wallet.getTransactions.useQuery({
  organizationId: 'org_123',
  page: 1,
  pageSize: 10,
  type: 'CHARGE',        // Optional
  search: 'AI'           // Optional
})

// Top-up mutation
const topUpMutation = trpc.wallet.topUp.useMutation()

await topUpMutation.mutateAsync({
  organizationId: 'org_123',
  amount: 20000  // $20.00 in millicents
})
```

---

## Automatic Wallet Creation

Wallets are automatically created when an organization is created via `createStudioOrganization()` in `src/services/organization.service.ts`.

**What happens:**
1. Organization is created
2. Wallet is created with $1.00 (100 cents) balance
3. Initial "FREE_CREDIT" transaction is recorded

```typescript
// This happens automatically in createStudioOrganization()
const wallet = await tx.organizationWallet.create({
  data: {
    organizationId: organization.id,
    balance: 1000,             // $1.00 in millicents (1000 = $1.00)
    currency: 'USD',
    autoTopUpEnabled: true,
    autoTopUpThreshold: 0,     // Trigger when balance < $0
    autoTopUpAmount: 10000,    // $10.00 in millicents
  },
})

await tx.walletTransaction.create({
  data: {
    walletId: wallet.id,
    type: 'TOP_UP',
    status: 'COMPLETED',
    category: 'FREE_CREDIT',
    amount: 1000,
    currency: 'USD',
    balanceAfter: 1000,
    description: 'Initial free credit',
  },
})
```

---

## Auto Top-Up Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    chargeWallet() called                      │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│            Deduct amount from wallet balance                  │
│            Create CHARGE transaction                          │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│     Is autoTopUpEnabled AND balance < autoTopUpThreshold?     │
└───────────┬─────────────────────────────────────┬────────────┘
            │ YES                                 │ NO
            ▼                                     ▼
┌───────────────────────────┐       ┌─────────────────────────┐
│ Get Stripe customer       │       │     Return result       │
│ Get default payment method│       │  (no auto top-up)       │
│ Create payment intent     │       └─────────────────────────┘
│ Charge autoTopUpAmount    │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│ Payment succeeded?        │
└───────┬───────────┬───────┘
        │ YES       │ NO
        ▼           ▼
┌───────────────┐  ┌─────────────────────────────┐
│ Add funds     │  │ Log error, return result    │
│ Create TOP_UP │  │ (charge still completed,    │
│ transaction   │  │  but no auto top-up)        │
│ Return result │  └─────────────────────────────┘
│ with flag     │
└───────────────┘
```

---

## Important Notes

### Amounts are in MILLICENTS (not cents!)

All amounts in the database and service are stored in **MILLICENTS** (1000 = $1.00) to handle sub-cent PAYG pricing without floating point issues:
- `1000` = $1.00
- `10000` = $10.00
- `25000` = $25.00
- `15` = $0.015 (sub-cent precision for tier-specific email pricing)
- `8` = $0.008 (sub-cent precision for enterprise email pricing)

**WHY MILLICENTS OVER CENTS:**
Sub-cent pricing (e.g., $0.015 starter email, $0.008 enterprise email) can't be represented as integer cents without precision loss. `Math.round(0.015 * 100) = 2`, not 1.5. With millicents: `Math.round(0.015 * 1000) = 15` — a clean integer.

**TWO FORMATTING FUNCTIONS:**
- `formatWalletAmount(millicents)` — divides by 1000, use for wallet balances and transactions
- `formatCurrency(cents)` — divides by 100, use for Stripe amounts (prices, invoices)

**STRIPE BOUNDARY:**
Stripe always works in cents. Conversions happen at the boundary via `toStripeCents()`:
- `toStripeCents(millicents)` = `Math.round(millicents / 10)` — converts millicents to cents before sending to Stripe
- Top-up amounts are always whole dollars so `millicents / 10` is always clean

### Minimum Amounts

- **Minimum top-up:** $10.00 (10000 millicents)
- **Minimum auto top-up:** $10.00 (10000 millicents)
- **Initial free credit:** $1.00 (1000 millicents)

### Charge Amounts are Negative

In transactions, charges are stored as **negative amounts**:
- Top-up of $10: `amount: 10000`
- Charge of $2.50: `amount: -2500`
- Charge of $0.015 (1 email, starter tier): `amount: -15`

This makes calculating running balances straightforward.

### Stripe Integration

- Top-ups use the organization's Stripe customer from the `Subscription` table
- Auto top-up uses the default payment method on file
- Manual top-up can specify a payment method or use default
- If 3DS is required, `clientSecret` is returned for frontend handling

---

## File Locations

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Database models and enums |
| `src/services/wallet.service.ts` | **Single source of truth** for wallet operations |
| `src/lib/config/usage-pricing.ts` | Pricing rates (MILLICENTS), tier-aware pricing functions |
| `src/lib/config/feature-gates.ts` | PAYG feature definitions, tier-specific pricing config |
| `src/lib/utils.ts` | `formatWalletAmount()` (millicents) and `formatCurrency()` (cents) |
| `src/trpc/routers/wallet.ts` | TRPC endpoints |
| `src/services/organization.service.ts` | Auto-creates wallet on org creation |
| `src/app/.../settings/_components/wallet-tab.tsx` | Wallet UI component |
| `src/app/.../settings/_components/wallet-card.tsx` | Wallet balance card |
| `src/app/.../settings/_components/wallet-transactions-table.tsx` | Transaction history table |
| `src/app/.../settings/_components/top-up-dialog.tsx` | Manual top-up dialog |

---

## Setup Required

After pulling these changes, run:

```bash
# Generate Prisma client with new models
npx prisma generate

# Apply migrations to database
npx prisma db push
# OR
npx prisma migrate dev --name add-wallet-system
```

---

## Email Charging Integration

Email charging is automatically handled when emails are sent. The cost is defined in `feature-gates.ts` as the **single source of truth**.

### How It Works

1. **Cost Source**: `FEATURES.organization['emails.payg']` in `src/lib/config/feature-gates.ts` with tier-specific pricing via `getTierSpecificCostMillicents()`
2. **Tier-aware pricing** (in MILLICENTS): Free=$0.02 (20), Starter=$0.015 (15), Pro=$0.01 (10), Enterprise=$0.008 (8)
3. **Helper Function**: `chargeForEmail()` in `wallet.service.ts` uses `getEmailCostMillicentsByTier()` for tier-aware pricing
4. **Charging**: Happens AFTER successful email send to avoid charging for failed emails

### Where Emails Are Charged

| File | Function | Description |
|------|----------|-------------|
| `email.service.ts` | `sendOrganizationInvitationEmail()` | When organizationId provided |
| `email.service.ts` | `sendMarketingEmail()` | When fromOrganizationId provided |
| `inbox.service.ts` | `sendMessage()` | For EMAIL channel messages |
| `email-template.service.ts` | `sendTestEmail()` | Test emails (real sends) |

### Usage Example

The `chargeForEmail()` helper simplifies charging:

```typescript
import { chargeForEmail } from '@/services/wallet.service'

// Charge for a single email
const result = await chargeForEmail(
  organizationId,
  'Marketing email to john@example.com',
  {
    type: 'campaign',
    recipient: 'john@example.com',
    messageId: 'resend-msg-123'
  }
)

// For batch emails
import { chargeForEmailBatch } from '@/services/wallet.service'

const batchResult = await chargeForEmailBatch(
  organizationId,
  100, // Number of emails
  'Campaign: Welcome Series - 100 emails',
  { campaignId: 'campaign_123' }
)
```

### Platform Emails (NOT Charged)

These emails are NOT charged to organization wallets:
- `sendPaymentFailedEmail()` - Platform notification
- `sendSubscriptionEventEmail()` - Platform notification

---

## Example: Integrating with AI Service

Here's how another service would charge for AI usage:

```typescript
// src/services/ai.service.ts
import { chargeWallet } from '@/services/wallet.service'

export async function processAIRequest(
  organizationId: string,
  prompt: string
): Promise<AIResponse> {
  // Call AI API
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  })

  // Calculate cost based on tokens (in MILLICENTS)
  const tokensUsed = response.usage?.total_tokens || 0
  const costInMillicents = Math.ceil((tokensUsed / 1000) * 30) // 30 millicents per 1K tokens

  // Charge the wallet
  const chargeResult = await chargeWallet({
    organizationId,
    amount: costInMillicents,
    category: 'AI_USAGE',
    description: `GPT-4 API usage`,
    metadata: {
      model: 'gpt-4',
      tokens: tokensUsed,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
    },
  })

  // Auto top-up is handled automatically if needed
  if (chargeResult.autoTopUpTriggered) {
    console.log('Auto top-up was triggered')
  }

  return response
}
```
