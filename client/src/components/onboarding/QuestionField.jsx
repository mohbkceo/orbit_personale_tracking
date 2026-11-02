import { localized, CHOICE_TYPES, NUMBER_TYPES } from '../../../../shared/onboarding.js';
import { useTranslation } from 'react-i18next';

export function QuestionField({
  question: q,
  value,
  onChange,
  language = 'en',
  error,
  disabled = false,
}) {
  const { t } = useTranslation();
  const tr = (key) => t(`onboarding:studio.${key}`, { lng: language });
  const title = localized(q.title, language),
    description = localized(q.description, language);
  const props = {
    id: q.id,
    disabled,
    'aria-invalid': Boolean(error),
    'aria-describedby': `${q.id}-help ${q.id}-error`,
    'aria-required': q.required,
    className: 'field min-h-12 w-full',
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
  };
  let input;
  if (CHOICE_TYPES.includes(q.type) && q.type !== 'dropdown') {
    input = (
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={title}>
        {q.options.map((o) => {
          const selected =
            q.type === 'multiple' ? (value || []).includes(o.value) : value === o.value;
          return (
            <label
              key={o.value}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-3 focus-within:ring-2 focus-within:ring-[#EB4300] ${selected ? 'border-[#EB4300] bg-orange-50' : 'border-border bg-white'}`}
            >
              <input
                type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                name={q.id}
                value={o.value}
                checked={selected}
                disabled={disabled}
                aria-describedby={`${q.id}-error`}
                onChange={() =>
                  onChange(
                    q.type === 'multiple'
                      ? selected
                        ? value.filter((v) => v !== o.value)
                        : [...(value || []), o.value]
                      : o.value,
                  )
                }
              />
              <span aria-hidden="true" className="text-2xl">
                {o.emoji}
              </span>
              <span>{localized(o.label, language)}</span>
            </label>
          );
        })}
      </div>
    );
  } else if (q.type === 'dropdown')
    input = (
      <select {...props}>
        <option value="">{localized(q.placeholder, language) || tr('chooseAnswer')}</option>
        {q.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.emoji} {localized(o.label, language)}
          </option>
        ))}
      </select>
    );
  else if (q.type === 'yes-no')
    input = (
      <div className="flex gap-3" role="group" aria-label={title}>
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            disabled={disabled}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`min-h-12 flex-1 rounded-xl border px-4 focus-visible:ring-2 focus-visible:ring-[#EB4300] ${value === v ? 'border-[#EB4300] bg-orange-50' : 'border-border'}`}
          >
            {tr(v ? 'yes' : 'no')}
          </button>
        ))}
      </div>
    );
  else if (q.type === 'rating')
    input = (
      <div role="group" aria-label={title} className="flex flex-wrap gap-2">
        {Array.from(
          { length: Math.max(0, Math.min(21, (q.max ?? 5) - (q.min ?? 1) + 1)) },
          (_, i) => (q.min ?? 1) + i,
        ).map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`h-12 min-w-12 rounded-xl border px-3 focus-visible:ring-2 focus-visible:ring-[#EB4300] ${value === v ? 'border-[#EB4300] bg-orange-50' : 'border-border'}`}
          >
            {v}
          </button>
        ))}
      </div>
    );
  else if (q.type === 'long-text')
    input = (
      <textarea
        {...props}
        rows={4}
        minLength={q.minLength}
        maxLength={q.maxLength ?? 5000}
        placeholder={localized(q.placeholder, language)}
      />
    );
  else if (NUMBER_TYPES.includes(q.type))
    input = (
      <div>
        <div className="flex items-center gap-2">
          <input
            {...props}
            type={q.type === 'range' ? 'range' : 'number'}
            min={q.min}
            max={q.max}
            step={q.step ?? (q.type === 'currency' ? 0.01 : 'any')}
            value={value ?? (q.type === 'range' ? q.min : '')}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            placeholder={localized(q.placeholder, language)}
          />
          {q.type === 'currency' && <span>{q.currency || 'DZD'}</span>}
        </div>
        {q.type === 'range' && (
          <output htmlFor={q.id} className="mt-2 block text-center">
            {value ?? tr('chooseSlider')}
          </output>
        )}
      </div>
    );
  else
    input = (
      <input
        {...props}
        type={q.type === 'date' ? 'date' : 'text'}
        min={q.minDate}
        max={q.maxDate}
        minLength={q.minLength}
        maxLength={q.maxLength ?? 500}
        placeholder={localized(q.placeholder, language)}
      />
    );
  return (
    <fieldset className="min-w-0 space-y-3" disabled={disabled}>
      <legend className="mb-2 text-base font-semibold">
        <span aria-hidden="true">{q.emoji} </span>
        <label htmlFor={q.id}>{title}</label>
        {q.required ? (
          <span className="ms-1 text-[#EB4300]" aria-label={tr('required')}>
            *
          </span>
        ) : (
          <span className="ms-2 text-xs font-normal text-muted">{tr('optional')}</span>
        )}
      </legend>
      <p id={`${q.id}-help`} className="text-sm text-muted">
        {description}
      </p>
      {input}
      <p id={`${q.id}-error`} role={error ? 'alert' : undefined} className="text-sm text-red-700">
        {error || ''}
      </p>
    </fieldset>
  );
}
