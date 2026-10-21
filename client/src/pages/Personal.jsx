import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  BookOpenText,
  Check,
  ContactRound,
  FolderKanban,
  HeartPulse,
  Plus,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { useData } from '../hooks/useData.js';
import { displayValue, formatDate, formatMoney, formatNumber } from '../utils/format.js';
import { EmptyState, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { AnimatedList } from '../animations/AnimatedList.jsx';

const configs = {
  contacts: {
    icon: ContactRound,
    fields: [
      ['name', 'text'], ['phone', 'tel'], ['email', 'email'], ['telegram', 'text'], ['notes', 'textarea'],
    ],
  },
  projects: {
    icon: FolderKanban,
    fields: [
      ['name', 'text'], ['description', 'textarea'], ['status', 'select:planned,active,on_hold,completed,cancelled'], ['targetDate', 'date'],
    ],
  },
  notes: {
    icon: BookOpenText,
    fields: [
      ['title', 'text'], ['content', 'textarea'],
    ],
  },
  habits: {
    icon: HeartPulse,
    fields: [
      ['name', 'text'], ['frequency', 'select:daily,weekdays,weekly'], ['target', 'number'],
    ],
  },
  wishlist: {
    icon: ShoppingBag,
    fields: [
      ['name', 'text'], ['expectedPrice', 'number'], ['priority', 'select:low,medium,high'], ['status', 'select:wanted,saving,purchased,cancelled'], ['url', 'url'], ['notes', 'textarea'],
    ],
  },
};
const fieldLabel = (kind, key) => kind === 'projects' && key === 'name' ? 'projectName' : kind === 'habits' && key === 'name' ? 'habitName' : kind === 'wishlist' && key === 'name' ? 'item' : key === 'url' ? 'link' : key;

function ResourceForm({ kind, open, onClose, onSaved }) {
  const { t: _t } = useTranslation();
  const { toast } = useApp();
  const config = configs[kind];
  const initial = Object.fromEntries(
    config.fields.map(([key, type]) => [
      key,
      type.startsWith('select:') ? type.split(':')[1].split(',')[0] : type === 'number' ? 1 : '',
    ]),
  );
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((v) => ({ ...v, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await endpoints.create(kind, form);
      toast(_t('common:dynamic.itemAdded', { item: _t(`common:resources.${kind}.singular`) }));
      onSaved();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={_t('common:dynamic.addItem', { item: _t(`common:resources.${kind}.singular`) })}>
      <form className="space-y-4" onSubmit={submit}>
        {config.fields.map(([key, type], index) => (
          <label key={key}>
            <span className="label">{_t(`common:fields.${fieldLabel(kind, key)}`)}</span>
            {type === 'textarea' ? (
              <textarea
                autoFocus={index === 0}
                required={index === 0}
                rows="4"
                className="field h-auto py-3"
                value={form[key]}
                onChange={set(key)}
              />
            ) : type.startsWith('select:') ? (
              <select className="field capitalize" value={form[key]} onChange={set(key)}>
                {type
                  .split(':')[1]
                  .split(',')
                  .map((v) => (
                    <option key={v} value={v}>
                      {displayValue(v)}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                autoFocus={index === 0}
                required={index === 0}
                type={type}
                min={type === 'number' ? 0 : undefined}
                className="field"
                value={form[key]}
                onChange={set(key)}
              />
            )}
          </label>
        ))}
        <button disabled={busy} className="btn-primary w-full">
          {busy ? _t('common:saving') : _t('common:ui.save')}
        </button>
      </form>
    </Modal>
  );
}

function Card({ kind, item, onRemove, onLog, currency }) {
  const { t: _t } = useTranslation();
  if (kind === 'contacts')
    return (
      <article className="panel p-5">
        <div className="flex items-start justify-between">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-alt">
            <ContactRound size={18} />
          </span>
          <button className="icon-btn" onClick={onRemove}>
            <Trash2 size={15} />
          </button>
        </div>
        <h3 className="mt-4 font-display font-bold">{item.name}</h3>
        <p className="mt-1 text-xs text-muted">
          {item.phone || item.email || item.telegram || _t('common:ui.noContactDetails')}
        </p>
        <p className="mt-3 line-clamp-2 text-xs text-muted">{item.notes}</p>
      </article>
    );
  if (kind === 'notes')
    return (
      <article className="panel p-5">
        <div className="flex items-start justify-between">
          <h3 className="font-display font-bold">{item.title}</h3>
          <button className="icon-btn" onClick={onRemove}>
            <Trash2 size={15} />
          </button>
        </div>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted ">
          {item.content || _t('common:ui.emptyNote')}
        </p>
        <p className="mt-4 text-[10px] text-muted">
          {_t('common:ui.updated')} {formatDate(item.updatedAt)}
        </p>
      </article>
    );
  if (kind === 'habits') {
    const today = new Date().toISOString().slice(0, 10);
    const done = item.logs?.some((log) => log.date?.slice(0, 10) === today);
    return (
      <article className="panel p-5">
        <div className="flex items-start justify-between">
          <div>
            <StatusBadge tone={item.active ? 'success' : 'neutral'}>{item.frequency}</StatusBadge>
            <h3 className="mt-3 font-display text-lg font-bold">{item.name}</h3>
          </div>
          <button
            onClick={onLog}
            disabled={done}
            className={`grid h-11 w-11 place-items-center rounded-xl ${done ? 'bg-success/10 text-success' : 'border border-border hover:bg-hover '}`}
          >
            <Check size={20} />
          </button>
        </div>
        <p className="mt-6 text-xs text-muted">
          {formatNumber(item.logs?.length || 0)} {_t('common:ui.totalCheckInsTarget')} {formatNumber(item.target)}
        </p>
      </article>
    );
  }
  if (kind === 'wishlist')
    return (
      <article className="panel p-5">
        <div className="flex justify-between">
          <StatusBadge
            tone={
              item.status === 'purchased'
                ? 'success'
                : item.priority === 'high'
                  ? 'warning'
                  : 'neutral'
            }
          >
            {item.status}
          </StatusBadge>
          <button className="icon-btn" onClick={onRemove}>
            <Trash2 size={15} />
          </button>
        </div>
        <h3 className="mt-4 font-display text-lg font-bold">{item.name}</h3>
        <p className="mt-1 text-xl font-bold text-primary ">
          {formatMoney(item.expectedPrice, currency)}
        </p>
        <p className="mt-3 text-xs capitalize text-muted">
          {displayValue(item.priority)} {_t('common:ui.priority')}
        </p>
      </article>
    );
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between">
        <StatusBadge tone={item.status === 'completed' ? 'success' : 'info'}>
          {item.status}
        </StatusBadge>
        <button className="icon-btn" onClick={onRemove}>
          <Trash2 size={15} />
        </button>
      </div>
      <h3 className="mt-4 font-display text-lg font-bold">{item.name}</h3>
      <p className="mt-2 line-clamp-2 text-sm text-muted">
        {item.description || _t('common:ui.noDescriptionYet')}
      </p>
      <p className="mt-5 text-xs text-muted">
        {_t('common:ui.target')} {formatDate(item.targetDate)}
      </p>
    </article>
  );
}

export default function Personal({ kind }) {
  const { t: _t } = useTranslation();
  const { toast, settings } = useApp();
  const [open, setOpen] = useState(false);
  const config = configs[kind];
  const { data, loading, error, reload } = useData(() => endpoints.list(kind), [kind]);
  const items = data?.data || [];
  async function remove(id) {
    if (!window.confirm(_t('common:ui.deleteThisRecord'))) return;
    try {
      await endpoints.remove(kind, id);
      toast(_t('common:ui.recordDeleted'));
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  async function log(id) {
    try {
      await endpoints.create(`habits/${id}/log`, { value: 1 });
      toast(_t('common:ui.habitCheckedIn'));
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={_t(`common:resources.${kind}.eyebrow`)}
        title={_t(`common:resources.${kind}.title`)}
        description={_t(`common:resources.${kind}.description`)}
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={17} />
            {_t('common:add')}
          </button>
        }
      />
      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon={config.icon} title={_t('common:dynamic.itemUnavailable', { item: _t(`common:resources.${kind}.title`) })} description={error} />
      ) : (
        <>
          {items.length === 0 && (
            <div className="panel">
              <EmptyState
                icon={config.icon}
                title={_t('common:dynamic.noItemsYet', { item: _t(`common:resources.${kind}.title`) })}
                description={_t('common:ui.addTheFirstOneWhenItIsUseful')}
                action={
                  <button className="btn-primary" onClick={() => setOpen(true)}>
                    {_t('common:ui.addOne')}
                  </button>
                }
              />
            </div>
          )}
          <AnimatedList
            as="section"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            items={items}
            renderItem={(item) => (
              <Card
                key={item._id}
                kind={kind}
                item={item}
                currency={settings.defaultCurrency}
                onRemove={() => remove(item._id)}
                onLog={() => log(item._id)}
              />
            )}
          />
        </>
      )}
      <ResourceForm
        key={kind}
        kind={kind}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={reload}
      />
    </>
  );
}
