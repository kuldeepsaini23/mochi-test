import { useState } from 'react'

interface RefundValidation {
  amount: string
  error: string | null
  setAmount: (value: string) => void
  resetAmount: () => void
}

export function useRefundValidation(maxAmountCents: number): RefundValidation {
  const [amount, setAmountInternal] = useState('')
  const [error, setError] = useState<string | null>(null)

  const validateAmount = (value: string): string | null => {
    if (!value || value === '') return null
    const numAmount = parseFloat(value)
    if (isNaN(numAmount)) return 'Invalid amount'
    if (numAmount <= 0) return 'Must be greater than $0'
    const maxDollars = maxAmountCents / 100
    if (numAmount > maxDollars) {
      return `Cannot exceed $${maxDollars.toFixed(2)}`
    }
    return null
  }

  const setAmount = (value: string) => {
    setAmountInternal(value)
    setError(validateAmount(value))
  }

  const resetAmount = () => {
    setAmountInternal('')
    setError(null)
  }

  return { amount, error, setAmount, resetAmount }
}
