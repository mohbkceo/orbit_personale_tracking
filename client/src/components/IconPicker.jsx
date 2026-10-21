import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';

const validIcon = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function IconPicker({ value = '', onChange, label }) {
  const { t: _t } = useTranslation();
  const displayLabel = label || _t('common:ui.iconifyIcon');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setError(''); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query.trim())}&limit=60`, { signal: controller.signal });
        if (!response.ok) throw new Error('Icon search unavailable');
        const data = await response.json();
        setResults(data.icons || []);
        setError('');
      } catch (failure) {
        if (failure.name !== 'AbortError') setError('unavailable');
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <div>
    <label className="label" htmlFor={`${displayLabel.replace(/\W/g, '-')}-id`}>{displayLabel}</label>
    <div className="flex items-center gap-2">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border text-xl ">{validIcon.test(value) && <Icon icon={value} />}</span>
      <input id={`${displayLabel.replace(/\W/g, '-')}-id`} className="field" placeholder="mdi:telegram" value={value} onChange={(event) => onChange(event.target.value.trim().toLowerCase())} />
    </div>
    <input className="field mt-2" aria-label={_t('common:ui.searchAllIconifyIcons')} placeholder={_t('common:ui.searchAllIconifyIcons')} value={query} onChange={(event) => setQuery(event.target.value)} />
    {error && <p className="mt-1 text-xs text-danger">{_t('common:ui.iconSearchUnavailableYouCanEnterAnIconifyIdDirectly')}</p>}
    {!!results.length && <div className="mt-2 grid max-h-44 grid-cols-6 gap-1 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-10 ">
      {results.map((id) => <button key={id} type="button" title={id} aria-label={_t('common:dynamic.selectIcon', { icon: id })} className="grid h-9 place-items-center rounded-lg hover:bg-hover focus:bg-selected " onClick={() => { onChange(id); setQuery(''); }}><Icon icon={id} width="22" /></button>)}
    </div>}
  </div>;
}
