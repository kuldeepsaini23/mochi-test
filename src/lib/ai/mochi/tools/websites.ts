/**
 * ============================================================================
 * MOCHI AI TOOLS - WEBSITES & PAGES
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for website and page management.
 * Allows the AI to create websites, create/list/delete pages, and navigate
 * the user to the website builder with optional AI content generation.
 *
 * Routes through tRPC caller for full middleware (permissions, feature gates).
 *
 * When a `contentPrompt` is provided on createPage or editPageContent,
 * the tool navigates to the builder and instructs the model to output
 * ```ui-spec code fences. The modular content fence transform separates
 * them into data-ui-spec events that stream to the builder's canvas.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiWebsiteTools, AIWebsiteManagement,
 * MochiPageTools, AIPageManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generates a URL-safe slug from a page name.
 *
 * Converts "About Us" → "about-us", "My Landing Page!" → "my-landing-page".
 * Strips non-alphanumeric characters, collapses hyphens, and trims edges.
 *
 * SOURCE OF TRUTH KEYWORDS: AISlugGenerate, generateSlugFromName
 */
function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'page'
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

/**
 * Creates all website/page-related tools bound to the given organization.
 * Uses tRPC caller for permission-checked DB operations.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller that enforces permissions, feature gates, etc.
 */
