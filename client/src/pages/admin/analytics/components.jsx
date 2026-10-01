import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Modal } from '../../../components/ui.jsx';
import { analyticsApi } from './api.js';
import { comparison, count, dateTime, titleCase } from './state.js';

export function Panel({ title, description, action, children, className = '' }) {
  return (
    <section className={`panel min-w-0 p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold">{title}</h2>
          {description && <p className="mt-1 text-xs text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ReportBody({
  report,
  children,
  empty = 'No analytics data for this period. Try a wider date range or clear filters.',
  height = 'min-h-44',
}) {
  if (report.loading)
    return (
      <div
        role="status"
        aria-label="Loading analytics"
        className={`${height} animate-pulse rounded-xl bg-surface-alt`}
      />
    );
  if (report.error)
    return (
      <div
        role="alert"
        className={`${height} flex flex-col items-center justify-center gap-2 text-center text-sm`}
      >
        <AlertCircle size={20} className="text-danger" />
        <p>Could not load this report.</p>
        <p className="text-xs text-muted">{report.error}</p>
        {report.retry && <button type="button" className="btn-secondary mt-2" onClick={report.retry}>Retry</button>}
      </div>
    );
  if (!report.data || (Array.isArray(report.data) && !report.data.length))
    return (
      <div
        className={`${height} flex flex-col items-center justify-center gap-2 text-center text-sm text-muted`}
      >
        <Inbox size={20} />
        <p>{empty}</p>
      </div>
    );
  return children(report.data);
}

export function MetricCard({ label, value, previous, format = count, description }) {
  const change = comparison(value, previous);
  return (
    <div className="panel min-w-0 p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-2 font-display text-[26px] font-bold tabular-nums leading-tight">
        {format(value)}
      </p>
      {change && (
        <p
          className={`mt-2 flex items-center gap-1 text-xs ${change.direction === 'up' ? 'text-success' : change.direction === 'down' ? 'text-danger' : 'text-muted'}`}
        >
          {change.direction === 'up' ? (
            <ArrowUp size={13} />
          ) : change.direction === 'down' ? (
            <ArrowDown size={13} />
          ) : null}
          {change.text} <span className="text-muted">vs previous period</span>
        </p>
      )}
      {description && <p className="mt-2 text-xs text-muted">{description}</p>}
    </div>
  );
}

export function MetricSkeletons({ items = 4 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="panel h-28 animate-pulse bg-surface-alt" />
      ))}
    </div>
  );
}

export function TrendChart({ points, metric, unit }) {
  const chart = points.map((point) => ({
    ...point,
    label:
      unit === 'hour'
        ? new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(point.at))
        : new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(point.at)),
  }));
  if (!chart.length)
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        No trend data for this period.
      </div>
    );
  return (
    <div
      role="img"
      aria-label={`${titleCase(metric)} trend, ${chart.length} UTC ${unit}ly points`}
      className="h-64 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            minTickGap={30}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'rgb(var(--color-muted))' }}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'rgb(var(--color-muted))' }}
          />
          <Tooltip
            contentStyle={{
              background: 'rgb(var(--color-surface))',
              border: '1px solid rgb(var(--color-border))',
              borderRadius: 10,
              color: 'rgb(var(--color-text))',
            }}
            labelFormatter={(label) => `${label} UTC`}
            formatter={(value) => [count(value), titleCase(metric)]}
          />
          <Area
            type="monotone"
            dataKey={metric}
            name={titleCase(metric)}
            stroke="rgb(var(--color-primary))"
            strokeWidth={2.5}
            fill="rgb(var(--color-primary) / .12)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RankedBars({ rows, valueKey = 'sessions', max = 8, onSelect }) {
  const ranked = rows.slice(0, max);
  if (!ranked.length)
    return (
      <p className="py-8 text-center text-sm text-muted">No breakdown data for this period.</p>
    );
  const highest = Math.max(1, ...ranked.map((row) => Number(row[valueKey]) || 0));
  return (
    <div className="space-y-3" aria-label={`${valueKey} by category`}>
      {ranked.map((row) => (
        <div key={row.value}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <button
              type="button"
              onClick={() => onSelect?.(row)}
              disabled={!onSelect}
              className="max-w-[75%] truncate text-left font-medium hover:text-primary disabled:cursor-default disabled:hover:text-text"
              title={row.value}
            >
              {titleCase(row.value)}
            </button>
            <span className="tabular-nums text-muted">{count(row[valueKey])}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-alt">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, ((Number(row[valueKey]) || 0) / highest) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsTable({
  rows,
  columns,
  sortable = false,
  empty = 'No matching rows.',
  onRowClick,
}) {
  const [sort, setSort] = useState({ key: null, direction: 'desc' });
  const sorted = useMemo(() => {
    if (!sort.key || !sortable) return rows;
    const column = columns.find((item) => item.key === sort.key);
    return [...rows].sort((a, b) => {
      const av = column?.sortValue ? column.sortValue(a) : a[sort.key];
      const bv = column?.sortValue ? column.sortValue(b) : b[sort.key];
      const result =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av ?? '').localeCompare(String(bv ?? ''));
      return sort.direction === 'asc' ? result : -result;
    });
  }, [rows, columns, sort, sortable]);
  if (!rows.length)
    return (
      <div className="flex min-h-36 items-center justify-center text-center text-sm text-muted">
        {empty}
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-alt text-xs text-muted">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  sort.key === column.key
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
                className={`whitespace-nowrap px-3 py-3 font-semibold ${column.numeric ? 'text-right' : ''}`}
              >
                {sortable && column.sortable !== false ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSort((current) => ({
                        key: column.key,
                        direction:
                          current.key === column.key && current.direction === 'desc'
                            ? 'asc'
                            : 'desc',
                      }))
                    }
                    className="inline-flex items-center gap-1 hover:text-primary"
                  >
                    {column.label}
                    <span aria-hidden="true">
                      {sort.key === column.key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
            {onRowClick && <th scope="col" className="px-3 py-3 text-right font-semibold">Detail</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr
              key={row.id || row.eventId || row.sessionId || row.visitorId || row.value || index}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-border last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-hover' : ''}`}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-3 align-top ${column.numeric ? 'text-right tabular-nums' : ''}`}
                >
                  {column.render ? column.render(row) : String(row[column.key] ?? '—')}
                </td>
              ))}
              {onRowClick && <td className="px-3 py-3 text-right"><button type="button" className="text-xs font-semibold text-primary underline" aria-label={`View ${row.value || row.eventId || row.visitorId || row.sessionId || 'row'} details`} onClick={(event) => { event.stopPropagation(); onRowClick(row); }}>View</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const pages = Math.ceil(pagination.total / pagination.limit);
  return (
    <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs text-muted">
      <span>
        {count(pagination.total)} records · Page {pagination.page} of {pages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary h-8 px-2"
          disabled={pagination.page <= 1}
          onClick={() => onPage(pagination.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="btn-secondary h-8 px-2"
          disabled={pagination.page >= pages}
          onClick={() => onPage(pagination.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function TouchSummary({ touch }) {
  if (!touch) return <span className="text-muted">Unknown</span>;
  return (
    <span>
      {titleCase(touch.channel)}
      {touch.utmSource ? ` · ${touch.utmSource}` : ''}
      {touch.utmCampaign ? ` · ${touch.utmCampaign}` : ''}
    </span>
  );
}

export function JourneyModal({ kind, id, onClose }) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    const controller = new AbortController();
    const request =
      kind === 'conversion'
        ? analyticsApi.journey(id, controller.signal)
        : analyticsApi.visitorJourney(id, controller.signal);
    request
      .then((response) => {
        if (!controller.signal.aborted)
          setState({ data: response.data, loading: false, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            data: null,
            loading: false,
            error: error.message || 'Could not load journey',
          });
      });
    return () => controller.abort();
  }, [kind, id]);
  return <JourneyContent kind={kind} onClose={onClose} state={state} />;
}

function JourneyContent({ kind, onClose, state }) {
  const data = state.data;
  const visitor = data?.visitor;
  const items = [
    ...(data?.sessions || []).map((row) => ({
      at: row.startedAt,
      title: 'Session started',
      detail: `${row.landingPath || '/'} · ${titleCase(row.attribution?.channel)}`,
    })),
    ...(data?.events || []).map((row) => ({
      at: row.occurredAt,
      title: titleCase(row.name),
      detail: row.path || row.source,
    })),
    ...(data?.leads || []).map((row) => ({
      at: row.createdAt,
      title: 'Lead created',
      detail: row.leadCode,
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'conversion' ? 'Conversion journey' : 'Visitor journey'}
      description="Recent first-party activity. Times shown in UTC."
      wide
    >
      {state.loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface-alt" />
      ) : state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : (
        <div className="space-y-5 text-sm">
          <div className="grid gap-3 rounded-xl bg-surface-alt p-4 sm:grid-cols-3">
            <div>
              <p className="label">First touch</p>
              <TouchSummary
                touch={visitor?.firstTouch || data?.conversion?.attribution?.firstTouch}
              />
            </div>
            <div>
              <p className="label">Last touch</p>
              <TouchSummary
                touch={visitor?.lastTouch || data?.conversion?.attribution?.lastTouch}
              />
            </div>
            <div>
              <p className="label">Last non-direct</p>
              <TouchSummary
                touch={
                  visitor?.lastNonDirectTouch || data?.conversion?.attribution?.lastNonDirectTouch
                }
              />
            </div>
          </div>
          <p className="break-all text-xs text-muted">
            Visitor {visitor?.visitorId || data?.conversion?.visitorId || 'unknown'}
            {visitor?.userId ? ` · User ${visitor.userId}` : ''}
          </p>
          <ol className="max-h-80 space-y-3 overflow-y-auto border-l-2 border-border pl-4">
            {items.map((item, index) => (
              <li key={`${item.at}-${index}`} className="relative">
                <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                <time className="text-[11px] text-muted">{dateTime(item.at)}</time>
                <p className="font-semibold">{item.title}</p>
                <p className="break-all text-xs text-muted">{item.detail}</p>
              </li>
            ))}
          </ol>
          {!items.length && <p className="text-muted">No journey records available.</p>}
          {data?.conversion && (
            <p className="rounded-lg border border-border p-3 font-semibold">
              Confirmed conversion: {titleCase(data.conversion.name)} ·{' '}
              {dateTime(data.conversion.occurredAt)}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
