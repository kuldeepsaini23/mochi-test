/**
 * PAGE SCREENSHOT CAPTURE TASK
 *
 * Trigger.dev task that captures a screenshot of a published page for
 * display in the website list view.
 *
 * WHY THIS EXISTS:
 * - Website list needs preview thumbnails to help users identify pages quickly
 * - Rendering actual page components in a list is expensive (like email templates do)
 * - Screenshots are captured once on publish and reused, much more efficient
 *
 * FLOW:
 * 1. Page is published → publishPage() triggers this task
 * 2. Task waits briefly for CDN propagation (2 seconds)
 * 3. Puppeteer navigates to the PUBLIC live URL (not preview/edit mode)
 * 4. Screenshot captured at 1440x1920 (desktop width, tall portrait capture)
 * 5. Image uploaded to user's R2 storage (they own the file)
 * 6. StorageFile record created/updated, Page.previewImageId updated
 *
 * IF IMAGE IS DELETED:
 * - User can delete the screenshot from their storage
 * - Page will fall back to placeholder illustration in the list view
 * - Re-publishing the page will capture a new screenshot
 *
 * SCREENSHOT SPECS:
 * - Resolution: 1440x1920 (desktop width, tall portrait capture)
 * - Format: PNG (lossless, good quality)
 * - Location: org-{orgId}/page-previews/{pageId}.png
 *
 * SOURCE OF TRUTH KEYWORDS: PageScreenshot, CapturePreview, WebsitePreview
 */

import { schemaTask, logger } from '@trigger.dev/sdk'
import { z } from 'zod'
import puppeteer from 'puppeteer'
import { getR2Client } from '@/lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import {
  createFile,
  findStorageFileByKey,
  hardDeleteStorageFileById,
  updateStorageFileForScreenshot,
  updatePagePreviewImage,
} from '@/services/storage.service'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * R2 bucket name from environment
 */
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!

/**
 * Public CDN URL for R2 bucket
 */
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

/**
 * Screenshot viewport — desktop width so the page renders in desktop layout,
 * but tall viewport to capture more vertical content for portrait card display.
 * The UI card uses object-cover + object-top to crop from the top.
 */
const SCREENSHOT_WIDTH = 1440
const SCREENSHOT_HEIGHT = 1920

/**
 * Delay before capturing screenshot (milliseconds)
 * Allows time for CDN propagation and page render
 */
const CAPTURE_DELAY_MS = 2000

/**
 * Page load timeout (milliseconds)
 * How long to wait for page to fully load before capturing
 */
const PAGE_LOAD_TIMEOUT_MS = 30000

// ============================================================================
// INPUT SCHEMA
// ============================================================================

const screenshotCaptureSchema = z.object({
  pageId: z.string().describe('The page ID to capture screenshot for'),
  organizationId: z.string().describe('The organization that owns this page'),
  publicUrl: z.string().url().describe('The public URL of the published page'),
})

// ============================================================================
// MAIN TASK
// ============================================================================

/**
 * Screenshot Capture Task
 *
 * Captures a screenshot of a published page and stores it in the user's R2 storage.
 * Called automatically when a page is published.
 */
