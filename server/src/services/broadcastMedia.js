import mongoose from 'mongoose';
import sharp from 'sharp';
import { AppError } from '../utils/AppError.js';

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'broadcastMedia' });
export async function saveBroadcastImage(bytes, declaredType) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(declaredType) || bytes.length > 5 * 1024 * 1024 || bytes.length < 50) throw new AppError('Upload a JPEG, PNG, or WebP image under 5 MB', 422);
  let image;
  try { image = sharp(bytes, { failOn: 'error', limitInputPixels: 20_000_000 }); const metadata = await image.metadata(); if (metadata.format !== ({ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' })[declaredType]) throw new Error('MIME mismatch'); }
  catch { throw new AppError('Invalid image content', 422); }
  const normalized = await image.rotate().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  if (normalized.length > 5 * 1024 * 1024) throw new AppError('Image is too large', 422);
  const id = new mongoose.Types.ObjectId();
  await new Promise((resolve, reject) => { const stream = bucket().openUploadStreamWithId(id, 'broadcast.jpg', { contentType: 'image/jpeg' }); stream.on('finish', resolve); stream.on('error', reject); stream.end(normalized); });
  return id;
}
export async function loadBroadcastImage(id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid image ID', 422);
  const chunks = [];
  await new Promise((resolve, reject) => { const stream = bucket().openDownloadStream(new mongoose.Types.ObjectId(id)); stream.on('data', (chunk) => chunks.push(chunk)); stream.on('end', resolve); stream.on('error', reject); });
  return Buffer.concat(chunks);
}
export async function broadcastImageExists(id) {
  return Boolean(await mongoose.connection.db.collection('broadcastMedia.files').findOne({ _id: new mongoose.Types.ObjectId(id) }, { projection: { _id: 1 } }));
}
