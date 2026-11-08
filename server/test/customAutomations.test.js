import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import sharp from 'sharp';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { hashPassword } from '../src/services/authService.js';
import { Admin } from '../src/models/Admin.js';
import { User } from '../src/models/User.js';
import { Plan } from '../src/models/Plan.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { TelegramConnection } from '../src/models/TelegramConnection.js';
import { MessagePreference } from '../src/models/MessagePreference.js';
import { BroadcastSettings } from '../src/models/BroadcastSettings.js';
import { CustomAutomation, AutomationExecution } from '../src/models/CustomAutomation.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { processCustomAutomationsOnce } from '../src/jobs/customAutomationWorker.js';
import { scheduleAutomation } from '../src/services/customAutomations.js';
import { createAdminGrant } from '../src/services/adminGrantService.js';
import { createActivationLink, activateLink } from '../src/services/activationService.js';
import { workspaceModels } from '../src/services/adminUserLifecycleService.js';
import { handleTelegramUpdate } from '../src/telegram/handler.js';

const bot = vi.hoisted(() => ({ telegramRequest: vi.fn(), sendPhoto: vi.fn(), sendMessage: vi.fn() }));
vi.mock('../src/telegram/botClient.js', () => bot);
const header = { 'X-Orbit-Admin-Action': '1' };
const message = (text = 'Welcome {firstName}', delayMinutes = 0, order = 0) => ({ order, text, imageId: null, buttons: [], delayMinutes });
const input = (messages = [message()], type = 'REGISTRATION') => ({ name: 'Welcome New Users', enabled: true, promotional: false, trigger: { type, configuration: {} }, audience: { type: 'ALL', planIds: [] }, messages });
let mongo; let passwordHash; let root; let user; let plan; let agent;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(mongo.getUri()); passwordHash = await hashPassword('automation-password');
});
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all([CustomAutomation.createIndexes(), AutomationExecution.createIndexes(), User.createIndexes(), TelegramConnection.createIndexes(), AccessSubscription.createIndexes(), BroadcastSettings.createIndexes()]);
  bot.telegramRequest.mockReset().mockResolvedValue({ message_id: 1 }); bot.sendPhoto.mockReset().mockResolvedValue({ message_id: 2 });
  root = await Admin.create({ fullName: 'Root', email: 'root@example.com', passwordHash, role: 'SUPER_ADMIN' });
  user = await User.create({ fullName: 'Alex Example', email: root.email, passwordHash });
  plan = await Plan.create({ name: 'Plus', kind: 'PAID', durationValue: 30, durationUnit: 'DAY', createdBy: root._id });
  await TelegramConnection.create({ user: user._id, telegramUserId: '123', chatId: '123' });
  await BroadcastSettings.create({ key: 'global', quietHours: false, deliveryStart: '00:00', deliveryEnd: '23:59', retryDelaySeconds: 10 });
  agent = request.agent(app);
  await agent.post('/api/admin/auth/login').send({ email: root.email, password: 'automation-password' }).expect(200);
});
const create = async (body = input()) => (await agent.post('/api/admin/custom-automations').set(header).send(body).expect(201)).body.data;
const registration = async (id = user._id) => AuditLog.create({ event: 'USER_CREATED', actorType: 'USER', targetType: 'User', targetId: id });
const subscription = (extra = {}) => AccessSubscription.create({ user: user._id, plan: plan._id, source: 'ADMIN_GRANT', startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), ...extra });

