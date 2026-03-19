# Realtime Architecture

> **SOURCE OF TRUTH KEYWORDS:** RealtimeArchitecture, RealtimePubSub, RealtimeEvents, SSE

This document explains how realtime events are implemented in the application using `@upstash/realtime` for true pub/sub via Redis Streams + Server-Sent Events (SSE).

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [File Structure](#file-structure)
4. [Core Components](#core-components)
5. [Event Schema](#event-schema)
6. [Server-Side: Emitting Events](#server-side-emitting-events)
7. [Client-Side: Subscribing to Events](#client-side-subscribing-to-events)
8. [Data Flow Examples](#data-flow-examples)
9. [Adding New Events](#adding-new-events)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The application uses **@upstash/realtime** for production-grade realtime event delivery. This provides:

- **True pub/sub** - No polling. Events are pushed instantly via Redis Streams
- **SSE (Server-Sent Events)** - One-way server-to-client communication over HTTP
- **Type-safe** - Zod schemas define event payloads with full TypeScript inference
- **Serverless-compatible** - Works with Next.js edge/serverless functions
- **Zero infrastructure** - Upstash manages Redis scaling automatically

### Why SSE over WebSockets?

| Feature | SSE (Our Choice) | WebSockets |
|---------|------------------|------------|
| Direction | Server → Client (one-way) | Bidirectional |
| Complexity | Simple, HTTP-based | More complex, persistent connection |
| Serverless | Native support | Requires persistent server |
| Use Case | Notifications, status updates | Live typing, collaborative editing |

For inbox notifications, chat messages, and status updates, SSE is the right choice.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVER SIDE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐ │
│  │ Webhook Handler │    │ Service Layer   │    │ tRPC Mutation           │ │
│  │ (Resend emails) │    │ (inbox.service) │    │ (send message)          │ │
│  └────────┬────────┘    └────────┬────────┘    └────────────┬────────────┘ │
│           │                      │                          │              │
│           └──────────────────────┼──────────────────────────┘              │
│                                  │                                          │
│                                  ▼                                          │
│                    ┌─────────────────────────┐                             │
│                    │   realtime.emit()       │                             │
│                    │   (src/lib/realtime.ts) │                             │
│                    └────────────┬────────────┘                             │
│                                 │                                          │
└─────────────────────────────────┼──────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │    UPSTASH REDIS        │
                    │    (Redis Streams)      │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  /api/realtime (SSE)    │
                    │  Route Handler          │
                    └────────────┬────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                                ▼                              CLIENT SIDE   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    ┌─────────────────────────┐                             │
│                    │   RealtimeProvider      │                             │
│                    │   (app/layout.tsx)      │                             │
│                    └────────────┬────────────┘                             │
│                                 │                                          │
│                                 ▼                                          │
│                    ┌─────────────────────────┐                             │
│                    │   useRealtime() hook    │                             │
│                    │   (realtime-client.ts)  │                             │
│                    └────────────┬────────────┘                             │
│                                 │                                          │
│           ┌─────────────────────┼─────────────────────┐                    │
│           ▼                     ▼                     ▼                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │ Inbox Component │  │ Chat Widget     │  │ Other Components│            │
│  │ (invalidate     │  │ (show new msg)  │  │ (react to       │            │
│  │  queries)       │  │                 │  │  events)        │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── lib/
│   ├── redis.ts              # Upstash Redis client (singleton)
│   ├── realtime.ts           # Realtime instance + Zod event schema (SERVER)
│   └── realtime-client.ts    # Typed useRealtime hook (CLIENT)
│
├── app/
│   ├── layout.tsx            # Wraps app with RealtimeProviderWrapper
│   └── api/
│       └── realtime/
│           └── route.ts      # SSE endpoint handler
│
├── components/
│   └── realtime-provider-wrapper.tsx  # Client component wrapper for RealtimeProvider
│
└── services/
    ├── inbox.service.ts              # Uses realtime.emit() for chat events
    ├── chat-widget-messaging.service.ts  # Uses realtime.emit() for widget events
    └── resend-webhook.service.ts     # Uses realtime.emit() for email events
```

---

## Core Components

### 1. Redis Client (`src/lib/redis.ts`)

Simple Upstash Redis client singleton. Used by the Realtime instance.

```typescript
import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})
```

### 2. Realtime Instance (`src/lib/realtime.ts`)

Defines the event schema with Zod and creates the Realtime instance.

```typescript
import { Realtime, InferRealtimeEvents } from '@upstash/realtime'
import { redis } from './redis'
import { z } from 'zod'

// Define event schema with Zod
const schema = {
  inbox: {
    emailReceived: z.object({
      organizationId: z.string(),
      conversationId: z.string(),
      // ... more fields
    }),
    chatReceived: z.object({ /* ... */ }),
    // ... more events
  },
  leads: { /* ... */ },
  notifications: { /* ... */ },
}

// Create realtime instance
export const realtime = new Realtime({ schema, redis })

// Export types for client-side usage
export type RealtimeEvents = InferRealtimeEvents<typeof realtime>
```

### 3. SSE Route Handler (`src/app/api/realtime/route.ts`)

Handles SSE connections from clients.

```typescript
import { handle } from '@upstash/realtime'
import { realtime } from '@/lib/realtime'

export const GET = handle({ realtime })
```

### 4. Client Hook (`src/lib/realtime-client.ts`)

Creates typed `useRealtime` hook for React components.

```typescript
'use client'

import { createRealtime } from '@upstash/realtime/client'
import type { RealtimeEvents } from './realtime'

export const { useRealtime } = createRealtime<RealtimeEvents>()
```

### 5. Provider Wrapper (`src/components/realtime-provider-wrapper.tsx`)

Client component wrapper required because `RealtimeProvider` uses React context.

```typescript
'use client'

import { RealtimeProvider } from '@upstash/realtime/client'

export function RealtimeProviderWrapper({ children }: { children: React.ReactNode }) {
  return <RealtimeProvider>{children}</RealtimeProvider>
}
```

---

## Event Schema

All events are defined in `src/lib/realtime.ts` using Zod schemas.

### Current Events

| Event Name | Description | Emitted By |
|------------|-------------|------------|
| `inbox.emailReceived` | New inbound email from a lead | `resend-webhook.service.ts` |
| `inbox.emailSent` | Outbound email sent by team | (not currently used) |
| `inbox.emailStatusChanged` | Email status update (delivered, opened, bounced) | `resend-webhook.service.ts` |
| `inbox.chatReceived` | Chat message from widget visitor | `chat-widget-messaging.service.ts` |
| `inbox.chatSent` | Chat reply from team to visitor | `inbox.service.ts` (chat widget subscribes for instant updates) |
| `inbox.conversationUpdated` | Conversation metadata changed | (not currently used) |
| `leads.created` | New lead created | (not currently used) |
| `leads.updated` | Lead info updated | (not currently used) |
| `notifications.created` | New notification | (not currently used) |
| `notifications.read` | Notification marked as read | (not currently used) |

### Event Naming Convention

Events use dot notation: `domain.eventName`

- `inbox.emailReceived` - Inbox domain, email received event
- `leads.created` - Leads domain, created event

---

## Server-Side: Emitting Events

To emit an event from the server (services, API routes, webhooks):

```typescript
import { realtime } from '@/lib/realtime'

// Emit an event - all fields are type-checked via Zod schema
await realtime.emit('inbox.emailReceived', {
  organizationId: 'org_123',
  conversationId: 'conv_456',
  messageId: 'msg_789',
  leadId: 'lead_abc',
  lead: {
    id: 'lead_abc',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    avatarUrl: null,
  },
  preview: 'Hey, I have a question about...',
  subject: 'Support Request',
})
```

### Important Notes

1. **Always await** - `realtime.emit()` returns a Promise
2. **Include organizationId** - Clients filter events by organization
3. **Type-safe** - TypeScript will error if payload doesn't match schema

---

## Client-Side: Subscribing to Events

To subscribe to events in a React component:

```typescript
'use client'

import { useRealtime } from '@/lib/realtime-client'

function MyComponent({ organizationId }: { organizationId: string }) {
  useRealtime({
    // List of events to subscribe to
    events: [
      'inbox.emailReceived',
      'inbox.chatReceived',
      'inbox.emailStatusChanged',
    ],

    // Callback when any subscribed event fires
    onData({ event, data }) {
      // Filter by organization - events are global!
      if (data.organizationId !== organizationId) return

      switch (event) {
        case 'inbox.emailReceived':
          console.log('New email:', data.conversationId)
          // Invalidate queries, show notification, etc.
          break

        case 'inbox.chatReceived':
          console.log('New chat:', data.preview)
          break

        case 'inbox.emailStatusChanged':
          console.log('Status changed:', data.status)
          break
      }
    },
  })

  return <div>...</div>
}
```

### Important Notes

1. **Filter by organizationId** - Events are broadcast globally, you must filter
2. **Events array** - Only subscribe to events you need
3. **No cleanup needed** - The hook handles subscription cleanup automatically

---

## Data Flow Examples

### Example 1: Inbound Email Notification

```
1. Lead sends email to emmanuel@quaacko.com
                    │
                    ▼
2. Resend receives email, fires webhook to /api/webhooks/resend
                    │
                    ▼
3. resend-webhook.service.ts processes webhook
   - Creates/finds lead
   - Records message in database
   - Calls: await realtime.emit('inbox.emailReceived', {...})
                    │
                    ▼
4. Event published to Upstash Redis Stream
                    │
                    ▼
5. /api/realtime SSE endpoint pushes to connected clients
                    │
                    ▼
6. Inbox component's useRealtime hook receives event
   - Filters by organizationId
   - Invalidates React Query cache
   - UI updates instantly showing new email
```

### Example 2: Chat Widget Message

```
1. Visitor types message in chat widget
                    │
                    ▼
2. Widget calls /api/chat-widget/message endpoint
                    │
                    ▼
3. chat-widget-messaging.service.ts processes message
   - Records in database
   - Calls: await realtime.emit('inbox.chatReceived', {...})
                    │
                    ▼
4. Event published to Upstash Redis Stream
                    │
                    ▼
5. Team member viewing inbox receives event instantly
   - Inbox refreshes to show new chat message
   - Can respond immediately
```

---

## Adding New Events

### Step 1: Add to Schema

Edit `src/lib/realtime.ts`:

```typescript
const schema = {
  // ... existing events

  // Add new domain or event
  tickets: {
    created: z.object({
      organizationId: z.string(),
      ticketId: z.string(),
      title: z.string(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']),
    }),

    statusChanged: z.object({
      organizationId: z.string(),
      ticketId: z.string(),
      oldStatus: z.string(),
      newStatus: z.string(),
    }),
  },
}
```

### Step 2: Emit from Server

In your service or API route:

```typescript
import { realtime } from '@/lib/realtime'

await realtime.emit('tickets.created', {
  organizationId: 'org_123',
  ticketId: 'ticket_456',
  title: 'Bug Report: Login fails',
  priority: 'high',
})
```

### Step 3: Subscribe from Client

In your React component:

```typescript
useRealtime({
  events: ['tickets.created', 'tickets.statusChanged'],
  onData({ event, data }) {
    if (data.organizationId !== organizationId) return

    if (event === 'tickets.created') {
      // Show notification, refresh list, etc.
    }
  },
})
```

---

## Troubleshooting

### Events not being received

1. **Check RealtimeProvider** - Ensure `RealtimeProviderWrapper` is in `app/layout.tsx`
2. **Check SSE endpoint** - Visit `/api/realtime` in browser, should show SSE stream
3. **Check Redis connection** - Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars
4. **Check organizationId filter** - Events are global, ensure you're filtering correctly

### TypeScript errors

1. **Event name typo** - Event names are type-checked, ensure exact match
2. **Missing payload field** - All required Zod fields must be included
3. **Wrong payload type** - Check Zod schema for correct types

### SSE connection issues

1. **Check browser dev tools** - Network tab should show `/api/realtime` as EventStream
2. **Check for CORS** - Ensure proper headers if cross-origin
3. **Check serverless timeout** - SSE connections are long-lived, ensure platform supports it

---

## Environment Variables

Required environment variables for realtime to work:

```env
# Upstash Redis (required)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

---

## Performance Considerations

1. **Event size** - Keep payloads small (< 1KB ideally)
2. **Event frequency** - Don't emit for every keystroke, batch when possible
3. **Client filtering** - Filter by organizationId early to avoid unnecessary processing
4. **Query invalidation** - Be specific with query keys to avoid over-fetching

---

## Related Documentation

- [@upstash/realtime docs](https://upstash.com/docs/realtime)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Redis Streams](https://redis.io/docs/data-types/streams/)
