import { useOrbitReducedMotion } from '../animations/useOrbitReducedMotion.js';
import { useEffect, useMemo, useState } from 'react';
import { BanknoteArrowDown, BanknoteArrowUp, CheckSquare2 } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { todayInput } from '../utils/format.js';
import { Modal } from './ui.jsx';
import { motion } from 'motion/react';
import { buttonMotion } from '../animations/motionPresets.js';
import { useCapabilities } from '../context/CapabilitiesContext.js';
import { Link } from 'react-router-dom';

const types = [
  { id: 'expense', label: 'Expense', icon: BanknoteArrowDown, color: 'text-danger bg-danger/10 ' },
  { id: 'income', label: 'Income', icon: BanknoteArrowUp, color: 'text-success bg-success/10 ' },
  { id: 'task', label: 'Task', icon: CheckSquare2, color: 'text-primary bg-selected' },
];

export function QuickAdd() {
  const { quickAddOpen, setQuickAddOpen, settings, toast, reward } = useApp();
  const { allowed } = useCapabilities();
  const available = useMemo(() => types.filter((item) => allowed(item.id === 'task' ? 'tasks' : item.id) && (item.id === 'task' || allowed('accounts') && allowed('transactions'))), [allowed]);
  const reduce = useOrbitReducedMotion();
  const [type, setType] = useState('expense'); const [accounts, setAccounts] = useState([]); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ amount: '', description: '', title: '', accountId: '', category: 'Other', date: todayInput(), dueDate: todayInput(), priority: 'medium' });
  useEffect(() => { if (quickAddOpen && available.some((item) => item.id !== 'task')) endpoints.list('accounts').then((r) => { setAccounts(r.data); setForm((v) => ({ ...v, accountId: v.accountId || r.data[0]?._id || '' })); }).catch(() => {}); }, [quickAddOpen, available]);
  useEffect(() => { if (quickAddOpen && available.length && !available.some((item) => item.id === type)) setType(available[0].id); }, [quickAddOpen, available, type]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); if (!available.some((item) => item.id === type) || !allowed('quick-access')) return; setBusy(true);
    try {
      if (type === 'task') await endpoints.create('tasks', { title: form.title, dueDate: form.dueDate || null, priority: form.priority });
      else await endpoints.create('transactions', { type, amount: form.amount, description: form.description, accountId: form.accountId, category: form.category, date: form.date });
      reward(type === 'task' ? 'TASK_CREATED' : type === 'income' ? 'INCOME_RECORDED' : 'EXPENSE_RECORDED');
      toast(type === 'task' ? 'Task added' : `${types.find((item) => item.id === type).label} added`); setQuickAddOpen(false); setForm((v) => ({ ...v, amount: '', description: '', title: '' })); window.dispatchEvent(new Event('orbit:refresh'));
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  }
  return <Modal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} title="Quick add" description="Capture it while it is fresh">{!allowed('quick-access') || !available.length ? <p className="text-sm text-muted">Quick Add is unavailable in your current plan. <Link className="text-primary underline" to="/pricing?feature=quick-access">Explore plans</Link></p> : <><div className="mb-5 grid grid-cols-3 gap-2">{available.map((item) => <motion.button {...(reduce ? {} : buttonMotion)} key={item.id} onClick={() => setType(item.id)} className={`rounded-xl border p-3 text-left ${type === item.id ? 'border-primary bg-selected' : 'border-border bg-surface hover:bg-hover'}`}><span className={`mb-3 inline-flex rounded-lg p-2 ${item.color}`}><item.icon size={18} /></span><span className="block text-sm font-semibold">{item.label}</span></motion.button>)}</div><form onSubmit={submit} className="space-y-4">{type === 'task' ? <><label><span className="label">Task</span><input required autoFocus className="field" value={form.title} onChange={set('title')} placeholder="What needs doing?" /></label><div className="grid grid-cols-2 gap-3"><label><span className="label">Due date</span><input type="date" className="field" value={form.dueDate} onChange={set('dueDate')} /></label><label><span className="label">Priority</span><select className="field" value={form.priority} onChange={set('priority')}><option>low</option><option>medium</option><option>high</option><option>urgent</option></select></label></div></> : <><label><span className="label">Amount</span><input required autoFocus type="number" min="0.01" step="0.01" className="field text-lg font-bold" value={form.amount} onChange={set('amount')} placeholder="0" /></label><label><span className="label">Description</span><input required className="field" value={form.description} onChange={set('description')} placeholder={type === 'expense' ? 'What did you spend on?' : 'Where did it come from?'} /></label><div className="grid grid-cols-2 gap-3"><label><span className="label">Account</span><select required className="field" value={form.accountId} onChange={set('accountId')}>{accounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</select></label><label><span className="label">Date</span><input type="date" className="field" value={form.date} onChange={set('date')} /></label></div><label><span className="label">Category</span><input className="field" list={`${type}-categories`} value={form.category} onChange={set('category')} /><datalist id={`${type}-categories`}>{(type === 'expense' ? settings.expenseCategories : settings.incomeCategories)?.map((v) => <option key={v} value={v} />)}</datalist></label></>}<button disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : `Add ${type}`}</button></form></>}</Modal>;
}