describe('custom automation authoring and authorization', () => {
  it('creates one or multiple messages, edits order, validates references and previews unsaved HTML', async () => {
    const single = await create(); expect(single.messages).toHaveLength(1);
    const body = input([message('First'), message('Second', 1440, 1), message('Third', 4320, 2)]);
    const automation = await create(body);
    const reordered = { ...body, messages: [message('Third', 4320), message('First', 0, 1), message('Second', 1440, 2)] };
    const edited = await agent.put(`/api/admin/custom-automations/${automation._id}`).set(header).send(reordered).expect(200);
    expect(edited.body.data.messages.map((entry) => entry.text)).toEqual(['Third', 'First', 'Second']);
    expect(edited.body.data.revision).toBe(2);
    const preview = await agent.post('/api/admin/custom-automations/preview').set(header).send({ automation: input(), messageIndex: 0 }).expect(200);
    expect(preview.body.data.text.text).toBe('Welcome Alex');
    await agent.post('/api/admin/custom-automations').set(header).send(input([message('<script>bad</script>')])).expect(422);
    await agent.post('/api/admin/custom-automations').set(header).send(input([{ ...message(), buttons: [[{ label: 'Unsafe', url: 'http://example.com' }]] }])).expect(422);
    await agent.post('/api/admin/custom-automations').set(header).send({ ...input(), audience: { type: 'PLANS', planIds: ['000000000000000000000001'] } }).expect(422);
    await agent.post('/api/admin/custom-automations').set(header).send(input([message('Bad order', 0, 1)])).expect(422);
  });
  it('requires authentication, CSRF, Super Admin and confines test sends to the admin account', async () => {
    await request(app).get('/api/admin/custom-automations').expect(401);
    await agent.post('/api/admin/custom-automations').send(input()).expect(403);
    await agent.post('/api/admin/custom-automations/test').set(header).send({ automation: input() }).expect(200);
    expect(bot.telegramRequest.mock.calls[0][2].chat_id).toBe('123');
    await agent.post('/api/admin/custom-automations/test').set(header).send({ automation: input(), recipientUserId: user.id }).expect(422);
    await Admin.updateOne({ _id: root._id }, { $set: { role: 'ADMIN' } });
    await agent.get('/api/admin/custom-automations').expect(200);
    await agent.post('/api/admin/custom-automations').set(header).send(input()).expect(403);
    await agent.patch(`/api/admin/custom-automations/${new mongoose.Types.ObjectId()}/enabled`).set(header).send({ enabled: true }).expect(403);
  });
  it('disables, cancels pending jobs, and enables only future event starts', async () => {
    const automation = await create(input([message('Later', 1440)])); await registration();
    await processCustomAutomationsOnce(); expect(await AutomationExecution.countDocuments({ status: 'PENDING' })).toBe(1);
    await agent.patch(`/api/admin/custom-automations/${automation._id}/enabled`).set(header).send({ enabled: false }).expect(200);
    expect(await AutomationExecution.countDocuments({ status: 'CANCELLED' })).toBe(1);
    await agent.patch(`/api/admin/custom-automations/${automation._id}/enabled`).set(header).send({ enabled: true }).expect(200);
    await processCustomAutomationsOnce(); expect(await AutomationExecution.countDocuments()).toBe(1);
    expect(bot.telegramRequest).not.toHaveBeenCalled();
    expect(workspaceModels).toContain(AutomationExecution);
  });
  it('cancels pending steps on edit without enrolling new steps into an old expiry run', async () => {
    const body = input([message('Later', 60)], 'BEFORE_EXPIRY'); body.trigger.configuration = { leadMinutes: 4320 };
    const automation = await create(body);
    await subscription({ expiresAt: new Date(Date.now() + 3 * 86400000 - 1000) });
    await processCustomAutomationsOnce();
    await agent.put(`/api/admin/custom-automations/${automation._id}`).set(header).send({ ...body, messages: [message('Updated', 60), message('Additional', 120, 1)] }).expect(200);
    await processCustomAutomationsOnce();
    expect(await AutomationExecution.countDocuments()).toBe(1);
    expect((await AutomationExecution.findOne()).status).toBe('CANCELLED');
    expect(bot.telegramRequest).not.toHaveBeenCalled();
  });
});

