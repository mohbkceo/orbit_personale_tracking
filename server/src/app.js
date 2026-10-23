import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import {
  securityMiddleware,
  rejectUnsafeKeys,
  verifyBrowserOrigin,
  advertisingFramePolicy,
} from './middleware/security.js';
import { userAuth, accessGuard, requireFeature } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { accountRoutes } from './routes/accounts.js';
import { transactionRoutes } from './routes/transactions.js';
import { debtRoutes } from './routes/debts.js';
import { taskRoutes } from './routes/tasks.js';
import { billRoutes, goalRoutes, subscriptionRoutes } from './routes/planning.js';
import { resourceRoutes } from './routes/resources.js';
import { settingsRoutes } from './routes/settings.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { telegramRoutes } from './routes/telegram.js';
import { systemRoutes } from './routes/system.js';
import { authRoutes } from './routes/auth.js';
import { activationRoutes } from './routes/activation.js';
import { accessRoutes } from './routes/access.js';
import { adminAuthRoutes } from './routes/adminAuth.js';
import { adminPlanRoutes } from './routes/adminPlans.js';
import { adminFeatureRoutes } from './routes/adminFeatures.js';
import { publicPlanRoutes } from './routes/publicPlans.js';
import { adminActivationLinkRoutes } from './routes/adminActivationLinks.js';
import { adminQrBatchRoutes } from './routes/adminQrBatches.js';
import { adminQrPrintTemplateRoutes } from './routes/adminQrPrintTemplates.js';
import { adminUserRoutes } from './routes/adminUsers.js';
import { adminAdminRoutes } from './routes/adminAdmins.js';
import { adminOperationRoutes } from './routes/adminOperations.js';
import { telegramLinkRoutes } from './routes/telegramLink.js';
import { reminderRoutes } from './routes/reminders.js';
import { dailyFocusRoutes } from './routes/dailyFocus.js';
import { adminAutomationSettingsRoutes } from './routes/adminAutomationSettings.js';
import { publicConfigRoutes } from './routes/publicConfig.js';
import { analyticsRoutes } from './routes/analytics.js';
import { adminAnalyticsRoutes } from './routes/adminAnalytics.js';
import { adminEventSettingsRoutes } from './routes/adminEventSettings.js';
import { adminEventsRoutes } from './routes/adminEvents.js';
import { eventRoutes } from './routes/events.js';
import { paymentRoutes, adminPaymentRoutes } from './routes/payments.js';
import { meCapabilityRoutes } from './routes/meCapabilities.js';
import { meOnboardingRoutes } from './routes/meOnboarding.js';
import { adminAccessControlRoutes } from './routes/adminAccessControl.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(...securityMiddleware);
app.use(advertisingFramePolicy);
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(cookieParser());
app.use(verifyBrowserOrigin);
app.use(rejectUnsafeKeys);

app.get('/api/health', (_req, res) =>
  res.json({ success: true, data: { status: 'ok', timestamp: new Date() } }),
);
app.use('/api/telegram', telegramRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin/payments', adminPaymentRoutes);
app.use('/api/activation', activationRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/me', userAuth, meCapabilityRoutes);
app.use('/api/me', userAuth, meOnboardingRoutes);
app.use('/api/admin/access-control', adminAccessControlRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/plans', adminPlanRoutes);
app.use('/api/admin/features', adminFeatureRoutes);
app.use('/api/public/plans', publicPlanRoutes);
app.use('/api/public/config', publicConfigRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/admin/activation-links', adminActivationLinkRoutes);
app.use('/api/admin/qr-batches', adminQrBatchRoutes);
app.use('/api/admin/qr-print-templates', adminQrPrintTemplateRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/admins', adminAdminRoutes);
app.use('/api/admin/settings/automation', adminAutomationSettingsRoutes);
app.use('/api/admin/settings/events', adminEventSettingsRoutes);
app.use('/api/admin/events', adminEventsRoutes);
app.use('/api/admin', adminOperationRoutes);
app.use('/api/telegram-link', userAuth, accessGuard, telegramLinkRoutes);
app.use('/api/accounts', userAuth, accessGuard, requireFeature('accounts'), accountRoutes);
app.use(
  '/api/transactions',
  userAuth,
  accessGuard,
  requireFeature('transactions'),
  transactionRoutes,
);
app.use(
  '/api/expenses',
  userAuth,
  accessGuard,
  requireFeature('expenses'),
  (req, _res, next) => {
    req.query.type = 'expense';
    if (req.method === 'POST') req.body.type = 'expense';
    next();
  },
  transactionRoutes,
);
app.use(
  '/api/income',
  userAuth,
  accessGuard,
  requireFeature('income'),
  (req, _res, next) => {
    req.query.type = 'income';
    if (req.method === 'POST') req.body.type = 'income';
    next();
  },
  transactionRoutes,
);
app.use('/api/debts', userAuth, accessGuard, requireFeature('debts'), debtRoutes);
app.use('/api/tasks', userAuth, accessGuard, requireFeature('tasks'), taskRoutes);
app.use('/api/daily-focus', userAuth, accessGuard, requireFeature('daily-focus'), dailyFocusRoutes);
app.use('/api/reminders', userAuth, accessGuard, requireFeature('reminders'), reminderRoutes);
app.use('/api/events', userAuth, accessGuard, requireFeature('events'), eventRoutes);
app.use('/api/bills', userAuth, accessGuard, requireFeature('bills'), billRoutes);
app.use(
  '/api/subscriptions',
  userAuth,
  accessGuard,
  requireFeature('subscriptions'),
  subscriptionRoutes,
);
app.use('/api/goals', userAuth, accessGuard, requireFeature('goals'), goalRoutes);
app.use('/api/settings', userAuth, accessGuard, settingsRoutes);
app.use('/api/dashboard', userAuth, accessGuard, requireFeature('dashboard'), dashboardRoutes);
app.use('/api', userAuth, accessGuard, resourceRoutes);
app.use('/api', userAuth, accessGuard, systemRoutes);

if (process.env.NODE_ENV === 'production') {
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(directory));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(directory, 'index.html')));
}

// pushing

app.use(notFound);
app.use(errorHandler);
