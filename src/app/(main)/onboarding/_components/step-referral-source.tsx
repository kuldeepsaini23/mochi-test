'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const referralSchema = z.object({
  referralSource: z.string().min(1, 'Please select how you heard about us'),
})

type ReferralFormData = z.infer<typeof referralSchema>

interface StepReferralSourceProps {
  value: string
  onChange: (data: { referralSource: string }) => void
  onNext: () => void
}

const referralOptions = [
  {
    value: 'search',
    label: 'Search Engine',
    description: 'Google, Bing, etc.',
  },
  {
    value: 'social',
    label: 'Social Media',
    description: 'Twitter, LinkedIn, etc.',
  },
  {
    value: 'friend',
    label: 'Friend or Colleague',
    description: 'Word of mouth',
  },
  {
    value: 'blog',
    label: 'Blog or Article',
    description: 'Online publication',
  },
  { value: 'advertisement', label: 'Advertisement', description: 'Paid ads' },
  { value: 'other', label: 'Other', description: 'Something else' },
]

export function StepReferralSource({
  value,
  onChange,
  onNext,
}: StepReferralSourceProps) {
  const {
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<ReferralFormData>({
    resolver: zodResolver(referralSchema),
    mode: 'onChange',
    values: {
      referralSource: value,
    },
  })

  const handleSelection = (newValue: string) => {
    setValue('referralSource', newValue, { shouldValidate: true })
    onChange({ referralSource: newValue })
  }

  const onSubmit = () => {
    onNext()
  }

  // Check if form is valid based on the value prop
  const isFormValid = value && value.trim() !== ''

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            How did you hear about us?
          </h2>
          <p className="text-sm text-muted-foreground">
            Help us understand how you discovered our platform
          </p>
        </div>

        <div className="space-y-2">
          {referralOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelection(option.value)}
              className={cn(
                'w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-all bg-linear-to-br from-muted/50 to-muted border-t-2 border-t-accent dark:border-b dark:border-b-border/50',
                'hover:bg-accent/50 hover:cursor-pointer',
                value === option.value ? ' bg-accent' : 'border-border'
              )}
            >
              <div
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border mt-0.5 ',
                  value === option.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30'
                )}
              >
                {value === option.value && <Check className="h-3 w-3" />}
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-muted-foreground">
                  {option.description}
                </div>
              </div>
            </button>
          ))}
        </div>
        {errors.referralSource && (
          <p className="text-sm text-destructive text-center">
            {errors.referralSource.message}
          </p>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={!isFormValid}
          className="w-full sm:w-auto"
        >
          Continue
        </Button>
      </div>
    </form>
  )
}
