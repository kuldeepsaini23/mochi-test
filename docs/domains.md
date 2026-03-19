# Domain Management Documentation

This document covers the domain verification system for custom website domains.

## Overview

Mochi supports custom domains for websites. Users can connect their own domains (e.g., `courses.example.com`) to their Mochi websites instead of using the default subdomain.

## Domain Verification Flow

### 1. Add Domain

User adds a custom domain via the Domains page:
- Enter the domain name (e.g., `courses.example.com`)
- System generates a unique domain record with `isVerified: false`

### 2. DNS Configuration

User must configure **BOTH** DNS records with their domain registrar:

| Record Type | Name | Value | Purpose | Required |
|-------------|------|-------|---------|----------|
| CNAME | `@` or subdomain | `{NEXT_PUBLIC_ROOT_DOMAIN}` | Points traffic to Mochi | Yes |
| TXT | `_mochi-verification` | `mochi-verify={domainId}` | Ownership verification | Yes |

**SECURITY**: Both records are required. The TXT record proves domain ownership - only the actual domain owner can add TXT records to their DNS. This prevents domain hijacking.

### 3. Verification

User clicks "Verify" button which triggers DNS lookup:
1. Server performs `dns.resolveCname(domain)` to check CNAME
2. Server performs `dns.resolveTxt(_mochi-verification.domain)` to check TXT
3. Domain is verified ONLY if both records are correct
4. Updates `isVerified` status based on result
5. Shows toast notification with success/failure message

## Security Implementation

### DNS Verification Service

Location: `src/services/dns-verification.service.ts`

**Key Security Features:**

```typescript
// Domain is verified if BOTH CNAME points to us AND TXT ownership is verified
// SECURITY: TXT verification proves domain ownership - only the actual owner
// can add TXT records to their DNS. This prevents domain hijacking.
const isVerified = cnameResult.verified && txtResult.verified
```

**Verification Messages:**
- Both verified: "Domain is verified and pointing to Mochi."
- CNAME only: "CNAME is correct but TXT ownership verification is missing."
- TXT only: "TXT verified but CNAME is not pointing to Mochi."
- Neither: "Please add both CNAME and TXT records to verify domain ownership."

### Verification States

| Status | Badge | Meaning |
|--------|-------|---------|
| `isVerified: false` | Pending | DNS not configured or ownership not verified |
| `isVerified: true` | Verified | Both CNAME and TXT correctly configured |

## tRPC Endpoints

### domains.verifyDomain

```typescript
domains.verifyDomain({
  organizationId: string
  domainId: string
})
// Returns: {
//   verified: boolean
//   message: string
//   customDomain: string
//   records: DnsRecord[]
//   checkedAt: Date
// }
```

### domains.getDnsInstructions

```typescript
domains.getDnsInstructions({
  organizationId: string
  domainId: string
})
// Returns: DNS record instructions for the user
```

## UI Components

### Domains Page

Location: `src/app/(main)/(protected)/(dashboard-layout)/domains/_components/domains-page-content.tsx`

**Features:**
- List of website and email domains
- Expandable rows showing DNS instructions
- Verify button for unverified domains
- Toast notifications for verification results
- Status badges (Verified, Pending)
- Copy button with clipboard support

## Common Issues

### "CNAME is correct but TXT ownership verification is missing"

**Cause:** User added CNAME but not the TXT record

**Solution:** Add TXT record:
- Name: `_mochi-verification`
- Value: `mochi-verify={domainId}` (shown in DNS instructions)

### "No CNAME record found"

**Causes:**
- DNS not configured yet
- DNS propagation not complete (can take up to 48 hours)
- Cloudflare proxy enabled (masks CNAME)

**Solutions:**
- Wait for DNS propagation
- Disable Cloudflare proxy temporarily
- Check DNS configuration with `dig` or online tools

### "CNAME points to wrong domain"

**Cause:** CNAME points to a different domain than expected

**Solution:** Update CNAME value to point to `{NEXT_PUBLIC_ROOT_DOMAIN}`

## Files Reference

| File | Purpose |
|------|---------|
| `src/services/dns-verification.service.ts` | DNS lookup and verification logic |
| `src/trpc/routers/domains.ts` | tRPC endpoints for domain management |
| `src/services/domain.service.ts` | Domain CRUD operations |
| `domains/_components/domains-page-content.tsx` | UI component |

## Environment Variables

```env
# Required: Platform root domain for verification
NEXT_PUBLIC_ROOT_DOMAIN=mochidev.net
```

## Database Schema

```prisma
model Domain {
  id             String   @id @default(cuid())
  organizationId String
  customDomain   String   @unique // e.g., "courses.example.com"
  isVerified     Boolean  @default(false)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(...)
  websites       Website[]

  @@unique([customDomain])
  @@index([organizationId])
}
```
