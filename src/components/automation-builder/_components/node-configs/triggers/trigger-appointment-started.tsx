/**
 * ============================================================================
 * APPOINTMENT STARTED TRIGGER CONFIG
 * ============================================================================
 *
 * Configuration form for the "Appointment Started" trigger.
 * Fires when an appointment's start time is reached.
 *
 * SOURCE OF TRUTH: AppointmentStartedTriggerConfig
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
import type { AppointmentStartedTriggerConfig as AppointmentStartedConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// TYPES
// ============================================================================

interface TriggerAppointmentStartedConfigProps {
  config: AppointmentStartedConfig
  onChange: (config: AppointmentStartedConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TriggerAppointmentStartedConfig({
  config,
  onChange,
}: TriggerAppointmentStartedConfigProps) {
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

      {/* Timing note — subtle info pill */}
      <p className="text-xs text-muted-foreground">
        Triggers when the scheduled start time is reached.
      </p>

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
