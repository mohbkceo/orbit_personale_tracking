import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Account } from '../src/models/Account.js';
import { Setting } from '../src/models/Setting.js';
import { Task } from '../src/models/Task.js';
import { Debt } from '../src/models/Debt.js';
import { Transaction } from '../src/models/Transaction.js';
import { TelegramConnection } from '../src/models/TelegramConnection.js';
import { TelegramSession } from '../src/models/TelegramSession.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { accountBalances, archiveTransaction } from '../src/services/financeService.js';
import { telegramFinancialSummary } from '../src/services/dashboardService.js';
import { publicSettings } from '../src/services/settingsService.js';
import { parseTelegramMessage } from '../src/telegram/parser.js';
import { executeIntent } from '../src/telegram/commandHandlers.js';
import { handleCallbackAction } from '../src/telegram/callbackHandlers.js';
import { handleTelegramUpdate } from '../src/telegram/handler.js';
import { getPending, pendingExpired, setPending } from '../src/telegram/sessionService.js';
import { escapeHtml } from '../src/telegram/formatters.js';
import { sendMessage, telegramRequest } from '../src/telegram/botClient.js';
import { telegramStatus } from '../src/telegram/statusService.js';
import { resolveTelegramAccount } from '../src/telegram/accountResolver.js';

vi.mock('../src/telegram/botClient.js', () => ({ sendMessage: vi.fn().mockResolvedValue({}), telegramRequest: vi.fn().mockResolvedValue({}) }));
let mongo;
let user;
let account;
let settings;
let originalToken;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  originalToken = env.ORBIT_TELEGRAM_BOT_TOKEN;
  env.ORBIT_TELEGRAM_BOT_TOKEN = 'test-token';
});
afterAll(async () => {
  env.ORBIT_TELEGRAM_BOT_TOKEN = originalToken;
  await disconnectDatabase();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([User, Account, Setting, Task, Debt, Transaction, TelegramConnection, TelegramSession, AccessSubscription].map((model) => model.deleteMany()));
  user = await User.create({ fullName: 'Owner', email: 'quick@example.com', passwordHash: 'unused' });
  account = await Account.create({ user: user._id, name: 'Cash', type: 'cash', openingBalance: 0 });
  settings = await Setting.create({ user: user._id, telegram: { defaultIncomeAccount: account._id, defaultExpenseAccount: account._id } });
  vi.clearAllMocks();
});
const run = (text) => executeIntent(user._id, parseTelegramMessage(text, { timezone: settings.timezone }), settings, { userId: '123', chatId: '123' });

