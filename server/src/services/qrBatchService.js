import crypto from 'node:crypto';
import { ZipArchive } from 'archiver';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { ActivationLink } from '../models/ActivationLink.js';
import { Plan } from '../models/Plan.js';
import { QrBatch } from '../models/QrBatch.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/query.js';
import { activationUrlFromLink, createActivationLink } from './activationService.js';
import { audit } from './auditService.js';

function batchCodeStem(name) {
  return (
    String(name)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5) || 'BATCH'
  );
}

async function uniqueBatchCode(name, session) {
  const stem = batchCodeStem(name);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
    const code = `${stem}${suffix}`;
    if (!(await QrBatch.exists({ code }).session(session || null))) return code;
  }
  throw new AppError('Could not generate a unique batch code. Please try again.', 503);
}

function emptyStats(total = 0) {
  return { total, active: 0, used: 0, expired: 0, revoked: 0 };
}

function statsFromRows(rows) {
  const stats = emptyStats();
  for (const row of rows) {
    const key = String(row._id || '').toLowerCase();
    if (key in stats) stats[key] = row.count;
    stats.total += row.count;
  }
  return stats;
}

async function syncExpiredBatchLinks(qrBatch) {
  const filter = { qrBatch: { $exists: true }, status: 'ACTIVE', expiresAt: { $lte: new Date() } };
  if (qrBatch) filter.qrBatch = qrBatch;
  await ActivationLink.updateMany(filter, { $set: { status: 'EXPIRED' } });
}

