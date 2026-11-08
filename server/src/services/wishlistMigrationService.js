import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Goal } from '../models/Planning.js';
import { Wishlist } from '../models/Personal.js';

const statusMap = {
  wanted: 'active',
  saving: 'active',
  purchased: 'completed',
  cancelled: 'cancelled',
};
const empty = (value) => value === undefined || value === null || value === '';
const migrationId = (item) =>
  new mongoose.Types.ObjectId(
    createHash('sha256')
      .update(`orbit:wishlist:${item.user}:${item._id}`)
      .digest('hex')
      .slice(0, 24),
  );

export function wishlistGoalFields(item) {
  const money =
    typeof item.expectedPrice === 'number' &&
    Number.isFinite(item.expectedPrice) &&
    item.expectedPrice >= 0;
  return {
    title: item.name,
    progressType: money ? 'money' : 'simple',
    type: money ? 'financial' : 'personal',
    ...(money ? { targetAmount: item.expectedPrice } : {}),
    targetDate: item.targetDate,
    priority: item.priority,
    description: item.notes,
    notes: item.notes,
    url: item.url,
    category: item.category,
    status: statusMap[item.status] || 'active',
  };
}

// Never deletes or modifies a legacy record. Each atomic goal write carries its full raw snapshot.
// Deterministic IDs and conditional writes make concurrent requests and interrupted runs retryable.
export async function migrateWishlist({ userId, dryRun = true, validate = false } = {}) {
  const report = {
    dryRun,
    scanned: 0,
    created: 0,
    merged: 0,
    skipped: 0,
    dangling: 0,
    conflicts: [],
    errors: [],
  };
  const filter = userId ? { user: new mongoose.Types.ObjectId(userId) } : {};
  for await (const item of Wishlist.collection.find(filter)) {
    report.scanned++;
    if (
      !mongoose.isValidObjectId(item.user) ||
      typeof item.name !== 'string' ||
      !item.name.trim()
    ) {
      report.errors.push({
        wishlistId: String(item._id),
        reason: 'Missing owner or title; legacy record retained',
      });
      continue;
    }
    const scope = { user: item.user };
    const existing = await Goal.collection.findOne({
      ...scope,
      'legacyWishlist.wishlistId': item._id,
    });
    if (existing) {
      report.skipped++;
      if (validate) {
        const snapshot = existing.legacyWishlist.find(
          (entry) => String(entry.wishlistId) === String(item._id),
        );
        if (JSON.stringify(snapshot.original) !== JSON.stringify(item))
          report.errors.push({
            wishlistId: String(item._id),
            reason: 'Legacy source changed after migration; snapshot retained for review',
          });
      }
      continue;
    }
    const linked =
      item.goalId && mongoose.isValidObjectId(item.goalId)
        ? await Goal.collection.findOne({ ...scope, _id: new mongoose.Types.ObjectId(item.goalId) })
        : null;
    if (item.goalId && !linked) report.dangling++;
    if (validate) {
      report.errors.push({ wishlistId: String(item._id), reason: 'Not migrated' });
      continue;
    }
    const fields = wishlistGoalFields(item);
    const snapshot = { wishlistId: item._id, original: item, migratedAt: new Date() };
    if (linked) {
      const fill = {};
      for (const [key, value] of Object.entries(fields)) {
        // Existing progress, status, tracking method and financial state always win.
        if (['type', 'progressType', 'status'].includes(key)) continue;
        if (empty(linked[key]) && !empty(value)) fill[key] = value;
        else if (!empty(value) && String(linked[key]) !== String(value))
          report.conflicts.push({
            wishlistId: String(item._id),
            goalId: String(linked._id),
            field: key,
          });
      }
      if (!empty(fields.status) && String(linked.status) !== String(fields.status))
        report.conflicts.push({
          wishlistId: String(item._id),
          goalId: String(linked._id),
          field: 'status',
        });
      if (!dryRun) {
        // Fill blanks and append provenance together. Recheck each field inside the
        // atomic update so concurrent user edits always win over migration fields.
        const updates = Object.fromEntries(
          Object.entries(fill).map(([key, value]) => [
            key,
            {
              $cond: [
                { $in: [{ $ifNull: [`$${key}`, null] }, [null, '']] },
                { $literal: value },
                `$${key}`,
              ],
            },
          ]),
        );
        updates.legacyWishlist = {
          $concatArrays: [{ $ifNull: ['$legacyWishlist', []] }, { $literal: [snapshot] }],
        };
        await Goal.collection.updateOne(
          { ...scope, _id: linked._id, 'legacyWishlist.wishlistId': { $ne: item._id } },
          [{ $set: updates }],
        );
      }
      report.merged++;
    } else {
      const _id = migrationId(item);
      const collision = await Goal.collection.findOne({ _id });
      if (
        collision &&
        (String(collision.user) !== String(item.user) ||
          !collision.legacyWishlist?.some((entry) => String(entry.wishlistId) === String(item._id)))
      ) {
        report.errors.push({
          wishlistId: String(item._id),
          reason: 'Goal ID collision; no data overwritten',
        });
        continue;
      }
      if (!dryRun)
        try {
          await Goal.collection.updateOne(
            { ...scope, _id },
            {
              $setOnInsert: {
                ...Object.fromEntries(
                  Object.entries(fields).filter(([, value]) => value !== undefined),
                ),
                _id,
                user: item.user,
                currentAmount: 0,
                savingsOpeningAmount: 0,
                steps: [],
                reminderMode: 'automatic',
                deletedAt: null,
                createdAt: item.createdAt || new Date(),
                updatedAt: item.updatedAt || item.createdAt || new Date(),
                legacyWishlist: [snapshot],
              },
            },
            { upsert: true },
          );
        } catch (error) {
          // Concurrent upserts can race on MongoDB's unique _id index. Only accept
          // the winner when ownership and the exact migration source both match.
          if (
            error.code !== 11000 ||
            !(await Goal.collection.findOne({
              ...scope,
              _id,
              'legacyWishlist.wishlistId': item._id,
            }))
          )
            throw error;
        }
      report.created++;
    }
  }
  return report;
}
