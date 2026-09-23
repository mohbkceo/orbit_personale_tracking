import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Reminder } from '../src/models/Reminder.js';
import { ReminderEvent } from '../src/models/ReminderEvent.js';
import { Task } from '../src/models/Task.js';
import { Goal } from '../src/models/Planning.js';
import { Setting } from '../src/models/Setting.js';
import { Account } from '../src/models/Account.js';
import { Debt } from '../src/models/Debt.js';
import { Transaction } from '../src/models/Transaction.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { createTask, updateTask } from '../src/services/taskService.js';
import {
  createReminder,
  completeReminder,
  markReminderBlocked,
  regenerateAutomaticReminderPlan,
  resumeReminder,
  snoozeReminder,
  updateReminder,
} from '../src/services/reminders/reminderService.js';
import { inQuietHours, nextActiveTime, nextOccurrence } from '../src/services/reminders/reminderTime.js';
import { buildReminderPlan } from '../src/services/reminders/reminderPolicyService.js';
import { processDueReminders } from '../src/jobs/reminderWorker.js';
import { updateOverdueStatuses } from '../src/jobs/stateWorker.js';
import { parseTelegramMessage } from '../src/telegram/parser.js';
import { sendTelegramNotification } from '../src/telegram/notifier.js';
import { telegramRequest } from '../src/telegram/botClient.js';
import { handleReminderCallback } from '../src/telegram/callbacks/reminderCallbacks.js';
import { createDebt } from '../src/services/debtService.js';
import { backfillUpcomingReminders } from '../src/services/reminders/reminderBackfillService.js';

vi.mock('../src/telegram/notifier.js', () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue({ sent: 1 }),
}));
vi.mock('../src/telegram/botClient.js', () => ({ telegramRequest: vi.fn().mockResolvedValue({}) }));

let mongo;
let user;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  await Reminder.init();
});
afterAll(async () => {
  await disconnectDatabase();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([
    User.deleteMany(),
    Task.deleteMany(),
    Goal.deleteMany(),
    Reminder.deleteMany(),
    ReminderEvent.deleteMany(),
    Setting.deleteMany(),
    Account.deleteMany(),
    Debt.deleteMany(),
    Transaction.deleteMany(),
    AccessSubscription.deleteMany(),
  ]);
  user = await User.create({
    fullName: 'Owner',
    email: 'owner@example.com',
    passwordHash: 'unused',
  });
  await AccessSubscription.create({
    user: user._id,
    plan: new mongoose.Types.ObjectId(),
    activationLink: new mongoose.Types.ObjectId(),
    startedAt: new Date(),
    activatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    planSnapshot: { name: 'Day', durationValue: 1, durationUnit: 'DAY' },
  });
  vi.clearAllMocks();
});

const tomorrow = () => new Date(Date.now() + 86400000);
const custom = (input = {}) =>
  createReminder(user._id, {
    title: 'Call Karim',
    trigger: { type: 'datetime', at: tomorrow() },
    ...input,
  });

