/**
 * Organization Booking Page
 *
 * WHY: Lists all active booking calendars for an organization
 * ROUTE: /book/[orgSlug] (public, no auth required)
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, PublicBooking, CalendarList
 */

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createCaller } from '@/trpc/server'
import { CalendarListClient } from './_components/calendar-list-client'
import { CalendarListSkeleton } from './_components/calendar-list-skeleton'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function OrganizationBookingPage({ params }: PageProps) {
  const { orgSlug } = await params

  // Fetch public booking calendars for this organization
  const api = await createCaller()
  let data
  try {
    data = await api.bookingCalendar.getPublicCalendars({ organizationSlug: orgSlug })
  } catch {
    notFound()
  }

  if (!data) {
    notFound()
  }

  return (
    <Suspense fallback={<CalendarListSkeleton />}>
      <CalendarListClient
        organization={data.organization}
        calendars={data.calendars}
        orgSlug={orgSlug}
      />
    </Suspense>
  )
}
