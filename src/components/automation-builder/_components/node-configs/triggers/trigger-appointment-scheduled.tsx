/**
 * ============================================================================
 * APPOINTMENT SCHEDULED TRIGGER CONFIG
 * ============================================================================
 *
 * Configuration form for the "Appointment Scheduled" trigger.
 * Fires when an appointment is booked through a booking calendar.
 *
 * SOURCE OF TRUTH: AppointmentScheduledTriggerConfig
 */

'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { AppointmentScheduledTriggerConfig as AppointmentScheduledConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// TYPES
// ============================================================================

interface TriggerAppointmentScheduledConfigProps {
  config: AppointmentScheduledConfig
  onChange: (config: AppointmentScheduledConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TriggerAppointmentScheduledConfig({
  config,
  onChange,
}: TriggerAppointmentScheduledConfigProps) {
  const { organizationId } = useAutomationBuilder()
  const { calendars, isLoading } = useAutomationBuilderData(organizationId)

  /** Handle calendar selection — updates both calendarId and calendarName */
  const handleCalendarChange = (calendarId: string) => {
    if (calendarId === 'any') {
      onChange({ ...config, calendarId: undefined, calendarName: undefined })
    } else {
      const calendar = calendars?.find((c) => c.id === calendarId)
      onChange({ ...config, calendarId, calendarName: calendar?.name })
    }
  }

  return (
    <div className="space-y-4">
      {/* Calendar — inline row */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium shrink-0">Calendar</span>
        <div className="flex-1 flex justify-end">
          <Select
            value={config.calendarId ?? 'any'}
            onValueChange={handleCalendarChange}
            disabled={isLoading}
          >
            <SelectTrigger className="h-9 w-auto min-w-[140px] rounded-xl bg-accent dark:bg-background/20 border-0 text-sm gap-2">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-muted-foreground text-sm">Loading...</span>
                </div>
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any calendar</SelectItem>
              {calendars?.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Available data — compact pills */}
      <div>
        <span className="text-sm font-medium">Available data</span>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[
            'appointment.title',
            'appointment.startTime',
            'appointment.endTime',
            'calendar.name',
            'lead.email',
            'lead.firstName',
          ].map((v) => (
            <code key={v} className="text-[11px] px-2 py-1 bg-accent dark:bg-background/20 rounded-lg text-muted-foreground">
              {`{{trigger.${v}}}`}
            </code>
          ))}
        </div>
      </div>
    </div>
  )
}
