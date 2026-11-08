import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Goal } from '../src/models/Planning.js';
import { Wishlist } from '../src/models/Personal.js';
import { Account } from '../src/models/Account.js';
import { Transaction } from '../src/models/Transaction.js';
import { User } from '../src/models/User.js';
import { Reminder } from '../src/models/Reminder.js';
import { Feature } from '../src/models/Feature.js';
import { Setting } from '../src/models/Setting.js';
import { env } from '../src/config/env.js';
import { migrateWishlist } from '../src/services/wishlistMigrationService.js';
import {
  accountBalances,
  archiveTransaction,
  createTransaction,
  updateTransaction,
} from '../src/services/financeService.js';
import { getGoal, listGoals } from '../src/services/goalService.js';
import { resolveUserEntitlements } from '../src/services/entitlementService.js';
import { UserFeatureOverride } from '../src/models/UserFeatureOverride.js';
import { Plan } from '../src/models/Plan.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';

let mongo, user, other, cookie, accounts;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
});
afterAll(async () => {
  await disconnectDatabase();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
  [user, other] = await User.create([
    { fullName: 'Owner', email: 'owner@goals.test', passwordHash: 'unused' },
    { fullName: 'Other', email: 'other@goals.test', passwordHash: 'unused' },
  ]);
  cookie = `orbit_user=${jwt.sign({ sub: String(user._id), type: 'user' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
  accounts = await Account.create([
    { user: user._id, name: 'Cash', type: 'cash', openingBalance: 1000 },
    { user: user._id, name: 'Savings', type: 'savings' },
  ]);
});
const api = (method, path) => request(app)[method](`/api/${path}`).set('Cookie', cookie);
const savings = (goal, amount, type = 'savings_contribution') => ({
  type,
  amount,
  accountId: accounts[type === 'savings_contribution' ? 0 : 1]._id,
  destinationAccountId: accounts[type === 'savings_contribution' ? 1 : 0]._id,
  sourceEntityType: 'Goal',
  sourceEntityId: goal._id,
  description: 'Savings',
});

describe('unified Goals API', () => {
  it('creates all three methods with only a title required and preserves legacy types', async () => {
    for (const progressType of ['money', 'steps', 'simple']) {
      const response = await api('post', 'goals')
        .send({ title: progressType, progressType })
        .expect(201);
      expect(response.body.data.progressType).toBe(progressType);
      expect(response.body.data.progress.percentage).toBeNull();
    }
    expect(
      (await api('post', 'goals').send({ title: 'Just a title' }).expect(201)).body.data
        .progressType,
    ).toBe('simple');
    expect(
      (
        await api('post', 'goals')
          .send({ title: 'Legacy', type: 'financial', targetAmount: 200 })
          .expect(201)
      ).body.data.progressType,
    ).toBe('money');
    await api('post', 'goals').send({ title: ' ' }).expect(422);
    await api('post', 'goals').send({ title: 'Invalid', progressType: 'other' }).expect(422);
  });
  it('edits without resetting progress, dates, account references or reminders', async () => {
    const goal = await Goal.create({
      user: user._id,
      title: 'Legacy',
      type: 'financial',
      targetAmount: 500,
      currentAmount: 80,
      targetDate: new Date('2027-01-01'),
      accountId: accounts[1]._id,
    });
    const response = await api('patch', `goals/${goal._id}`).send({ title: 'Renamed' }).expect(200);
    expect(response.body.data).toMatchObject({
      title: 'Renamed',
      targetAmount: 500,
      currentAmount: 80,
      accountId: String(accounts[1]._id),
      targetDate: '2027-01-01T00:00:00.000Z',
    });
    await api('patch', `goals/${goal._id}`).send({ status: 'completed' }).expect(200);
    expect(
      await Reminder.countDocuments({
        user: user._id,
        entityId: goal._id,
        status: { $in: ['scheduled', 'active'] },
      }),
    ).toBe(0);
    await api('delete', `goals/${goal._id}`).expect(200);
    await api('get', `goals/${goal._id}`).expect(404);
    expect((await Goal.findById(goal._id)).deletedAt).toBeTruthy();
  });
  it('adds, edits, completes and removes steps with automatic progress', async () => {
    const goal = (
      await api('post', 'goals').send({ title: 'Course', progressType: 'steps' }).expect(201)
    ).body.data;
    const first = (await api('post', `goals/${goal._id}/steps`).send({ title: 'Read' }).expect(201))
      .body.data.steps[0];
    let response = await api('post', `goals/${goal._id}/steps`)
      .send({ title: 'Practice' })
      .expect(201);
    const second = response.body.data.steps[1];
    response = await api('patch', `goals/${goal._id}/steps/${first._id}`)
      .send({ completed: true, title: 'Read chapter' })
      .expect(200);
    expect(response.body.data.progress).toMatchObject({ percentage: 50, remainingSteps: 1 });
    expect(
      (
        await api('patch', `goals/${goal._id}/steps/${second._id}`)
          .send({ completed: true })
          .expect(200)
      ).body.data.status,
    ).toBe('completed');
    expect(
      (
        await api('patch', `goals/${goal._id}/steps/${first._id}`)
          .send({ completed: false })
          .expect(200)
      ).body.data.status,
    ).toBe('active');
    await api('delete', `goals/${goal._id}/steps/${first._id}`).expect(200);
    response = await api('delete', `goals/${goal._id}/steps/${second._id}`).expect(200);
    expect(response.body.data.progress.percentage).toBeNull();
    await api('patch', `goals/${goal._id}/steps/${second._id}`)
      .send({ completed: true })
      .expect(404);
  });
  it('isolates goals, steps, contributions and account ownership by user', async () => {
    const goal = await Goal.create({
      user: other._id,
      title: 'Private',
      progressType: 'steps',
      steps: [{ title: 'Private step' }],
    });
    for (const method of ['get', 'patch', 'delete'])
      await api(method, `goals/${goal._id}`)
        .send(method === 'patch' ? { title: 'Attack' } : undefined)
        .expect(404);
    await api('post', `goals/${goal._id}/steps`).send({ title: 'Attack' }).expect(404);
    await api('post', `goals/${goal._id}/contribute`)
      .send({
        amount: 10,
        accountId: String(accounts[0]._id),
        destinationAccountId: String(accounts[1]._id),
      })
      .expect(404);
    const privateAccount = await Account.create({ user: other._id, name: 'Private', type: 'bank' });
    await api('post', 'goals')
      .send({ title: 'Attack', accountId: String(privateAccount._id) })
      .expect(404);
  });
  it('recalculates completion on money edits and allows clearing an optional target', async () => {
    const goal = await Goal.create({
      user: user._id,
      title: 'Edit target',
      currentAmount: 50,
      targetAmount: 100,
    });
    expect(
      (await api('patch', `goals/${goal._id}`).send({ targetAmount: 40 }).expect(200)).body.data
        .status,
    ).toBe('completed');
    expect(
      (await api('patch', `goals/${goal._id}`).send({ targetAmount: 80 }).expect(200)).body.data
        .status,
    ).toBe('active');
    expect(
      (await api('patch', `goals/${goal._id}`).send({ targetAmount: null }).expect(200)).body.data
        .progress.percentage,
    ).toBeNull();
  });
});

describe('goal savings and financial integrity', () => {
  it('keeps the opening amount and synchronizes contributions, edits, reversals and withdrawals', async () => {
    const goal = await Goal.create({
      user: user._id,
      title: 'Laptop',
      targetAmount: 500,
      currentAmount: 50,
    });
    const tx = await createTransaction(user._id, savings(goal, 150));
    expect((await getGoal(user._id, goal._id)).currentAmount).toBe(200);
    await updateTransaction(user._id, tx._id, { amount: 200 });
    expect((await getGoal(user._id, goal._id)).currentAmount).toBe(250);
    const withdrawal = await createTransaction(user._id, savings(goal, 40, 'savings_withdrawal'));
    expect((await getGoal(user._id, goal._id)).currentAmount).toBe(210);
    await archiveTransaction(user._id, withdrawal._id);
    expect((await getGoal(user._id, goal._id)).currentAmount).toBe(250);
    await archiveTransaction(user._id, tx._id);
    expect((await getGoal(user._id, goal._id)).currentAmount).toBe(50);
    const balances = await accountBalances(user._id);
    expect(balances.reduce((sum, account) => sum + account.currentBalance, 0)).toBe(1000);
    expect(await Transaction.countDocuments({ type: { $in: ['income', 'expense'] } })).toBe(0);
    // Editing a description must not undo an explicitly completed Goal.
    const manual = await Goal.create({
      user: user._id,
      title: 'Manual completion',
      targetAmount: 500,
    });
    const manualTx = await createTransaction(user._id, savings(manual, 10));
    await Goal.updateOne({ _id: manual._id }, { $set: { status: 'completed' } });
    await updateTransaction(user._id, manualTx._id, { description: 'Corrected description' });
    expect((await getGoal(user._id, manual._id)).status).toBe('completed');
    const noTarget = await Goal.create({
      user: user._id,
      title: 'Completed without a target',
      targetAmount: 0,
      currentAmount: 100,
      status: 'completed',
    });
    await createTransaction(user._id, savings(noTarget, 20, 'savings_withdrawal'));
    expect(await getGoal(user._id, noTarget._id)).toMatchObject({
      currentAmount: 80,
      status: 'completed',
    });
  });
  it('does not double count legacy savings history and recomputes completion', async () => {
    const goal = await Goal.create({
      user: user._id,
      title: 'Legacy',
      targetAmount: 300,
      currentAmount: 250,
    });
    const historic = await Transaction.create({ ...savings(goal, 200), user: user._id });
    const tx = await createTransaction(user._id, savings(goal, 100));
    expect(await getGoal(user._id, goal._id)).toMatchObject({
      currentAmount: 350,
      status: 'completed',
    });
    await archiveTransaction(user._id, tx._id);
    expect(await getGoal(user._id, goal._id)).toMatchObject({
      currentAmount: 250,
      status: 'active',
    });
    await updateTransaction(user._id, historic._id, { amount: 180 });
    expect((await getGoal(user._id, goal._id)).currentAmount).toBe(230);
    await api('patch', `goals/${goal._id}`).send({ currentAmount: 999 }).expect(409);
    await api('patch', `goals/${goal._id}`).send({ progressType: 'simple' }).expect(409);
  });
  it('rejects overspending, foreign links, same-account and cross-currency edits without ledger writes', async () => {
    const goal = await Goal.create({ user: user._id, title: 'Savings', targetAmount: 500 });
    await expect(
      createTransaction(user._id, savings(goal, 1, 'savings_withdrawal')),
    ).rejects.toThrow('exceeds');
    const foreign = await Goal.create({ user: other._id, title: 'Foreign' });
    await expect(createTransaction(user._id, savings(foreign, 50))).rejects.toThrow('not found');
    const tx = await createTransaction(user._id, savings(goal, 50));
    await expect(
      updateTransaction(user._id, tx._id, { destinationAccountId: accounts[0]._id }),
    ).rejects.toThrow('differ');
    const usd = await Account.create({
      user: user._id,
      name: 'USD',
      type: 'bank',
      currency: 'USD',
    });
    await expect(
      updateTransaction(user._id, tx._id, { destinationAccountId: usd._id }),
    ).rejects.toThrow('Cross-currency');
    expect(await Transaction.countDocuments()).toBe(1);
  });
  it('serializes concurrent contributions and prevents simultaneous overdrafts', async () => {
    const goal = await Goal.create({ user: user._id, title: 'Concurrent', targetAmount: 1000 });
    await Promise.all([
      createTransaction(user._id, savings(goal, 100)),
      createTransaction(user._id, savings(goal, 100)),
    ]);
    expect((await getGoal(user._id, goal._id)).currentAmount).toBe(200);
    const results = await Promise.allSettled([
      createTransaction(user._id, savings(goal, 150, 'savings_withdrawal')),
      createTransaction(user._id, savings(goal, 150, 'savings_withdrawal')),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await getGoal(user._id, goal._id)).currentAmount).toBe(50);
  });
  it('retains transaction history after goal deletion and allows ledger reversal', async () => {
    const goal = await Goal.create({ user: user._id, title: 'Remove', targetAmount: 500 });
    const tx = await createTransaction(user._id, savings(goal, 100));
    await api('delete', `goals/${goal._id}`).expect(200);
    expect(await Transaction.countDocuments({ sourceEntityId: goal._id })).toBe(1);
    await archiveTransaction(user._id, tx._id);
    expect((await Goal.findById(goal._id)).currentAmount).toBe(0);
  });
  it('preserves legacy account currency and paused status through savings changes', async () => {
    const [cash, bank] = await Account.create([
      { user: user._id, name: 'USD cash', type: 'cash', currency: 'USD' },
      { user: user._id, name: 'USD savings', type: 'savings', currency: 'USD' },
    ]);
    const goal = await Goal.create({
      user: user._id,
      title: 'Legacy USD',
      targetAmount: 100,
      currentAmount: 50,
      accountId: bank._id,
      status: 'paused',
    });
    expect((await getGoal(user._id, goal._id)).currency).toBe('USD');
    await expect(createTransaction(user._id, savings(goal, 10))).rejects.toThrow('currency');
    await createTransaction(user._id, {
      ...savings(goal, 60),
      accountId: cash._id,
      destinationAccountId: bank._id,
    });
    expect(await getGoal(user._id, goal._id)).toMatchObject({
      currentAmount: 110,
      status: 'paused',
      currency: 'USD',
    });
    await api('patch', `goals/${goal._id}`).send({ currency: 'DZD' }).expect(409);
    await api('patch', `goals/${goal._id}`).send({ accountId: null }).expect(200);
    expect((await getGoal(user._id, goal._id)).currency).toBe('USD');
  });
  it('enforces savings feature gates while leaving Goal tracking available', async () => {
    const goal = await Goal.create({ user: user._id, title: 'Gated', targetAmount: 100 });
    await UserFeatureOverride.create({
      user: user._id,
      key: 'transactions',
      enabled: false,
      reason: 'Test policy',
      updatedBy: new mongoose.Types.ObjectId(),
    });
    await api('post', `goals/${goal._id}/contribute`)
      .send({
        amount: 10,
        accountId: String(accounts[0]._id),
        destinationAccountId: String(accounts[1]._id),
      })
      .expect(403);
    await api('get', 'goals').expect(200);
    expect(await Transaction.countDocuments()).toBe(0);
  });
});

describe('recoverable Wishlist migration', () => {
  it('maps every status, prices, dates, notes, priority, URL and unknown metadata without transactions', async () => {
    const statuses = {
      wanted: 'active',
      saving: 'active',
      purchased: 'completed',
      cancelled: 'cancelled',
    };
    const createdAt = new Date('2024-01-01');
    for (const status of Object.keys(statuses))
      await Wishlist.collection.insertOne({
        user: user._id,
        name: status,
        expectedPrice: 250,
        status,
        targetDate: new Date('2027-01-01'),
        notes: 'Keep',
        url: 'https://example.com',
        priority: 'high',
        createdAt,
        customMetadata: { color: 'red' },
      });
    await Wishlist.create({ user: user._id, name: 'Travel', status: 'wanted' });
    expect(await migrateWishlist({ userId: user._id })).toMatchObject({ dryRun: true, created: 5 });
    expect(await Goal.countDocuments()).toBe(0);
    expect(await migrateWishlist({ userId: user._id, dryRun: false })).toMatchObject({
      created: 5,
      errors: [],
    });
    const goals = await Goal.find({ user: user._id }).lean();
    for (const [title, status] of Object.entries(statuses))
      expect(goals.find((goal) => goal.title === title)).toMatchObject({
        status,
        progressType: 'money',
        targetAmount: 250,
        currentAmount: 0,
        description: 'Keep',
        priority: 'high',
        url: 'https://example.com',
        createdAt,
        legacyWishlist: [
          expect.objectContaining({
            original: expect.objectContaining({ customMetadata: { color: 'red' } }),
          }),
        ],
      });
    expect(goals.find((goal) => goal.title === 'Travel').progressType).toBe('simple');
    expect(await Wishlist.countDocuments()).toBe(5);
    expect(await Transaction.countDocuments()).toBe(0);
    expect(await migrateWishlist({ userId: user._id, validate: true })).toMatchObject({
      skipped: 5,
      errors: [],
    });
  });
  it('merges linked records without replacing existing Goal progress, status or user data', async () => {
    const goal = await Goal.create({
      user: user._id,
      title: 'My title',
      description: 'My description',
      targetAmount: 1000,
      currentAmount: 450,
      accountId: accounts[1]._id,
      status: 'paused',
    });
    const wish = await Wishlist.create({
      user: user._id,
      name: 'Other title',
      expectedPrice: 500,
      status: 'purchased',
      notes: 'Older notes',
      url: 'https://example.com',
      goalId: goal._id,
    });
    const report = await migrateWishlist({ userId: user._id, dryRun: false });
    expect(report.merged).toBe(1);
    expect(report.conflicts.length).toBeGreaterThan(0);
    expect(await Goal.countDocuments()).toBe(1);
    const after = await Goal.findById(goal._id);
    expect(after.toObject()).toMatchObject({
      title: 'My title',
      description: 'My description',
      targetAmount: 1000,
      currentAmount: 450,
      status: 'paused',
      accountId: accounts[1]._id,
      notes: 'Older notes',
      url: 'https://example.com',
    });
    expect(String(after.legacyWishlist[0].wishlistId)).toBe(String(wish._id));
    expect((await getGoal(user._id, goal._id)).legacyDetails[0].notes).toBe('Older notes');
  });
  it('retries and concurrent migrations produce no duplicates or resurrected deleted goals', async () => {
    await Wishlist.create({ user: user._id, name: 'Once' });
    await Promise.all([
      migrateWishlist({ userId: user._id, dryRun: false }),
      migrateWishlist({ userId: user._id, dryRun: false }),
    ]);
    expect(await Goal.countDocuments()).toBe(1);
    const goal = await Goal.findOne();
    await api('delete', `goals/${goal._id}`).expect(200);
    expect(await listGoals(user._id)).toEqual([]);
    expect(await Goal.countDocuments()).toBe(1);
  });
  it('handles dangling and cross-user goal references without exposing or updating other users', async () => {
    const foreign = await Goal.create({ user: other._id, title: 'Private', currentAmount: 99 });
    await Wishlist.create([
      { user: user._id, name: 'Dangling', goalId: new mongoose.Types.ObjectId() },
      { user: user._id, name: 'Cross-user', goalId: foreign._id },
      { user: other._id, name: 'Other wish' },
    ]);
    expect(await migrateWishlist({ userId: user._id, dryRun: false })).toMatchObject({
      scanned: 2,
      created: 2,
      dangling: 2,
    });
    expect((await Goal.findById(foreign._id)).currentAmount).toBe(99);
    expect(await Goal.countDocuments({ user: other._id })).toBe(1);
    expect(
      await api('get', 'goals')
        .expect(200)
        .then((response) => response.body.data),
    ).toHaveLength(2);
  });
  it('reports invalid and changed legacy data, retaining originals', async () => {
    const wish = await Wishlist.create({ user: user._id, name: 'Valid' });
    await Wishlist.collection.insertOne({ user: user._id, notes: 'Missing name' });
    expect((await migrateWishlist({ userId: user._id, dryRun: false })).errors).toHaveLength(1);
    await Wishlist.collection.updateOne(
      { _id: wish._id },
      { $set: { notes: 'Changed externally' } },
    );
    expect((await migrateWishlist({ userId: user._id, validate: true })).errors).toHaveLength(2);
    expect(await Wishlist.countDocuments()).toBe(2);
    const response = await api('get', 'goals').expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.migration.errors).toHaveLength(1);
  });
  it('keeps old API writes on Goals, search, exports, currency and subscription access', async () => {
    await Setting.create({ user: user._id, defaultCurrency: 'DZD' });
    const wish = await Wishlist.create({ user: user._id, name: 'Bicycle', expectedPrice: 100 });
    await Feature.create({
      key: 'goals',
      name: 'Goals',
      category: 'Planning',
      icon: 'mdi:target',
      type: 'BOOLEAN',
      accessMode: 'PLAN_BASED',
    });
    expect((await resolveUserEntitlements(user)).decisions.goals.allowed).toBe(true);
    expect((await api('get', 'search?q=Bicycle').expect(200)).body.data[0].resultType).toBe('goal');
    const response = await api('patch', `wishlist/${wish._id}`).send({ name: 'Bike' }).expect(200);
    expect(response.body.data.title).toBe('Bike');
    expect(response.headers.deprecation).toBe('true');
    await api('post', 'wishlist').send({ name: 'Camera', expectedPrice: 200 }).expect(201);
    expect(await Wishlist.countDocuments()).toBe(1);
    expect(await Goal.countDocuments()).toBe(2);
    const backup = await api('get', 'export/all').expect(200);
    expect(backup.body.data.goals).toHaveLength(2);
    expect(backup.body.data.wishlist).toHaveLength(1);
  });
  it('recognizes a historical Wishlist plan grant without exposing a separate capability', async () => {
    const [goalFeature, wishFeature] = await Feature.create([
      {
        key: 'goals',
        name: 'Goals',
        category: 'Planning',
        icon: 'mdi:target',
        type: 'BOOLEAN',
        accessMode: 'PLAN_BASED',
      },
      {
        key: 'wishlist',
        name: 'Wishlist',
        category: 'Personal',
        icon: 'mdi:heart',
        type: 'BOOLEAN',
        accessMode: 'PLAN_BASED',
      },
    ]);
    const plan = await Plan.create({
      name: 'Legacy',
      slug: 'legacy',
      durationValue: 30,
      durationUnit: 'DAY',
      createdBy: new mongoose.Types.ObjectId(),
      features: [
        { feature: goalFeature._id, enabled: false },
        { feature: wishFeature._id, enabled: true },
      ],
    });
    await AccessSubscription.create({
      user: user._id,
      plan: plan._id,
      source: 'ADMIN_GRANT',
      startedAt: new Date(),
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      entitlementVersion: 1,
      planSnapshot: { name: 'Legacy', features: [{ key: 'wishlist', enabled: true }] },
    });
    const access = await resolveUserEntitlements(user);
    expect(access.decisions.goals.allowed).toBe(true);
    expect(access.decisions.wishlist).toBeUndefined();
    await UserFeatureOverride.create({
      user: user._id,
      key: 'goals',
      enabled: false,
      reason: 'Explicit policy',
      updatedBy: new mongoose.Types.ObjectId(),
    });
    expect((await resolveUserEntitlements(user)).decisions.goals.allowed).toBe(false);
  });
});
