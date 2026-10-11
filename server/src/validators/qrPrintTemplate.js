import { z } from 'zod';

export const PRINT_WIDTH = 97;
export const PRINT_HEIGHT = 55;
const id = z.string().regex(/^[a-f\d]{24}$/i);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const number = (max) => z.number().finite().min(0).max(max);
const variable = z.enum(['ACTIVATION_CODE', 'PLAN_NAME', 'PLAN_DURATION', 'BATCH_CODE', 'CARD_NUMBER']);
const base = z.object({
  id: z.string().uuid(), x: number(PRINT_WIDTH), y: number(PRINT_HEIGHT),
  w: number(PRINT_WIDTH).positive(), h: number(PRINT_HEIGHT).positive(),
  rotation: z.number().finite().min(-360).max(360).default(0),
  opacity: z.number().finite().min(0).max(1).default(1),
  locked: z.boolean().default(false),
});
const textStyle = {
  color: color.default('#111111'), fontFamily: z.enum(['Noto Sans', 'Noto Serif', 'Noto Sans Mono']).default('Noto Sans'),
  fontSize: z.number().finite().min(4).max(72).default(12),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  align: z.enum(['left', 'center', 'right']).default('left'),
};
const shapeStyle = {
  fill: color.default('#ffffff'), stroke: color.default('#111111'),
  strokeWidth: number(5).default(0), radius: number(20).default(3),
};
export const printElementSchema = z.discriminatedUnion('type', [
  base.extend({ type: z.literal('text'), text: z.string().max(500)
    .refine((value) => !/\/activate\/[A-Za-z0-9_-]{40,100}/.test(value), 'Activation URLs cannot be stored in templates'), ...textStyle }),
  base.extend({ type: z.literal('variable'), variable, ...textStyle }),
  base.extend({ type: z.literal('qr'), variable: z.literal('QR_CODE').default('QR_CODE'), foreground: color.default('#111111'), background: color.default('#ffffff') })
    .refine((value) => Math.abs(value.w - value.h) < 0.01 && value.w >= 20, 'QR must be square and at least 20 mm')
    .refine((value) => value.rotation === 0 && value.opacity === 1, 'QR rotation and opacity cannot change')
    .refine((value) => qrContrast(value.foreground, value.background) >= 4.5 && luminance(value.foreground) < luminance(value.background), 'QR foreground must be dark with a contrast ratio of at least 4.5'),
  base.extend({ type: z.literal('shape'), shape: z.enum(['rect', 'roundRect', 'circle', 'ellipse', 'line']), ...shapeStyle }),
  base.extend({ type: z.literal('image'), assetId: id, cropX: z.number().min(0).max(0.99).default(0), cropY: z.number().min(0).max(0.99).default(0), cropW: z.number().positive().max(1).default(1), cropH: z.number().positive().max(1).default(1) })
    .refine((value) => value.cropX + value.cropW <= 1.001 && value.cropY + value.cropH <= 1.001, 'Invalid crop'),
]);

const background = z.discriminatedUnion('type', [
  z.object({ type: z.literal('color'), color }),
  z.object({ type: z.literal('image'), assetId: id }),
]);
export const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  widthMm: z.literal(PRINT_WIDTH).default(PRINT_WIDTH),
  heightMm: z.literal(PRINT_HEIGHT).default(PRINT_HEIGHT),
  background: background.default({ type: 'color', color: '#ffffff' }),
  elements: z.array(printElementSchema).max(80),
}).strict().superRefine((value, ctx) => {
  const ids = new Set();
  for (const [index, element] of value.elements.entries()) {
    if (ids.has(element.id)) ctx.addIssue({ code: 'custom', path: ['elements', index, 'id'], message: 'Duplicate element ID' });
    ids.add(element.id);
    if (element.x + element.w > PRINT_WIDTH + 0.01 || element.y + element.h > PRINT_HEIGHT + 0.01)
      ctx.addIssue({ code: 'custom', path: ['elements', index], message: 'Element extends beyond the card' });
    if (element.rotation) {
      const angle = element.rotation * Math.PI / 180;
      const points = [[0, 0], [element.w, 0], [0, element.h], [element.w, element.h]];
      if (points.some(([dx, dy]) => {
        const x = element.x + dx * Math.cos(angle) - dy * Math.sin(angle);
        const y = element.y + dx * Math.sin(angle) + dy * Math.cos(angle);
        return x < -0.01 || y < -0.01 || x > PRINT_WIDTH + 0.01 || y > PRINT_HEIGHT + 0.01;
      })) ctx.addIssue({ code: 'custom', path: ['elements', index], message: 'Rotated element extends beyond the card' });
    }
  }
  if (value.elements.filter((element) => element.type === 'qr').length !== 1)
    ctx.addIssue({ code: 'custom', path: ['elements'], message: 'Exactly one QR element is required' });
});

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function qrContrast(a, b) {
  const x = luminance(a); const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function templateAssetIds(template) {
  return [...new Set([
    ...(template.background?.type === 'image' ? [template.background.assetId] : []),
    ...(template.elements || []).filter((element) => element.type === 'image').map((element) => element.assetId),
  ])];
}
