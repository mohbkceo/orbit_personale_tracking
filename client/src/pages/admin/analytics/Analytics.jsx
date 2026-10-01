import { useCallback, useState } from 'react';
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { PageHeader } from '../../../components/ui.jsx';
import {
  channels,
  conversionNames,
  filterKeys,
  filterLabels,
  models,
  readAnalyticsState,
  reportParams,
  titleCase,
} from './state.js';
import { Overview } from './Overview.jsx';
import { Acquisition, Campaigns } from './Acquisition.jsx';
import { Funnel, Conversions } from './Conversions.jsx';
import { Product, Retention } from './Product.jsx';
import { Visitors, Sessions, Events } from './Explorers.jsx';

const base = '/admin/analytics';
const sections = [
  ['Overview', ''],
  ['Acquisition', '/acquisition'],
  ['Campaigns', '/campaigns'],
  ['Funnel', '/funnel'],
  ['Conversions', '/conversions'],
  ['Product', '/product'],
  ['Retention', '/retention'],
  ['Visitors', '/visitors'],
  ['Sessions', '/sessions'],
  ['Events', '/events'],
];
const utcDay = (date) => date.toISOString().slice(0, 10);
function presetRange(preset) {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = { day: 1, week: 7, month: 30, quarter: 90 }[preset];
  if (days)
    return { from: utcDay(new Date(today - (days - 1) * 86400000)), to: utcDay(new Date(today)) };
  if (preset === 'thisMonth')
    return {
      from: utcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
      to: utcDay(new Date(today)),
    };
  if (preset === 'previousMonth')
    return {
      from: utcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))),
      to: utcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))),
    };
  return null;
}

