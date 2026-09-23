import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Admin } from '../src/models/Admin.js';
import { Task } from '../src/models/Task.js';
import { Reminder } from '../src/models/Reminder.js';
import { ReminderEvent } from '../src/models/ReminderEvent.js';
import { DailyFocus } from '../src/models/DailyFocus.js';
import { TaskExecutionEvent } from '../src/models/TaskExecutionEvent.js';
import { AutomationSettings } from '../src/models/AutomationSettings.js';
import { Setting } from '../src/models/Setting.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { automationDefaults, getAutomationSettings, updateAutomationSettings } from '../src/services/automationSettings.service.js';
import { automationSettingsInput } from '../src/validators/automationSettings.js';
import { addFocusTask, finishFocusPlanning, getDailyFocus, removeFocusTask, reviewFocusTask } from '../src/services/dailyFocus.service.js';
import { evaluateTaskAutomation, scheduleSmartTaskCue } from '../src/services/smartTaskAutomation.service.js';
import { executeTask } from '../src/services/taskExecution.service.js';
import { createTask } from '../src/services/taskService.js';
import { runAutomationForUser } from '../src/jobs/automationWorker.js';
import { coordinateReminder } from '../src/services/reminders/reminderCoordinatorService.js';
import { handleFocusCallback } from '../src/telegram/callbacks/focusCallbacks.js';
import { migrateAutomation } from '../src/scripts/migrateAutomation.js';

vi.mock('../src/telegram/botClient.js', () => ({ telegramRequest: vi.fn().mockResolvedValue({}) }));

let mongo;
let user;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDatabase(mongo.getUri()); await Promise.all([Reminder.init(), DailyFocus.init()]); });
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([User.deleteMany(), Admin.deleteMany(), Task.deleteMany(), Reminder.deleteMany(), ReminderEvent.deleteMany(), DailyFocus.deleteMany(), TaskExecutionEvent.deleteMany(), AutomationSettings.deleteMany(), Setting.deleteMany(), AccessSubscription.deleteMany()]);
  user = await User.create({ fullName: 'Owner', email: 'focus@example.com', passwordHash: 'unused' });
  await Setting.create({ user: user._id, timezone: 'UTC' });
  await AccessSubscription.create({ user: user._id, plan: new mongoose.Types.ObjectId(), activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), planSnapshot: { name: 'Day', durationValue: 1, durationUnit: 'DAY' } });
});

