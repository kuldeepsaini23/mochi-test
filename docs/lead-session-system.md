# Lead Session System (Sticky Forms)

> **SOURCE OF TRUTH KEYWORDS:** LeadSession, StickyForm, LeadIdentification, LeadSessionToken

## Overview

A global, reusable lead session system that identifies returning visitors using secure tokens. Works everywhere:
- Internal pages
- Embedded forms
- Chat widgets
- Chatbots on external websites

## Key Features

| Feature | Description |
|---------|-------------|
| **Global** | Can be used from ANY context (internal pages, external embeds, chatbots) |
| **Secure** | Token cannot be brute-forced or guessed (HMAC-SHA256 signed) |
| **Simple** | Core functionality only - no audit logs, no rate limiting |
| **Modular** | Email is unique identifier, can add more data types later |

## Security Model

### Signed Token Architecture

```
Token Format: v1.{random_payload}.{signature}

Components:
- version: "v1" - Allows future token format changes
- random_payload: 32 bytes cryptographically random (base64url encoded)
- signature: HMAC-SHA256(version.payload.organizationId) (base64url encoded)
```

**Security Properties:**
- Token is opaque - reveals nothing about the lead or organization
- HMAC-SHA256 signature bound to organization
- Server stores only SHA-256 hash of token (never the raw token)
- Only valid with matching organization context
- 256-bit entropy prevents brute force attacks

---

## Database Schema

### LeadSession Model

```prisma
// Location: prisma/schema.prisma
// SOURCE OF TRUTH KEYWORDS: LeadSession, StickyForm, LeadIdentification

model LeadSession {
  id             String   @id @default(cuid())
  organizationId String
  leadId         String

  // Token storage (hash only, never raw)
  tokenHash      String   @unique  // SHA-256 hash for lookup
  tokenSuffix    String            // Last 8 chars for debugging/support

  // Session metadata
  source         String?  // Where session was created: 'form', 'chatbot', 'manual', etc.
  lastSeenAt     DateTime @default(now())
  createdAt      DateTime @default(now())

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  lead           Lead         @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([organizationId, leadId])
  @@index([tokenHash])
  @@map("leadSession")
}
```

### Relations Added

```prisma
// In Lead model
sessions  LeadSession[]

// In Organization model
leadSessions  LeadSession[]
```

---

## File Structure

```
src/
├── lib/
│   └── lead-session/
│       ├── token.ts      # Token generation/validation (server-only)
│       ├── cookie.ts     # Server-side cookie utilities
│       ├── client.ts     # Client-side cookie utilities (browser)
│       └── embed.ts      # Cross-origin embed support
├── services/
│   └── lead-session.service.ts  # Core service (DAL)
├── trpc/
│   └── routers/
│       └── lead-session.ts      # tRPC router
└── hooks/
    └── use-lead-session.ts      # React hook
```

---

## Token Library

### Location: `src/lib/lead-session/token.ts`

```typescript
import { randomBytes, createHmac, timingSafeEqual } from 'crypto'

const TOKEN_VERSION = 'v1'
const PAYLOAD_BYTES = 32

export interface CreateTokenOptions {
  organizationId: string
  leadId: string
}

export interface TokenResult {
  token: string       // Full token to send to client
  tokenHash: string   // SHA-256 hash for database storage
  tokenSuffix: string // Last 8 chars for debugging
}

/**
 * Create a secure lead session token
 *
 * WHY: Generate opaque, unforgeable tokens for lead identification
 * HOW: Random payload + HMAC signature bound to organization
 */
export function createLeadSessionToken(options: CreateTokenOptions): TokenResult

/**
 * Validate token signature matches the organization
 *
 * WHY: Ensure token was created for this organization
 * HOW: Recalculate HMAC and compare with timing-safe equality
 */
export function validateTokenSignature(token: string, organizationId: string): boolean

/**
 * Hash a token for database lookup
 *
 * WHY: Never store raw tokens in database
 * HOW: HMAC-SHA256 with secret key
 */
export function hashToken(token: string): string
```

### Environment Variable

