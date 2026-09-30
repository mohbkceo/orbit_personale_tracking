import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Task } from '../src/models/Task.js';
import { Reminder } from '../src/models/Reminder.js';
import { Setting } from '../src/models/Setting.js';
import { TelegramConnection } from '../src/models/TelegramConnection.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { TaskDigestDelivery } from '../src/models/TaskDigestDelivery.js';
import { automationDefaults } from '../src/services/automationSettings.service.js';
import { collectTaskDigest, renderTaskDigest } from '../src/services/taskReminderDigest.service.js';
import { runTaskReminderDigestForUser } from '../src/jobs/taskReminderDigestWorker.js';
import { handleTaskReminderDigestCallback } from '../src/telegram/callbacks/taskReminderDigestCallbacks.js';
import { backfillTaskReminderState, suppressLegacyTaskReminders } from '../src/services/migrateTaskReminders.service.js';

const bot = vi.hoisted(() => ({ sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }), telegramRequest: vi.fn().mockResolvedValue({}) }));
vi.mock('../src/telegram/botClient.js', () => bot);

let mongo;
let user;
const rules = () => structuredClone(automationDefaults);
const at = (day) => new Date(`${day}T00:00:00.000Z`);
const callback = (data) => ({ data, id: 'callback', message: { chat: { id: 321 }, message_id: 12 } });

beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDatabase(mongo.getUri()); await TaskDigestDelivery.init(); });
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([User.deleteMany(), Task.deleteMany(), Reminder.deleteMany(), Setting.deleteMany(), TelegramConnection.deleteMany(), AccessSubscription.deleteMany(), TaskDigestDelivery.deleteMany()]);
  bot.sendMessage.mockClear(); bot.telegramRequest.mockClear();
  user = await User.create({ fullName: 'Digest owner', email: 'digest@example.com', passwordHash: 'unused' });
  await Setting.create({ user: user._id, timezone: 'Africa/Lagos' });
  await TelegramConnection.create({ user: user._id, telegramUserId: '123', chatId: '321' });
  await AccessSubscription.create({ user: user._id, plan: new mongoose.Types.ObjectId(), activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), planSnapshot: { name: 'Day', durationValue: 1, durationUnit: 'DAY' } });
});