describe('Daily Focus and task automation', () => {
  it('creates a focus task, reuses an existing title, prevents duplicates, and accepts early done', async () => {
    const existing = await createTask(user._id, { title: 'Ship report' });
    let focus = await addFocusTask(user._id, { title: 'ship report' });
    expect(String(focus.items[0].task._id)).toBe(String(existing._id));
    await expect(addFocusTask(user._id, { taskId: String(existing._id) })).rejects.toThrow('already');
    focus = await finishFocusPlanning(user._id);
    expect(focus.planningCompleted).toBe(true);
    expect(focus.items).toHaveLength(1);
    await addFocusTask(user._id, { title: 'New from focus' });
    expect(await Task.countDocuments({ user: user._id })).toBe(2);
  });

  it('enforces the configured maximum and keeps users isolated', async () => {
    const rules = await getAutomationSettings(); rules.dailyFocus.maxTasks = 2; await updateAutomationSettings(rules);
    await addFocusTask(user._id, { title: 'One' });
    const focus = await addFocusTask(user._id, { title: 'Two' });
    expect(focus.planningCompleted).toBe(true);
    await expect(addFocusTask(user._id, { title: 'Three' })).rejects.toThrow('full');
    const other = await User.create({ fullName: 'Other', email: 'other@example.com', passwordHash: 'unused' });
    await Setting.create({ user: other._id, timezone: 'UTC' });
    expect((await getDailyFocus(other._id)).items).toHaveLength(0);
    await expect(removeFocusTask(other._id, String(focus.items[0].task._id))).rejects.toThrow('not found');
  });

  it('records evening decisions without automatically carrying unfinished tasks', async () => {
    const focus = await addFocusTask(user._id, { title: 'Unfinished' });
    const taskId = String(focus.items[0].task._id);
    await finishFocusPlanning(user._id);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect((await getDailyFocus(user._id, tomorrow)).items).toHaveLength(0);
    await reviewFocusTask(user._id, focus.date, taskId, 'tomorrow');
    expect((await getDailyFocus(user._id, tomorrow)).items).toHaveLength(1);
    expect(await TaskExecutionEvent.countDocuments({ user: user._id, type: 'evening_review_decision' })).toBe(1);
  });

  it('evaluates deadline bands, escalation, and blocked policy from settings', () => {
    const rules = structuredClone(automationDefaults);
    const task = { title: 'Launch', dueDate: new Date(), status: 'todo', priority: 'medium', reminderMode: 'automatic', executionState: 'idle' };
    expect(evaluateTaskAutomation(task, { daysUntilDue: 40 }, rules).band).toBe('far');
    expect(evaluateTaskAutomation(task, { daysUntilDue: 9 }, rules).band).toBe('medium');
    expect(evaluateTaskAutomation(task, { daysUntilDue: 3 }, rules).band).toBe('near');
    expect(evaluateTaskAutomation(task, { daysUntilDue: 1 }, rules).band).toBe('urgent');
    expect(evaluateTaskAutomation(task, { daysUntilDue: -1 }, rules).band).toBe('overdue');
    task.priority = 'high';
    expect(evaluateTaskAutomation(task, { daysUntilDue: 9 }, rules).band).toBe('near');
    task.priority = 'medium';
    expect(evaluateTaskAutomation(task, { daysUntilDue: 40 }, rules).needsAction).toBe(true);
    task.postponeCount = rules.escalation.forceDecisionThreshold;
    expect(evaluateTaskAutomation(task, { daysUntilDue: 8 }, rules).escalationLevel).toBe(2);
    task.postponeCount = 0; task.ignoreCount = rules.escalation.ignoreThreshold;
    expect(evaluateTaskAutomation(task, { daysUntilDue: 8 }, rules).escalationLevel).toBe(1);
    task.executionState = 'blocked';
    expect(evaluateTaskAutomation(task, { daysUntilDue: 8 }, rules).action).toBe('none');
    rules.reminderBehavior.blockedTaskPolicy = 'review';
    expect(evaluateTaskAutomation(task, { daysUntilDue: 8 }, rules).action).toBe('schedule');
    task.executionState = 'started';
    expect(evaluateTaskAutomation(task, { daysUntilDue: 8 }, rules).action).toBe('none');
    task.executionState = 'idle';
    rules.thresholds.mediumDays = 10;
    expect(evaluateTaskAutomation(task, { daysUntilDue: 12 }, rules).band).toBe('far');
  });

  it('tracks start, continue, completion, and postponement', async () => {
    const task = await createTask(user._id, { title: 'Build', dueDate: new Date(Date.now() + 86400000) });
    await executeTask(user._id, task._id, 'start');
    await executeTask(user._id, task._id, 'continue');
    let stored = await Task.findById(task._id);
    expect(stored.status).toBe('in_progress');
    expect(stored.startCount).toBe(1);
    expect(stored.lastProgressAt).toBeTruthy();
    expect(await Reminder.exists({ user: user._id, policyKey: `task:${task._id}:checkin` })).toBeTruthy();
    await executeTask(user._id, task._id, 'later', { reason: 'no_time' });
    stored = await Task.findById(task._id);
    expect(stored.postponeCount).toBe(1);
    await executeTask(user._id, task._id, 'done');
    expect((await Task.findById(task._id)).executionState).toBe('completed');
    expect(await TaskExecutionEvent.countDocuments({ user: user._id, task: task._id })).toBeGreaterThanOrEqual(4);
  });

  it('schedules morning and evening cues once even across overlapping runs', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const morning = new Date(`${day}T09:00:00.000Z`);
    await Promise.all([runAutomationForUser(user._id, morning), runAutomationForUser(user._id, morning)]);
    expect(await Reminder.countDocuments({ user: user._id, 'metadata.automation': 'focus-morning' })).toBe(1);
    const focus = await addFocusTask(user._id, { title: 'Evening task' });
    await finishFocusPlanning(user._id);
    await runAutomationForUser(user._id, new Date(`${day}T20:30:00.000Z`));
    expect(await Reminder.countDocuments({ user: user._id, 'metadata.automation': 'focus-evening' })).toBe(1);
    const evening = await Reminder.findOne({ user: user._id, 'metadata.automation': 'focus-evening' });
    expect(evening.message).toContain('0/1');
    expect(String(evening.metadata.focusId)).toBe(String(focus._id));
  });

  it('gives focus tasks without deadlines a deduplicated start cue', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const focus = await addFocusTask(user._id, { title: 'No deadline yet' });
    await finishFocusPlanning(user._id);
    const now = new Date(`${day}T11:00:00.000Z`);
    await Promise.all([runAutomationForUser(user._id, now), runAutomationForUser(user._id, now)]);
    const key = `focus:${focus.date}:task:${focus.items[0].task._id}`;
    const cue = await Reminder.findOne({ user: user._id, policyKey: key });
    expect(cue).toBeTruthy();
    expect(cue.priority).toBe('high');
    expect(await Reminder.countDocuments({ user: user._id, policyKey: key })).toBe(1);
    cue.status = 'active'; cue.deliveredAt = now; cue.triggerCount = 1; await cue.save();
    await runAutomationForUser(user._id, new Date(`${day}T14:30:00.000Z`));
    expect((await Reminder.findById(cue._id)).status).toBe('scheduled');
    expect((await Task.findById(focus.items[0].task._id)).ignoreCount).toBe(1);
  });

  it('defers automation in quiet hours and preserves a user snooze', async () => {
    const task = await createTask(user._id, { title: 'Quiet', dueDate: new Date('2026-09-24T00:00:00.000Z') });
    const cue = await Reminder.findOne({ user: user._id, entityId: task._id });
    expect((await coordinateReminder(cue, new Date('2026-09-23T23:00:00.000Z'))).action).toBe('defer');
    cue.status = 'snoozed'; cue.nextTriggerAt = new Date('2026-09-24T11:00:00.000Z'); await cue.save();
    await scheduleSmartTaskCue(user._id, task, { now: new Date('2026-09-23T10:00:00.000Z') });
    expect((await Reminder.findById(cue._id)).nextTriggerAt.toISOString()).toBe('2026-09-24T11:00:00.000Z');
  });

  it('records an ignored delivery once across overlapping automation runs', async () => {
    const task = await createTask(user._id, { title: 'Unanswered', dueDate: new Date(Date.now() + 86400000) });
    const cue = await Reminder.findOne({ user: user._id, entityId: task._id });
    cue.status = 'active'; cue.deliveredAt = new Date(Date.now() - 3 * 3600000); cue.triggerCount = 1; await cue.save();
    await Promise.all([scheduleSmartTaskCue(user._id, await Task.findById(task._id)), scheduleSmartTaskCue(user._id, await Task.findById(task._id))]);
    expect((await Task.findById(task._id)).ignoreCount).toBe(1);
    expect(await ReminderEvent.countDocuments({ user: user._id, reminderId: cue._id, eventType: 'ignored' })).toBe(1);
  });

  it('validates settings and rejects a focus callback for another owner', async () => {
    const rules = await getAutomationSettings();
    expect(automationSettingsInput.safeParse(rules).success).toBe(true);
    const invalid = structuredClone(rules); invalid.thresholds.farDays = 1;
    expect(automationSettingsInput.safeParse(invalid).success).toBe(false);
    const focus = await addFocusTask(user._id, { title: 'Private' });
    const other = await User.create({ fullName: 'Other', email: 'other2@example.com', passwordHash: 'unused' });
    const callback = { data: `f:drop:${focus.date}:${focus.items[0].task._id}`, message: { chat: { id: 1 } }, id: '1' };
    await expect(handleFocusCallback(callback, other._id, 'token')).rejects.toThrow('not found');
    expect((await Task.findById(focus.items[0].task._id)).status).toBe('todo');
  });

  it('enforces ownership and validation through the focus and execution APIs', async () => {
    const cookie = (id) => `orbit_user=${jwt.sign({ sub: String(id), type: 'user' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
    const created = await request(app).post('/api/daily-focus/today/items').set('Cookie', cookie(user._id)).send({ title: 'Owner only' }).expect(201);
    const taskId = created.body.data.items[0].task._id;
    const other = await User.create({ fullName: 'Other', email: 'apiother@example.com', passwordHash: 'unused' });
    await AccessSubscription.create({ user: other._id, plan: new mongoose.Types.ObjectId(), activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), planSnapshot: { name: 'Day', durationValue: 1, durationUnit: 'DAY' } });
    expect((await request(app).get('/api/daily-focus/today').set('Cookie', cookie(other._id)).expect(200)).body.data.items).toHaveLength(0);
    await request(app).post('/api/daily-focus/today/items').set('Cookie', cookie(other._id)).send({ taskId }).expect(404);
    await request(app).post(`/api/tasks/${taskId}/execute`).set('Cookie', cookie(other._id)).send({ action: 'start' }).expect(404);
    await request(app).post('/api/daily-focus/today/done').set('Cookie', cookie(user._id)).expect(200);
  });

  it('restricts Automation Settings to Super Admin and persists valid changes', async () => {
    const admin = await Admin.create({ fullName: 'Admin', email: 'admin@example.com', passwordHash: 'unused', role: 'ADMIN' });
    const superAdmin = await Admin.create({ fullName: 'Root', email: 'root@example.com', passwordHash: 'unused', role: 'SUPER_ADMIN' });
    const cookie = (id) => `orbit_admin=${jwt.sign({ sub: String(id), type: 'admin' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
    await request(app).get('/api/admin/settings/automation').set('Cookie', cookie(admin._id)).expect(403);
    const rules = (await request(app).get('/api/admin/settings/automation').set('Cookie', cookie(superAdmin._id)).expect(200)).body.data;
    const invalid = structuredClone(rules); invalid.dailyFocus.maxTasks = 0;
    await request(app).put('/api/admin/settings/automation').set('Cookie', cookie(superAdmin._id)).send(invalid).expect(422);
    rules.dailyFocus.maxTasks = 4;
    await request(app).put('/api/admin/settings/automation').set('Cookie', cookie(superAdmin._id)).send(rules).expect(200);
    expect((await getAutomationSettings()).dailyFocus.maxTasks).toBe(4);
  });

  it('backfills legacy execution states without changing them on rerun', async () => {
    const id = new mongoose.Types.ObjectId();
    await Task.collection.insertOne({ _id: id, user: user._id, title: 'Old completed', status: 'completed', priority: 'medium', archived: false });
    expect((await migrateAutomation()).backfilled.completed).toBe(1);
    expect((await Task.findById(id)).executionState).toBe('completed');
    expect((await migrateAutomation()).backfilled.completed).toBe(0);
  });
});
