import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';

const validIcon = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function IconPicker({ value = '', onChange, label = 'Iconify icon' }) {
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
        if (failure.name !== 'AbortError') setError('Icon search unavailable. You can enter an Iconify ID directly.');
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <div>
    <label className="label" htmlFor={`${label.replace(/\W/g, '-')}-id`}>{label}</label>
    <div className="flex items-center gap-2">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#d7ddd7] text-xl dark:border-white/10">{validIcon.test(value) && <Icon icon={value} />}</span>
      <input id={`${label.replace(/\W/g, '-')}-id`} className="field" placeholder="mdi:telegram" value={value} onChange={(event) => onChange(event.target.value.trim().toLowerCase())} />
    </div>
    <input className="field mt-2" aria-label="Search all Iconify icons" placeholder="Search all Iconify icons" value={query} onChange={(event) => setQuery(event.target.value)} />
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    {!!results.length && <div className="mt-2 grid max-h-44 grid-cols-6 gap-1 overflow-y-auto rounded-xl border border-[#d7ddd7] p-2 sm:grid-cols-10 dark:border-white/10">
      {results.map((id) => <button key={id} type="button" title={id} aria-label={`Select ${id}`} className="grid h-9 place-items-center rounded-lg hover:bg-black/5 focus:bg-black/5 dark:hover:bg-white/10" onClick={() => { onChange(id); setQuery(''); }}><Icon icon={id} width="22" /></button>)}
    </div>}
  </div>;
}
