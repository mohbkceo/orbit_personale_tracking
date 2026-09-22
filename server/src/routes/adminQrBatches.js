import { Router } from 'express';
import { z } from 'zod';
import { adminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { audit } from '../services/auditService.js';
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
    quantity: z.coerce.number().int().min(1).max(500),
    validityDays: z.coerce.number().int().min(1).max(365),
    note: z.string().trim().max(500).default(''),
    qrFormat: formatValue.optional(),
    format: formatValue.optional(),
    qrSize: sizeValue.optional(),
    size: sizeValue.optional(),
  })
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
