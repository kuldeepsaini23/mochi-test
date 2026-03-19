/**
 * Form Submissions Page
 *
 * WHY: Server component that renders the submissions page for a specific form
 * HOW: Extracts slug from route params and passes it to the client component
 *
 * ROUTE: /sites/forms/[slug]/submissions
 * (Slug-based URL for clean navigation, mirrors /forms/[slug]/edit pattern)
 *
 * SOURCE OF TRUTH: FormSubmission, Form
 */

import { SubmissionsPageContent } from './_components/submissions-page-content'

interface SubmissionsPageProps {
  params: Promise<{ slug: string }>
}

export default async function SubmissionsPage({ params }: SubmissionsPageProps) {
  const { slug } = await params
  return <SubmissionsPageContent slug={slug} />
}