export function createWebsiteTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * List all websites (categories) in the organization.
     * Returns basic info: id, name, previewId, page count.
     */
    listWebsites: tool({
      description:
        'List all websites in the organization. Returns website names, IDs, ' +
        'preview IDs, and page counts. Use this to find a website before creating pages.',
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe('Optional search term to filter websites by name'),
      }),
      execute: async (params) => {
        try {
          /* List via tRPC — enforces WEBSITES_READ permission */
          const result = await caller.websites.list({
            organizationId,
            search: params.search,
            page: 1,
            pageSize: 50,
          })

          return {
            success: true,
            websites: result.websites.map((w) => ({
              id: w.id,
              name: w.name,
              previewId: w.previewId,
              pageCount: w._count?.pages ?? 0,
            })),
            total: result.total,
            message: `Found ${result.total} website${result.total === 1 ? '' : 's'}`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listWebsites', err)
        }
      },
    }),

    /**
     * Create a new website with an optional initial "home" page.
     * Does NOT navigate — the user can create pages in a separate step.
     */
    createWebsite: tool({
      description:
        'Create a new website (category). Optionally creates an initial "home" page. ' +
        'To add more pages with AI content, use createPage after this.',
      inputSchema: z.object({
        name: z
          .string()
          .describe('Website name (e.g., "Portfolio", "Marketing Site")'),
        description: z
          .string()
          .optional()
          .describe('Optional description for internal reference'),
        createHomePage: z
          .boolean()
          .optional()
          .describe('If true, creates an initial "home" page with slug "home" (default: true)'),
      }),
      execute: async (params) => {
        try {
          /**
           * Determine whether to create an initial page.
           * Default to true — most websites need at least one page.
           */
          const shouldCreateHome = params.createHomePage !== false

          /* Create via tRPC — enforces WEBSITES_CREATE permission + websites.limit gate */
          const website = await caller.websites.create({
            organizationId,
            name: params.name,
            description: params.description,
            ...(shouldCreateHome
              ? { initialPageSlug: 'home', initialPageName: 'Home' }
              : {}),
          })

          return {
            success: true,
            websiteId: website.id,
            name: website.name,
            previewId: website.previewId,
            message: `Created website "${params.name}" (ID: ${website.id})${shouldCreateHome ? ' with a "Home" page' : ''}`,
            /** Event bus: notify that a new website was created */
            _event: {
              feature: 'website-builder' as const,
              action: 'created' as const,
              entityId: website.id,
            },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createWebsite', err)
        }
      },
    }),

    /**
     * List all pages for a specific website.
     * Returns page names, slugs, IDs, and publish status.
     */
    listPages: tool({
      description:
        'List all pages for a website. Returns page names, slugs, IDs, and status. ' +
        'Use this to see existing pages before creating new ones.',
      inputSchema: z.object({
        websiteId: z
          .string()
          .describe('The website ID to list pages for (from listWebsites)'),
      }),
      execute: async (params) => {
        try {
          /* List via tRPC — enforces WEBSITES_READ permission */
          const pages = await caller.pages.listByWebsite({
            organizationId,
            websiteId: params.websiteId,
          })

          return {
            success: true,
            pages: pages.map((p) => ({
              id: p.id,
              name: p.name,
              slug: p.slug,
              status: p.status,
            })),
            total: pages.length,
            message: `Found ${pages.length} page${pages.length === 1 ? '' : 's'}`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listPages', err)
        }
      },
    }),

    /**
     * Create a new page in a website — optionally navigate to the builder
     * and generate AI content via ```ui-spec code fences.
     *
     * When contentPrompt is provided:
     * 1. Fetches website to get previewId and domainId
     * 2. Creates the page via tRPC
     * 3. Returns a navigation event to open the builder at /{previewId}/{slug}/edit
     * 4. Instructs the model to output ```ui-spec content for the page
     *
     * Without contentPrompt, the page is created without navigation.
     */
    createPage: tool({
      description:
        'Create a new page in a website. If contentPrompt is provided, opens the builder ' +
        'and you MUST output page content inside a ```ui-spec code fence after this tool returns. ' +
        'Without contentPrompt, just creates an empty page.',
      inputSchema: z.object({
        websiteId: z
          .string()
          .describe('The website ID to create the page in (from listWebsites or createWebsite)'),
        name: z
          .string()
          .describe('Page name (e.g., "About Us", "Contact", "Landing Page")'),
        slug: z
          .string()
          .optional()
          .describe(
            'URL slug for the page (e.g., "about-us"). Auto-generated from name if not provided. ' +
            'Must be lowercase, alphanumeric with hyphens only.'
          ),
        contentPrompt: z
          .string()
          .optional()
          .describe(
            'If provided, navigates to the builder and generates AI page content. ' +
            'Describe the page layout: "hero section with headline, features grid, testimonials". ' +
            'After this tool returns, output the content inside a ```ui-spec code fence.'
          ),
      }),
      execute: async (params) => {
        try {
          /** Fetch the website to get previewId and domainId for navigation */
          const website = await caller.websites.getById({
            organizationId,
            websiteId: params.websiteId,
          })

          /** Auto-generate slug from name if not explicitly provided */
          const slug = params.slug || generateSlugFromName(params.name)

          /* Create page via tRPC — enforces WEBSITES_CREATE permission + page limit gate */
          const page = await caller.pages.create({
            organizationId,
            domainId: website.domainId ?? null,
            websiteId: params.websiteId,
            slug,
            name: params.name,
          })

          /**
           * If contentPrompt is provided, navigate to the builder and
           * instruct the model to generate ui-spec content.
           */
          if (params.contentPrompt) {
            return {
              success: true,
              pageId: page.id,
              name: page.name,
              slug: page.slug,
              websiteId: params.websiteId,
              previewId: website.previewId,
              message:
                `Page "${params.name}" created and the builder is now open. ` +
                `Output the page content inside a \`\`\`ui-spec code fence. ` +
                `Generate sections based on the user's request for: ${params.name}. ` +
                `Follow the ui-spec generation rules from your system prompt.`,
              /** Event bus: navigate to the website builder */
              _event: {
                feature: 'website-builder' as const,
                action: 'navigate' as const,
                entityId: page.id,
                navigate: true,
                data: {
                  previewId: website.previewId ?? params.websiteId,
                  slug: page.slug,
                },
              },
            }
          }

          return {
            success: true,
            pageId: page.id,
            name: page.name,
            slug: page.slug,
            websiteId: params.websiteId,
            message: `Created page "${params.name}" with slug "/${slug}"`,
            /**
             * Event bus: navigate to the newly created page in the builder.
             * Even without contentPrompt, the user expects to see the new page.
             * Background mode will suppress navigation if needed.
             */
            _event: {
              feature: 'website-builder' as const,
              action: 'created' as const,
              entityId: page.id,
              navigate: true,
              data: {
                previewId: website.previewId ?? params.websiteId,
                slug: page.slug,
              },
            },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createPage', err)
        }
      },
    }),

    /**
     * Navigate to an existing page in the builder and generate AI content.
     * No database mutation — purely opens the builder with the page.
     *
     * Used when the user wants to edit an existing page with AI-generated
     * content (e.g., "add a hero section to my about page").
     */
    editPageContent: tool({
      description:
        'Open an existing page in the website builder and generate AI content for it. ' +
        'After this tool returns, output the content inside a ```ui-spec code fence. ' +
        'Use this when the user wants to add AI-generated sections to an existing page.',
      inputSchema: z.object({
        websiteId: z
          .string()
          .describe('The website ID the page belongs to'),
        pageId: z
          .string()
          .describe('The page ID to edit (from listPages)'),
        slug: z
          .string()
          .describe('The page slug (from listPages) — needed for the builder URL'),
        prompt: z
          .string()
          .describe('Instructions for what to generate (e.g., "add a hero section with team photos")'),
      }),
      execute: async (params) => {
        try {
          /** Fetch the website to get previewId for navigation */
          const website = await caller.websites.getById({
            organizationId,
            websiteId: params.websiteId,
          })

          return {
            success: true,
            pageId: params.pageId,
            slug: params.slug,
            message:
              `Builder is now open for page "${params.slug}". ` +
              `Output the content inside a \`\`\`ui-spec code fence. ` +
              `Follow the ui-spec generation rules from your system prompt.`,
            /** Event bus: navigate to the website builder */
            _event: {
              feature: 'website-builder' as const,
              action: 'navigate' as const,
              entityId: params.pageId,
              navigate: true,
              data: {
                previewId: website.previewId ?? params.websiteId,
                slug: params.slug,
              },
            },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('editPageContent', err)
        }
      },
    }),

    /**
     * Permanently delete a page.
     * ALWAYS confirm with askUser before calling this tool.
     */
    deletePage: tool({
      description:
        'Permanently delete a page from a website. This removes the page and all its content. ' +
        'ALWAYS use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        pageId: z
          .string()
          .describe('The page ID to delete (from listPages)'),
      }),
      execute: async (params) => {
        try {
          /* Delete via tRPC — enforces WEBSITES_DELETE permission */
          await caller.pages.delete({
            organizationId,
            pageId: params.pageId,
          })

          return {
            success: true,
            pageId: params.pageId,
            message: `Page deleted successfully`,
            /** Event bus: notify that a page was deleted */
            _event: {
              feature: 'website-builder' as const,
              action: 'deleted' as const,
              entityId: params.pageId,
            },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deletePage', err)
        }
      },
    }),
  }
}