describe('durable trigger scheduling and delivery', () => {
  it('starts from successful backend registration and allows linking before a delayed message', async () => {
    const automation = await create(input([message('Welcome', 1)]));
    const result = await request(app).post('/api/auth/register').send({ fullName: 'New User', email: 'new@example.com', phone: '+213555001234', password: 'new-user-password' }).expect(201);
    const newUserId = result.body.data.user.id;
    await processCustomAutomationsOnce();
    const job = await AutomationExecution.findOne({ automation: automation._id, user: newUserId });
    expect(job).toBeTruthy(); expect(job.status).toBe('PENDING');
    await TelegramConnection.create({ user: newUserId, chatId: '456', telegramUserId: '456' });
    await AutomationExecution.updateOne({ _id: job._id }, { $set: { scheduledAt: new Date(0) } });
    await processCustomAutomationsOnce();
    expect((await AutomationExecution.findById(job._id)).status).toBe('SENT');
    expect(bot.telegramRequest.mock.calls[0][2].chat_id).toBe('456');
  });
  it('schedules each delay relative to the event, survives reconnect, and deduplicates concurrent worker ticks', async () => {
    await create(input([message('Now'), message('Tomorrow', 1440, 1), message('Day three', 4320, 2)]));
    const event = await registration();
    await Promise.all([processCustomAutomationsOnce(), processCustomAutomationsOnce()]);
    let jobs = await AutomationExecution.find().sort({ messageIndex: 1 });
    expect(jobs).toHaveLength(3); expect(jobs[0].status).toBe('SENT'); expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
    expect(+jobs[1].scheduledAt - +event.createdAt).toBe(1440 * 60000);
    expect(+jobs[2].scheduledAt - +event.createdAt).toBe(4320 * 60000);
    await disconnectDatabase(); await connectDatabase(mongo.getUri());
    await AutomationExecution.updateMany({ status: 'PENDING' }, { $set: { scheduledAt: new Date(0) } });
    await processCustomAutomationsOnce();
    jobs = await AutomationExecution.find(); expect(jobs.every((job) => job.status === 'SENT')).toBe(true);
    await processCustomAutomationsOnce(); expect(bot.telegramRequest).toHaveBeenCalledTimes(3);
  });
  it('uses committed admin grants and activation links once per subscription cycle', async () => {
    await create(input([message('Activated')], 'SUBSCRIPTION_ACTIVATED'));
    const grantInput = { mode: 'GRANT', planId: plan.id, grantKind: 'COMPLIMENTARY', reason: 'Automation test', idempotencyKey: 'automation-grant' };
    const grant = await createAdminGrant(user._id, root._id, grantInput);
    await createAdminGrant(user._id, root._id, grantInput);
    await processCustomAutomationsOnce(); expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
    const link = await createActivationLink(plan.id, root._id);
    await activateLink(link.url.split('/').at(-1), user);
    // A repeated committed event for the same cycle cannot schedule another send.
    await AuditLog.create({ event: 'ACCESS_ACTIVATED', actorType: 'SYSTEM', targetType: 'AccessSubscription', targetId: grant._id });
    await processCustomAutomationsOnce(); expect(bot.telegramRequest).toHaveBeenCalledTimes(2);
    expect(await AutomationExecution.countDocuments()).toBe(2);
  });
  it.each(['ACCESS_ACTIVATED', 'ADMIN_ACCESS_GRANTED'])('consumes %s events only when the source subscription exists', async (eventName) => {
    await create(input([message('Activated')], 'SUBSCRIPTION_ACTIVATED'));
    const sub = await subscription();
    await AuditLog.create({ event: eventName, actorType: 'SYSTEM', targetType: 'AccessSubscription', targetId: sub._id });
    await processCustomAutomationsOnce(); expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
    expect((await AutomationExecution.findOne()).sourceEventId).toBe(`activation:${sub._id}`);
  });
  it('sends before expiry and suppresses delayed messages when a newer cycle renews access', async () => {
    const body = input([message('Three days before'), message('One day before', 2880, 1)], 'BEFORE_EXPIRY');
    body.trigger.configuration = { leadMinutes: 4320 };
    const automation = await create(body);
    const sub = await subscription({ expiresAt: new Date(Date.now() + 3 * 86400000 - 1000) });
    await processCustomAutomationsOnce(); expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
    expect(await AutomationExecution.countDocuments({ status: 'PENDING' })).toBe(1);
    await subscription({ expiresAt: new Date(Date.now() + 30 * 86400000) });
    await AutomationExecution.updateMany({ automation: automation._id, status: 'PENDING' }, { $set: { scheduledAt: new Date(0) } });
    await processCustomAutomationsOnce(); expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
    expect(await AutomationExecution.countDocuments({ subscription: sub._id, status: 'SKIPPED' })).toBe(1);
  });
  it('uses actual expiry timestamps, skips renewed/changed expirations, and sends after expiry', async () => {
    const automation = await create(input([message('Expired {planName} on {expiryDate}')], 'AFTER_EXPIRY'));
    // Enable before the simulated expiry event.
    await CustomAutomation.updateOne({ _id: automation._id }, { $set: { enabledAt: new Date(Date.now() - 86400000) } });
    await subscription({ expiresAt: new Date(Date.now() - 1000), status: 'EXPIRED' });
    await processCustomAutomationsOnce(); expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
    expect(bot.telegramRequest.mock.calls[0][2].text).toMatch(/^Expired Plus on /);
    expect(bot.telegramRequest.mock.calls[0][2].text).not.toContain('—');
    await processCustomAutomationsOnce(); expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
  });
  it('suppresses an after-expiry notification after renewal before its delay elapses', async () => {
    const automation = await create(input([message('Expired', 60)], 'AFTER_EXPIRY'));
    await CustomAutomation.updateOne({ _id: automation._id }, { $set: { enabledAt: new Date(Date.now() - 86400000) } });
    await subscription({ expiresAt: new Date(Date.now() - 1000), status: 'EXPIRED' });
    await processCustomAutomationsOnce(); await subscription();
    await AutomationExecution.updateMany({}, { $set: { scheduledAt: new Date(0) } });
    await processCustomAutomationsOnce();
    expect((await AutomationExecution.findOne()).status).toBe('SKIPPED'); expect(bot.telegramRequest).not.toHaveBeenCalled();
  });
  it('runs a scheduled automation once in UTC and excludes users created after the start', async () => {
    const at = new Date(Date.now() + 60000);
    const body = input([message('Scheduled')], 'SCHEDULED'); body.trigger.configuration = { scheduledAt: at.toISOString() };
    const automation = await create(body);
    await processCustomAutomationsOnce(); expect(await AutomationExecution.countDocuments()).toBe(0);
    await scheduleAutomation(await CustomAutomation.findById(automation._id), new Date(at.getTime() + 1));
    expect(+(await AutomationExecution.findOne()).scheduledAt).toBe(+at);
    await AutomationExecution.updateMany({}, { $set: { scheduledAt: new Date(0) } });
    await processCustomAutomationsOnce(); await processCustomAutomationsOnce();
    expect(bot.telegramRequest).toHaveBeenCalledTimes(1);
  });
  it.each(['disconnect', 'suspend', 'optout', 'audience'])('reevaluates %s before each send', async (change) => {
    const body = input([message('Later', 60)]);
    body.promotional = change === 'optout';
    if (change === 'audience') body.audience.type = 'ACTIVE';
    if (body.promotional) await MessagePreference.create({ user: user._id, promotionalTelegram: true });
    await create(body); await registration(); await processCustomAutomationsOnce();
    if (change === 'disconnect') await TelegramConnection.deleteMany({});
    if (change === 'suspend') await User.updateOne({ _id: user._id }, { $set: { status: 'SUSPENDED' } });
    if (change === 'optout') await MessagePreference.updateOne({ user: user._id }, { $set: { promotionalTelegram: false } });
    await AutomationExecution.updateMany({}, { $set: { scheduledAt: new Date(0) } });
    await processCustomAutomationsOnce(); expect((await AutomationExecution.findOne()).status).toBe('SKIPPED');
    expect(bot.telegramRequest).not.toHaveBeenCalled();
  });
  it('honors the promotional opt-out button for Free users and suppresses later steps', async () => {
    await MessagePreference.create({ user: user._id, promotionalTelegram: true });
    const automation = await create({ ...input([message('Promo'), message('Later promo', 60, 1)]), promotional: true }); await registration();
    await processCustomAutomationsOnce();
    const markup = bot.telegramRequest.mock.calls[0][2].reply_markup;
    expect(markup.inline_keyboard.flat().at(-1).callback_data).toBe(`b:optout:${automation._id}`);
    await handleTelegramUpdate({ update_id: 100, callback_query: { id: 'callback', from: { id: 123 }, message: { chat: { id: 123, type: 'private' } }, data: `b:optout:${automation._id}` } });
    expect((await MessagePreference.findOne({ user: user._id })).promotionalTelegram).toBe(false);
    await AutomationExecution.updateMany({ status: 'PENDING' }, { $set: { scheduledAt: new Date(0) } });
    await processCustomAutomationsOnce();
    expect(await AutomationExecution.countDocuments({ status: 'SKIPPED' })).toBe(1);
  });
  it('retries explicit Telegram failures and preserves a successful photo checkpoint', async () => {
    const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
    const upload = await agent.post('/api/admin/broadcasts/media').set(header).set('Content-Type', 'image/png').send(image).expect(201);
    await create(input([{ ...message('x'.repeat(1100)), imageId: upload.body.data.imageId }])); await registration();
    bot.telegramRequest.mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { telegramCode: 429, retryAfter: 1 }));
    await processCustomAutomationsOnce();
    const job = await AutomationExecution.findOne(); expect(job.status).toBe('RETRYING'); expect(job.photoSentAt).toBeTruthy();
    await AutomationExecution.updateOne({ _id: job._id }, { $set: { nextAttemptAt: new Date(0) } });
    await BroadcastSettings.updateOne({ key: 'global' }, { $set: { rateLimitedUntil: new Date(0) } });
    await processCustomAutomationsOnce();
    expect((await AutomationExecution.findById(job._id)).status).toBe('SENT'); expect(bot.sendPhoto).toHaveBeenCalledTimes(1);
  });
  it('does not mark blocked, uncertain, or interrupted sends as sent or retry unknown outcomes', async () => {
    await create(); await registration();
    bot.telegramRequest.mockRejectedValueOnce(Object.assign(new Error('Bot blocked'), { telegramCode: 403 }));
    await processCustomAutomationsOnce();
    expect((await AutomationExecution.findOne()).status).toBe('FAILED');
    expect((await TelegramConnection.findOne()).deliveryDisabledAt).toBeTruthy();
    await TelegramConnection.updateOne({}, { $unset: { deliveryDisabledAt: '' } });
    const other = await create(); await registration();
    bot.telegramRequest.mockRejectedValueOnce(new Error('Connection reset after request'));
    await processCustomAutomationsOnce();
    expect((await AutomationExecution.findOne({ automation: other._id })).lastError).toContain('AMBIGUOUS');
    const third = await create(input([message('Later', 60)])); await registration(); await processCustomAutomationsOnce();
    await AutomationExecution.updateOne({ automation: third._id }, { $set: { status: 'PROCESSING', claimUntil: new Date(0) } });
    await processCustomAutomationsOnce();
    expect((await AutomationExecution.findOne({ automation: third._id })).lastError).toContain('AMBIGUOUS');
    expect(bot.telegramRequest).toHaveBeenCalledTimes(2);
  });
});
