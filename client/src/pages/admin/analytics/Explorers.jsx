import { useState } from 'react';
import { EVENTS } from '../../../analytics/events.js';
import { useAnalyticsData } from './api.js';
import {
  AnalyticsTable,
  JourneyModal,
  Pagination,
  Panel,
  ReportBody,
  TouchSummary,
  TrendChart,
} from './components.jsx';
import { count, dateTime, models, titleCase } from './state.js';

export function Visitors({ state, params, revision, setParams, search }) {
  const page = Math.max(1, Number(new URLSearchParams(search).get('page')) || 1);
  const report = useAnalyticsData('visitors', { ...params, page, limit: 30 }, revision);
  const [selected, setSelected] = useState(null);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Visitors</h2>
        <p className="text-sm text-muted">
          Visitors first seen in this date range. Identifiers are first-party and anonymous until
          linked.
        </p>
      </div>
      <Panel
        title="Visitor explorer"
        description={`First and last acquisition touch · ${models[state.model]} filter`}
      >
        <ReportBody report={report}>
          {(rows) => (
            <>
              <AnalyticsTable
                rows={rows}
                columns={[
                  {
                    key: 'visitorId',
                    label: 'Visitor',
                    render: (row) => (
                      <span className="font-mono text-xs">{row.visitorId.slice(0, 12)}</span>
                    ),
                  },
                  {
                    key: 'userId',
                    label: 'User',
                    render: (row) => (row.userId ? 'Identified' : 'Anonymous'),
                  },
                  {
                    key: 'firstSeenAt',
                    label: 'First seen',
                    render: (row) => dateTime(row.firstSeenAt),
                  },
                  { key: 'sessions', label: 'Sessions', numeric: true },
                  { key: 'events', label: 'Events', numeric: true },
                  {
                    key: 'firstTouch',
                    label: 'First touch',
                    render: (row) => <TouchSummary touch={row.firstTouch} />,
                  },
                  {
                    key: 'converted',
                    label: 'Activated',
                    render: (row) => (row.converted ? 'Yes' : 'No'),
                  },
                ]}
                onRowClick={(row) => setSelected(row.visitorId)}
              />
              <Pagination
                pagination={report.pagination}
                onPage={(value) => setParams({ page: value })}
              />
            </>
          )}
        </ReportBody>
      </Panel>
      {selected && (
        <JourneyModal
          key={selected}
          kind="visitor"
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export function Sessions({ params, revision, setParams, search }) {
  const page = Math.max(1, Number(new URLSearchParams(search).get('page')) || 1);
  const report = useAnalyticsData('sessions', { ...params, page, limit: 30 }, revision);
  const [selected, setSelected] = useState(null);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Sessions</h2>
        <p className="text-sm text-muted">
          Recent session entries in the selected range, with acquisition and engagement context.
        </p>
      </div>
      <Panel title="Session explorer">
        <ReportBody report={report}>
          {(rows) => (
            <>
              <AnalyticsTable
                rows={rows}
                columns={[
                  {
                    key: 'sessionId',
                    label: 'Session',
                    render: (row) => (
                      <span className="font-mono text-xs">{row.sessionId.slice(0, 12)}</span>
                    ),
                  },
                  {
                    key: 'startedAt',
                    label: 'Started (UTC)',
                    render: (row) => dateTime(row.startedAt),
                  },
                  { key: 'landingPath', label: 'Landing', render: (row) => row.landingPath || '/' },
                  {
                    key: 'channel',
                    label: 'Channel',
                    render: (row) => titleCase(row.attribution?.channel),
                  },
                  {
                    key: 'deviceCategory',
                    label: 'Device',
                    render: (row) => titleCase(row.deviceCategory),
                  },
                  { key: 'events', label: 'Events', numeric: true },
                  {
                    key: 'converted',
                    label: 'Activated',
                    render: (row) => (row.converted ? 'Yes' : 'No'),
                  },
                ]}
                onRowClick={(row) => setSelected(row.visitorId)}
              />
              <Pagination
                pagination={report.pagination}
                onPage={(value) => setParams({ page: value })}
              />
            </>
          )}
        </ReportBody>
      </Panel>
      {selected && (
        <JourneyModal
          key={selected}
          kind="visitor"
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export function Events({ params, revision, setParams, search }) {
  const page = Math.max(1, Number(new URLSearchParams(search).get('page')) || 1);
  const event = new URLSearchParams(search).get('event');
  const selected = Object.values(EVENTS).includes(event) ? event : '';
  const summary = useAnalyticsData('eventSummary', params, revision);
  const events = useAnalyticsData(
    'events',
    { ...params, event: selected || undefined, page, limit: 30 },
    revision,
  );
  const trend = useAnalyticsData(
    'eventTrend',
    selected ? { ...params, event: selected } : null,
    revision,
  );
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Events</h2>
        <p className="text-sm text-muted">
          Validated semantic events. Operational audit records are separate.
        </p>
      </div>
      <Panel
        title="Event usage"
        description="Count, unique visitors and identified users by event. Select a row to inspect its trend and records."
      >
        <ReportBody report={summary}>
          {(rows) => (
            <AnalyticsTable
              rows={rows}
              columns={[
                { key: 'name', label: 'Event', render: (row) => titleCase(row.name) },
                { key: 'count', label: 'Events', numeric: true, render: (row) => count(row.count) },
                {
                  key: 'visitors',
                  label: 'Visitors',
                  numeric: true,
                  render: (row) => count(row.visitors),
                },
                { key: 'users', label: 'Users', numeric: true, render: (row) => count(row.users) },
              ]}
              sortable
              onRowClick={(row) => setParams({ event: row.name, page: null })}
            />
          )}
        </ReportBody>
      </Panel>
      {selected && (
        <Panel
          title={`${titleCase(selected)} trend`}
          action={
            <button
              className="text-xs font-semibold text-primary"
              onClick={() => setParams({ event: null, page: null })}
            >
              Clear event
            </button>
          }
        >
          <ReportBody report={trend} height="h-64">
            {(data) => <TrendChart points={data.points || []} metric="events" unit={data.unit} />}
          </ReportBody>
        </Panel>
      )}
      <Panel
        title="Recent event records"
        description={
          selected
            ? `Filtered to ${titleCase(selected)} · server-paginated`
            : 'Server-paginated; event properties and private content are not exposed'
        }
      >
        <ReportBody report={events}>
          {(rows) => (
            <>
              <AnalyticsTable
                rows={rows}
                columns={[
                  { key: 'name', label: 'Event', render: (row) => titleCase(row.name) },
                  {
                    key: 'occurredAt',
                    label: 'UTC time',
                    render: (row) => dateTime(row.occurredAt),
                  },
                  { key: 'source', label: 'Origin', render: (row) => titleCase(row.source) },
                  { key: 'path', label: 'Path', render: (row) => row.path || '—' },
                  {
                    key: 'visitorId',
                    label: 'Visitor',
                    render: (row) => (
                      <span className="font-mono text-xs">
                        {row.visitorId?.slice(0, 12) || '—'}
                      </span>
                    ),
                  },
                ]}
              />
              <Pagination
                pagination={events.pagination}
                onPage={(value) => setParams({ page: value })}
              />
            </>
          )}
        </ReportBody>
      </Panel>
    </div>
  );
}
