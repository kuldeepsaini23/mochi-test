/**
 * Booking Calendars Management Page
 *
 * WHY: Allows users to create and manage multiple booking calendar types
 * ROUTE: /calendar/booking (protected, requires calendar:read permission)
 *
 * SOURCE OF TRUTH KEYWORDS: BookingCalendar, CalendarManagement, Appointments
 */

import { BookingCalendarsContent } from './_components/booking-calendars-content'

export default function BookingCalendarsPage() {
  return <BookingCalendarsContent />
}