```env
LEAD_SESSION_TOKEN_SECRET=your-32-char-secret-here
```

---

## Cookie Configuration

### Location: `src/lib/lead-session/cookie.ts`

```typescript
export const LEAD_SESSION_COOKIE_NAME = 'mochi_lead_sid'

export interface CookieConfig {
  name: string
  value: string
  maxAge: number      // 10 years in seconds (315360000)
  path: string        // '/'
  sameSite: 'lax'
  secure: boolean     // true in production
  httpOnly: boolean   // true for server-set cookies
  domain?: string     // .mochi.test for subdomains
}
```

### Domain Strategy

| Scenario | Cookie Domain |
|----------|---------------|
| `acme.mochi.test` (subdomain) | `.mochi.test` (shared across org subdomains) |
| `webprodigies.com` (custom domain) | `webprodigies.com` (exact match) |
| `localhost` (development) | `null` (no domain restriction) |

---

## Service Layer

### Location: `src/services/lead-session.service.ts`

### Types

```typescript
export interface CreateSessionInput {
  organizationId: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  source?: string  // 'form', 'chatbot', 'manual', etc.
}

export interface CreateSessionResult {
  success: boolean
  token?: string      // Send this to client for cookie storage
  leadId?: string
  isNewLead?: boolean
  error?: string
}

export interface ValidateSessionInput {
  organizationId: string
  token: string
}

export interface ValidateSessionResult {
  valid: boolean
  leadId?: string
  lead?: {
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
  }
  error?: string
}
```

### Core Functions

```typescript
/**
 * Create or retrieve a session for a lead
 *
 * Flow:
 * 1. Find or create lead by email
 * 2. Check for existing session
 * 3. If exists, update lastSeenAt and return (token already with client)
 * 4. If not, create new session and return token
 */
export async function createSession(input: CreateSessionInput): Promise<CreateSessionResult>

/**
 * Validate a session token and get lead data
 *
 * Flow:
 * 1. Verify token signature matches organization
 * 2. Look up token hash in database
 * 3. Return lead data if valid
 */
export async function validateSession(input: ValidateSessionInput): Promise<ValidateSessionResult>

/**
 * Update lead data using a valid session
 */
export async function updateLeadFromSession(
  organizationId: string,
  token: string,
  updates: Partial<{ firstName: string; lastName: string; phone: string }>
): Promise<{ success: boolean; error?: string }>

/**
 * Get all sessions for a lead (for admin UI)
 */
export async function getLeadSessions(
  organizationId: string,
  leadId: string
): Promise<Array<{ id: string; source: string | null; lastSeenAt: Date; createdAt: Date }>>

/**
 * Delete a session (for admin or lead request)
 */
export async function deleteSession(
  organizationId: string,
  sessionId: string
): Promise<{ success: boolean }>
```

---

## tRPC Router

### Location: `src/trpc/routers/lead-session.ts`

### Public Endpoints (No Auth Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `create` | mutation | Create session, returns token for cookie |
| `validate` | query | Validate token, get lead data |
| `updateLead` | mutation | Update lead info with valid token |

### Protected Endpoints (Admin Only)

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `listForLead` | query | `leads:read` | List sessions for a lead |
| `delete` | mutation | `leads:update` | Delete a session |

---

## Client-Side Utilities

### Location: `src/lib/lead-session/client.ts`

```typescript
export const LEAD_SESSION_COOKIE_NAME = 'mochi_lead_sid'

/**
 * Get the current session token from cookie
 */
export function getSessionToken(): string | null

/**
 * Set the session token in cookie
 */
export function setSessionToken(token: string, options?: { domain?: string }): void

/**
 * Clear the session token cookie
 */
export function clearSessionToken(): void

/**
 * Check if we have an existing session
 */
export function hasSession(): boolean
```

---

## Embed Support (External Websites)

### Location: `src/lib/lead-session/embed.ts`

For external websites (chatbots, forms embedded via iframe), cookies may be blocked due to third-party cookie restrictions. This module handles cross-origin scenarios.

### Storage Strategy

