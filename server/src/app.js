import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { securityMiddleware, rejectUnsafeKeys } from './middleware/security.js';
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

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(...securityMiddleware);
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(rejectUnsafeKeys);

app.get('/api/health', (_req, res) => res.json({ success: true, data: { status: 'ok', timestamp: new Date() } }));
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/expenses', (req, _res, next) => { req.query.type = 'expense'; if (req.method === 'POST') req.body.type = 'expense'; next(); }, transactionRoutes);
app.use('/api/income', (req, _res, next) => { req.query.type = 'income'; if (req.method === 'POST') req.body.type = 'income'; next(); }, transactionRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api', resourceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api', systemRoutes);

if (process.env.NODE_ENV === 'production') {
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(directory));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(directory, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);
