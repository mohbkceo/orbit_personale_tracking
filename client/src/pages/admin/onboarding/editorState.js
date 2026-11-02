import { CHOICE_TYPES } from '../../../../../shared/onboarding.js';

export const newId = (prefix) =>
  `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
export const bilingual = (en = '', ar = '') => ({ en, ar });
export const newQuestion = (type = 'single') => ({
  id: newId('q'),
  type,
  title: bilingual('New question', 'سؤال جديد'),
  description: bilingual(),
  placeholder: bilingual(),
  emoji: '💬',
  required: false,
  enabled: true,
  options: CHOICE_TYPES.includes(type)
    ? [
        { value: newId('o'), label: bilingual('Option 1', 'الخيار الأول'), emoji: '✨' },
        { value: newId('o'), label: bilingual('Option 2', 'الخيار الثاني'), emoji: '🎯' },
      ]
    : [],
  ...(['range', 'rating'].includes(type)
    ? { min: type === 'rating' ? 1 : 0, max: type === 'rating' ? 5 : 100, step: 1 }
    : {}),
  ...(type === 'currency' ? { currency: 'DZD' } : {}),
});

export const moveItem = (items, from, to) => {
  const result = [...items];
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
};