1. **First-party context** (same domain): Use cookies
2. **Third-party context** (iframe embed): Use localStorage + postMessage

```typescript
/**
 * Get session token with cross-origin fallback
 *
 * Flow:
 * 1. Try cookie first
 * 2. Fall back to localStorage
 * 3. If in iframe, try postMessage to parent
 */
export function getEmbedSessionToken(): string | null

/**
 * Set session token with cross-origin fallback
 *
 * Flow:
 * 1. Set cookie (if allowed)
 * 2. Always set localStorage as backup
 */
export function setEmbedSessionToken(token: string): void
```

---

## React Hook

### Location: `src/hooks/use-lead-session.ts`

```typescript
/**
 * React Hook for Lead Session Management
 *
 * Use this in forms, chat widgets, etc. to identify leads.
 */
export function useLeadSession(organizationId: string) {
  return {
    isLoading: boolean,
    isIdentified: boolean,
    lead: { firstName, lastName, email, phone } | null,
    identify: (email: string, data?: { firstName?, lastName?, phone? }) => Promise<void>,
    updateLead: (updates: { firstName?, lastName?, phone? }) => Promise<void>,
    clearSession: () => void,
  }
}
```

---

## Usage Examples

### In a Form Component

```typescript
import { useLeadSession } from '@/hooks/use-lead-session'

function ContactForm({ organizationId }: { organizationId: string }) {
  const { identify, isIdentified, lead } = useLeadSession(organizationId)

  // Prefill form if already identified
  useEffect(() => {
    if (lead) {
      setFormData({
        firstName: lead.firstName || '',
        lastName: lead.lastName || '',
        email: lead.email,
        phone: lead.phone || '',
      })
    }
  }, [lead])

  const handleSubmit = async (data: FormData) => {
    // Identify the lead (creates session if new)
    await identify(data.email, {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
    })

    // Continue with form submission...
  }
}
```

### In Chat Widget

```typescript
import { useLeadSession } from '@/hooks/use-lead-session'

function ChatWidget({ organizationId }: { organizationId: string }) {
  const { isIdentified, lead, identify } = useLeadSession(organizationId)

  // Prefill welcome message if identified
  if (isIdentified && lead) {
    return <WelcomeBack name={lead.firstName} />
  }

  // Ask for email if not identified
  return <EmailCaptureForm onSubmit={(email) => identify(email)} />
}
```

### From External Embed Script

```typescript
// For use in external websites embedding Mochi widgets
class MochiEmbed {
  constructor(config: { organizationId: string }) {
    this.organizationId = config.organizationId
  }

  async identifyLead(email: string, data?: { firstName?: string }) {
    const result = await fetch(`${MOCHI_API}/trpc/leadSession.create`, {
      method: 'POST',
      body: JSON.stringify({
        organizationId: this.organizationId,
        email,
        ...data,
        source: 'embed',
      }),
    })

    if (result.success && result.token) {
      setEmbedSessionToken(result.token)
    }

    return result
  }
}

// Usage
const mochi = new MochiEmbed({ organizationId: 'org_xxx' })
await mochi.identifyLead('user@example.com', { firstName: 'John' })
```

---

## FormRenderer Integration

### Location: `src/components/form-builder/form-renderer.tsx`

The FormRenderer component has **built-in** lead session support. When you pass `organizationId`, it automatically:

1. **Detects lead fields** - Finds email, firstName, lastName, phone fields by element type
2. **Validates existing sessions** - Checks for returning visitors on mount
3. **Shows loading state** - Displays shimmer animation on lead fields while validating
4. **Prefills form fields** - Auto-populates fields for identified leads
5. **Identifies on submit** - Creates/updates lead session after successful submission

### Usage

```tsx
// Simply pass organizationId to enable lead session
<FormRenderer
  formId={formId}
  schema={schema}
  organizationId={organization.id}  // This enables lead session!
  showCanvas={true}
/>
```

### Field Detection

The FormRenderer automatically detects lead-related fields:

