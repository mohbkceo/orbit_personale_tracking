import mongoose from 'mongoose';
import express, { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { QrPrintTemplate } from '../models/QrPrintTemplate.js';
import { templateInput } from '../validators/qrPrintTemplate.js';
import { checkPrintAssets, printAssetInfo, removePrintAsset, savePrintAsset, streamPrintAsset } from '../services/qrPrintAssetService.js';
import { reservePrintExport, samplePrintRow, streamPrintPdf } from '../services/qrPrintPdfService.js';

export const adminQrPrintTemplateRoutes = Router();
adminQrPrintTemplateRoutes.use(adminAuth);
adminQrPrintTemplateRoutes.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const findTemplate = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Print template not found', 404);
  const template = await QrPrintTemplate.findById(id);
  if (!template) throw new AppError('Print template not found', 404);
  return template;
};

adminQrPrintTemplateRoutes.get('/', asyncHandler(async (_req, res) =>
  success(res, await QrPrintTemplate.find().populate('createdByAdmin', 'fullName').sort({ updatedAt: -1 }))));
adminQrPrintTemplateRoutes.post('/', validate(templateInput), asyncHandler(async (req, res) => {
  await checkPrintAssets(req.body);
  const template = await QrPrintTemplate.create({ ...req.body, createdByAdmin: req.admin._id });
  await audit('QR_PRINT_TEMPLATE_CREATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'QrPrintTemplate', targetId: template._id });
  return success(res, template, 201);
}));
adminQrPrintTemplateRoutes.post('/assets', express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' }), asyncHandler(async (req, res) => {
  const asset = await savePrintAsset(req.body, req.get('Content-Type')?.split(';')[0], req.admin._id);
  await audit('QR_PRINT_ASSET_UPLOADED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'QrPrintAsset', targetId: asset._id });
  return success(res, asset, 201);
}));
adminQrPrintTemplateRoutes.get('/assets/:id', asyncHandler(async (req, res) => {
  const file = await printAssetInfo(req.params.id);
  res.set({ 'Content-Type': file.contentType, 'Content-Length': String(file.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  const stream = streamPrintAsset(req.params.id, res);
  res.once('close', () => stream.destroy());
  stream.on('error', (error) => {
    if (!res.headersSent) { res.removeHeader('Content-Length'); res.status(500).end(); }
    else res.destroy(error);
  });
}));
adminQrPrintTemplateRoutes.delete('/assets/:id', asyncHandler(async (req, res) => {
  await removePrintAsset(req.params.id);
  await audit('QR_PRINT_ASSET_DELETED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'QrPrintAsset', targetId: new mongoose.Types.ObjectId(req.params.id) });
  return success(res, { deleted: true });
}));
adminQrPrintTemplateRoutes.post('/preview.pdf', validate(templateInput), async (req, res, next) => {
  let release;
  try {
    release = reservePrintExport();
    await checkPrintAssets(req.body);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="sample-print-card.pdf"', 'Cache-Control': 'no-store' });
    await streamPrintPdf(res, req.body, [samplePrintRow], { sample: true });
  } catch (error) { if (res.headersSent) res.destroy(error); else next(error); }
  finally { release?.(); }
});
adminQrPrintTemplateRoutes.get('/:id', asyncHandler(async (req, res) => success(res, await findTemplate(req.params.id))));
adminQrPrintTemplateRoutes.patch('/:id', validate(templateInput), asyncHandler(async (req, res) => {
  const template = await findTemplate(req.params.id);
  await checkPrintAssets(req.body);
  Object.assign(template, req.body);
  template.version += 1;
  await template.save();
  await audit('QR_PRINT_TEMPLATE_UPDATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'QrPrintTemplate', targetId: template._id, metadata: { version: template.version } });
  return success(res, template);
}));
adminQrPrintTemplateRoutes.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const original = await findTemplate(req.params.id);
  const copy = await QrPrintTemplate.create({ ...original.toObject(), _id: undefined, name: `${original.name} copy`.slice(0, 120), version: 1, createdByAdmin: req.admin._id, createdAt: undefined, updatedAt: undefined });
  await audit('QR_PRINT_TEMPLATE_DUPLICATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'QrPrintTemplate', targetId: copy._id });
  return success(res, copy, 201);
}));
adminQrPrintTemplateRoutes.delete('/:id', asyncHandler(async (req, res) => {
  const template = await findTemplate(req.params.id);
  await template.deleteOne();
  await audit('QR_PRINT_TEMPLATE_DELETED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'QrPrintTemplate', targetId: template._id });
  return success(res, { deleted: true });
}));
adminQrPrintTemplateRoutes.get('/:id/preview.pdf', async (req, res, next) => {
  let release;
  try {
    release = reservePrintExport();
    const template = await findTemplate(req.params.id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="sample-print-card.pdf"', 'Cache-Control': 'no-store' });
    await streamPrintPdf(res, template, [samplePrintRow], { sample: true });
  } catch (error) { if (res.headersSent) res.destroy(error); else next(error); }
  finally { release?.(); }
});
