/**
 * ============================================================================
 * PAYMENT COMPLETED TRIGGER CONFIG
 * ============================================================================
 *
 * Configuration form for the "Payment Completed" trigger.
 * Primary filter: price ID (most specific — identifies exactly what was purchased).
 * Secondary filter: product ID (broader — matches any price under the product).
 * Optional filters: minimum amount, currency.
 *
 * The product→price relationship mirrors the pipeline→stage pattern:
 * selecting a product reveals its prices in a child dropdown.
 *
 * SOURCE OF TRUTH: PaymentCompletedTriggerConfig
 */

'use client'

import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { PaymentCompletedTriggerConfig as PaymentCompletedConfig } from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'

// ============================================================================
// TYPES
// ============================================================================

interface TriggerPaymentCompletedConfigProps {
  config: PaymentCompletedConfig
  onChange: (config: PaymentCompletedConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TriggerPaymentCompletedConfig({
  config,
  onChange,
  errors,
}: TriggerPaymentCompletedConfigProps) {
  const { organizationId } = useAutomationBuilder()
  const { products, isLoading } = useAutomationBuilderData(organizationId)

  /** Find the currently selected product so we can show its prices */
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === config.productId)
  }, [config.productId, products])

  /**
   * Handle product selection. Selecting a product clears any previously
   * selected price since the old price may not belong to the new product.
   */
  const handleProductChange = (productId: string) => {
    if (productId === 'any') {
      onChange({
        ...config,
        productId: undefined,
        productName: undefined,
        priceId: undefined,
        priceName: undefined,
      })
    } else {
      const product = products.find((p) => p.id === productId)
      onChange({
        ...config,
        productId,
        productName: product?.name,
        priceId: undefined,
        priceName: undefined,
      })
    }
  }

  /**
   * Handle price selection within the selected product.
   * Price ID is the most specific filter — it identifies exactly what was purchased.
   */
  const handlePriceChange = (priceId: string) => {
    if (priceId === 'any') {
      onChange({
        ...config,
        priceId: undefined,
        priceName: undefined,
      })
    } else {
      const price = selectedProduct?.prices.find((p) => p.id === priceId)
      onChange({
        ...config,
        priceId,
        priceName: price?.name,
      })
    }
  }

  /** Shared select trigger classes */
  const selectClasses = 'h-9 w-auto min-w-[140px] rounded-xl bg-accent dark:bg-background/20 border-0 text-sm gap-2'

  return (
    <div className="space-y-4">
      {/* Product — inline row */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium shrink-0">Product</span>
        <div className="flex-1 flex justify-end">
          <Select
            value={config.productId ?? 'any'}
            onValueChange={handleProductChange}
            disabled={isLoading}
          >
            <SelectTrigger className={selectClasses}>
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
              <SelectItem value="any">Any product</SelectItem>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Price — inline row, only shown when a product is selected */}
      {selectedProduct && selectedProduct.prices.length > 0 && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium shrink-0">Price</span>
          <div className="flex-1 flex justify-end">
            <Select
              value={config.priceId ?? 'any'}
              onValueChange={handlePriceChange}
            >
              <SelectTrigger className={selectClasses}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any price</SelectItem>
                {selectedProduct.prices.map((price) => (
                  <SelectItem key={price.id} value={price.id}>
                    {price.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Available data — compact pills */}
      <div>
        <span className="text-sm font-medium">Available data</span>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[
            'payment.amount',
            'payment.currency',
            'payment.productName',
            'payment.priceName',
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
