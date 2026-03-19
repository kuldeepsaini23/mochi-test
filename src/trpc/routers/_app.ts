/**
 * App Router - Main tRPC Router
 *
 * WHY: Central registry for all API procedures. Single source of truth for frontend/backend contract.
 * HOW: Add all procedures here. AppRouter type is exported to client/server for full type safety.
 *      Client uses this type via useTRPC(), server uses it via trpc proxy.
 */

import { z } from 'zod';
import { baseProcedure, createTRPCRouter } from '../init';
import { dashboardRouter } from './dashboard';
import { featuresRouter } from './features';
import { paymentRouter } from './payment';
import { organizationRouter } from './organization';
import { userRouter } from './user';
import { integrationsRouter } from './integrations';
import { profileRouter } from './profile';
import { organizationSettingsRouter } from './organization-settings';
import { usageRouter } from './usage';
import { affiliateRouter } from './affiliate';
import { leadsRouter } from './leads';
import { customDataRouter } from './custom-data';
import { productsRouter } from './products';
import { transactionsRouter } from './transactions';
import { websitesRouter } from './websites';
import { pagesRouter } from './pages';
import { domainsRouter } from './domains';
import { builderRouter } from './builder';
import { localComponentsRouter } from './local-components';
import { cmsRouter } from './cms';
import { storageRouter } from './storage';
import { formsRouter } from './forms';
import { emailDomainsRouter } from './email-domains';
import { emailTemplatesRouter } from './email-templates';
import { inboxRouter } from './inbox';
import { pipelineRouter } from './pipeline';
import { storesRouter } from './stores';
import { chatWidgetsRouter } from './chat-widgets';
import { leadSessionRouter } from './lead-session';
import { chatWidgetMessagingRouter } from './chat-widget-messaging';
import { portalRouter } from './portal';
import { calendarRouter } from './calendar';
import { bookingCalendarRouter } from './booking-calendar';
import { walletRouter } from './wallet';
import { memberAvailabilityRouter } from './member-availability';
import { automationRouter } from './automation';

import { ordersRouter } from './orders';
import { contractsRouter } from './contracts'
import { invoicesRouter } from './invoices'
import { pageViewRouter } from './page-view';
import { notificationsRouter } from './notifications'
import { pushSubscriptionsRouter } from './push-subscriptions'
import { savedColorsRouter } from './saved-colors'
import { templatesRouter } from './templates'

/**
 * All tRPC procedures live here
 * WHY: Keeps API surface organized. All queries/mutations accessible via trpc.procedureName
 * HOW: Use baseProcedure.input(zod).query() for reads, .mutation() for writes
 *
 * NOTE: Auth operations (sign in, sign up, sign out) use Better Auth client directly,
 *       not tRPC. See src/lib/auth-client.ts for client-side auth.
 */
export const appRouter = createTRPCRouter({
  hello: baseProcedure
    .input(z.object({ name: z.string() }).optional())
    .query(({ input }) => {
      return { greeting: `Hello ${input?.name ?? 'World'}!` };
    }),

  // Routers
  dashboard: dashboardRouter,
  features: featuresRouter,
  payment: paymentRouter,
  organization: organizationRouter,
  user: userRouter,
  integrations: integrationsRouter,
  profile: profileRouter,
  organizationSettings: organizationSettingsRouter,
  usage: usageRouter,
  affiliate: affiliateRouter,
  leads: leadsRouter,
  customData: customDataRouter,
  products: productsRouter,
  transactions: transactionsRouter,
  websites: websitesRouter,
  pages: pagesRouter,
  domains: domainsRouter,
  builder: builderRouter,
  localComponents: localComponentsRouter,
  cms: cmsRouter,
  storage: storageRouter,
  forms: formsRouter,
  emailDomains: emailDomainsRouter,
  emailTemplates: emailTemplatesRouter,
  inbox: inboxRouter,
  pipeline: pipelineRouter,
  stores: storesRouter,
  chatWidgets: chatWidgetsRouter,
  leadSession: leadSessionRouter,
  chatWidgetMessaging: chatWidgetMessagingRouter,
  portal: portalRouter,
  calendar: calendarRouter,
  bookingCalendar: bookingCalendarRouter,
  wallet: walletRouter,
  memberAvailability: memberAvailabilityRouter,
  automation: automationRouter,

  orders: ordersRouter,
  contracts: contractsRouter,
  invoices: invoicesRouter,
  pageView: pageViewRouter,
  notifications: notificationsRouter,
  pushSubscriptions: pushSubscriptionsRouter,
  savedColors: savedColorsRouter,
  templates: templatesRouter,
});

/**
 * Export type for client/server
 * WHY: Enables end-to-end type safety without code generation
 * HOW: Imported by client.tsx and server.tsx to get typed tRPC clients
 */
export type AppRouter = typeof appRouter;
