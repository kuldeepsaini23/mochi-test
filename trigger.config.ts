/**
 * Trigger.dev Configuration
 *
 * Configuration for Trigger.dev task orchestration.
 * This file defines project settings, runtime configuration, and retry policies.
 *
 * TASKS:
 * - Storage: Video HLS transcoding (FFmpeg), scheduled trash deletion
 * - Automation: Workflow execution, appointment-started scheduling
 * - Pages: Website preview screenshots (Puppeteer)
 *
 * COST EFFICIENCY NOTES:
 * - maxDuration: 120s is sufficient for most tasks
 * - Retries: Kept minimal (2 attempts) since most failures are not transient
 * - Video processing tasks override maxDuration for long videos
 *
 * @see https://trigger.dev/docs/config/overview
 */

import { defineConfig } from '@trigger.dev/sdk'
import { ffmpeg } from '@trigger.dev/build/extensions/core'
import { puppeteer } from '@trigger.dev/build/extensions/puppeteer'
import { prismaExtension } from '@trigger.dev/build/extensions/prisma'

export default defineConfig({
  // Project identifier - should match your Trigger.dev dashboard project
  project: 'proj_alnzjtcbobhcedfdwkpm',

  // Runtime environment
  runtime: 'node',

  // Logging level - use 'warn' in production for less verbosity
  logLevel: 'log',

  // Maximum execution time (in seconds)
  // Default 120s for chat operations
  // Video processing tasks override this with longer durations
  maxDuration: 120,

  // Global retry configuration for all tasks
  // Kept conservative to avoid multiplying AI costs
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2, // Reduced from 3 - most failures are not transient
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 5000, // Reduced max timeout
      factor: 2,
    },
  },

  // Directories containing task definitions
  dirs: ['src/lib/trigger'],

  // Build configuration
  build: {
    // External packages that should not be bundled
    external: ['@trigger.dev/sdk'],

    // Build extensions
    // FFmpeg: Includes ffmpeg/ffprobe binaries for video processing tasks
    // This enables HLS transcoding for course videos
    // Puppeteer: Headless browser for capturing website preview screenshots
    extensions: [
      /**
       * Prisma engine-only mode — needed because we use a custom output path
       * (src/generated/prisma). This installs the correct Linux binary engine
       * for Trigger.dev's Debian container without running prisma generate
       * (we handle that ourselves via prebuild).
       */
      prismaExtension({
        mode: 'engine-only',
        version: '6.19.0',
      }),
      ffmpeg(),
      puppeteer(),
    ],
  },
})
