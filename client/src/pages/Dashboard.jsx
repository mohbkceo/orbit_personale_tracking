import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays, CheckCircle2, Goal, Landmark, ReceiptText, TrendingUp, WalletCards } from 'lucide-react';
import dayjs from 'dayjs';
import { endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { useAuth } from '../context/useAuth.js';
import { useData } from '../hooks/useData.js';
import { formatDate, formatMoney } from '../utils/format.js';
import { EmptyState, Money, Spinner, StatusBadge } from '../components/ui.jsx';
import { DailyFocusPanel } from '../components/DailyFocusPanel.jsx';
import { AnimatedList } from '../animations/AnimatedList.jsx';
import { AnimatedNumber } from '../animations/AnimatedNumber.jsx';
import { AnimatedProgress } from '../animations/AnimatedProgress.jsx';
import { paletteColor } from '../appearance/themes.js';

async function loadDashboard() {
  const overview = await endpoints.dashboard();
  const [tasks, reminders, goals] = await Promise.allSettled([
    Promise.all([endpoints.list('tasks', { status: 'todo', limit: 4 }), endpoints.list('tasks', { status: 'in_progress', limit: 4 })]),
    endpoints.list('reminders', { limit: 100 }),
    endpoints.list('goals'),
  ]);
  return {
    ...overview,
    taskItems: tasks.status === 'fulfilled' ? tasks.value.flatMap((result) => result.data).sort((a, b) => new Date(a.dueDate || '9999-12-31') - new Date(b.dueDate || '9999-12-31')).slice(0, 4) : [],
    reminderItems: reminders.status === 'fulfilled' ? reminders.value.data.filter((item) => ['scheduled', 'active', 'snoozed', 'waiting'].includes(item.status)).slice(0, 4) : [],
    goals: goals.status === 'fulfilled' ? goals.value.data.filter((item) => item.status === 'active') : overview.goals,
  };
}

function SummaryCard({ label, value, detail, icon: Icon, tone = 'primary' }) {
  const tones = { primary: 'bg-selected text-primary', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', danger: 'bg-danger/10 text-danger' };
  return <article className="panel-flat flex min-w-0 flex-col p-4 sm:p-5">
    <span className={`mb-4 grid h-10 w-10 place-items-center rounded-full ${tones[tone]}`}><Icon size={20} strokeWidth={1.9} /></span>
    <p className="break-words font-display text-[25px] font-bold leading-tight tracking-tight sm:text-[28px]">{value}</p>
    <p className="mt-1 text-sm font-medium text-muted">{label}</p>
    <p className="mt-1.5 text-xs text-muted">{detail}</p>
  </article>;
}

function Widget({ title, to, children, className = '' }) {
  return <section className={`panel min-w-0 p-4 sm:p-5 ${className}`}>
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-display text-base font-bold">{title}</h2>
      {to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted hover:text-primary">View all <ArrowRight size={14} /></Link>}
    </div>
    {children}
  </section>;
}

function ChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-border bg-surface p-3 text-xs shadow-lift"><p className="mb-2 font-semibold">{label}</p>{payload.map((item) => <p key={item.dataKey} style={{ color: item.color }} className="mt-1 capitalize">{item.name}: {formatMoney(item.value, currency)}</p>)}</div>;
}

function GoalRow({ goal }) {
  const progress = goal.targetAmount ? Math.min(goal.currentAmount / goal.targetAmount * 100, 100) : 0;
  return <div className="flex items-center gap-3 py-2.5">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success/10 text-success"><Goal size={17} /></span>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{goal.title}</p><AnimatedProgress value={progress} className="mt-2 h-1.5" /></div>
    <span className="w-10 text-right text-xs font-semibold text-muted"><AnimatedNumber value={progress} />%</span>
  </div>;
}

export default function Dashboard() {
  const { settings, darkMode, setQuickAddOpen } = useApp();
  const { user } = useAuth();
  const { data, loading, error, reload } = useData(loadDashboard, 'dashboard');
  const currency = settings.defaultCurrency || 'DZD';
  const preset = settings.appearance?.preset || 'orbit';
  const chartColors = ['primary', 'success', 'warning', 'danger', 'accent', 'muted'].map((token) => paletteColor(preset, darkMode, token));
  const greeting = useMemo(() => { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; }, []);
  if (loading) return <Spinner label="Building your overview…" />;
  if (error || !data) return <EmptyState icon={TrendingUp} title="Dashboard unavailable" description={error || 'Please try again.'} action={<button type="button" className="btn-primary" onClick={reload}>Try again</button>} />;

  const m = data.money;
  const name = user?.fullName?.trim().split(/\s+/)[0] || 'there';
  const debtTotal = data.debts.payable;
  const maxCategory = Math.max(...data.charts.categories.map((item) => item.value), 1);
  return <>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="font-display text-[27px] font-bold tracking-tight sm:text-[30px]">{greeting}, {name} <span aria-hidden="true" className="text-primary">☀</span></h1><p className="mt-1 text-sm text-muted">Here’s your day at a glance.</p></div>
      <div className="flex items-center gap-3"><time className="pt-2 text-sm text-muted" dateTime={dayjs().format('YYYY-MM-DD')}>{dayjs().format('ddd, MMM D, YYYY')}</time><button type="button" className="btn-primary hidden sm:inline-flex" onClick={() => setQuickAddOpen(true)}>Add new</button></div>
    </header>

    <section aria-label="Summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <SummaryCard label="Tasks" value={data.tasks.open} detail={`${data.tasks.dueToday} due today · ${data.tasks.overdue} overdue`} icon={CheckCircle2} />
      <SummaryCard label="Goals" value={data.goals.length} detail={`${data.goals.filter((goal) => goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount).length} at target`} icon={Goal} tone="success" />
      <SummaryCard label="Expenses" value={formatMoney(m.expenses, currency, true)} detail="This month · excludes transfers" icon={ReceiptText} tone="danger" />
      <SummaryCard label="Balance" value={formatMoney(m.totalBalance, currency, true)} detail={`${data.accounts.length} active accounts · ${formatMoney(debtTotal, currency, true)} owed`} icon={WalletCards} tone="primary" />
    </section>

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Widget title="Tasks" to="/panel/tasks">
        {data.taskItems.length ? <AnimatedList items={data.taskItems} renderItem={(task) => <Link to="/panel/tasks" className="flex min-w-0 items-center gap-3 border-b border-border py-2.5 last:border-0"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border text-primary"><CheckCircle2 size={13} /></span><span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span><span className="shrink-0 text-xs text-muted">{task.dueDate ? dayjs(task.dueDate).isSame(dayjs(), 'day') ? 'Today' : formatDate(task.dueDate) : 'Anytime'}</span></Link>} /> : <p className="py-6 text-sm text-muted">No open tasks. Add one to get started.</p>}
      </Widget>
      <Widget title="Goals" to="/panel/planning/goals">
        {data.goals.length ? <AnimatedList items={data.goals.slice(0, 4)} renderItem={(goal) => <GoalRow goal={goal} />} /> : <p className="py-6 text-sm text-muted">No active goals yet.</p>}
      </Widget>
      <Widget title="Expenses" to="/panel/money/expenses">
        {data.charts.categories.length ? <div className="space-y-3">{data.charts.categories.slice(0, 4).map((item) => <div key={item.name} className="flex min-w-0 items-center gap-3 text-sm"><ReceiptText size={17} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="shrink-0 text-xs font-semibold">{formatMoney(item.value, currency, true)}</span><span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-alt sm:block"><span className="block h-full rounded-full bg-primary" style={{ width: `${item.value / maxCategory * 100}%` }} /></span></div>)}</div> : <p className="py-6 text-sm text-muted">No expenses recorded this month.</p>}
      </Widget>
      <Widget title="Reminders" to="/panel/reminders">
        {data.reminderItems.length ? <AnimatedList items={data.reminderItems} renderItem={(item) => <Link to="/panel/reminders" className="flex min-w-0 items-center gap-3 border-b border-border py-2.5 last:border-0"><Bell size={17} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span><span className="shrink-0 text-xs text-muted">{formatDate(item.nextTriggerAt)}</span></Link>} /> : <p className="py-6 text-sm text-muted">No upcoming reminders.</p>}
      </Widget>

      <Widget title="Cash flow" to="/panel/money/transactions">
        <p className="mb-3 text-xs text-muted">Income vs expenses · last 6 months</p>
        <div className="h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.charts.cashflow}><CartesianGrid vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: chartColors[5] }} /><YAxis hide /><Tooltip content={<ChartTooltip currency={currency} />} /><Area type="monotone" dataKey="income" stroke={chartColors[1]} strokeWidth={2} fill={chartColors[1]} fillOpacity={.09} /><Area type="monotone" dataKey="expenses" stroke={chartColors[0]} strokeWidth={2} fill={chartColors[0]} fillOpacity={.07} /></AreaChart></ResponsiveContainer></div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"><span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success" />Income {formatMoney(m.income, currency, true)}</span><span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />Expenses {formatMoney(m.expenses, currency, true)}</span><span>Net {formatMoney(m.net, currency, true)}</span></div>
      </Widget>
      <Widget title="Spending" to="/panel/money/expenses">
        {data.charts.categories.length ? <><div className="h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.charts.categories} dataKey="value" nameKey="name" innerRadius={53} outerRadius={76} paddingAngle={2}>{data.charts.categories.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip content={<ChartTooltip currency={currency} />} /></PieChart></ResponsiveContainer></div><div className="grid grid-cols-2 gap-2">{data.charts.categories.slice(0, 6).map((item, index) => <div key={item.name} className="flex min-w-0 items-center gap-2 text-xs"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span className="min-w-0 flex-1 truncate text-muted">{item.name}</span><span className="font-semibold">{formatMoney(item.value, currency, true)}</span></div>)}</div></> : <EmptyState icon={ReceiptText} title="No spending yet" description="Category totals will appear here." />}
      </Widget>
      <Widget title="Recent transactions" to="/panel/money/transactions">
        {data.recentTransactions.length ? <AnimatedList items={data.recentTransactions.slice(0, 5)} renderItem={(item) => { const positive = ['income', 'debt_payment_in'].includes(item.type); return <div className="flex min-w-0 items-center gap-3 border-b border-border py-2.5 last:border-0"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${positive ? 'bg-success/10 text-success' : 'bg-selected text-primary'}`}>{positive ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description}</p><p className="text-xs text-muted">{item.category} · {item.accountId?.name || 'Account'}</p></div><div className="text-right"><Money value={positive ? item.amount : -item.amount} currency={currency} signed className="text-sm font-semibold" /><p className="text-xs text-muted">{formatDate(item.date)}</p></div></div>; }} /> : <p className="py-6 text-sm text-muted">No transactions yet.</p>}
      </Widget>
      <Widget title="Debts" to="/panel/money/debts">
        <div className="space-y-4 py-2"><div className="flex items-center justify-between border-b border-border pb-4"><span className="flex items-center gap-2 text-sm text-muted"><Landmark size={17} className="text-primary" /> You owe</span><Money value={data.debts.payable} currency={currency} className="font-semibold" /></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-muted"><ArrowDownRight size={17} className="text-success" /> Owed to you</span><Money value={data.debts.receivable} currency={currency} className="font-semibold" /></div></div>
      </Widget>
      <Widget title="Upcoming" to="/panel/planning/bills">
        {data.upcoming.length ? <AnimatedList items={data.upcoming.slice(0, 5)} getKey={(item) => `${item.kind}-${item._id}`} renderItem={(item) => <div className="flex min-w-0 items-center gap-3 border-b border-border py-2.5 last:border-0"><CalendarDays size={17} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span><StatusBadge tone={item.kind === 'bill' ? 'warning' : 'info'}>{item.kind}</StatusBadge><span className="shrink-0 text-xs text-muted">{formatDate(item.date)}</span></div>} /> : <p className="py-6 text-sm text-muted">Nothing due in the next 30 days.</p>}
      </Widget>
      <Widget title="Accounts" to="/panel/money/accounts">
        {data.accounts.length ? <AnimatedList items={data.accounts.slice(0, 5)} renderItem={(account) => <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"><WalletCards size={17} className="text-primary" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{account.name}</span><Money value={account.currentBalance} currency={currency} className="text-sm font-semibold" /></div>} /> : <p className="py-6 text-sm text-muted">No accounts yet.</p>}
      </Widget>
    </div>
    <section className="mt-4" aria-label="Daily Focus"><DailyFocusPanel compact onTaskChanged={reload} /></section>
  </>;
}