function Controls({ state, setParams, revision, refresh, period, compareAvailable }) {
  const [dates, setDates] = useState({ from: state.from, to: state.to });
  const [draft, setDraft] = useState(state.filters);
  const active = filterKeys.filter((key) => state.filters[key]);
  const applyFilters = (event) => {
    event.preventDefault();
    setParams(Object.fromEntries(filterKeys.map((key) => [key, draft[key] || null])));
  };
  return (
    <div className="panel mb-5 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-36 flex-1 sm:flex-none">
          <span className="label">Date range (UTC)</span>
          <select
            className="field"
            aria-label="Date range"
            value={period || 'custom'}
            onChange={(event) => {
              const selected = event.target.value;
              const range = presetRange(selected);
              if (range) {
                setDates(range);
                setParams({ ...range, period: selected, page: null });
              } else setParams({ period: 'custom' });
            }}
          >
            <option value="day">Today (UTC)</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="quarter">Last 90 days</option>
            <option value="thisMonth">This month</option>
            <option value="previousMonth">Previous month</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (dates.from <= dates.to) setParams({ ...dates, period: 'custom', page: null });
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label>
            <span className="label">From</span>
            <input
              className="field w-36"
              type="date"
              value={dates.from}
              max={dates.to}
              onChange={(event) => setDates((value) => ({ ...value, from: event.target.value }))}
            />
          </label>
          <label>
            <span className="label">To</span>
            <input
              className="field w-36"
              type="date"
              value={dates.to}
              min={dates.from}
              onChange={(event) => setDates((value) => ({ ...value, to: event.target.value }))}
            />
          </label>
          <button className="btn-secondary" type="submit">
            Apply
          </button>
        </form>
        <label className="min-w-40 flex-1 sm:flex-none">
          <span className="label">Attribution model</span>
          <select
            className="field"
            aria-label="Attribution model"
            value={state.model}
            onChange={(event) => setParams({ model: event.target.value, page: null })}
          >
            {Object.entries(models).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={`flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm ${compareAvailable ? '' : 'text-muted'}`}>
          <input
            type="checkbox"
            checked={state.compare}
            disabled={!compareAvailable}
            onChange={(event) => setParams({ compare: event.target.checked ? 'previous' : null })}
          />
          Compare previous period
        </label>
        <button
          type="button"
          className="btn-secondary"
          onClick={refresh}
          aria-label="Refresh analytics"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      <details className="mt-4 border-t border-border pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal size={16} /> Filters {active.length ? `(${active.length})` : ''}
        </summary>
        <form onSubmit={applyFilters} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="label">Channel</span>
            <select
              className="field"
              value={draft.channel || ''}
              onChange={(event) => setDraft((value) => ({ ...value, channel: event.target.value }))}
            >
              <option value="">All channels</option>
              {channels.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
          </label>
          {['source', 'medium', 'campaign', 'content', 'term', 'id'].map((key) => (
            <label key={key}>
              <span className="label">{filterLabels[key]}</span>
              <input
                className="field"
                maxLength={160}
                value={draft[key] || ''}
                onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))}
                placeholder={`Any ${filterLabels[key].toLowerCase()}`}
              />
            </label>
          ))}
          <label>
            <span className="label">Conversion type</span>
            <select
              className="field"
              value={draft.conversion || ''}
              onChange={(event) =>
                setDraft((value) => ({ ...value, conversion: event.target.value }))
              }
            >
              <option value="">Default activation</option>
              {conversionNames.map((name) => (
                <option key={name} value={name}>
                  {titleCase(name)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="btn-primary" type="submit">
              Apply filters
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setDraft({});
                setParams(Object.fromEntries(filterKeys.map((key) => [key, null])));
              }}
            >
              Clear all
            </button>
          </div>
        </form>
      </details>
      {active.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
          {active.map((key) => (
            <button
              key={key}
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-selected px-2.5 py-1 text-xs text-primary"
              onClick={() => {
                setDraft((value) => ({ ...value, [key]: '' }));
                setParams({ [key]: null });
              }}
              aria-label={`Remove ${filterLabels[key]} filter`}
            >
              {filterLabels[key]}: {state.filters[key]} <X size={12} />
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted">
        All dates use UTC. Period comparison is available on Overview and Funnel. Traffic uses session acquisition; conversion outcomes use{' '}
        {models[state.model].toLowerCase()} attribution. {revision > 0 ? 'Refreshed.' : ''}
      </p>
    </div>
  );
}

export default function AdminAnalytics() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const state = readAnalyticsState(location.search);
  const params = reportParams(state);
  const setParams = useCallback(
    (patch) => {
      setSearch((current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value == null || value === '') next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      });
    },
    [setSearch],
  );
  const go = useCallback(
    (path, patch = {}) => {
      const next = new URLSearchParams(location.search);
      next.delete('page');
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      navigate({ pathname: `${base}${path}`, search: next.toString() });
    },
    [location.search, navigate],
  );
  const shared = { state, params, revision, setParams, go, search: location.search };
  const period = search.get('period') || (search.has('from') ? 'custom' : 'month');
  return (
    <>
      <PageHeader
        eyebrow="Admin / Analytics"
        title="Analytics"
        description="Acquisition, activation and product behavior from first-party data."
      />
      <nav
        aria-label="Analytics sections"
        className="mb-5 flex gap-1 overflow-x-auto border-b border-border pb-2"
      >
        {sections.map(([label, path]) => (
          <NavLink
            key={path}
            end={path === ''}
            to={{ pathname: `${base}${path}`, search: location.search }}
            className={({ isActive }) =>
              `shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-selected text-primary' : 'text-muted hover:bg-hover hover:text-text'}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Controls
        key={`${state.from}:${state.to}:${JSON.stringify(state.filters)}`}
        state={state}
        setParams={setParams}
        period={period}
        compareAvailable={location.pathname === base || location.pathname === `${base}/funnel`}
        revision={revision}
        refresh={() => setRevision((value) => value + 1)}
      />
      <Routes>
        <Route index element={<Overview {...shared} />} />
        <Route path="acquisition" element={<Acquisition {...shared} />} />
        <Route path="campaigns" element={<Campaigns {...shared} />} />
        <Route path="funnel" element={<Funnel {...shared} />} />
        <Route path="conversions" element={<Conversions {...shared} />} />
        <Route path="product" element={<Product {...shared} />} />
        <Route path="retention" element={<Retention {...shared} />} />
        <Route path="visitors" element={<Visitors {...shared} />} />
        <Route path="sessions" element={<Sessions {...shared} />} />
        <Route path="events" element={<Events {...shared} />} />
      </Routes>
    </>
  );
}
