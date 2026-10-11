import mongoose from 'mongoose';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { AppError } from '../utils/AppError.js';
import { QrPrintTemplate } from '../models/QrPrintTemplate.js';
import { QrBatch } from '../models/QrBatch.js';
import { templateAssetIds } from '../validators/qrPrintTemplate.js';

const MAX_SOURCE = 2 * 1024 * 1024;
const MAX_STORED = 3 * 1024 * 1024;
const MAX_PIXELS = 12_000_000;
function bucket() { return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'qrPrintAssets' }); }

export async function savePrintAsset(buffer, declaredType, adminId) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_SOURCE)
    throw new AppError('Image must be at most 2 MB', 422);
  let metadata;
  try { metadata = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata(); }
  catch { throw new AppError('Invalid image', 422); }
  const mime = metadata.format === 'png' ? 'image/png' : metadata.format === 'jpeg' ? 'image/jpeg' : null;
  if (!mime || mime !== declaredType || !metadata.width || !metadata.height || metadata.width > 5000 || metadata.height > 5000)
    throw new AppError('Only valid PNG/JPEG images up to 5000 pixels per side are allowed', 422);
  let clean;
  try {
    const source = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate();
    clean = await (mime === 'image/png' ? source.png() : source.jpeg({ quality: 90 })).toBuffer();
  } catch { throw new AppError('Invalid image', 422); }
  if (clean.length > MAX_STORED) throw new AppError('Processed image is too large', 422);
  const upload = bucket().openUploadStream(`artwork-${Date.now()}`, {
    contentType: mime, metadata: { width: metadata.width, height: metadata.height, createdByAdmin: String(adminId) },
  });
  await new Promise((resolve, reject) => { upload.on('finish', resolve); upload.on('error', reject); Readable.from([clean]).pipe(upload); });
  return { _id: upload.id, contentType: mime, width: metadata.width, height: metadata.height, length: clean.length };
}

export async function printAssetInfo(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Artwork not found', 404);
  const rows = await bucket().find({ _id: new mongoose.Types.ObjectId(id) }).limit(1).toArray();
  if (!rows[0]) throw new AppError('Artwork not found', 404);
  return rows[0];
}

export async function readPrintAsset(id) {
  const file = await printAssetInfo(id);
  if (file.length > MAX_STORED) throw new AppError('Artwork exceeds print size limit', 422);
  const chunks = [];
  for await (const chunk of bucket().openDownloadStream(file._id)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function checkPrintAssets(template) {
  const ids = templateAssetIds(template);
  if (ids.length > 10) throw new AppError('A template can use at most 10 images', 422);
  const files = await Promise.all(ids.map(printAssetInfo));
  if (files.reduce((sum, file) => sum + file.length, 0) > 8 * 1024 * 1024)
    throw new AppError('Template artwork exceeds 8 MB', 422);
}

export async function removePrintAsset(id) {
  const file = await printAssetInfo(id);
  if ((await QrPrintTemplate.exists({ assetRefs: id })) || (await QrBatch.exists({ 'printSnapshot.assetRefs': id })))
    throw new AppError('Artwork is used by a saved template or batch', 409);
  await bucket().delete(file._id);
}

export function streamPrintAsset(id, output) {
  const input = bucket().openDownloadStream(new mongoose.Types.ObjectId(id));
  input.pipe(output);
  return input;
}