async function batchStats(batchIds) {
  if (!batchIds.length) return new Map();
  const rows = await ActivationLink.aggregate([
    { $match: { qrBatch: { $in: batchIds } } },
    { $group: { _id: { batch: '$qrBatch', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const map = new Map(batchIds.map((id) => [String(id), emptyStats()]));
  for (const row of rows) {
    const stats = map.get(String(row._id.batch));
    if (!stats) continue;
    stats.total += row.count;
    const key = String(row._id.status).toLowerCase();
    if (key in stats) stats[key] += row.count;
  }
  return map;
}

export async function createQrBatch(input, adminId) {
  const session = await mongoose.startSession();
  let batchId;
  try {
    await session.withTransaction(async () => {
      const plan = await Plan.findOne({ _id: input.planId, status: 'ACTIVE' }).session(session);
      if (!plan)
        throw new AppError('The plan is inactive or unavailable.', 409, undefined, 'PLAN_INACTIVE');
      const code = await uniqueBatchCode(input.name, session);
      const [batch] = await QrBatch.create(
        [
          {
            name: input.name,
            code,
            plan: plan._id,
            quantity: input.quantity,
            validityDays: input.validityDays,
            note: input.note,
            qrFormat: input.qrFormat,
            qrSize: input.qrSize,
            createdByAdmin: adminId,
          },
        ],
        { session },
      );
      batchId = batch._id;

      for (let sequence = 1; sequence <= input.quantity; sequence += 1) {
        await createActivationLink(plan._id, adminId, {
          validityDays: input.validityDays,
          note: input.note,
          qrBatch: batch._id,
          batchSequence: sequence,
          batchCode: `ORB-${code}-${String(sequence).padStart(3, '0')}`,
          session,
          planDocument: plan,
        });
      }

      await audit('QR_BATCH_CREATED', {
        actorType: 'ADMIN',
        actorId: adminId,
        targetType: 'QrBatch',
        targetId: batch._id,
        metadata: { code, planId: String(plan._id), quantity: input.quantity },
        session,
      });
    });
  } finally {
    await session.endSession();
  }
  return getQrBatch(batchId);
}

export async function listQrBatches({ search = '' } = {}) {
  await syncExpiredBatchLinks();
  const term = String(search).trim();
  const filter = term
    ? {
        $or: [
          { name: { $regex: escapeRegex(term), $options: 'i' } },
          { code: { $regex: escapeRegex(term), $options: 'i' } },
        ],
      }
    : {};
  const batches = await QrBatch.find(filter)
    .populate('plan', 'name durationValue durationUnit status')
    .populate('createdByAdmin', 'fullName email')
    .sort({ createdAt: -1 });
  const stats = await batchStats(batches.map((batch) => batch._id));
  return batches.map((batch) => ({
    ...batch.toObject(),
    stats: stats.get(String(batch._id)) || emptyStats(),
  }));
}

export async function getQrBatch(id, { search = '' } = {}) {
  await syncExpiredBatchLinks(id);
  const batch = await QrBatch.findById(id)
    .populate('plan', 'name durationValue durationUnit status')
    .populate('createdByAdmin', 'fullName email');
  if (!batch) throw new AppError('QR batch not found', 404);
  const term = String(search).trim();
  const linkFilter = { qrBatch: batch._id };
  if (term) linkFilter.batchCode = { $regex: escapeRegex(term), $options: 'i' };
  const [links, grouped] = await Promise.all([
    ActivationLink.find(linkFilter)
      .populate('activatedUser', 'fullName email')
      .select(
        'batchCode batchSequence status openCount activatedUser activatedAt expiresAt createdAt',
      )
      .sort({ batchSequence: 1 }),
    ActivationLink.aggregate([
      { $match: { qrBatch: batch._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  return { batch, stats: statsFromRows(grouped), links };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportManifestCsv(rows) {
  return [
    'Code,Plan,Status,ExpiresAt,URL',
    ...rows.map((row) =>
      [row.code, row.plan, row.status, row.expiresAt, row.url].map(csvCell).join(','),
    ),
  ].join('\r\n');
}

export async function prepareQrBatchExport(id) {
  await syncExpiredBatchLinks(id);
  const batch = await QrBatch.findById(id).populate('plan', 'name durationValue durationUnit');
  if (!batch) throw new AppError('QR batch not found', 404);
  const links = await ActivationLink.find({ qrBatch: batch._id })
    .select(
      'batchCode batchSequence status expiresAt planSnapshot +encryptedToken +tokenIv +tokenAuthTag',
    )
    .sort({ batchSequence: 1 });
  const rows = links.map((link) => {
    let url = '';
    if (
      link.status === 'ACTIVE' &&
      (!link.expiresAt || link.expiresAt > new Date()) &&
      link.encryptedToken
    ) {
      try {
        url = activationUrlFromLink(link);
      } catch {
        url = '';
      }
    }
    return {
      code: link.batchCode,
      sequence: link.batchSequence,
      plan: link.planSnapshot?.name || batch.plan?.name || 'Plan',
      status: link.status,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : '',
      url,
    };
  });
  return { batch, rows, csv: exportManifestCsv(rows) };
}

function safeFolderName(name, fallback) {
  const printable = Array.from(String(name))
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('');
  const cleaned = printable
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

export async function writeQrBatchArchive(output, prepared) {
  const { batch, rows, csv } = prepared;
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const completed = new Promise((resolve, reject) => {
    archive.on('error', reject);
    archive.on('end', resolve);
  });
  archive.pipe(output);
  const folder = safeFolderName(batch.name, batch.code);
  const extension = batch.qrFormat === 'SVG' ? 'svg' : 'png';
  for (const row of rows.filter((item) => item.url)) {
    const data =
      extension === 'svg'
        ? await QRCode.toString(row.url, {
            type: 'svg',
            width: batch.qrSize,
            margin: 2,
            errorCorrectionLevel: 'M',
          })
        : await QRCode.toBuffer(row.url, {
            type: 'png',
            width: batch.qrSize,
            margin: 2,
            errorCorrectionLevel: 'M',
          });
    archive.append(data, {
      name: `${folder}/QR-${String(row.sequence).padStart(3, '0')}.${extension}`,
    });
  }
  archive.append(csv, { name: `${folder}/manifest.csv` });
  await archive.finalize();
  await completed;
}

export async function revokeUnusedQrBatch(id, adminId) {
  await syncExpiredBatchLinks(id);
  const batch = await QrBatch.findById(id);
  if (!batch) throw new AppError('QR batch not found', 404);
  const result = await ActivationLink.updateMany(
    { qrBatch: batch._id, status: 'ACTIVE' },
    { $set: { status: 'REVOKED' } },
  );
  await audit('QR_BATCH_UNUSED_REVOKED', {
    actorType: 'ADMIN',
    actorId: adminId,
    targetType: 'QrBatch',
    targetId: batch._id,
    metadata: { revokedCount: result.modifiedCount },
  });
  const detail = await getQrBatch(batch._id);
  return { ...detail, revokedCount: result.modifiedCount };
}