export const capturePageScreenshot = schemaTask({
  id: 'capture-page-screenshot',
  description: 'Capture screenshot of published page for website list preview',
  schema: screenshotCaptureSchema,

  // Screenshot capture is quick, 60 seconds is plenty
  maxDuration: 60,

  run: async ({ pageId, organizationId, publicUrl }) => {
    logger.info('Starting screenshot capture', { pageId, organizationId, publicUrl })

    let browser = null

    try {
      // ========================================================================
      // STEP 1: Wait for CDN propagation
      // ========================================================================
      // The page was just published, give CDN time to propagate
      logger.info('Waiting for CDN propagation', { delayMs: CAPTURE_DELAY_MS })
      await new Promise((resolve) => setTimeout(resolve, CAPTURE_DELAY_MS))

      // ========================================================================
      // STEP 2: Launch browser and capture screenshot
      // ========================================================================
      logger.info('Launching Puppeteer browser')

      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      })

      const page = await browser.newPage()

      // Set viewport to our desired screenshot dimensions
      await page.setViewport({
        width: SCREENSHOT_WIDTH,
        height: SCREENSHOT_HEIGHT,
        deviceScaleFactor: 1,
      })

      // Navigate to the public URL
      logger.info('Navigating to public URL', { url: publicUrl })

      await page.goto(publicUrl, {
        waitUntil: 'networkidle2', // Wait for network to be idle (page fully loaded)
        timeout: PAGE_LOAD_TIMEOUT_MS,
      })

      // Small delay for any client-side rendering to complete
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Capture the screenshot
      logger.info('Capturing screenshot')

      const screenshotBuffer = await page.screenshot({
        type: 'png',
        fullPage: false, // Only capture viewport, not full page scroll
      })

      // ========================================================================
      // STEP 3: Upload to R2 storage
      // ========================================================================
      const storageKey = `org-${organizationId}/page-previews/${pageId}.png`
      const publicFileUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${storageKey}` : null

      logger.info('Uploading screenshot to R2', { storageKey })

      const client = getR2Client()

      await client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: storageKey,
          Body: screenshotBuffer,
          ContentType: 'image/png',
          ContentDisposition: 'inline',
        })
      )

      // ========================================================================
      // STEP 4: Create or Update StorageFile record
      // ========================================================================
      // This makes the screenshot visible in the user's storage and trackable
      // Uses upsert to handle re-publishing (same storageKey, just update the file)
      logger.info('Creating/Updating StorageFile record')

      // Check if a file with this storageKey already exists (from previous publish)
      // IMPORTANT: Check ALL files including soft-deleted ones since storageKey has
      // a unique constraint across the entire table, not just active records.
      // If a soft-deleted file exists with this key, we hard-delete it first.
      // Delegates to storage.service.ts for database access
      const existingFile = await findStorageFileByKey(organizationId, storageKey)

      // Handle existing file scenarios:
      // 1. Soft-deleted file with same key: Hard delete it, then create new
      // 2. Active file with same key: Update it (re-publishing scenario)
      // 3. No existing file: Create new
      let storageFile: { id: string }
      const activeExistingFile = existingFile && existingFile.deletedAt === null

      if (existingFile && existingFile.deletedAt !== null) {
        // Soft-deleted file exists - hard delete it to free up the storageKey
        // Delegates to storage.service.ts for database access
        logger.info('Hard deleting soft-deleted file to free storageKey', { existingId: existingFile.id })
        await hardDeleteStorageFileById(existingFile.id)
      }

      if (activeExistingFile) {
        // Update existing active file record (re-publishing scenario)
        // Delegates to storage.service.ts for database access
        logger.info('Updating existing StorageFile', { existingId: existingFile.id })
        storageFile = await updateStorageFileForScreenshot(
          existingFile.id,
          { size: screenshotBuffer.length, publicUrl: publicFileUrl }
        )
      } else {
        // Create new file record (first publish)
        storageFile = await createFile({
          organizationId,
          name: `${pageId}-preview.png`,
          displayName: 'Page Preview Screenshot',
          mimeType: 'image/png',
          size: screenshotBuffer.length,
          extension: 'png',
          fileCategory: 'IMAGE',
          storageKey,
          publicUrl: publicFileUrl,
          visibility: 'PUBLIC', // Previews need to be publicly accessible
          folderId: null, // Root level (not in any folder)
          width: SCREENSHOT_WIDTH,
          height: SCREENSHOT_HEIGHT,
        })
      }

      // ========================================================================
      // STEP 5: Update Page with preview image reference
      // ========================================================================
      // NOTE: This requires the previewImageId field to be added to Page model
      // Run prisma migration after adding the field to schema.prisma
      // TODO: Remove try-catch after migration is confirmed to be run
      logger.info('Updating Page with previewImageId', { storageFileId: storageFile.id })

      try {
        // Update page with preview image reference via storage service
        // Uses raw query to safely handle case where column doesn't exist yet
        await updatePagePreviewImage(pageId, storageFile.id)
      } catch (updateError) {
        // If the column doesn't exist yet (migration not run), log warning but continue
        // The screenshot is still saved to R2 and can be linked once migration runs
        logger.warn('Could not update Page.previewImageId - migration may not have run yet', {
          pageId,
          storageFileId: storageFile.id,
          error: updateError instanceof Error ? updateError.message : 'Unknown error',
        })
      }

      logger.info('Screenshot capture complete', {
        pageId,
        storageFileId: storageFile.id,
        storageKey,
      })

      return {
        success: true,
        storageFileId: storageFile.id,
        storageKey,
        publicUrl: publicFileUrl,
      }
    } catch (error) {
      // Log the error but don't fail hard - missing preview is not critical
      // The UI will show a fallback placeholder instead
      logger.error('Screenshot capture failed', {
        pageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    } finally {
      // Always close the browser to free resources
      if (browser) {
        await browser.close()
      }
    }
  },
})
