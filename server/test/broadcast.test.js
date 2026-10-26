import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import sharp from 'sharp';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { hashPassword } from '../src/services/authService.js';
import { Admin } from '../src/models/Admin.js';
import { User } from '../src/models/User.js';
import { Plan } from '../src/models/Plan.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { TelegramConnection } from '../src/models/TelegramConnection.js';
import { DailyFocus } from '../src/models/DailyFocus.js';
import { Task } from '../src/models/Task.js';
import { Setting } from '../src/models/Setting.js';
import { MessagePreference } from '../src/models/MessagePreference.js';
import { BroadcastCampaign } from '../src/models/BroadcastCampaign.js';
import { BroadcastRecipient } from '../src/models/BroadcastRecipient.js';
import { BroadcastSettings } from '../src/models/BroadcastSettings.js';
import { BroadcastLaunchGuard } from '../src/models/BroadcastLaunchGuard.js';
import { BroadcastDailyQuota } from '../src/models/BroadcastDailyQuota.js';
import { processBroadcastsOnce } from '../src/jobs/broadcastWorker.js';
import { ensureAutomaticTemplates, getAutomaticTemplate, renderAutomaticMessage, updateAutomaticTemplate } from '../src/services/automaticMessages.js';
import { audiencePipeline, previewAudience } from '../src/services/broadcastAudience.js';
import { broadcastParts, renderBroadcastText } from '../src/services/broadcastContent.js';
import { automaticReminderKey } from '../src/services/automaticMessages.js';
import { deliverReminder } from '../src/services/reminders/reminderDeliveryService.js';
import { coordinateReminder } from '../src/services/reminders/reminderCoordinatorService.js';

const bot = vi.hoisted(() => ({ telegramRequest: vi.fn().mockResolvedValue({ message_id: 101 }), sendPhoto: vi.fn().mockResolvedValue({ message_id: 102 }), sendMessage: vi.fn().mockResolvedValue({ message_id: 103 }) }));
const notify = vi.hoisted(() => ({ sendTelegramNotification: vi.fn().mockResolvedValue({ sent: 1 }) }));
vi.mock('../src/telegram/botClient.js', () => bot);
vi.mock('../src/telegram/notifier.js', () => notify);
const header = { 'X-Orbit-Admin-Action': '1' };
const password = 'broadcast-test-password';
const filters = { status: 'ALL', subscription: 'ALL', telegram: 'ALL', planIds: [], expiringDays: 30, search: '' };
const selection = { filters, allMatching: true, includeIds: [], excludeIds: [] };
const campaignBody = (audience = selection, category = 'IMPORTANT_NOTICE') => ({ name: 'Product news', description: 'Internal', category, channel: 'telegram', variants: { en: { text: '<b>Hello {firstName}</b>' }, ar: { text: '<b>مرحبا {firstName}</b>' } }, imageId: null, buttons: [[{ label: 'Open', url: 'https://example.com' }]], audience });
let mongo; let root; let staff; let rootUser; let freeUser; let expiredUser; let suspendedUser; let plan; let rootAgent; let staffAgent;

beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDatabase(mongo.getUri()); env.ORBIT_TELEGRAM_BOT_TOKEN = 'test-token'; });
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all([Admin.init(), User.init(), Plan.init(), BroadcastCampaign.init(), BroadcastRecipient.init(), BroadcastLaunchGuard.init(), BroadcastDailyQuota.init(), TelegramConnection.init(), MessagePreference.init()]);
  await Promise.all([BroadcastLaunchGuard.createIndexes(), BroadcastDailyQuota.createIndexes()]);
  await BroadcastSettings.create({ key: 'global', deliveryStart: '00:00', deliveryEnd: '23:59', quietHours: false });
  bot.telegramRequest.mockReset().mockResolvedValue({ message_id: 101 }); bot.sendPhoto.mockReset().mockResolvedValue({ message_id: 102 });
  notify.sendTelegramNotification.mockReset().mockResolvedValue({ sent: 1 });
  root = await Admin.create({ fullName: 'Root Admin', email: 'root@example.com', passwordHash: await hashPassword(password), role: 'SUPER_ADMIN' });
  staff = await Admin.create({ fullName: 'Staff Admin', email: 'staff@example.com', passwordHash: await hashPassword(password), role: 'ADMIN' });
  plan = await Plan.create({ name: 'Plus', slug: 'plus-broadcast', kind: 'PAID', durationValue: 30, durationUnit: 'DAY', status: 'ACTIVE', createdBy: root._id });
  const userPasswordHash = await hashPassword('user-password-long');
  [rootUser, freeUser, expiredUser, suspendedUser] = await User.create([
    { fullName: 'Root User', email: 'root@example.com', passwordHash: userPasswordHash },
    { fullName: 'Free User', email: 'free@example.com', passwordHash: 'unused' },
    { fullName: 'Expired User', email: 'expired@example.com', passwordHash: 'unused' },
    { fullName: 'Suspended User', email: 'suspended@example.com', passwordHash: 'unused', status: 'SUSPENDED' },
  ]);
  await TelegramConnection.create([{ user: rootUser._id, telegramUserId: '1', chatId: '1' }, { user: freeUser._id, telegramUserId: '2', chatId: '2' }, { user: suspendedUser._id, telegramUserId: '3', chatId: '3' }]);
  await MessagePreference.create({ user: rootUser._id, promotionalTelegram: true, consentAt: new Date() });
  await AccessSubscription.create([{ user: rootUser._id, plan: plan._id, source: 'ADMIN_GRANT', startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 5 * 86400000), status: 'ACTIVE' }, { user: expiredUser._id, plan: plan._id, source: 'ADMIN_GRANT', startedAt: new Date(Date.now() - 20 * 86400000), activatedAt: new Date(Date.now() - 20 * 86400000), expiresAt: new Date(Date.now() - 86400000), status: 'EXPIRED' }]);
  rootAgent = request.agent(app); staffAgent = request.agent(app);
  await rootAgent.post('/api/admin/auth/login').send({ email: root.email, password }).expect(200);
  await staffAgent.post('/api/admin/auth/login').send({ email: staff.email, password }).expect(200);
});

