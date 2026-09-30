import { useEffect, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { Modal } from './ui.jsx';

const destinations = { task: '/tasks', transaction: '/money/transactions', debt: '/money/debts', contact: '/personal/contacts', note: '/personal/notes', project: '/personal/projects', subscription: '/planning/subscriptions', goal: '/planning/goals' };

export function SearchPalette({ open, onClose }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState([]); const navigate = useNavigate();
  useEffect(() => { if (!open) { setQuery(''); setResults([]); } }, [open]);
  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    const timer = window.setTimeout(() => api.get('/search', { params: { q: query } }).then((r) => setResults(r.data)).catch(() => setResults([])), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const select = (item) => { navigate(destinations[item.resultType] || '/'); onClose(); };
  return <Modal open={open} onClose={onClose} title="Search Orbit" description="Tasks, money, debts, notes, projects and people"><div className="relative"><Search className="absolute left-3.5 top-3 text-muted" size={18} /><input autoFocus className="field pl-10" placeholder="Type at least two characters…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="mt-3 max-h-80 overflow-y-auto">{results.map((item) => <button key={`${item.resultType}-${item._id}`} onClick={() => select(item)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-hover "><span className="rounded-lg bg-surface-alt px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted ">{item.resultType}</span><span className="flex-1 truncate text-sm font-medium">{item.label}</span><ArrowRight size={15} className="text-muted" /></button>)}{query.length >= 2 && results.length === 0 && <p className="py-10 text-center text-sm text-muted">No matching records</p>}</div></Modal>;
}
