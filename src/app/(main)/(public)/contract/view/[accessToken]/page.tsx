/**
 * ============================================================================
 * PUBLIC CONTRACT VIEW — Server Page
 * ============================================================================
 *
 * Fetches contract by accessToken and renders the read-only signing view.
 * No authentication required — the accessToken IS the security.
 * Invalid/missing tokens → 404.
 *
 * Variable resolution:
 * - For COMPLETED contracts: uses BAKED variable values from signeeData
 *   (snapshot taken at signing time so dates/values never change)
 * - For SENT contracts: resolves variables LIVE from lead + org + datetime
 *
 * SOURCE OF TRUTH KEYWORDS: PublicContractPage, ContractViewPage
 */

import { notFound } from 'next/navigation'
import { createCaller } from '@/trpc/server'
import { ContractViewClient } from './_components/contract-view-client'
import { LEAD_CATEGORY, ORGANIZATION_CATEGORY, DATETIME_CATEGORY } from '@/lib/variables/variable-categories'

interface PageProps {
  params: Promise<{ accessToken: string }>
}

export default async function PublicContractViewPage({ params }: PageProps) {
  const { accessToken } = await params

  /** Fetch the contract by accessToken — public endpoint, no auth required */
  const api = await createCaller()
  let contract
  try {
    contract = await api.contracts.getByAccessToken({ accessToken })
  } catch {
    notFound()
  }

  if (!contract) notFound()

  const contractRecord = contract as unknown as Record<string, unknown>
  const isCompleted = contract.status === 'COMPLETED'

  /**
   * For COMPLETED contracts, check if baked variable values exist in signeeData.
   * WHY: At signing time, all dynamic values (dates, lead info, etc.) are
   * snapshot into signeeData.bakedVariableValues so they don't change on re-view.
   */
  const signeeData = contractRecord.signeeData as Record<string, unknown> | null | undefined
  const bakedValues = signeeData?.bakedVariableValues as Record<string, string> | undefined

  /** If we have baked values and the contract is completed, use those directly */
  if (isCompleted && bakedValues) {
    /** Map contract variable names for label resolution on pills */
    const variableLabels: Record<string, string> = {}
    const variables = contractRecord.variables as Array<{ id: string; name: string; value: string }> | null
    if (variables) {
      variables.forEach((v) => {
        if (v.name) variableLabels[`contract.${v.id}`] = v.name
      })
    }
    /** Add system variable labels from LEAD_CATEGORY, ORG, DATETIME */
    LEAD_CATEGORY.variables.forEach((v) => { variableLabels[v.key] = v.label })
    ORGANIZATION_CATEGORY.variables.forEach((v) => { variableLabels[v.key] = v.label })
    DATETIME_CATEGORY.variables.forEach((v) => { variableLabels[v.key] = v.label })

    return (
      <ContractViewClient
        contractName={contract.name}
        contractContent={contract.content as string | null}
        contractStatus={contract.status}
        accessToken={accessToken}
        variableValues={bakedValues}
        variableLabels={variableLabels}
        signeeData={signeeData}
      />
    )
  }

  /**
   * Build the variable value map for interpolating variable pills.
   * Merges ALL data sources: contract vars + lead data + org data + datetime.
   */
  const variableValues: Record<string, string> = {}

  /** 1. Map contract variables (stored as JSON on the contract) */
  const variables = contractRecord.variables as Array<{ id: string; name: string; value: string }> | null
  if (variables) {
    variables.forEach((v) => {
      if (v.value) variableValues[`contract.${v.id}`] = v.value
    })
  }

  /** 2. Map ALL lead data to lead variable keys for interpolation */
  const recipient = contractRecord.recipient as {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    zipCode: string | null
    country: string | null
    status: string | null
    source: string | null
    cltv: number | null
  } | null | undefined

  if (recipient) {
    if (recipient.firstName) variableValues['lead.firstName'] = recipient.firstName
    if (recipient.lastName) variableValues['lead.lastName'] = recipient.lastName
    const fullName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ')
    if (fullName) variableValues['lead.fullName'] = fullName
    if (recipient.email) variableValues['lead.email'] = recipient.email
    if (recipient.phone) variableValues['lead.phone'] = recipient.phone
    if (recipient.address) variableValues['lead.address'] = recipient.address
    if (recipient.city) variableValues['lead.city'] = recipient.city
    if (recipient.state) variableValues['lead.state'] = recipient.state
    if (recipient.zipCode) variableValues['lead.zipCode'] = recipient.zipCode
    if (recipient.country) variableValues['lead.country'] = recipient.country
    if (recipient.status) variableValues['lead.status'] = recipient.status
    if (recipient.source) variableValues['lead.source'] = recipient.source
    if (recipient.cltv != null) variableValues['lead.cltvFormatted'] = `$${Number(recipient.cltv).toFixed(2)}`
  }

  /** 3. Map organization data */
  const organization = contractRecord.organization as {
    id: string
    name: string
    logo: string | null
    customDomain: string | null
  } | null | undefined

  if (organization) {
    if (organization.name) variableValues['organization.name'] = organization.name
    if (organization.logo) variableValues['organization.logo'] = organization.logo
    if (organization.customDomain) variableValues['organization.customDomain'] = organization.customDomain
  }

  /** 4. Date/time variables — snapshot at render time */
  const now = new Date()
  variableValues['now.date'] = now.toLocaleDateString()
  variableValues['now.year'] = String(now.getFullYear())
  variableValues['now.month'] = now.toLocaleDateString(undefined, { month: 'long' })
  variableValues['now.day'] = String(now.getDate())
  variableValues['now.datetime'] = now.toLocaleString()

  /** Map contract variable names for label resolution on pills */
  const variableLabels: Record<string, string> = {}
  if (variables) {
    variables.forEach((v) => {
      if (v.name) variableLabels[`contract.${v.id}`] = v.name
    })
  }
  /** Add system variable labels */
  LEAD_CATEGORY.variables.forEach((v) => { variableLabels[v.key] = v.label })
  ORGANIZATION_CATEGORY.variables.forEach((v) => { variableLabels[v.key] = v.label })
  DATETIME_CATEGORY.variables.forEach((v) => { variableLabels[v.key] = v.label })

  return (
    <ContractViewClient
      contractName={contract.name}
      contractContent={contract.content as string | null}
      contractStatus={contract.status}
      accessToken={accessToken}
      variableValues={variableValues}
      variableLabels={variableLabels}
      signeeData={signeeData}
    />
  )
}