describe('audience and campaign API', () => {
  it('separates active account, paid access, expiry, Telegram connection and consent', async () => {
    expect((await previewAudience(selection)).deliverable).toBe(2);
    expect((await previewAudience(selection, { promotional: true })).deliverable).toBe(1);
    expect((await previewAudience({ ...selection, filters: { ...filters, subscription: 'FREE' } })).targeted).toBe(3);
    expect((await previewAudience({ ...selection, filters: { ...filters, subscription: 'EXPIRED' } })).targeted).toBe(1);
    expect((await previewAudience({ ...selection, filters: { ...filters, subscription: 'PAID', telegram: 'CONNECTED' } })).targeted).toBe(1);
    expect((await previewAudience({ ...selection, allMatching: false, includeIds: [rootUser.id, freeUser.id], excludeIds: [freeUser.id] })).deliverable).toBe(1);
    expect(audiencePipeline(selection)).toBeInstanceOf(Array);
    const response = await rootAgent.post('/api/admin/broadcast-audience/users').set(header).send({ selection, page: 2, limit: 2 }).expect(200);
    expect(response.body.data.total).toBe(4); expect(response.body.data.rows).toHaveLength(2);
  });
  it('lets a user opt out and back in independently of Telegram connection', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: rootUser.email, password: 'user-password-long' }).expect(200);
    expect((await agent.get('/api/message-preferences').expect(200)).body.data.promotionalTelegram).toBe(true);
    await agent.put('/api/message-preferences').send({ promotionalTelegram: false }).expect(200);
    expect((await previewAudience(selection, { promotional: true })).deliverable).toBe(0);
    expect(await TelegramConnection.exists({ user: rootUser._id })).toBeTruthy();
    await agent.put('/api/message-preferences').send({ promotionalTelegram: true }).expect(200);
    expect((await previewAudience(selection, { promotional: true })).deliverable).toBe(1);
  });
  it('enforces role, CSRF, reauthentication and launch idempotency', async () => {
    await staffAgent.post('/api/admin/broadcasts').send(campaignBody()).expect(403);
    const created = await staffAgent.post('/api/admin/broadcasts').set(header).send(campaignBody()).expect(201);
    const id = created.body.data._id;
    await staffAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password }).expect(403);
    await rootAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: 'wrong' }).expect(403);
    await rootAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password }).expect(200);
    await rootAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password }).expect(409);
    expect((await BroadcastCampaign.findById(id)).status).toBe('PREPARING');
  });
  it('enforces duplicate and daily campaign safeguards', async () => {
    const first = await rootAgent.post('/api/admin/broadcasts').set(header).send(campaignBody()).expect(201);
    const duplicate = await rootAgent.post('/api/admin/broadcasts').set(header).send(campaignBody()).expect(201);
    await rootAgent.post(`/api/admin/broadcasts/${first.body.data._id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password }).expect(200);
    await rootAgent.post(`/api/admin/broadcasts/${duplicate.body.data._id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password }).expect(409);
    await BroadcastSettings.updateOne({ key: 'global' }, { $set: { dailyCampaignLimit: 1 } });
    const different = await rootAgent.post('/api/admin/broadcasts').set(header).send({ ...campaignBody(), variants: { en: { text: 'Different content' }, ar: { text: 'محتوى مختلف' } } }).expect(201);
    await rootAgent.post(`/api/admin/broadcasts/${different.body.data._id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password }).expect(429);
  });
  it('rejects unsafe formatting, callbacks, URLs and unauthorized test recipients', async () => {
    expect(() => renderBroadcastText('<script>x</script>')).toThrow();
    expect(() => renderBroadcastText('<b>{unknown}</b>')).toThrow();
    expect(renderBroadcastText('<b>{firstName}</b>', { firstName: '<evil>' })).toBe('<b>&lt;evil&gt;</b>');
    await rootAgent.post('/api/admin/broadcasts').set(header).send({ ...campaignBody(), buttons: [[{ label: 'Unsafe', url: 'http://example.com' }]] }).expect(422);
    await rootAgent.post('/api/admin/broadcasts').set(header).send({ ...campaignBody(), buttons: [[{ label: 'Unsafe', action: 'DELETE' }]] }).expect(422);
    const created = await rootAgent.post('/api/admin/broadcasts').set(header).send(campaignBody()).expect(201);
    await rootAgent.post(`/api/admin/broadcasts/${created.body.data._id}/test`).set(header).send({ recipientUserId: freeUser.id, language: 'en' }).expect(403);
    await rootAgent.post(`/api/admin/broadcasts/${created.body.data._id}/test`).set(header).send({ recipientUserId: rootUser.id, language: 'en' }).expect(200);
    expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
    const promotionalParts = broadcastParts({ ...campaignBody(selection, 'PROMOTION'), _id: created.body.data._id }, 'ar', { firstName: 'أحمد' });
    expect(promotionalParts.text.keyboard.inline_keyboard.flat().some((button) => button.callback_data?.startsWith('b:optout:'))).toBe(true);
  });
  it('restricts global template and worker settings to Super Admins', async () => {
    const variants = { en: { title: 'Notice', body: '{legacyMessage}' }, ar: { title: 'إشعار', body: '{legacyMessage}' } };
    await staffAgent.put('/api/admin/automatic-messages/reminder-generic').set(header).send({ enabled: true, variants, buttons: [] }).expect(403);
    await rootAgent.put('/api/admin/automatic-messages/reminder-generic').send({ enabled: true, variants, buttons: [] }).expect(403);
    await rootAgent.put('/api/admin/automatic-messages/reminder-generic').set(header).send({ enabled: true, variants, buttons: [] }).expect(200);
    const history = await rootAgent.get('/api/admin/automatic-messages/reminder-generic/history').expect(200);
    expect(history.body.data.rows).toHaveLength(1);
    const settings = (await rootAgent.get('/api/admin/broadcast-settings').expect(200)).body.data;
    const input = Object.fromEntries(['enabled', 'requestsPerSecond', 'concurrency', 'batchSize', 'maxAttempts', 'retryDelaySeconds', 'dailyCampaignLimit', 'deliveryStart', 'deliveryEnd', 'quietHours', 'duplicateWindowHours'].map((key) => [key, settings[key]]));
    await staffAgent.put('/api/admin/broadcast-settings').set(header).send(input).expect(403);
    await rootAgent.put('/api/admin/broadcast-settings').set(header).send({ ...input, requestsPerSecond: 200 }).expect(422);
    await rootAgent.put('/api/admin/broadcast-settings').set(header).send({ ...input, requestsPerSecond: 10 }).expect(200);
  });
  it('schedules, pauses, resumes and cancels without sending', async () => {
    const created = await rootAgent.post('/api/admin/broadcasts').set(header).send(campaignBody()).expect(201);
    const id = created.body.data._id;
    const scheduledAt = new Date(Date.now() + 3600000).toISOString();
    await rootAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password, scheduledAt }).expect(200);
    await processBroadcastsOnce();
    expect((await BroadcastCampaign.findById(id)).status).toBe('SCHEDULED');
    await rootAgent.post(`/api/admin/broadcasts/${id}/pause`).set(header).expect(200);
    await processBroadcastsOnce(); expect(bot.telegramRequest).not.toHaveBeenCalled();
    await rootAgent.post(`/api/admin/broadcasts/${id}/resume`).set(header).expect(200);
    await rootAgent.post(`/api/admin/broadcasts/${id}/cancel`).set(header).expect(200);
    await processBroadcastsOnce(); expect(bot.telegramRequest).not.toHaveBeenCalled();
    expect(await BroadcastRecipient.countDocuments({ campaign: id, status: 'SKIPPED' })).toBe(2);
  });
  it('suppresses an opt-out that occurs after snapshot and before delivery', async () => {
    const created = await rootAgent.post('/api/admin/broadcasts').set(header).send(campaignBody(selection, 'PROMOTION')).expect(201);
    const id = created.body.data._id;
    await rootAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password, scheduledAt: new Date(Date.now() + 3600000).toISOString() }).expect(200);
    await processBroadcastsOnce();
    expect(await BroadcastRecipient.countDocuments({ campaign: id })).toBe(1);
    await MessagePreference.updateOne({ user: rootUser._id }, { $set: { promotionalTelegram: false, optOutAt: new Date() } });
    await BroadcastCampaign.updateOne({ _id: id }, { $set: { status: 'SENDING', startedAt: new Date() } });
    await processBroadcastsOnce();
    expect(await BroadcastRecipient.countDocuments({ campaign: id, status: 'SKIPPED' })).toBe(1);
    expect(bot.telegramRequest).not.toHaveBeenCalled();
  });
});

describe('worker and templates', () => {
  it('visits later campaigns when older campaigns are waiting for retries', async () => {
    const startedAt = new Date();
    const campaigns = await BroadcastCampaign.create(Array.from({ length: 11 }, (_, index) => ({
      ...campaignBody(), name: `Campaign ${index}`, status: 'SENDING', startedAt, createdBy: root._id,
    })));
    await BroadcastRecipient.create(campaigns.map((campaign, index) => ({
      campaign: campaign._id, user: rootUser._id, chatId: '1',
      status: index < 10 ? 'RETRYING' : 'PENDING',
      ...(index < 10 ? { nextAttemptAt: new Date(Date.now() + 3600000) } : {}),
    })));
    await processBroadcastsOnce();
    expect(bot.telegramRequest).not.toHaveBeenCalled();
    await processBroadcastsOnce();
    expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
    expect((await BroadcastRecipient.findOne({ campaign: campaigns[10]._id })).status).toBe('SENT');
  });
  it('snapshots recipients, sends text once under concurrent worker ticks and supports pause', async () => {
    const created = await rootAgent.post('/api/admin/broadcasts').set(header).send(campaignBody()).expect(201);
    const id = created.body.data._id;
    await rootAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password }).expect(200);
    await Promise.all([processBroadcastsOnce(), processBroadcastsOnce()]);
    expect(await BroadcastRecipient.countDocuments({ campaign: id, status: 'SENT' })).toBe(2);
    expect(bot.telegramRequest).toHaveBeenCalledTimes(2);
    await processBroadcastsOnce(); expect(bot.telegramRequest).toHaveBeenCalledTimes(2);
    expect((await BroadcastCampaign.findById(id)).status).toBe('COMPLETED');
  });
  it('keeps successful photo parts when a text part fails', async () => {
    const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const uploaded = await rootAgent.post('/api/admin/broadcasts/media').set(header).set('Content-Type', 'image/png').send(image).expect(201);
    const body = campaignBody({ ...selection, allMatching: false, includeIds: [rootUser.id] });
    body.imageId = uploaded.body.data.imageId; body.variants.en.text = 'x'.repeat(1100); body.variants.ar.text = 'x'.repeat(1100);
    const created = await rootAgent.post('/api/admin/broadcasts').set(header).send(body).expect(201);
    const id = created.body.data._id;
    await rootAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password }).expect(200);
    bot.telegramRequest.mockRejectedValueOnce(Object.assign(new Error('Too Many Requests'), { telegramCode: 429, retryAfter: 1 }));
    await processBroadcastsOnce();
    let recipient = await BroadcastRecipient.findOne({ campaign: id });
    expect(recipient.status).toBe('RETRYING'); expect(recipient.parts.photo.status).toBe('SENT'); expect(bot.sendPhoto).toHaveBeenCalledTimes(1);
    await BroadcastRecipient.updateOne({ _id: recipient._id }, { $set: { nextAttemptAt: new Date(0) } });
    await processBroadcastsOnce();
    recipient = await BroadcastRecipient.findById(recipient._id);
    expect(recipient.status).toBe('SENT'); expect(bot.sendPhoto).toHaveBeenCalledTimes(1);
  });
  it('marks an expired processing lease ambiguous after restart and avoids blind retry', async () => {
    const created = await rootAgent.post('/api/admin/broadcasts').set(header).send(campaignBody({ ...selection, allMatching: false, includeIds: [rootUser.id] })).expect(201);
    const id = created.body.data._id;
    await rootAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password, scheduledAt: new Date(Date.now() + 3600000).toISOString() }).expect(200);
    await processBroadcastsOnce();
    await BroadcastCampaign.updateOne({ _id: id }, { $set: { status: 'SENDING', startedAt: new Date() } });
    await BroadcastRecipient.updateOne({ campaign: id }, { $set: { status: 'PROCESSING', claimedBy: 'old-worker', claimUntil: new Date(0), attempts: 1 } });
    await processBroadcastsOnce();
    const recipient = await BroadcastRecipient.findOne({ campaign: id });
    expect(recipient.status).toBe('FAILED'); expect(recipient.lastError.code).toBe('AMBIGUOUS');
    const retried = await rootAgent.post(`/api/admin/broadcasts/${id}/retry`).set(header).expect(200);
    expect(retried.body.data.queued).toBe(0);
    expect(bot.telegramRequest).not.toHaveBeenCalled();
  });
  it('defers recipients during their quiet hours without consuming an attempt', async () => {
    await BroadcastSettings.updateOne({ key: 'global' }, { $set: { quietHours: true } });
    await Setting.create({ user: rootUser._id, timezone: 'UTC', reminders: { quietHours: { enabled: true, start: '00:00', end: '23:59' } } });
    const created = await rootAgent.post('/api/admin/broadcasts').set(header).send(campaignBody({ ...selection, allMatching: false, includeIds: [rootUser.id] })).expect(201);
    const id = created.body.data._id;
    await rootAgent.post(`/api/admin/broadcasts/${id}/launch`).set(header).send({ confirmation: 'SEND', adminPassword: password }).expect(200);
    await processBroadcastsOnce();
    let recipient = await BroadcastRecipient.findOne({ campaign: id });
    expect(recipient.status).toBe('RETRYING'); expect(recipient.attempts).toBe(0);
    expect(bot.telegramRequest).not.toHaveBeenCalled();
    await Setting.updateOne({ user: rootUser._id }, { $set: { 'reminders.quietHours.enabled': false } });
    await BroadcastRecipient.updateOne({ _id: recipient._id }, { $set: { nextAttemptAt: new Date(0) } });
    await processBroadcastsOnce();
    recipient = await BroadcastRecipient.findById(recipient._id);
    expect(recipient.status).toBe('SENT');
  });
  it('initializes templates idempotently, validates variables, and renders escaped data', async () => {
    await ensureAutomaticTemplates(); await ensureAutomaticTemplates();
    const template = await getAutomaticTemplate('debt-act');
    expect(template.revision).toBe(0);
    const edited = await updateAutomaticTemplate('debt-act', { enabled: true, variants: { en: { title: 'Debt for {personName}', body: '{remainingAmount} {currency}' }, ar: { title: 'دين {personName}', body: '{remainingAmount} {currency}' } }, buttons: [[{ label: 'Open Orbit', url: 'https://example.com' }]] }, root._id);
    expect(edited.revision).toBe(1);
    const rendered = await renderAutomaticMessage('debt-act', 'en', { personName: '<Ali>', remainingAmount: 50, currency: 'DZD' });
    expect(rendered.title).toContain('&lt;Ali&gt;'); expect(rendered.buttons[0][0].url).toBe('https://example.com');
    const lengthy = await renderAutomaticMessage('debt-act', 'en', { personName: 'x'.repeat(500), remainingAmount: 'y'.repeat(5000), currency: 'DZD' });
    expect(lengthy.title.length).toBeLessThanOrEqual(180);
    expect(lengthy.message.length).toBeLessThanOrEqual(3800);
    await expect(updateAutomaticTemplate('debt-act', { enabled: true, variants: { en: { title: '{password}', body: 'body' }, ar: { title: 'title', body: 'body' } } }, root._id)).rejects.toThrow('Unsupported variable');
    await expect(updateAutomaticTemplate('debt-act', { enabled: true, variants: edited.variants, buttons: [[{ label: 'Unsafe', url: 'javascript:alert(1)' }]] }, root._id)).rejects.toThrow('HTTPS');
    await updateAutomaticTemplate('debt-act', { enabled: false, variants: edited.variants, buttons: [] }, root._id);
    expect(await renderAutomaticMessage('debt-act', 'en', { personName: 'Ali' })).toBeNull();
    expect((await renderAutomaticMessage('debt-act', 'en', { personName: 'Ali' }, { preview: true })).title).toBe('Debt for Ali');
    expect((await rootAgent.post('/api/admin/automatic-messages/debt-act/preview').set(header).send({ language: 'en' }).expect(200)).body.data.title).toContain('Debt for');
  });
  it('uses edited event templates for existing event reminder records', async () => {
    const reminder = { _id: new mongoose.Types.ObjectId(), user: rootUser._id, entityType: 'custom', title: 'Concert updated', message: 'Venue changed', source: 'custom', autoGenerated: false, deliveryChannels: ['telegram'], metadata: { integration: 'dzevent-change', eventIds: [] } };
    expect(automaticReminderKey(reminder)).toBe('event-change');
    await updateAutomaticTemplate('event-change', { enabled: true, variants: { en: { title: 'Update: {eventName}', body: '{legacyMessage}' }, ar: { title: 'تحديث: {eventName}', body: '{legacyMessage}' } } }, root._id);
    await deliverReminder(reminder);
    expect(notify.sendTelegramNotification).toHaveBeenCalledWith(rootUser._id, expect.objectContaining({ title: 'Update: Concert updated', message: 'Venue changed', html: true }));
    await updateAutomaticTemplate('event-change', { enabled: false, variants: { en: { title: 'Update: {eventName}', body: '{legacyMessage}' }, ar: { title: 'تحديث: {eventName}', body: '{legacyMessage}' } } }, root._id);
    expect((await coordinateReminder(reminder)).action).toBe('defer');
  });
  it('resolves Daily Focus variables from live tasks and preserves a customized reminder', async () => {
    const tasks = await Task.create([{ user: rootUser._id, title: 'Done task', status: 'completed' }, { user: rootUser._id, title: 'Open task', status: 'todo' }]);
    const focus = await DailyFocus.create({ user: rootUser._id, date: '2026-10-26', timezone: 'UTC', items: tasks.map((task, position) => ({ task: task._id, position })) });
    const variants = { en: { title: 'Focus review', body: '{completedCount} of {totalCount} completed' }, ar: { title: 'مراجعة التركيز', body: '{completedCount} من {totalCount}' } };
    await updateAutomaticTemplate('focus-evening', { enabled: true, variants }, root._id);
    const reminder = { _id: new mongoose.Types.ObjectId(), user: rootUser._id, entityType: 'custom', title: 'Review', message: 'Legacy review', autoGenerated: true, deliveryChannels: ['telegram'], metadata: { automation: 'focus-evening', focusId: focus._id, date: '2026-10-26', items: [] } };
    await deliverReminder(reminder);
    expect(notify.sendTelegramNotification).toHaveBeenCalledWith(rootUser._id, expect.objectContaining({ title: 'Focus review', message: '1 of 2 completed' }));
    notify.sendTelegramNotification.mockClear();
    await deliverReminder({ ...reminder, customized: true, message: 'My custom review' });
    expect(notify.sendTelegramNotification).toHaveBeenCalledWith(rootUser._id, expect.objectContaining({ message: 'My custom review' }));
  });
});
