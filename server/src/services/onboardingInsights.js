import { z } from 'zod';
import mongoose from 'mongoose';
import { OnboardingResponse } from '../models/OnboardingResponse.js';
import { OnboardingFlow } from '../models/OnboardingFlow.js';
import { AppError } from '../utils/AppError.js';
import { emptyAnswer, NUMBER_TYPES } from '../../../shared/onboarding.js';
import { stableId } from './onboardingSchema.js';

const filters = z.strictObject({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  flow: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  plan: z.string().max(120).optional(),
  question: stableId.optional(),
  answer: z.string().max(5000).optional(),
  status: z.enum(['partial', 'completed', 'skipped']).optional(),
  user: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export function responseQuery(query) {
  const parsed = filters.safeParse(query);
  if (!parsed.success) throw new AppError('Invalid onboarding filters', 422);
  const q = parsed.data,
    match = {};
  if (q.from && q.to && q.from > q.to) throw new AppError('Invalid date range', 422);
  if (q.from || q.to)
    match.startedAt = {
      ...(q.from ? { $gte: new Date(q.from) } : {}),
      ...(q.to ? { $lt: new Date(new Date(q.to).getTime() + 86400000) } : {}),
    };
  if (q.flow) match.flow = new mongoose.Types.ObjectId(q.flow);
  if (q.user) match.user = new mongoose.Types.ObjectId(q.user);
  if (q.plan) match.plan = q.plan;
  if (q.status) match.status = q.status;
  const cohortMatch = { ...match };
  if (q.answer != null && !q.question)
    throw new AppError('Choose a question for the answer filter', 422);
  if (q.question) {
    const path = `answers.${q.question}`;
    // A typed $in also matches elements of multiple-choice arrays without coercing stored values.
    match[path] =
      q.answer != null
        ? {
            $in: [
              q.answer,
              ...(q.answer === 'true' ? [true] : q.answer === 'false' ? [false] : []),
              ...(/^-?\d+(\.\d+)?$/.test(q.answer) ? [Number(q.answer)] : []),
            ],
          }
        : { $exists: true };
  }
  // Choosing a question alone narrows answer inspection, not its statistical denominators.
  // Selecting an actual answer deliberately filters the statistical cohort as well.
  return { q, match, insightsMatch: q.answer != null ? match : cohortMatch };
}
// A user counts once in a filtered cohort, even after an explicit administrator reset.
export const cohortPipeline = (match) => [
  { $match: match },
  { $sort: { updatedAt: -1, _id: -1 } },
  { $group: { _id: '$user', row: { $first: '$$ROOT' } } },
  { $replaceRoot: { newRoot: '$row' } },
];

export function questionStatistics(question, responses) {
  const seen = responses.filter((r) => r.seenQuestions.includes(question.id));
  const answered = seen.filter((r) => !emptyAnswer(r.answers?.[question.id]));
  const skipped = seen.filter(
    (r) => emptyAnswer(r.answers?.[question.id]) && r.skippedQuestions.includes(question.id),
  ).length;
  const result = {
    id: question.id,
    title: question.title,
    type: question.type,
    seen: seen.length,
    answered: answered.length,
    skipped,
    unanswered: seen.length - answered.length - skipped,
    neverReached: responses.length - seen.length,
    completedAnswers: answered.filter((r) => r.status === 'completed').length,
    partialAnswers: answered.filter((r) => r.status === 'partial').length,
    skippedSubmissionAnswers: answered.filter((r) => r.status === 'skipped').length,
  };
  const values = answered.map((r) => r.answers[question.id]);
  if (NUMBER_TYPES.includes(question.type)) {
    const numbers = values
      .filter((v) => typeof v === 'number' && Number.isFinite(v))
      .sort((a, b) => a - b);
    if (numbers.length) {
      const n = numbers.length,
        min = numbers[0],
        max = numbers[n - 1];
      Object.assign(result, {
        average: numbers.reduce((a, b) => a + b, 0) / n,
        min,
        max,
        median: n % 2 ? numbers[(n - 1) / 2] : (numbers[n / 2 - 1] + numbers[n / 2]) / 2,
      });
      const bins = Math.min(10, new Set(numbers).size),
        width = (max - min) / bins;
      result.distribution = Array.from({ length: bins }, (_, i) => ({
        label: width
          ? `${(min + i * width).toFixed(2)}–${(min + (i + 1) * width).toFixed(2)}`
          : String(min),
        count: 0,
      }));
      numbers.forEach(
        (v) =>
          result.distribution[width ? Math.min(bins - 1, Math.floor((v - min) / width)) : 0]
            .count++,
      );
    }
  } else if (['single', 'multiple', 'dropdown', 'yes-no'].includes(question.type)) {
    const options =
      question.type === 'yes-no'
        ? [
            { value: true, label: { en: 'Yes', ar: 'نعم' } },
            { value: false, label: { en: 'No', ar: 'لا' } },
          ]
        : question.options;
    result.distribution = options.map((o) => {
      const count = values.filter((v) =>
        Array.isArray(v) ? v.includes(o.value) : v === o.value,
      ).length;
      return {
        value: o.value,
        label: o.label,
        emoji: o.emoji,
        count,
        percentage: answered.length ? (count / answered.length) * 100 : 0,
      };
    });
  } else if (question.type === 'date') {
    const months = new Map();
    values.forEach((v) => {
      const key = v.slice(0, 7);
      months.set(key, (months.get(key) || 0) + 1);
    });
    result.distribution = [...months]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, count }));
  }
  return result;
}

export async function onboardingInsights(match) {
  const [responses, flows, plans] = await Promise.all([
    OnboardingResponse.aggregate(cohortPipeline(match)),
    OnboardingFlow.find({ status: 'published' }).lean(),
    OnboardingResponse.distinct('plan'),
  ]);
  const completed = responses.filter((r) => r.status === 'completed');
  const durations = completed
    .filter((r) => r.completedAt && r.startedAt)
    .map((r) => Math.max(0, new Date(r.completedAt) - new Date(r.startedAt)) / 1000);
  const questions = [],
    pages = [];
  for (const flow of flows) {
    const cohort = responses.filter((r) => String(r.flow) === String(flow._id));
    for (const page of flow.pages.filter((p) => p.enabled)) {
      pages.push({
        flow: String(flow._id),
        version: flow.version,
        id: page.id,
        title: page.title,
        seen: cohort.filter((r) => r.seenPages.includes(page.id)).length,
        skipped: cohort.filter((r) => r.skippedPages.includes(page.id)).length,
      });
      for (const q of page.questions.filter((q) => q.enabled))
        questions.push({
          flow: String(flow._id),
          version: flow.version,
          ...questionStatistics(q, cohort),
        });
    }
  }
  return {
    kpis: {
      started: responses.length,
      completed: completed.length,
      skipped: responses.filter((r) => r.status === 'skipped').length,
      partial: responses.filter((r) => r.status === 'partial').length,
      completionRate: responses.length ? (completed.length / responses.length) * 100 : 0,
      averageCompletionSeconds: durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null,
      totalSubmittedResponses: responses.reduce(
        (sum, r) => sum + Object.values(r.answers || {}).filter((v) => !emptyAnswer(v)).length,
        0,
      ),
    },
    questions,
    pages: pages.sort((a, b) => b.skipped - a.skipped),
    plans,
  };
}

export const csvCell = (value) => {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
