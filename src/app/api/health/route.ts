/**
 * Health Check Endpoint
 *
 * WHY: Required for container orchestration and load balancers.
 * Coolify, Docker, and reverse proxies use this to verify the app is running.
 *
 * Returns 200 OK when the application is healthy.
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  )
}
