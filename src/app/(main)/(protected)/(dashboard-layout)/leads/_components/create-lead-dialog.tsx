/**
 * Create Lead Dialog
 * Sheet that opens from the "Add Lead" button
 */

'use client'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { LeadDetailsForm } from './lead-details-form'

interface CreateLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: any) => void
  isSubmitting?: boolean
}

export function CreateLeadDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: CreateLeadDialogProps) {
  const handleSuccess = (data: any) => {
    onSubmit(data)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col border-border/40"
      >
        {/* Hidden header for accessibility */}
        <SheetHeader className="sr-only">
          <SheetTitle>Create New Lead</SheetTitle>
        </SheetHeader>

        {/* Header */}
        <div className="px-6 py-5 border-b">
          <h2 className="text-lg font-semibold">Create New Lead</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add a new lead to your organization
          </p>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto">
          <LeadDetailsForm
            lead={null}
            onSubmit={handleSuccess}
            isSubmitting={isSubmitting}
            mode="create"
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