describe('reminder lifecycle', () => {
  it('rejects a recurring update without a recurrence rule', async () => {
    const item = await custom();
    await expect(updateReminder(user._id, item._id, {
      trigger: { type: 'recurring', at: tomorrow() },
    })).rejects.toThrow('A recurrence rule is required');
  });

  it('creates standalone and linked reminders with ownership and history', async () => {
    const item = await custom();
    expect(item.entityType).toBe('custom');
    expect(await ReminderEvent.countDocuments({ reminderId: item._id })).toBe(1);
    const task = await createTask(user._id, { title: 'Send quotation', dueDate: tomorrow() });
    const linked = await custom({ entityType: 'task', entityId: task._id });
    expect(String(linked.entityId)).toBe(String(task._id));
    await expect(
      custom({ entityType: 'task', entityId: new mongoose.Types.ObjectId() }),
    ).rejects.toThrow('Linked entity not found');
  });

  it('snoozes, blocks, resumes, then completes without inferring completion from delivery', async () => {
    const item = await custom();
    await snoozeReminder(user._id, item._id, tomorrow());
    expect((await Reminder.findById(item._id)).snoozeCount).toBe(1);
    await markReminderBlocked(user._id, item._id, 'waiting_for_someone');
    expect((await Reminder.findById(item._id)).status).toBe('waiting');
    await resumeReminder(user._id, item._id, tomorrow());
    await completeReminder(user._id, item._id);
    expect((await Reminder.findById(item._id)).status).toBe('completed');
    expect(await ReminderEvent.countDocuments({ reminderId: item._id })).toBe(5);
  });

  it('creates a review cue for goals and keeps edited policy reminders on task changes', async () => {
    const settings = await Setting.findOneAndUpdate(
      { user: user._id },
      { $setOnInsert: { user: user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const goal = await Goal.create({
      user: user._id,
      title: 'Launch Orbit',
      targetDate: tomorrow(),
    });
    expect(buildReminderPlan('goal', goal, settings)[0].purpose).toBe('review');
    const task = await createTask(user._id, { title: 'Call supplier', dueDate: tomorrow() });
    const plan = await Reminder.find({ entityType: 'task', entityId: task._id });
    expect(plan).toHaveLength(1);
    await updateReminder(user._id, plan[0]._id, { title: 'My preferred copy' });
    await updateTask(user._id, task._id, { dueDate: new Date(Date.now() + 2 * 86400000) });
    expect((await Reminder.findById(plan[0]._id)).title).toBe('My preferred copy');
    await updateTask(user._id, task._id, { status: 'completed' });
    expect(
      await Reminder.countDocuments({
        entityType: 'task',
        entityId: task._id,
        status: { $in: ['scheduled', 'active'] },
      }),
    ).toBe(0);
  });

  it('does not generate when off and can restore automatic defaults', async () => {
    const task = await createTask(user._id, {
      title: 'No cues',
      dueDate: tomorrow(),
      reminderMode: 'off',
    });
    expect(await Reminder.countDocuments({ entityId: task._id })).toBe(0);
    await updateTask(user._id, task._id, { reminderMode: 'automatic' });
    expect((await regenerateAutomaticReminderPlan(user._id, 'task', task._id)).length).toBe(1);
  });

  it('completes a linked task through its service', async () => {
    const task = await createTask(user._id, { title: 'Call supplier', dueDate: tomorrow() });
    const item = await custom({ entityType: 'task', entityId: task._id });
    await completeReminder(user._id, item._id);
    expect((await Task.findById(task._id)).status).toBe('completed');
    expect((await Reminder.findById(item._id)).status).toBe('completed');
  });

  it('backfills only upcoming entities and is safe to rerun', async () => {
    const upcoming = await Task.create({ user: user._id, title: 'Upcoming', dueDate: tomorrow() });
    const historical = await Task.create({
      user: user._id,
      title: 'Historical',
      dueDate: new Date(Date.now() - 90 * 86400000),
    });
    await backfillUpcomingReminders(user._id);
    await backfillUpcomingReminders(user._id);
    expect(await Reminder.countDocuments({ entityId: upcoming._id })).toBe(1);
    expect(await Reminder.countDocuments({ entityId: historical._id })).toBe(0);
  });

  it('creates a separate reminder lifecycle for the next recurring task occurrence', async () => {
    const first = await createTask(user._id, {
      title: 'Review budget',
      dueDate: tomorrow(),
      recurring: true,
      recurringRule: { frequency: 'daily', interval: 1 },
    });
    await updateTask(user._id, first._id, { status: 'completed' });
    const following = await Task.findOne({ user: user._id, seriesId: first._id });
    expect(following).toBeTruthy();
    expect(following.status).toBe('todo');
    expect(await Reminder.countDocuments({ entityId: first._id, status: 'completed' })).toBe(1);
    expect(await Reminder.countDocuments({ entityId: following._id, status: 'scheduled' })).toBe(1);
    await updateTask(user._id, first._id, { status: 'completed' });
    expect(await Task.countDocuments({ user: user._id, seriesId: first._id })).toBe(1);
  });

  it('materializes the next recurrence after an unfinished occurrence passes', async () => {
    const first = await Task.create({
      user: user._id,
      title: 'Daily review',
      dueDate: new Date(Date.now() - 86400000),
      recurring: true,
      recurringRule: { frequency: 'daily', interval: 1 },
    });
    await updateOverdueStatuses(user._id);
    const following = await Task.findOne({ user: user._id, seriesId: first._id });
    expect(following).toBeTruthy();
    expect(String((await Task.findById(first._id)).nextOccurrenceId)).toBe(String(following._id));
    await updateOverdueStatuses(user._id);
    expect(await Task.countDocuments({ user: user._id, seriesId: first._id })).toBe(1);
  });

  it('stops reconsidering an ended task recurrence', async () => {
    const first = await Task.create({
      user: user._id,
      title: 'Finished series',
      dueDate: new Date('2026-01-01T00:00:00.000Z'),
      recurring: true,
      recurringRule: { frequency: 'daily', interval: 1, endDate: new Date('2026-01-01T00:00:00.000Z') },
    });
    await updateOverdueStatuses(user._id);
    expect((await Task.findById(first._id)).recurrenceEnded).toBe(true);
    await updateOverdueStatuses(user._id);
    expect(await Task.countDocuments({ user: user._id, seriesId: first._id })).toBe(0);
  });
});

describe('scheduling and delivery', () => {
  it('advances recurring dates and respects local calendar boundaries', () => {
    expect(
      nextOccurrence(
        new Date('2026-09-18T18:00:00Z'),
        { frequency: 'weekly', daysOfWeek: [5] },
        'Africa/Algiers',
      ).toISOString(),
    ).toBe('2026-09-25T18:00:00.000Z');
    expect(
      nextOccurrence(
        new Date('2026-03-01T14:00:00Z'),
        { frequency: 'weekly', daysOfWeek: [0] },
        'America/New_York',
      ).toISOString(),
    ).toBe('2026-03-08T13:00:00.000Z');
  });

  it('handles active hours that wrap midnight', () => {
    const settings = { timezone: 'Africa/Algiers', reminders: { activeHours: { start: '22:00', end: '06:00' }, quietHours: { enabled: true, start: '08:00', end: '08:00' } } };
    expect(nextActiveTime(new Date('2026-09-19T22:00:00Z'), settings).toISOString()).toBe('2026-09-19T22:00:00.000Z');
    expect(nextActiveTime(new Date('2026-09-19T11:00:00Z'), settings).toISOString()).toBe('2026-09-19T21:00:00.000Z');
    expect(inQuietHours(new Date('2026-09-19T11:00:00Z'), settings)).toBe(false);
  });

  it('claims a due reminder once across overlapping workers and leaves it unresolved', async () => {
    const now = new Date('2026-09-19T10:00:00Z');
    const item = await custom({
      trigger: { type: 'datetime', at: new Date(now.getTime() - 60000) },
    });
    await Promise.all([processDueReminders({ now }), processDueReminders({ now })]);
    expect(sendTelegramNotification).toHaveBeenCalledTimes(1);
    const saved = await Reminder.findById(item._id);
    expect(saved.status).toBe('active');
    expect(saved.triggerCount).toBe(1);
    expect(await ReminderEvent.countDocuments({ reminderId: item._id, eventType: 'sent' })).toBe(1);
  });

  it('does not deliver waiting or cancelled reminders', async () => {
    const now = new Date('2026-09-19T10:00:00Z');
    const one = await custom({
      trigger: { type: 'datetime', at: new Date(now.getTime() - 60000) },
    });
    await markReminderBlocked(user._id, one._id, 'waiting_for_info');
    const two = await custom({
      trigger: { type: 'datetime', at: new Date(now.getTime() - 60000) },
    });
    two.status = 'cancelled';
    await two.save();
    await processDueReminders({ now });
    expect(sendTelegramNotification).not.toHaveBeenCalled();
  });

  it('defers during quiet hours and resolves a completed linked entity', async () => {
    const now = new Date('2026-09-19T10:00:00Z');
    await Setting.create({
      user: user._id,
      reminders: { quietHours: { enabled: true, start: '09:00', end: '12:00' } },
    });
    const item = await custom({
      trigger: { type: 'datetime', at: new Date(now.getTime() - 60000) },
    });
    await processDueReminders({ now });
    expect((await Reminder.findById(item._id)).nextTriggerAt.getTime()).toBeGreaterThan(
      now.getTime(),
    );
    expect(sendTelegramNotification).not.toHaveBeenCalled();
    const task = await createTask(user._id, { title: 'Already done', dueDate: tomorrow() });
    const linked = await custom({
      entityType: 'task',
      entityId: task._id,
      trigger: { type: 'datetime', at: new Date(now.getTime() - 60000) },
    });
    await Task.updateOne({ _id: task._id }, { status: 'completed' });
    await processDueReminders({ now });
    expect((await Reminder.findById(linked._id)).status).toBe('completed');
  });

  it('retains recurring reminders after delivery and advances the next occurrence', async () => {
    const now = new Date('2026-09-19T10:00:00Z');
    const at = new Date(now.getTime() - 60000);
    const item = await custom({
      trigger: {
        type: 'recurring',
        at,
        timezone: 'Africa/Algiers',
        recurrence: { frequency: 'weekly', interval: 1 },
      },
    });
    await processDueReminders({ now });
    const delivered = await Reminder.findById(item._id);
    expect(delivered.status).toBe('active');
    expect(delivered.nextTriggerAt.getTime()).toBeGreaterThan(now.getTime());
    await completeReminder(user._id, item._id);
    expect((await Reminder.findById(item._id)).nextTriggerAt.toISOString()).toBe(
      delivered.nextTriggerAt.toISOString(),
    );
    await processDueReminders({ now });
    expect(sendTelegramNotification).toHaveBeenCalledTimes(1);
  });

  it('snoozes one recurring cue without shifting the series cadence', async () => {
    await Setting.create({
      user: user._id,
      reminders: {
        activeHours: { start: '00:00', end: '23:59' },
        quietHours: { enabled: false },
      },
    });
    const at = tomorrow();
    const item = await custom({
      trigger: {
        type: 'recurring',
        at,
        timezone: 'Africa/Algiers',
        recurrence: { frequency: 'weekly', interval: 1 },
      },
    });
    await processDueReminders({ now: new Date(at.getTime() + 60000) });
    const next = (await Reminder.findById(item._id)).nextTriggerAt;
    const later = new Date(at.getTime() + 3600000);
    await snoozeReminder(user._id, item._id, later);
    await processDueReminders({ now: new Date(later.getTime() + 60000) });
    const rescheduled = await Reminder.findById(item._id);
    expect(rescheduled.nextTriggerAt.toISOString()).toBe(next.toISOString());
    expect(rescheduled.status).toBe('active');
    expect(sendTelegramNotification).toHaveBeenCalledTimes(2);
  });

  it('bundles a few low-priority actionable cues into one Telegram message', async () => {
    const now = new Date('2026-09-19T10:00:00Z');
    const trigger = { type: 'datetime', at: new Date(now.getTime() - 60000) };
    await custom({ title: 'Buy cable', priority: 'low', trigger });
    await custom({ title: 'Send document', priority: 'low', trigger });
    await processDueReminders({ now });
    expect(sendTelegramNotification).toHaveBeenCalledTimes(1);
    expect(sendTelegramNotification).toHaveBeenCalledWith(
      user._id,
      expect.objectContaining({ title: expect.stringContaining('2 things') }),
    );
    expect(await Reminder.countDocuments({ status: 'active' })).toBe(2);
  });

  it('sends only the configured number of standalone follow-ups', async () => {
    const now = new Date('2026-09-19T10:00:00Z');
    const item = await custom({
      trigger: { type: 'datetime', at: new Date(now.getTime() - 60000) },
      followUp: { enabled: true, delayMinutes: 30, maxCount: 1 },
    });
    await processDueReminders({ now });
    await processDueReminders({ now: new Date(now.getTime() + 31 * 60000) });
    await processDueReminders({ now: new Date(now.getTime() + 62 * 60000) });
    expect(sendTelegramNotification).toHaveBeenCalledTimes(2);
    expect((await Reminder.findById(item._id)).followUpCount).toBe(1);
    expect((await Reminder.findById(item._id)).status).toBe('active');
  });

  it('keeps a failed Telegram-only delivery claim in MongoDB for a later retry', async () => {
    const now = new Date('2026-09-19T10:00:00Z');
    const item = await custom({
      trigger: { type: 'datetime', at: new Date(now.getTime() - 60000) },
      deliveryChannels: ['telegram'],
    });
    sendTelegramNotification.mockRejectedValueOnce(new Error('Telegram unavailable'));
    await processDueReminders({ now });
    const failed = await Reminder.findById(item._id);
    expect(failed.status).toBe('scheduled');
    expect(failed.claimUntil.getTime()).toBeGreaterThan(now.getTime());
    expect(
      await ReminderEvent.countDocuments({ reminderId: item._id, eventType: 'delivery_failed' }),
    ).toBe(1);
    await processDueReminders({ now: new Date(now.getTime() + 16 * 60000) });
    expect((await Reminder.findById(item._id)).status).toBe('active');
  });
});

describe('Telegram reminder parsing', () => {
  const options = { now: new Date('2026-09-19T10:00:00Z'), timezone: 'Africa/Algiers' };
  it.each([
    'remind me tomorrow at 9 to call Karim',
    'remind me in 2 hours to check deployment',
    'remind me every Friday to review debts',
    'remind me every Sunday at 19:00 to review goals',
    'remind me September 25 at 09:00 to renew domain',
  ])('creates a reminder for %s', (input) => {
    const result = parseTelegramMessage(input, options);
    expect(result.intent).toBe('CREATE_REMINDER');
    expect(result.data.trigger.at).toBeInstanceOf(Date);
  });
  it('keeps tasks separate and asks for a missing time', () => {
    expect(parseTelegramMessage('task call dentist tomorrow').intent).toBe('CREATE_TASK');
    expect(parseTelegramMessage('remind me to call Karim', options).intent).toBe(
      'CLARIFY_REMINDER',
    );
  });
});

describe('Telegram reminder callbacks', () => {
  const callback = (action, id) => ({
    data: `r:${action}:${id}`,
    id: 'callback-1',
    message: { chat: { id: 123 }, message_id: 456 },
  });
  it('offers snooze choices and persists Later, Blocked, Resume and Done', async () => {
    const item = await custom();
    const settings = await Setting.findOneAndUpdate(
      { user: user._id },
      { $setOnInsert: { user: user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await handleReminderCallback(callback('later', item._id), user._id, 'test-token', settings);
    expect(telegramRequest).toHaveBeenCalledWith(
      'test-token',
      'editMessageText',
      expect.objectContaining({ text: expect.stringContaining('When should I remind') }),
    );
    await handleReminderCallback(callback('s30', item._id), user._id, 'test-token', settings);
    expect((await Reminder.findById(item._id)).status).toBe('snoozed');
    await handleReminderCallback(callback('binfo', item._id), user._id, 'test-token', settings);
    expect((await Reminder.findById(item._id)).status).toBe('waiting');
    await handleReminderCallback(callback('resume', item._id), user._id, 'test-token', settings);
    expect((await Reminder.findById(item._id)).status).toBe('scheduled');
    await handleReminderCallback(callback('done', item._id), user._id, 'test-token', settings);
    expect((await Reminder.findById(item._id)).status).toBe('completed');
  });

  it('records a debt payment through the existing financial flow', async () => {
    const account = await Account.create({
      user: user._id,
      name: 'Cash',
      type: 'cash',
      openingBalance: 0,
    });
    const settings = await Setting.create({
      user: user._id,
      telegram: { defaultIncomeAccount: account._id },
    });
    const debt = await createDebt(user._id, {
      personName: 'Karim',
      type: 'receivable',
      originalAmount: 12000,
      currency: 'DZD',
    });
    const item = await custom({ entityType: 'debt', entityId: debt._id });
    await handleReminderCallback(callback('paid', item._id), user._id, 'test-token', settings);
    expect((await Debt.findById(debt._id)).status).toBe('paid');
    expect(await Transaction.countDocuments({ user: user._id, sourceEntityType: 'Debt' })).toBe(1);
    expect((await Reminder.findById(item._id)).status).toBe('completed');
  });
});