| Element Type | Detected As |
|--------------|-------------|
| `email` | Email field |
| `firstName` | First name field |
| `lastName` | Last name field |
| `phone` | Phone field |
| `text` with name containing "firstname" | First name field (fallback) |
| `text` with name containing "lastname" | Last name field (fallback) |

### Loading State

When validating a returning visitor's session, the detected lead fields show:
- **Shimmer animation** - Subtle gradient sweep effect
- **"Loading..." placeholder** - Indicates data is being fetched
- **Disabled state** - Prevents user input until prefill complete

---

## Integration Points

### Form Submission Service

The form submission service (`src/services/form-submission.service.ts`) should check for an existing session token and use the identified lead instead of creating a new one by email.

```typescript
// In processFormSubmission
const leadToken = input.metadata?.leadSessionToken
if (leadToken) {
  const validation = await validateSession({
    organizationId: form.organizationId,
    token: leadToken,
  })

  if (validation.valid && validation.leadId) {
    // Use existing lead instead of email lookup
    existingLead = await getLeadById(form.organizationId, validation.leadId)
  }
}
```

### Chat Widget

The chat widget should use `useLeadSession` to identify users and prefill their information.

---

## Security Considerations

1. **Token Opacity**: Tokens reveal nothing about the lead or organization
2. **HMAC Signature**: Tokens are cryptographically signed with organization binding
3. **Hash Storage**: Only token hashes are stored in database (never raw tokens)
4. **Timing-Safe Comparison**: Prevents timing attacks on signature validation
5. **Organization Scoping**: Tokens only valid for the organization they were created for
6. **HTTPS Only**: Cookies marked `Secure` in production

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LEAD_SESSION_TOKEN_SECRET` | Yes (production) | 32+ character secret for HMAC signing |

In development, falls back to deriving from `BETTER_AUTH_SECRET`.

---

## Additional Use Case: Chat Widget with Lead Session

This example demonstrates a complete chat widget implementation that uses the lead session system to:
- Recognize returning visitors
- Personalize the welcome message
- Prefill the email capture form
- Maintain session across page navigations

### File: `src/components/chat-widget/chat-widget-client.tsx`

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useLeadSession } from '@/hooks/use-lead-session'

interface ChatWidgetProps {
  organizationId: string
  widgetConfig: {
    welcomeMessage: string
    returningVisitorMessage: string
    primaryColor: string
  }
}

export function ChatWidgetClient({ organizationId, widgetConfig }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showEmailCapture, setShowEmailCapture] = useState(false)

  // Lead session hook - handles all session management
  const {
    isLoading,
    isIdentified,
    lead,
    leadId,
    identify,
    isIdentifying,
    error,
  } = useLeadSession(organizationId)

  // Determine which view to show
  const getView = () => {
    if (isLoading) return 'loading'
    if (isIdentified && lead) return 'chat'
    if (showEmailCapture) return 'email-capture'
    return 'welcome'
  }

  const view = getView()

  return (
    <div className="chat-widget">
      {/* Chat bubble button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ backgroundColor: widgetConfig.primaryColor }}
        className="chat-bubble"
      >
        💬
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="chat-panel">
          {/* Loading State */}
          {view === 'loading' && (
            <div className="chat-loading">
              <div className="spinner" />
              <p>Loading...</p>
            </div>
          )}

          {/* Welcome View - New Visitor */}
          {view === 'welcome' && (
            <div className="chat-welcome">
              <h3>{widgetConfig.welcomeMessage}</h3>
              <p>How can we help you today?</p>
              <button onClick={() => setShowEmailCapture(true)}>
                Start Chat
              </button>
            </div>
          )}

          {/* Email Capture View */}
          {view === 'email-capture' && (
            <EmailCaptureForm
              onSubmit={async (email, firstName) => {
                // Identify the lead - creates session cookie
                const success = await identify(email, {
                  firstName,
                  source: 'chatbot',
                })
                if (success) {
                  setShowEmailCapture(false)
                }
              }}
              isSubmitting={isIdentifying}
              error={error}
            />
          )}

          {/* Chat View - Returning Visitor */}
          {view === 'chat' && lead && (
            <div className="chat-main">
              <div className="chat-header">
                <h3>
                  {widgetConfig.returningVisitorMessage.replace(
                    '{name}',
                    lead.firstName || 'there'
                  )}
                </h3>
                <p className="text-sm text-gray-500">
                  {lead.email}
                </p>
              </div>

              {/* Chat messages would go here */}
              <ChatMessages leadId={leadId!} organizationId={organizationId} />

              {/* Message input */}
              <ChatInput leadId={leadId!} organizationId={organizationId} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Email Capture Form Component
 * Collects email and optional first name to identify the lead
 */
function EmailCaptureForm({
  onSubmit,
  isSubmitting,
  error,
}: {
  onSubmit: (email: string, firstName?: string) => Promise<void>
  isSubmitting: boolean
  error: string | null
}) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(email, firstName || undefined)
  }

  return (
    <form onSubmit={handleSubmit} className="email-capture-form">
      <h3>Start a conversation</h3>
      <p>Enter your details to begin chatting</p>

      <div className="form-field">
        <label htmlFor="firstName">Name (optional)</label>
        <input
          id="firstName"
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Your name"
          disabled={isSubmitting}
        />
      </div>

      <div className="form-field">
        <label htmlFor="email">Email *</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={isSubmitting}
        />
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      <button type="submit" disabled={isSubmitting || !email}>
        {isSubmitting ? 'Starting...' : 'Start Chat'}
      </button>
    </form>
  )
}
```

