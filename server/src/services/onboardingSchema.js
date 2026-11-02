import { z } from 'zod';
import {
  answerError,
  CHOICE_TYPES,
  NUMBER_TYPES,
  QUESTION_TYPES,
} from '../../../shared/onboarding.js';

export const stableId = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/)
  .refine((id) => !Object.hasOwn(Object.prototype, id) && id !== 'prototype', 'Reserved ID');
const label = z.strictObject({ en: z.string().max(2000), ar: z.string().max(2000) });
const questionBase = z.strictObject({
  id: stableId,
  type: z.enum(QUESTION_TYPES),
  title: label,
  description: label.optional(),
  emoji: z.string().max(24).default(''),
  required: z.boolean().default(false),
  enabled: z.boolean().default(true),
  placeholder: label.optional(),
  defaultValue: z
    .union([z.string().max(5000), z.number().finite(), z.boolean(), z.array(stableId).max(100)])
    .nullable()
    .optional(),
  options: z
    .array(z.strictObject({ value: stableId, label, emoji: z.string().max(24).default('') }))
    .max(100)
    .default([]),
  min: z.number().finite().min(-1e12).max(1e12).optional(),
  max: z.number().finite().min(-1e12).max(1e12).optional(),
  step: z.number().positive().max(1e12).optional(),
  minLength: z.number().int().min(0).max(5000).optional(),
  maxLength: z.number().int().min(1).max(5000).optional(),
  minSelections: z.number().int().min(0).max(100).optional(),
  maxSelections: z.number().int().min(1).max(100).optional(),
  minDate: z.iso.date().optional(),
  maxDate: z.iso.date().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
});
const question = questionBase.superRefine((q, ctx) => {
  const fail = (message) => ctx.addIssue({ code: 'custom', message });
  if (!q.title.en.trim() || !q.title.ar.trim())
    fail('Question titles are required in English and Arabic');
  if (
    CHOICE_TYPES.includes(q.type) &&
    (!q.options.length ||
      new Set(q.options.map((o) => o.value)).size !== q.options.length ||
      q.options.some((o) => !o.label.en.trim() || !o.label.ar.trim()))
  )
    fail('Provide bilingual options with unique stable values');
  if (q.min != null && q.max != null && q.min > q.max) fail('Minimum exceeds maximum');
  if (['range', 'rating'].includes(q.type) && (q.min == null || q.max == null || q.min >= q.max))
    fail('Range and rating need a minimum and maximum');
  if (
    q.type === 'rating' &&
    (!Number.isInteger(q.min) || !Number.isInteger(q.max) || q.max - q.min > 20)
  )
    fail('Rating needs integer bounds spanning at most 20');
  if (q.minLength != null && q.minLength > (q.maxLength ?? 5000))
    fail('Invalid text length bounds');
  if (q.minSelections != null && q.minSelections > (q.maxSelections ?? q.options.length))
    fail('Invalid selection bounds');
  if (q.maxSelections != null && q.maxSelections > q.options.length)
    fail('Maximum selections exceeds options');
  if (q.minDate && q.maxDate && q.minDate > q.maxDate) fail('Invalid date bounds');
  if (q.defaultValue != null && answerError(q, q.defaultValue)) fail('Default answer is invalid');
  if (!NUMBER_TYPES.includes(q.type) && ['min', 'max', 'step'].some((k) => q[k] != null))
    fail('Numeric settings only apply to numeric fields');
  if (!CHOICE_TYPES.includes(q.type) && q.options.length)
    fail('Options only apply to selection questions');
  if (
    !['text', 'long-text'].includes(q.type) &&
    ['minLength', 'maxLength'].some((k) => q[k] != null)
  )
    fail('Length settings only apply to text');
  if (q.type !== 'multiple' && ['minSelections', 'maxSelections'].some((k) => q[k] != null))
    fail('Selection limits only apply to multiple choice');
  if (q.type !== 'date' && (q.minDate || q.maxDate)) fail('Date limits only apply to dates');
  if (q.type !== 'currency' && q.currency) fail('Currency only applies to amounts');
});
const pageBase = z.strictObject({
  id: stableId,
  kind: z.enum(['info', 'questions', 'welcome', 'features', 'telegram']),
  enabled: z.boolean(),
  allowSkip: z.boolean(),
  title: label,
  description: label,
  emoji: z.string().max(24),
  supportingText: label,
  questions: z.array(questionBase).max(20),
});
const identityCheck = (flow, ctx) => {
  const ids = new Set();
  let count = 0;
  for (const p of flow.pages) {
    if (ids.has(p.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate page/question IDs' });
    ids.add(p.id);
    for (const q of p.questions) {
      if (ids.has(q.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate page/question IDs' });
      ids.add(q.id);
      count++;
    }
  }
  if (count > 100)
    ctx.addIssue({ code: 'custom', message: 'A flow can contain at most 100 questions' });
};
export const flowInput = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    settings: z.strictObject({
      enabled: z.boolean(),
      autoShow: z.boolean(),
      allowSkip: z.boolean(),
      showProgress: z.boolean(),
    }),
    pages: z
      .array(pageBase.extend({ questions: z.array(question).max(20) }))
      .min(1)
      .max(50),
  })
  .superRefine((flow, ctx) => {
    const ids = new Set();
    const fail = (message) => ctx.addIssue({ code: 'custom', message });
    let count = 0;
    for (const p of flow.pages) {
      if (ids.has(p.id)) fail('Duplicate page/question IDs');
      ids.add(p.id);
      if (!p.title.en.trim() || !p.title.ar.trim())
        fail('Page titles are required in English and Arabic');
      if (p.kind !== 'questions' && p.questions.length)
        fail('Only data-collection pages may contain questions');
      for (const q of p.questions) {
        if (ids.has(q.id)) fail('Duplicate page/question IDs');
        ids.add(q.id);
        count++;
      }
    }
    if (count > 100) fail('A flow can contain at most 100 questions');
    if (!flow.pages.some((p) => p.enabled)) fail('Enable at least one page');
    if (flow.pages.filter((p) => p.kind === 'telegram').length > 1)
      fail('Only one Telegram step is allowed');
  });

// Drafts may be incomplete, but still have bounded, well-formed definitions.
export const draftInput = z
  .strictObject({
    name: flowInput.shape.name,
    settings: flowInput.shape.settings,
    pages: z.array(pageBase).min(1).max(50),
  })
  .superRefine(identityCheck);
