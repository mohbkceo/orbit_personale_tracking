import mongoose from 'mongoose';
import { User } from '../models/User.js';

const objectIds = (values) => values.map((value) => new mongoose.Types.ObjectId(value));
const dateRange = (from, to) => ({ ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) });
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function audiencePipeline(selection, { promotional = false, now = new Date() } = {}) {
  const { filters: f, allMatching, includeIds, excludeIds } = selection;
  const account = {};
  if (f.status !== 'ALL') account.status = f.status;
  if (f.registeredFrom || f.registeredTo) account.createdAt = dateRange(f.registeredFrom, f.registeredTo);
  if (f.lastLoginFrom || f.lastLoginTo) account.lastLoginAt = dateRange(f.lastLoginFrom, f.lastLoginTo);
  if (!allMatching) account._id = { $in: objectIds(includeIds) };
  const pipeline = [{ $match: account },
    { $lookup: { from: 'telegramconnections', localField: '_id', foreignField: 'user', as: 'connection' } },
    { $lookup: { from: 'accesssubscriptions', let: { uid: '$_id' }, pipeline: [
      { $match: { $expr: { $eq: ['$user', '$$uid'] }, status: { $in: ['ACTIVE', null] } } },
      { $sort: { expiresAt: -1, createdAt: -1 } }, { $limit: 1 },
    ], as: 'currentSubscription' } },
    { $lookup: { from: 'accesssubscriptions', let: { uid: '$_id' }, pipeline: [
      { $match: { $expr: { $eq: ['$user', '$$uid'] }, $or: [{ status: 'EXPIRED' }, { expiresAt: { $lte: now } }] } }, { $limit: 1 },
    ], as: 'expiredSubscription' } },
    { $lookup: { from: 'accesssubscriptions', let: { uid: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$user', '$$uid'] } } }, { $limit: 1 }], as: 'anySubscription' } },
    { $lookup: { from: 'messagepreferences', localField: '_id', foreignField: 'user', as: 'preference' } },
    { $set: { hasConnection: { $gt: [{ $size: '$connection' }, 0] }, connection: { $first: '$connection' }, currentSubscription: { $first: '$currentSubscription' }, preference: { $first: '$preference' }, hasExpired: { $gt: [{ $size: '$expiredSubscription' }, 0] }, hasPaidHistory: { $gt: [{ $size: '$anySubscription' }, 0] } } },
    { $set: { hasActivePaid: { $and: [{ $ne: ['$currentSubscription', null] }, { $gt: ['$currentSubscription.expiresAt', now] }] } } },
  ];
  if (f.search) {
    const regex = escapeRegex(f.search);
    pipeline.push({ $match: { $or: [{ fullName: { $regex: regex, $options: 'i' } }, { email: { $regex: regex, $options: 'i' } }, { 'connection.telegramUsername': { $regex: regex, $options: 'i' } }] } });
  }
  if (f.telegram === 'CONNECTED') pipeline.push({ $match: { hasConnection: true } });
  if (f.telegram === 'NOT_CONNECTED') pipeline.push({ $match: { hasConnection: false } });
  if (f.interactionFrom || f.interactionTo) pipeline.push({ $match: { 'connection.lastInteractionAt': dateRange(f.interactionFrom, f.interactionTo) } });
  if (['PAID', 'ACTIVE', 'EXPIRING'].includes(f.subscription)) pipeline.push({ $match: { hasActivePaid: true } });
  if (f.subscription === 'FREE') pipeline.push({ $match: { hasActivePaid: false } });
  if (f.subscription === 'EXPIRED') pipeline.push({ $match: { hasActivePaid: false, hasExpired: true } });
  if (f.subscription === 'NO_PAID') pipeline.push({ $match: { hasPaidHistory: false } });
  if (f.subscription === 'EXPIRING') pipeline.push({ $match: { 'currentSubscription.expiresAt': { $lte: new Date(now.getTime() + f.expiringDays * 86400000), $gt: now } } });
  if (f.planIds.length) pipeline.push({ $match: { hasActivePaid: true, 'currentSubscription.plan': { $in: objectIds(f.planIds) } } });
  pipeline.push({ $lookup: { from: 'plans', localField: 'currentSubscription.plan', foreignField: '_id', as: 'plan' } });
  pipeline.push({ $set: {
    plan: { $first: '$plan' }, excluded: { $in: ['$_id', objectIds(excludeIds)] },
    suppressed: promotional ? { $ne: ['$preference.promotionalTelegram', true] } : false,
  } });
  pipeline.push({ $set: { deliverable: { $and: [{ $eq: ['$status', 'ACTIVE'] }, '$hasConnection', { $eq: ['$excluded', false] }, { $eq: ['$suppressed', false] }] } } });
  return pipeline;
}

export async function previewAudience(selection, options = {}) {
  const pipeline = audiencePipeline(selection, options);
  const [result] = await User.aggregate([...pipeline, { $group: { _id: null,
    targeted: { $sum: 1 }, connected: { $sum: { $cond: ['$hasConnection', 1, 0] } },
    eligible: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'ACTIVE'] }, '$hasConnection'] }, 1, 0] } },
    excluded: { $sum: { $cond: ['$excluded', 1, 0] } }, withoutTelegram: { $sum: { $cond: ['$hasConnection', 0, 1] } },
    suppressed: { $sum: { $cond: ['$suppressed', 1, 0] } }, deliverable: { $sum: { $cond: ['$deliverable', 1, 0] } },
  } }]);
  return result || { targeted: 0, connected: 0, eligible: 0, excluded: 0, withoutTelegram: 0, suppressed: 0, deliverable: 0 };
}
export async function listAudience(selection, { page = 1, limit = 25, promotional = false } = {}) {
  const pipeline = audiencePipeline(selection, { promotional });
  const [result] = await User.aggregate([...pipeline, { $facet: {
    rows: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { fullName: 1, email: 1, status: 1, createdAt: 1, lastLoginAt: 1, connected: '$hasConnection', telegramUsername: '$connection.telegramUsername', planName: '$plan.name', expiresAt: '$currentSubscription.expiresAt', hasActivePaid: 1, suppressed: 1, excluded: 1, deliverable: 1 } }],
    count: [{ $count: 'total' }],
  } }]);
  return { rows: result.rows, total: result.count[0]?.total || 0, page, limit };
}
export async function* recipientSnapshot(selection, options = {}) {
  const cursor = User.aggregate([...audiencePipeline(selection, options), { $match: { deliverable: true } }, { $project: { _id: 1, chatId: '$connection.chatId' } }]).cursor({ batchSize: 100 });
  for await (const item of cursor) yield item;
}