### Key Implementation Details

1. **Session Check on Mount**
   - `useLeadSession` automatically checks for existing session cookie
   - Shows loading state while validating
   - If valid session found, skips email capture entirely

2. **Personalized Experience**
   - Returning visitors see personalized greeting with their name
   - Email is displayed for confirmation
   - Chat history could be loaded using the `leadId`

3. **Session Creation**
   - When new visitor submits email, `identify()` is called
   - Session token is automatically stored in cookie
   - Visitor is now "identified" for future visits

4. **Source Tracking**
   - `source: 'chatbot'` is passed to track where session originated
   - Useful for analytics and lead attribution

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Chat Widget Opens                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Check for existing session cookie               │
│                    (useLeadSession)                          │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│   No Session Found      │     │    Valid Session Found      │
│   (New Visitor)         │     │    (Returning Visitor)      │
└─────────────────────────┘     └─────────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│   Show Welcome Screen   │     │  Show Personalized Chat     │
│   → Email Capture Form  │     │  "Welcome back, {name}!"    │
└─────────────────────────┘     └─────────────────────────────┘
              │
              ▼
┌─────────────────────────┐
│   User Submits Email    │
│   → identify() called   │
│   → Cookie stored       │
└─────────────────────────┘
              │
              ▼
┌─────────────────────────┐
│   Session Created       │
│   → Show Chat View      │
└─────────────────────────┘
```

### Benefits of This Approach

| Benefit | Description |
|---------|-------------|
| **Zero Friction for Returning Visitors** | No need to re-enter email - recognized instantly |
| **Persistent Across Pages** | Session survives page navigations and browser closes |
| **Cross-Feature Recognition** | Same lead identified in forms, chat, booking, etc. |
| **Privacy Compliant** | No PII stored in cookie - only opaque token |
| **Secure** | HMAC-signed tokens prevent tampering |

---

## Troubleshooting

### Session Not Persisting

1. **Check cookie settings** - Ensure `Secure` flag matches environment (HTTPS in production)
2. **Check domain** - Cookie domain should match or be parent of current domain
3. **Third-party cookies blocked** - Use localStorage fallback (`embed.ts`)

### Lead Not Being Prefilled

1. **Check field types** - Ensure form uses `firstName`, `lastName`, `email`, `phone` element types
2. **Check organizationId** - Must be passed to FormRenderer
3. **Check isLoading** - Wait for session validation to complete

### Token Validation Failing

1. **Check LEAD_SESSION_TOKEN_SECRET** - Must match between token creation and validation
2. **Check organizationId** - Token is bound to specific organization
3. **Check for token expiry** - Tokens don't expire, but lead may have been deleted
