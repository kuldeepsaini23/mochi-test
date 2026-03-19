/**
 * ============================================================================
 * WAIT FOR EVENT ACTION CONFIG
 * ============================================================================
 *
 * Configuration form for the "Wait for Event" action node.
 * Pauses the automation until a specific event occurs (e.g., appointment starts,
 * email opened, etc.).
 *
 * SUPPORTED EVENT TYPES:
 * - appointment_started: Waits until the booking's scheduled start time
 * - email_opened / email_clicked: (coming soon) Waits for email engagement
 *
 * SOURCE OF TRUTH: WaitForEventActionConfig, WaitForEventUI
 */

'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Hourglass, Loader2 } from 'lucide-react'
import type { WaitForEventActionConfig as WaitForEventConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Available event types with labels and descriptions */
const EVENT_TYPE_OPTIONS = [
  { value: 'appointment_started', label: 'Appointment Started', description: 'Waits until the booking start time' },
  { value: 'email_opened', label: 'Email Opened', description: 'Coming soon' },
  { value: 'email_clicked', label: 'Email Clicked', description: 'Coming soon' },
] as const

/** Timeout action options */
const TIMEOUT_ACTION_OPTIONS = [
  { value: 'continue', label: 'Continue' },
  { value: 'stop', label: 'Stop' },
] as const

// ============================================================================
// TYPES
// ============================================================================

interface ActionWaitForEventConfigProps {
  config: WaitForEventConfig
  onChange: (config: WaitForEventConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionWaitForEventConfig({
  config,
  onChange,
  errors,
}: ActionWaitForEventConfigProps) {
  const { organizationId } = useAutomationBuilder()
  const { calendars, isLoading } = useAutomationBuilderData(organizationId)

  /** Handle event type change — resets type-specific fields */
  const handleEventTypeChange = (eventType: string) => {
    const typedEventType = eventType as WaitForEventConfig['eventType']

    // Reset type-specific fields when switching event types
    onChange({
      ...config,
      eventType: typedEventType,
      // Clear appointment fields when switching away from appointment
      ...(typedEventType !== 'appointment_started' && {
        calendarId: undefined,
        calendarName: undefined,
      }),
      // Clear email fields when switching away from email
      ...(typedEventType === 'appointment_started' && {
        sourceEmailNodeId: undefined,
        sourceEmailNodeLabel: undefined,
      }),
    })
  }

  /** Handle calendar selection for appointment events */
  const handleCalendarChange = (calendarId: string) => {
    if (calendarId === 'any') {
      onChange({ ...config, calendarId: undefined, calendarName: undefined })
    } else {
      const calendar = calendars?.find((c) => c.id === calendarId)
      onChange({ ...config, calendarId, calendarName: calendar?.name })
    }
  }

  /** Handle timeout hours change */
  const handleTimeoutChange = (value: string) => {
    const hours = parseInt(value, 10)
    if (!isNaN(hours) && hours >= 0) {
      onChange({ ...config, timeoutHours: hours || undefined })
    } else if (value === '') {
      onChange({ ...config, timeoutHours: undefined })
    }
  }

  /** Handle timeout action change */
  const handleTimeoutActionChange = (action: string) => {
    onChange({ ...config, timeoutAction: action as WaitForEventConfig['timeoutAction'] })
  }

  /** Whether the selected event type is an email event (not yet implemented) */
  const isEmailEvent = config.eventType === 'email_opened' || config.eventType === 'email_clicked'

  return (
    <div className="space-y-4">
      {/* Event Type selector */}
      <div className="space-y-1">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium shrink-0">Event</span>
          <div className="flex-1 flex justify-end">
            <Select
              value={config.eventType}
              onValueChange={handleEventTypeChange}
            >
              <SelectTrigger className="h-9 w-auto min-w-[180px] rounded-xl bg-accent dark:bg-background/20 border-0 text-sm gap-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {errors?.eventType && (
          <p className="text-xs text-destructive pl-20">{errors.eventType}</p>
        )}
      </div>

      {/* Appointment-specific config: Calendar selector */}
      {config.eventType === 'appointment_started' && (
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
      )}

      {/* Email events — coming soon placeholder */}
      {isEmailEvent && (
        <div className="flex flex-col items-center justify-center py-4 px-4 text-center">
          <div className="h-8 w-8 rounded-xl bg-accent dark:bg-background/20 flex items-center justify-center mb-2">
            <Hourglass className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground max-w-[220px]">
            Email tracking events are coming soon. Use &quot;Appointment Started&quot; for now.
          </p>
        </div>
      )}

      {/* Timeout settings — only show for appointment events since they have a natural deadline */}
      {config.eventType === 'appointment_started' && (
        <div className="space-y-2">
          <span className="text-sm font-medium">Timeout</span>
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              min={0}
              placeholder="72"
              value={config.timeoutHours ?? ''}
              onChange={(e) => handleTimeoutChange(e.target.value)}
              className="h-9 w-20 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm"
            />
            <span className="text-sm text-muted-foreground">hours, then</span>
            <Select
              value={config.timeoutAction ?? 'continue'}
              onValueChange={handleTimeoutActionChange}
            >
              <SelectTrigger className="h-9 w-auto min-w-[100px] rounded-xl bg-accent dark:bg-background/20 border-0 text-sm gap-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEOUT_ACTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {errors?.timeoutHours && (
            <p className="text-xs text-destructive">{errors.timeoutHours}</p>
          )}
          <p className="text-xs text-muted-foreground">
            If the event doesn&apos;t occur within this time, the automation will {config.timeoutAction === 'stop' ? 'stop' : 'continue to the next step'}.
          </p>
        </div>
      )}

      {/* Info note about how wait works */}
      {config.eventType === 'appointment_started' && (
        <p className="text-xs text-muted-foreground">
          Pauses the automation until the appointment&apos;s scheduled start time. Use after an &quot;Appointment Scheduled&quot; trigger to perform actions right when the meeting begins.
        </p>
      )}
    </div>
  )
}