describe('Task Digest', () => {
  it('includes only open enabled tasks and sorts priorities, due dates and global numbers', async () => {
    const now = new Date('2026-09-30T08:00:00.000Z');
    const fixtures = [
      { title: 'Low', priority: 'low' },
      { title: 'High future', priority: 'high', dueDate: at('2026-10-02') },
      { title: 'Urgent today', priority: 'urgent', dueDate: at('2026-09-30') },
      { title: 'High overdue', priority: 'high', dueDate: at('2026-09-29') },
      { title: 'High near', priority: 'high', dueDate: at('2026-10-01') },
      { title: 'High no date', priority: 'high' },
      { title: 'Medium', priority: 'medium' },
      { title: 'Completed', status: 'completed' },
      { title: 'Cancelled', status: 'cancelled' },
      { title: 'Archived', archived: true },
      { title: 'Muted', taskReminderState: 'muted' },
      { title: 'Manual only', reminderMode: 'custom' },
    ];
    await Task.insertMany(fixtures.map((fixture) => ({ user: user._id, ...fixture })));
    const tasks = await collectTaskDigest(user._id, rules(), 'Africa/Lagos', now);
    expect(tasks.map((task) => task.title)).toEqual(['Urgent today', 'High overdue', 'High near', 'High future', 'High no date', 'Medium', 'Low']);
    const view = renderTaskDigest(tasks);
    expect(view.text).toContain('01 — Urgent today');
    expect(view.text).toContain('02 — High overdue');
    expect(view.text).toContain('07 — Low');
    expect(view.markup.inline_keyboard.flat().map((button) => button.text)).toEqual(['01', '02', '03', '04', '05', '06', '07']);
    expect(view.markup.inline_keyboard[0][0].callback_data).toBe(`taskdigest:select:${tasks[0]._id}`);
    const limited = rules(); limited.taskReminderDigest.maxTasks = 3;
    expect(await collectTaskDigest(user._id, limited, 'Africa/Lagos', now)).toHaveLength(3);
    limited.taskReminderDigest.priorities.urgent = false;
    limited.taskReminderDigest.includeNoDueDate = false;
    expect((await collectTaskDigest(user._id, limited, 'Africa/Lagos', now)).map((task) => task.title)).toEqual(['High overdue', 'High near', 'High future']);
  });

  it('sends only at user local times, skips empty digests, and claims a slot once', async () => {
    const policy = rules();
    const now = new Date('2026-09-30T08:00:00.000Z'); // Lagos 09:00
    expect(await runTaskReminderDigestForUser(user._id, now, policy)).toBe(false);
    await Task.create({ user: user._id, title: 'Ship update' });
    expect(await runTaskReminderDigestForUser(user._id, new Date('2026-09-30T07:00:00.000Z'), policy)).toBe(false);
    const results = await Promise.all([runTaskReminderDigestForUser(user._id, now, policy), runTaskReminderDigestForUser(user._id, now, policy)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(await TaskDigestDelivery.countDocuments({ user: user._id, localDate: '2026-09-30', time: '09:00' })).toBe(1);
  });

  it('handles select, back, done, mute and drop with ownership and stale callback checks', async () => {
    const one = await Task.create({ user: user._id, title: 'One', priority: 'urgent' });
    const two = await Task.create({ user: user._id, title: 'Two', priority: 'high' });
    await handleTaskReminderDigestCallback(callback(`taskdigest:select:${two._id}`), user._id, 'token');
    expect(bot.telegramRequest.mock.calls.find((call) => call[1] === 'editMessageText')?.[2].text).toContain('Task 02');
    bot.telegramRequest.mockClear();
    await handleTaskReminderDigestCallback(callback('taskdigest:back'), user._id, 'token');
    expect(bot.telegramRequest.mock.calls.find((call) => call[1] === 'editMessageText')?.[2].text).toContain('01 — One');
    const other = await User.create({ fullName: 'Other', email: 'otherdigest@example.com', passwordHash: 'unused' });
    bot.telegramRequest.mockClear();
    await handleTaskReminderDigestCallback(callback(`taskdigest:done:${one._id}`), other._id, 'token');
    expect((await Task.findById(one._id)).status).toBe('todo');
    expect(bot.telegramRequest.mock.calls.at(-1)[2].text).toContain('no longer available');
    await handleTaskReminderDigestCallback(callback(`taskdigest:done:${one._id}`), user._id, 'token');
    expect((await Task.findById(one._id)).status).toBe('completed');
    await handleTaskReminderDigestCallback(callback(`taskdigest:mute:${two._id}`), user._id, 'token');
    expect((await Task.findById(two._id)).taskReminderState).toBe('muted');
    expect((await Task.findById(two._id)).status).toBe('todo');
    const three = await Task.create({ user: user._id, title: 'Three' });
    await handleTaskReminderDigestCallback(callback(`taskdigest:drop:${three._id}`), user._id, 'token');
    expect((await Task.findById(three._id)).status).toBe('cancelled');
    expect((await Task.findById(three._id)).archived).toBe(true);
    bot.telegramRequest.mockClear();
    await handleTaskReminderDigestCallback(callback(`taskdigest:done:${three._id}`), user._id, 'token');
    expect(bot.telegramRequest.mock.calls.at(-1)[2].text).toContain('no longer available');
  });

  it('backfills legacy task state and cancels only automatic task cues', async () => {
    const id = new mongoose.Types.ObjectId();
    await Task.collection.insertOne({ _id: id, user: user._id, title: 'Legacy', status: 'todo', priority: 'medium', reminderMode: 'automatic', archived: false, createdAt: new Date() });
    expect((await backfillTaskReminderState()).enabled).toBe(1);
    expect((await backfillTaskReminderState()).enabled).toBe(0);
    const atTime = new Date(Date.now() + 86400000);
    const auto = await Reminder.create({ user: user._id, title: 'Legacy', entityType: 'task', entityId: id, autoGenerated: true, source: 'automatic', mode: 'automatic', trigger: { type: 'datetime', at: atTime }, nextTriggerAt: atTime });
    const manual = await Reminder.create({ user: user._id, title: 'Manual', entityType: 'task', entityId: id, autoGenerated: false, source: 'custom', mode: 'custom', trigger: { type: 'datetime', at: atTime }, nextTriggerAt: atTime });
    const goal = await Reminder.create({ user: user._id, title: 'Goal', entityType: 'goal', entityId: new mongoose.Types.ObjectId(), autoGenerated: true, source: 'automatic', mode: 'automatic', trigger: { type: 'datetime', at: atTime }, nextTriggerAt: atTime });
    expect(await suppressLegacyTaskReminders()).toBe(1);
    expect(await suppressLegacyTaskReminders()).toBe(0);
    expect((await Reminder.findById(auto._id)).status).toBe('cancelled');
    expect((await Reminder.findById(manual._id)).status).toBe('scheduled');
    expect((await Reminder.findById(goal._id)).status).toBe('scheduled');
  });
});