describe('Telegram quick workflows', () => {
  it('stores one sale as income, counts it once, and undo removes it from the balance', async () => {
    const reply = await run('s 12500 Stand x3 #Logix @Ahmed');
    expect(reply.text).toContain('Sale added');
    const sale = await Transaction.findOne({ user: user._id });
    expect(await Transaction.countDocuments({ user: user._id })).toBe(1);
    expect(sale).toMatchObject({ type: 'income', category: 'Sale', createdVia: 'telegram', amount: 12500, saleDetails: { product: 'Stand', quantity: 3, business: 'Logix', customerName: 'Ahmed' } });
    expect((await accountBalances(user._id))[0].currentBalance).toBe(12500);
    await run('i 5000 freelance');
    await run('e 1000 lunch');
    expect((await telegramFinancialSummary(user._id, settings.timezone)).today).toMatchObject({ sales: 12500, otherIncome: 5000, expenses: 1000, net: 16500 });
    expect((await executeIntent(user._id, { intent: 'SHOW_SALES', data: {} }, settings)).text).toContain('12,500');
    expect((await executeIntent(user._id, { intent: 'SHOW_SALES', data: {} }, settings)).text).not.toContain('freelance');
    expect((await executeIntent(user._id, { intent: 'SHOW_TODAY', data: {} }, settings)).text).toContain('Other income: 5,000');
    await archiveTransaction(user._id, sale._id, 'telegram');
    expect((await telegramFinancialSummary(user._id, settings.timezone)).today.sales).toBe(0);
    expect((await accountBalances(user._id))[0].currentBalance).toBe(4000);
  });

  it('maps incoming and outgoing debts and records partial and full ledger payments', async () => {
    await run('din Ahmed 5000 NFC order');
    await run('dout Karim 8000 printing');
    expect((await Debt.findOne({ personName: 'Ahmed' })).type).toBe('receivable');
    expect((await Debt.findOne({ personName: 'Karim' })).type).toBe('payable');
    await run('dpay ahmed 2000');
    expect((await Debt.findOne({ personName: 'Ahmed' })).remainingAmount).toBe(3000);
    await run('dpaid Karim 3000');
    expect((await Debt.findOne({ personName: 'Karim' })).remainingAmount).toBe(5000);
    await run('dpaid Karim 5000');
    expect((await Debt.findOne({ personName: 'Karim' })).status).toBe('paid');
    expect(await Transaction.countDocuments({ sourceEntityType: 'Debt', deletedAt: null })).toBe(3);
    expect((await accountBalances(user._id))[0].currentBalance).toBe(-6000);
  });

  it('persists pending actions, expires them, validates callbacks, and escapes HTML', async () => {
    await setPending('123', '123', 'CREATE_SALE');
    expect((await getPending('123', '123')).action).toBe('CREATE_SALE');
    await TelegramSession.updateOne({ telegramUserId: '123' }, { expiresAt: new Date(Date.now() - 1000) });
    expect(await pendingExpired('123', '123')).toBe(true);
    expect(await getPending('123', '123')).toBeNull();
    expect(escapeHtml('<Ahmed & Co>')).toBe('&lt;Ahmed &amp; Co&gt;');
    const reply = await handleCallbackAction({ from: { id: 123 }, message: { chat: { id: 123 } }, data: 'task:done:bad' }, user._id, settings);
    expect(reply.answer).toBe('Invalid action');
  });

  it('ignores unlinked Telegram users and hides legacy webhook secrets in public settings', async () => {
    await handleTelegramUpdate({ message: { from: { id: 999 }, chat: { id: 999, type: 'private' }, text: 's 100' } });
    expect(sendMessage).not.toHaveBeenCalled();
    const publicValue = publicSettings({ telegram: { webhookUrl: '/api/telegram/webhook/very-secret', encryptedBotToken: 'cipher', iv: 'iv', authTag: 'tag' } });
    expect(JSON.stringify(publicValue)).not.toContain('very-secret');
    expect(publicValue.telegram.webhookConfigured).toBe(true);
  });

  it('returns complete Telegram status fields without exposing secrets', async () => {
    await TelegramConnection.create({ user: user._id, telegramUserId: '123', chatId: '123', lastUpdateAt: new Date() });
    const status = await telegramStatus(user._id);
    expect(status).toEqual({ connected: true, active: false, url: null, pendingUpdates: null, lastError: null, lastUpdateAt: expect.any(Date) });
    telegramRequest.mockResolvedValueOnce({ url: `https://example.com/api/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET}`, pending_update_count: 2, last_error_message: `bad ${env.TELEGRAM_WEBHOOK_SECRET}` });
    const masked = await telegramStatus(user._id);
    expect(masked).toMatchObject({ active: true, url: '/api/telegram/webhook/***', pendingUpdates: 2, lastError: 'bad ***' });
    expect(JSON.stringify(masked)).not.toContain(env.TELEGRAM_WEBHOOK_SECRET);
  });

  it('uses the single active compatible account and rejects an archived default with ambiguous alternatives', async () => {
    settings.telegram.defaultIncomeAccount = null;
    await settings.save();
    expect(String((await resolveTelegramAccount(user._id, settings, 'in')).accountId)).toBe(String(account._id));
    const second = await Account.create({ user: user._id, name: 'Bank', type: 'bank', openingBalance: 0 });
    account.archived = true;
    await account.save();
    settings.telegram.defaultIncomeAccount = account._id;
    await settings.save();
    expect(String((await resolveTelegramAccount(user._id, settings, 'in')).accountId)).toBe(String(second._id));
    await Account.create({ user: user._id, name: 'Wallet', type: 'wallet', openingBalance: 0 });
    expect((await resolveTelegramAccount(user._id, settings, 'in')).error).toContain('default income account');
  });

  it('handles an authorized message and safely formats user content', async () => {
    await AccessSubscription.create({ user: user._id, plan: new mongoose.Types.ObjectId(), activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), planSnapshot: { name: 'Day', durationValue: 1, durationUnit: 'DAY' } });
    await TelegramConnection.create({ user: user._id, telegramUserId: '123', chatId: '123' });
    await handleTelegramUpdate({ message: { from: { id: 123 }, chat: { id: 123, type: 'private' }, text: 's 500 <Stand> #Logix' } });
    expect(sendMessage).toHaveBeenCalledWith('test-token', 123, expect.stringContaining('&lt;Stand&gt;'), expect.any(Object));
    expect((await TelegramConnection.findOne({ user: user._id })).lastUpdateAt).toBeInstanceOf(Date);
  });

  it('runs quick sale, undo, task completion and debt payment through Telegram updates', async () => {
    await AccessSubscription.create({ user: user._id, plan: new mongoose.Types.ObjectId(), activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), planSnapshot: { name: 'Day', durationValue: 1, durationUnit: 'DAY' } });
    await TelegramConnection.create({ user: user._id, telegramUserId: '123', chatId: '123' });
    const message = (text) => handleTelegramUpdate({ message: { from: { id: 123 }, chat: { id: 123, type: 'private' }, text } });
    const callback = (data) => handleTelegramUpdate({ callback_query: { id: `cb-${data}`, data, from: { id: 123 }, message: { chat: { id: 123, type: 'private' }, message_id: 10 } } });
    await callback('quick:sale');
    expect((await getPending('123', '123')).action).toBe('CREATE_SALE');
    await message('12500 Stand x3');
    const sale = await Transaction.findOne({ category: 'Sale' });
    expect(sale.amount).toBe(12500);
    expect(await getPending('123', '123')).toBeNull();
    await callback(`tx:edit:${sale._id}`);
    await message('15000 Stand x3');
    expect((await Transaction.findById(sale._id)).amount).toBe(15000);
    expect(await Transaction.countDocuments({ category: 'Sale' })).toBe(1);
    expect((await accountBalances(user._id))[0].currentBalance).toBe(15000);
    await callback(`tx:undo:${sale._id}`);
    expect((await Transaction.findById(sale._id)).deletedAt).toBeInstanceOf(Date);
    expect((await accountBalances(user._id))[0].currentBalance).toBe(0);
    await message('t Call supplier tomorrow 10:00 high');
    const task = await Task.findOne({ title: 'Call supplier' });
    expect(task).toMatchObject({ dueTime: '10:00', priority: 'high' });
    await callback(`task:done:${task._id}`);
    expect((await Task.findById(task._id)).completedAt).toBeInstanceOf(Date);
    await message('din Ahmed 5000 NFC order');
    const debt = await Debt.findOne({ personName: 'Ahmed' });
    await callback(`debt:pay:${debt._id}`);
    expect((await getPending('123', '123')).action).toBe('PAY_DEBT');
    await message('2000');
    expect((await Debt.findById(debt._id)).remainingAmount).toBe(3000);
    expect(await Transaction.countDocuments({ sourceEntityType: 'Debt' })).toBe(1);
  });

  it('offers selection when the same person has multiple open debts', async () => {
    await run('din Ahmed 5000 first');
    await run('din Ahmed 3000 second');
    const reply = await run('dpay ahmed 1000');
    expect(reply.text).toContain('multiple open debts');
    expect(reply.markup.inline_keyboard).toHaveLength(2);
    expect(reply.markup.inline_keyboard[0][0].callback_data).toMatch(/^debt:select:[a-f0-9]{24}$/);
    expect((await getPending('123', '123')).action).toBe('SELECT_DEBT');
    expect(await Transaction.countDocuments({ sourceEntityType: 'Debt' })).toBe(0);
    const selected = reply.markup.inline_keyboard[0][0].callback_data;
    const action = await handleCallbackAction({ from: { id: 123 }, message: { chat: { id: 123 } }, data: selected }, user._id, settings);
    expect(action.text).toContain('Payment recorded');
    expect(await Transaction.countDocuments({ sourceEntityType: 'Debt' })).toBe(1);
  });
});
