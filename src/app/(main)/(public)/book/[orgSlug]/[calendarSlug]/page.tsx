/**
 * Public Booking Page
 *
 * WHY: Allows external users to book appointments on public booking calendars
 * ROUTE: /book/[orgSlug]/[calendarSlug] (public, no auth required)
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, PublicBooking, Appointments
 */

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createCaller } from '@/trpc/server'
import { BookingClient } from './_components/booking-client'
import { BookingSkeleton } from './_components/booking-skeleton'

interface PageProps {
  params: Promise<{
    orgSlug: string
    calendarSlug: string
  }>
}

export default async function BookingPage({ params }: PageProps) {
  const { orgSlug, calendarSlug } = await params

  // Fetch public booking calendar data via tRPC
  const api = await createCaller()
  let calendarData
  try {
    calendarData = await api.bookingCalendar.getPublicCalendar({
      organizationSlug: orgSlug,
      calendarSlug: calendarSlug,
    })
  } catch {
    notFound()
  }

  if (!calendarData) {
    notFound()
  }

  return (
    <Suspense fallback={<BookingSkeleton />}>
      <BookingClient
        organization={calendarData.organization}
        calendar={calendarData.calendar}
      />
    </Suspense>
  )
}
