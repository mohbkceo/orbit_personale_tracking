import { Router } from 'express';
import { z } from 'zod';
import { adminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { audit } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';
import { QrBatch } from '../models/QrBatch.js';
import { QrPrintTemplate } from '../models/QrPrintTemplate.js';
import { reservePrintExport, preparePrintBatch, streamPrintPdf } from '../services/qrPrintPdfService.js';
import {
  createQrBatch,
  getQrBatch,
  listQrBatches,
  prepareQrBatchExport,
  revokeUnusedQrBatch,
  writeQrBatchArchive,
} from '../services/qrBatchService.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid QR batch ID');
const idParams = z.object({ id: objectId });
const formatValue = z.preprocess((value) => String(value).toUpperCase(), z.enum(['PNG', 'SVG']));
const sizeValue = z.coerce
  .number()
  .int()
  .refine((value) => [512, 1024, 2048].includes(value), 'Invalid QR size');
const batchInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    planId: objectId,
    quantity: z.coerce.number().int().min(1).max(500).default(100),
    validityDays: z.coerce.number().int().min(1).max(365).optional(),
    noExpiry: z.boolean().default(false),
    templateId: objectId.optional(),
    note: z.string().trim().max(500).default(''),
    qrFormat: formatValue.optional(),
    format: formatValue.optional(),
    qrSize: sizeValue.optional(),
    size: sizeValue.optional(),
  })
  .refine((value) => value.noExpiry || value.validityDays != null, { path: ['validityDays'], message: 'Choose a validity period or no expiry' })
  .transform(({ format, size, ...value }) => ({
    ...value,
    qrFormat: value.qrFormat || format || 'PNG',
    qrSize: value.qrSize || size || 1024,
  }));
const searchQuery = z.object({ search: z.string().trim().max(100).default('') });

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success)
      return res
        .status(422)
        .json({
          success: false,
          message: 'Validation failed',
          errors: result.error.flatten().fieldErrors,
        });
    req.validatedQuery = result.data;
    return next();
  };
}

export const adminQrBatchRoutes = Router();
adminQrBatchRoutes.use(adminAuth);

adminQrBatchRoutes.get(
  '/',
  validateQuery(searchQuery),
  asyncHandler(async (req, res) => {
    return success(res, await listQrBatches(req.validatedQuery));
  }),
);

adminQrBatchRoutes.post(
  '/',
  validate(batchInput),
  asyncHandler(async (req, res) => {
    return success(res, await createQrBatch(req.body, req.admin._id), 201);
  }),
);

adminQrBatchRoutes.post('/:id/print-template', validate(idParams, 'params'),
  validate(z.object({ templateId: objectId })), asyncHandler(async (req, res) => {
    const template = await QrPrintTemplate.findById(req.body.templateId);
    if (!template) throw new AppError('Print template not found', 404);
    const snapshot = { name: template.name, widthMm: template.widthMm, heightMm: template.heightMm,
      background: template.background, elements: template.elements, assetRefs: template.assetRefs, version: template.version };
    const batch = await QrBatch.findOneAndUpdate({ _id: req.params.id, printSnapshot: { $exists: false } },
      { $set: { printTemplate: template._id, printSnapshot: snapshot } }, { new: true });
    if (!batch) {
      if (!(await QrBatch.exists({ _id: req.params.id }))) throw new AppError('QR batch not found', 404);
      throw new AppError('This batch already has a locked print design', 409);
    }
    await audit('QR_BATCH_PRINT_CONFIGURED', { actorType: 'ADMIN', actorId: req.admin._id,
      targetType: 'QrBatch', targetId: batch._id, metadata: { templateId: String(template._id), version: template.version } });
    return success(res, await getQrBatch(batch._id));
  }));

adminQrBatchRoutes.get('/:id/print.pdf', validate(idParams, 'params'), async (req, res, next) => {
  let release;
  try {
    release = reservePrintExport();
    const prepared = await preparePrintBatch(req.params.id);
    await audit('QR_BATCH_PRINT_EXPORTED', { actorType: 'ADMIN', actorId: req.admin._id,
      targetType: 'QrBatch', targetId: prepared.batch._id,
      metadata: { pageCount: prepared.rows.length, templateVersion: prepared.template.version } });
    res.set({ 'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${prepared.batch.code}-print.pdf"`,
      'Cache-Control': 'no-store' });
    await streamPrintPdf(res, prepared.template, prepared.rows);
  } catch (error) { if (res.headersSent) res.destroy(error); else next(error); }
  finally { release?.(); }
});

adminQrBatchRoutes.get(
  '/:id/download',
  validate(idParams, 'params'),
  asyncHandler(async (req, res) => {
    const prepared = await prepareQrBatchExport(req.params.id);
    await audit('QR_BATCH_DOWNLOADED', {
      actorType: 'ADMIN',
      actorId: req.admin._id,
      targetType: 'QrBatch',
      targetId: prepared.batch._id,
      metadata: { exportedQrCount: prepared.rows.filter((row) => row.url).length },
    });
    res.attachment(`${prepared.batch.code}.zip`);
    res.type('application/zip');
    res.set('Cache-Control', 'no-store');
    await writeQrBatchArchive(res, prepared);
  }),
);

adminQrBatchRoutes.get(
  '/:id/export.csv',
  validate(idParams, 'params'),
  asyncHandler(async (req, res) => {
    const prepared = await prepareQrBatchExport(req.params.id);
    res.attachment(`${prepared.batch.code}.csv`);
    res.type('text/csv');
    res.set('Cache-Control', 'no-store');
    res.send(prepared.csv);
  }),
);

adminQrBatchRoutes.post(
  '/:id/revoke-unused',
  validate(idParams, 'params'),
  asyncHandler(async (req, res) => {
    return success(res, await revokeUnusedQrBatch(req.params.id, req.admin._id));
  }),
);

adminQrBatchRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  validateQuery(searchQuery),
  asyncHandler(async (req, res) => {
    return success(res, await getQrBatch(req.params.id, req.validatedQuery));
  }),
);
