import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { Modal } from './ui.jsx';
import { displayValue } from '../utils/format.js';

const destinations = { task: '/panel/tasks', transaction: '/panel/money/transactions', debt: '/panel/money/debts', contact: '/panel/personal/contacts', note: '/panel/personal/notes', project: '/panel/personal/projects', subscription: '/panel/planning/subscriptions', goal: '/panel/planning/goals' };

export function SearchPalette({ open, onClose }) {
  const { t: _t } = useTranslation();
  const [query, setQuery] = useState(''); const [results, setResults] = useState([]); const navigate = useNavigate();
  useEffect(() => { if (!open) { setQuery(''); setResults([]); } }, [open]);
  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    const timer = window.setTimeout(() => api.get('/search', { params: { q: query } }).then((r) => setResults(r.data)).catch(() => setResults([])), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const select = (item) => { navigate(destinations[item.resultType] || '/panel'); onClose(); };
  return <Modal open={open} onClose={onClose} title={_t('navigation:ui.searchOrbit')} description={_t('navigation:ui.tasksMoneyDebtsNotesProjectsAndPeople')}><div className="relative"><Search className="absolute start-3.5 top-3 text-muted" size={18} /><input autoFocus className="field ps-10" placeholder={_t('navigation:ui.typeAtLeastTwoCharacters')} value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="mt-3 max-h-80 overflow-y-auto">{results.map((item) => <button key={`${item.resultType}-${item._id}`} onClick={() => select(item)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start hover:bg-hover "><span className="rounded-lg bg-surface-alt px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted ">{displayValue(item.resultType)}</span><span className="flex-1 truncate text-sm font-medium">{item.label}</span><ArrowRight className="rtl-flip text-muted" size={15} /></button>)}{query.length >= 2 && results.length === 0 && <p className="py-10 text-center text-sm text-muted">{_t('navigation:ui.noMatchingRecords')}</p>}</div></Modal>;
}
