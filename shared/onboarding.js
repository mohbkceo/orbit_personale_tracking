// Shared, side-effect-free definitions used by the renderer and server validation.
export const QUESTION_TYPES = [
  'single',
  'multiple',
  'dropdown',
  'text',
  'long-text',
  'number',
  'range',
  'yes-no',
  'rating',
  'date',
  'currency',
];
export const CHOICE_TYPES = ['single', 'multiple', 'dropdown'];
export const NUMBER_TYPES = ['number', 'range', 'rating', 'currency'];
export const localized = (value, language = 'en') =>
  value?.[language] || value?.en || value?.ar || '';
export const enabledPages = (flow) => (flow?.pages || []).filter((page) => page.enabled);
export const emptyAnswer = (value) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

export function answerError(question, value, required = false) {
  if (emptyAnswer(value)) return required && question.required ? 'required' : null;
  if (CHOICE_TYPES.includes(question.type)) {
    const values = question.type === 'multiple' ? value : [value];
    if (
      !Array.isArray(values) ||
      values.length > question.options.length ||
      new Set(values).size !== values.length ||
      values.some((v) => !question.options.some((o) => o.value === v))
    )
      return 'option';
    if (
      question.type === 'multiple' &&
      ((question.minSelections != null && values.length < question.minSelections) ||
        (question.maxSelections != null && values.length > question.maxSelections))
    )
      return 'selection';
  } else if (NUMBER_TYPES.includes(question.type)) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Math.abs(value) > 1e12 ||
      (question.min != null && value < question.min) ||
      (question.max != null && value > question.max)
    )
      return 'number';
    if (question.type === 'rating' && !Number.isInteger(value)) return 'number';
    if (
      question.step != null &&
      Math.abs(
        (value - (question.min ?? 0)) / question.step -
          Math.round((value - (question.min ?? 0)) / question.step),
      ) > 0.000001
    )
      return 'number';
  } else if (question.type === 'yes-no') {
    if (typeof value !== 'boolean') return 'boolean';
  } else if (question.type === 'date') {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value ||
      (question.minDate && value < question.minDate) ||
      (question.maxDate && value > question.maxDate)
    )
      return 'date';
  } else if (
    typeof value !== 'string' ||
    value.length > (question.maxLength ?? (question.type === 'long-text' ? 5000 : 500)) ||
    (question.minLength != null && value.trim().length < question.minLength) ||
    (required && question.required && !value.trim())
  )
    return 'text';
  return null;
}

export const DEFAULT_FLOW = {
  name: 'Orbit welcome',
  settings: { enabled: true, autoShow: true, allowSkip: true, showProgress: true },
  pages: [
    {
      id: 'welcome',
      kind: 'welcome',
      enabled: true,
      allowSkip: true,
      emoji: '👋',
      title: { en: 'Welcome to Orbit', ar: 'مرحباً بك في Orbit' },
      description: {
        en: 'A little more clarity. A little less chaos.',
        ar: 'وضوح أكثر، وفوضى أقل.',
      },
      supportingText: { en: '', ar: '' },
      questions: [],
    },
    {
      id: 'first-action',
      kind: 'features',
      enabled: true,
      allowSkip: true,
      emoji: '✨',
      title: { en: 'See everything together', ar: 'كل شيء في مكان واحد' },
      description: {
        en: 'Your tasks, money, goals, and reminders — all in one calm space.',
        ar: 'مهامك وأموالك وأهدافك وتذكيراتك في مساحة واحدة هادئة.',
      },
      supportingText: { en: '', ar: '' },
      questions: [],
    },
    {
      id: 'telegram',
      kind: 'telegram',
      enabled: true,
      allowSkip: true,
      emoji: '✈️',
      title: { en: 'Telegram is optional', ar: 'ربط تيليجرام اختياري' },
      description: {
        en: 'Connect for helpful reminders and quick updates.',
        ar: 'اربط حسابك لتلقي التذكيرات والتحديثات السريعة.',
      },
      supportingText: { en: '', ar: '' },
      questions: [],
    },
  ],
};
