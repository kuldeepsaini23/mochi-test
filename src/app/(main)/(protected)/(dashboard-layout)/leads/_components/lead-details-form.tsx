/**
 * Lead Details Form Component
 * Unified form for create/edit lead
 */

'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { Loader2 } from 'lucide-react'
import { PhoneNumberInput } from '@/components/shared/phone-input'
import { CountrySelect } from '@/components/shared/country-select'
import type { LeadStatus } from '@/generated/prisma'
import type { LeadWithRelations } from './leads-table'

const leadFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  source: z.string().optional(),
  // Address fields
  address: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  status: z.enum(['LEAD', 'PROSPECT', 'ACTIVE', 'INACTIVE']),
})

type LeadFormData = z.infer<typeof leadFormSchema>

interface LeadDetailsFormProps {
  lead: LeadWithRelations | null
  onSubmit?: (data: LeadFormData) => void
  isSubmitting?: boolean
  mode: 'create' | 'edit' | 'view'
  disabled?: boolean
}

export function LeadDetailsForm({
  lead,
  onSubmit,
  isSubmitting,
  mode,
  disabled = false,
}: LeadDetailsFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      firstName: lead?.firstName || '',
      lastName: lead?.lastName || '',
      email: lead?.email || '',
      phone: lead?.phone || '',
      source: lead?.source || '',
      address: lead?.address || '',
      address2: lead?.address2 || '',
      city: lead?.city || '',
      state: lead?.state || '',
      zipCode: lead?.zipCode || '',
      country: lead?.country || '',
      status: (lead?.status as LeadStatus) || 'LEAD',
    },
  })

  /**
   * Reset form when lead changes
   * WHY: Ensures form displays correct data when switching between leads
   * NOTE: Applies to both 'edit' and 'view' modes - view mode still needs
   *       the form values to update when the lead changes
   */
  useEffect(() => {
    if (lead && (mode === 'edit' || mode === 'view')) {
      reset({
        firstName: lead.firstName || '',
        lastName: lead.lastName || '',
        email: lead.email || '',
        phone: lead.phone || '',
        source: lead.source || '',
        address: lead.address || '',
        address2: lead.address2 || '',
        city: lead.city || '',
        state: lead.state || '',
        zipCode: lead.zipCode || '',
        country: lead.country || '',
        status: lead.status as LeadStatus,
      })
    }
  }, [lead, mode, reset])

  const currentStatus = watch('status')
  const currentPhone = watch('phone')
  const currentCountry = watch('country')

  const handleFormSubmit = (data: LeadFormData) => {
    if (onSubmit) {
      onSubmit(data)
    }
  }

  // Show save button in create mode (always), or in edit mode when dirty and not disabled
  const showSaveButton = !disabled && (mode === 'create' || isDirty)

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <Accordion type="multiple" defaultValue={['information']} className="w-full">
          {/* Information Section */}
          <AccordionItem value="information" className="border-0">
            <AccordionTrigger className="px-6 py-4 hover:no-underline text-sm font-medium">
              Information
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <div className="space-y-4">
                {/* First Name */}
                <div className="space-y-2">
                  <Label htmlFor="firstName">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    {...register('firstName')}
                    placeholder="Enter first name"
                  />
                  {errors.firstName && (
                    <p className="text-xs text-destructive">{errors.firstName.message}</p>
                  )}
                </div>

                {/* Last Name */}
                <div className="space-y-2">
                  <Label htmlFor="lastName">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    {...register('lastName')}
                    placeholder="Enter last name"
                  />
                  {errors.lastName && (
                    <p className="text-xs text-destructive">{errors.lastName.message}</p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="contact@example.com"
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                {/* Phone */}
                <PhoneNumberInput
                  id="phone"
                  label="Phone"
                  value={currentPhone || ''}
                  onChange={(value) => setValue('phone', value, { shouldDirty: true })}
                />

                {/* Source */}
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Input
                    id="source"
                    {...register('source')}
                    placeholder="Website, Referral, etc."
                  />
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <Label htmlFor="status">
                    Status <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={currentStatus}
                    onValueChange={(value) => setValue('status', value as LeadStatus, { shouldDirty: true })}
                  >
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LEAD">Lead</SelectItem>
                      <SelectItem value="PROSPECT">Prospect</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Address Section */}
          <AccordionItem value="address" className="border-0">
            <AccordionTrigger className="px-6 py-4 hover:no-underline text-sm font-medium">
              Address
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <div className="space-y-4">
                {/* Country */}
                <CountrySelect
                  id="country"
                  label="Country"
                  value={currentCountry || ''}
                  onValueChange={(value) => setValue('country', value, { shouldDirty: true })}
                />

                {/* Address Line 1 */}
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    {...register('address')}
                    placeholder="Street address"
                  />
                </div>

                {/* Address Line 2 */}
                <div className="space-y-2">
                  <Label htmlFor="address2">Address Line 2</Label>
                  <Input
                    id="address2"
                    {...register('address2')}
                    placeholder="Apartment, suite, unit, etc."
                  />
                </div>

                {/* City and State */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      {...register('city')}
                      placeholder="City"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State / Province</Label>
                    <Input
                      id="state"
                      {...register('state')}
                      placeholder="State"
                    />
                  </div>
                </div>

                {/* Zip Code */}
                <div className="space-y-2">
                  <Label htmlFor="zipCode">Zip / Postal Code</Label>
                  <Input
                    id="zipCode"
                    {...register('zipCode')}
                    placeholder="Zip code"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Save/Cancel Buttons */}
      {showSaveButton && (
        <>
          <Separator />
          <div className="p-4 flex justify-end gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Create Lead' : 'Save Changes'}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}
