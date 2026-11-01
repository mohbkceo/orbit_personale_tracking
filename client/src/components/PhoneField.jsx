import { Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PhoneField({ id, value, onChange, inputClass = 'field', disabled = false }) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {t('auth:phone')}
      </label>
      <div className="relative">
        <Phone
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          id={id}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          maxLength={64}
          placeholder="0550 123 456"
          aria-describedby={`${id}-hint`}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`${inputClass} pl-11 text-left`}
        />
      </div>
      <p id={`${id}-hint`} className="mt-2 text-xs leading-5 text-muted">
        {t('auth:phoneHint')}
      </p>
    </div>
  );
}
