import { bilingual, newQuestion, moveItem, newId } from './editorState.js';
import { CHOICE_TYPES, NUMBER_TYPES, QUESTION_TYPES } from '../../../../../shared/onboarding.js';

export function Field({ label, value, onChange, type = 'text', ...rest }) {
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <input
        className="field w-full"
        type={type}
        value={value ?? ''}
        onChange={(e) =>
          onChange(
            type === 'number'
              ? e.target.value === ''
                ? undefined
                : Number(e.target.value)
              : e.target.value,
          )
        }
        {...rest}
      />
    </label>
  );
}
export function LocalizedFields({ label, value, onChange, multiline = false }) {
  const Component = multiline ? 'textarea' : 'input';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {['en', 'ar'].map((lang) => (
        <label key={lang} className="min-w-0">
          <span className="label">
            {label} · {lang === 'en' ? 'English' : 'العربية'}
          </span>
          <Component
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className="field w-full"
            maxLength={2000}
            rows={multiline ? 3 : undefined}
            value={value?.[lang] || ''}
            onChange={(e) => onChange({ ...(value || bilingual()), [lang]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
export function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
export function MoveControls({ label, index, count, onMove }) {
  return (
    <span className="flex gap-1">
      <button
        type="button"
        className="min-h-9 min-w-9 rounded-lg border border-border disabled:opacity-30"
        aria-label={`Move ${label} earlier`}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="min-h-9 min-w-9 rounded-lg border border-border disabled:opacity-30"
        aria-label={`Move ${label} later`}
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        ↓
      </button>
    </span>
  );
}
export function QuestionEditor({ question: q, onChange, onNotice }) {
  const set = (key, value) => onChange({ ...q, [key]: value });
  const numeric = NUMBER_TYPES.includes(q.type),
    choices = CHOICE_TYPES.includes(q.type),
    text = ['text', 'long-text'].includes(q.type);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
        <Field label="Emoji" value={q.emoji} maxLength={24} onChange={(v) => set('emoji', v)} />
        <label>
          <span className="label">Answer type</span>
          <select
            className="field w-full"
            value={q.type}
            onChange={(e) => {
              const fresh = newQuestion(e.target.value);
              onChange({
                ...fresh,
                title: q.title,
                description: q.description,
                emoji: q.emoji,
                enabled: q.enabled,
                required: q.required,
                placeholder: q.placeholder,
              });
              onNotice(
                'Changing the type creates a new question ID. Historical answers keep their original definition.',
              );
            }}
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {
                  {
                    single: 'Single choice',
                    multiple: 'Multiple choice',
                    dropdown: 'Dropdown',
                    text: 'Short text',
                    'long-text': 'Long text',
                    number: 'Number',
                    range: 'Range slider',
                    'yes-no': 'Yes / No',
                    rating: 'Rating',
                    date: 'Date',
                    currency: 'Currency / amount',
                  }[type]
                }
              </option>
            ))}
          </select>
        </label>
      </div>
      <LocalizedFields label="Question title" value={q.title} onChange={(v) => set('title', v)} />
      <LocalizedFields
        label="Description"
        value={q.description}
        onChange={(v) => set('description', v)}
        multiline
      />
      <div className="flex flex-wrap gap-5">
        <Toggle label="Required" checked={q.required} onChange={(v) => set('required', v)} />
        <Toggle label="Enabled" checked={q.enabled} onChange={(v) => set('enabled', v)} />
      </div>
      {choices && (
        <section className="space-y-3">
          <h3 className="font-semibold">Answer options</h3>
          {q.options.map((option, index) => (
            <div
              key={option.value}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/option', String(index))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData('text/option');
                if (raw !== '') set('options', moveItem(q.options, Number(raw), index));
              }}
              className="space-y-3 rounded-xl border border-border p-3"
            >
              <div className="flex items-end gap-2">
                <div className="w-24">
                  <Field
                    label="Emoji"
                    value={option.emoji}
                    maxLength={24}
                    onChange={(v) =>
                      set(
                        'options',
                        q.options.map((o) => (o.value === option.value ? { ...o, emoji: v } : o)),
                      )
                    }
                  />
                </div>
                <MoveControls
                  label={`option ${index + 1}`}
                  index={index}
                  count={q.options.length}
                  onMove={(from, to) => set('options', moveItem(q.options, from, to))}
                />
                <button
                  type="button"
                  className="min-h-10 px-2 text-sm text-red-700"
                  onClick={() =>
                    set(
                      'options',
                      q.options.filter((o) => o.value !== option.value),
                    )
                  }
                >
                  Remove
                </button>
              </div>
              <LocalizedFields
                label={`Option ${index + 1}`}
                value={option.label}
                onChange={(v) =>
                  set(
                    'options',
                    q.options.map((o) => (o.value === option.value ? { ...o, label: v } : o)),
                  )
                }
              />
              <details>
                <summary className="cursor-pointer text-xs text-muted">Stable option value</summary>
                <code className="break-all text-xs">{option.value}</code>
              </details>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            disabled={q.options.length >= 100}
            onClick={() =>
              set('options', [
                ...q.options,
                {
                  value: newId('o'),
                  label: bilingual(
                    `Option ${q.options.length + 1}`,
                    `الخيار ${q.options.length + 1}`,
                  ),
                  emoji: '✨',
                },
              ])
            }
          >
            Add option
          </button>
        </section>
      )}
      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer font-medium">Advanced settings</summary>
        <div className="mt-4 space-y-4">
          <p className="break-all text-xs text-muted">Stable question ID: {q.id}</p>
          {(text || choices || numeric) && (
            <LocalizedFields
              label="Placeholder"
              value={q.placeholder}
              onChange={(v) => set('placeholder', v)}
            />
          )}
          {numeric && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Minimum" type="number" value={q.min} onChange={(v) => set('min', v)} />
              <Field label="Maximum" type="number" value={q.max} onChange={(v) => set('max', v)} />
              <Field
                label="Increment"
                type="number"
                min="0.000001"
                value={q.step}
                onChange={(v) => set('step', v)}
              />
            </div>
          )}
          {q.type === 'currency' && (
            <Field
              label="Currency code"
              value={q.currency}
              maxLength={3}
              onChange={(v) => set('currency', v.toUpperCase())}
            />
          )}
          {text && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Minimum characters"
                type="number"
                min="0"
                max="5000"
                value={q.minLength}
                onChange={(v) => set('minLength', v)}
              />
              <Field
                label="Maximum characters"
                type="number"
                min="1"
                max="5000"
                value={q.maxLength}
                onChange={(v) => set('maxLength', v)}
              />
            </div>
          )}
          {q.type === 'multiple' && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Minimum selections"
                type="number"
                min="0"
                value={q.minSelections}
                onChange={(v) => set('minSelections', v)}
              />
              <Field
                label="Maximum selections"
                type="number"
                min="1"
                value={q.maxSelections}
                onChange={(v) => set('maxSelections', v)}
              />
            </div>
          )}
          {q.type === 'date' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Earliest date"
                type="date"
                value={q.minDate}
                onChange={(v) => set('minDate', v || undefined)}
              />
              <Field
                label="Latest date"
                type="date"
                value={q.maxDate}
                onChange={(v) => set('maxDate', v || undefined)}
              />
            </div>
          )}
          {q.type === 'yes-no' ? (
            <label>
              <span className="label">Default answer</span>
              <select
                className="field"
                value={q.defaultValue == null ? '' : String(q.defaultValue)}
                onChange={(e) =>
                  set('defaultValue', e.target.value === '' ? null : e.target.value === 'true')
                }
              >
                <option value="">No default</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          ) : choices && q.type !== 'multiple' ? (
            <label>
              <span className="label">Default answer</span>
              <select
                className="field"
                value={q.defaultValue || ''}
                onChange={(e) => set('defaultValue', e.target.value || null)}
              >
                <option value="">No default</option>
                {q.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label.en}
                  </option>
                ))}
              </select>
            </label>
          ) : q.type === 'multiple' ? (
            <div>
              <p className="label">Default selections (optional)</p>
              {q.options.map((o) => (
                <Toggle
                  key={o.value}
                  label={o.label.en}
                  checked={(q.defaultValue || []).includes(o.value)}
                  onChange={(checked) =>
                    set(
                      'defaultValue',
                      checked
                        ? [...(q.defaultValue || []), o.value]
                        : (q.defaultValue || []).filter((v) => v !== o.value),
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <Field
              label="Default answer (optional)"
              type={numeric ? 'number' : q.type === 'date' ? 'date' : 'text'}
              value={q.defaultValue}
              onChange={(v) => set('defaultValue', v ?? null)}
            />
          )}
        </div>
      </details>
    </div>
  );
}
