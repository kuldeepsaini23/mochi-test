/**
 * Integration Service
 * Handles fetching integration statuses for Studio accounts
 *
 * DAL Layer 3: Services
 * - Trusts organizationId from API routes
 * - Performs database queries only
 * - NO auth, NO permissions, NO validation
 */

import 'server-only'

import { prisma } from '@/lib/config'
import { AVAILABLE_INTEGRATIONS } from '@/constants/integrations'
import type { Integration, IntegrationStatus } from '@/types/integration'

/**
 * Get all integrations with their connection status for a studio
 * @param organizationId - Studio organization ID (trusted from API route)
 * @returns List of integrations with current status
 */
export async function getStudioIntegrations(
  organizationId: string
): Promise<Integration[]> {
  // Fetch organization with stripe connection status
  const organization = await prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      stripeConnectedAccountId: true,
      createdAt: true,
    },
  })

  if (!organization) {
    throw new Error('Organization not found')
  }

  // Map integration definitions to integration instances with status
  const integrations: Integration[] = AVAILABLE_INTEGRATIONS.map(
    (definition) => {
      let status: IntegrationStatus = 'disconnected'
      let connectedAt: string | undefined
      let accountId: string | undefined

      // Check connection status based on integration type
      if (definition.id === 'stripe-connect') {
        if (organization.stripeConnectedAccountId) {
          status = 'connected'
          accountId = organization.stripeConnectedAccountId
          connectedAt = organization.createdAt.toISOString()
        }
      }

      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        logo: definition.logo,
        status,
        connectedAt,
        accountId,
        flowType: definition.flowType,
      }
    }
  )

  return integrations
}
