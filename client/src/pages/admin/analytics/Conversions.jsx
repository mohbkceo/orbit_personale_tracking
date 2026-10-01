import { useState } from 'react';
import { useAnalyticsData } from './api.js';
import {
  AnalyticsTable,
  JourneyModal,
  Pagination,
  Panel,
  ReportBody,
  TouchSummary,
} from './components.jsx';
import {
  count,
  dateTime,
  models,
  percent,
  previousPeriod,
  reportParams,
  titleCase,
} from './state.js';

export function Funnel({ state, params, revision }) {
  const report = useAnalyticsData('funnel', params, revision);
  const prior = useAnalyticsData(
    'funnel',
    state.compare ? reportParams(previousPeriod(state)) : null,
    revision,
  );
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Conversion funnel</h2>
        <p className="text-sm text-muted">
          Unique visitors completing the configured steps in order.
        </p>
      </div>
      <Panel
        title="Visitor progression"
        description="Step counts follow the first occurrence of each event per visitor"
      >
        <ReportBody report={report}>
          {(data) => {
            const first = data.steps?.[0]?.count || 0;
            if (!first) return <div className="flex min-h-44 items-center justify-center text-center text-sm text-muted">No visitors entered the configured funnel in this period. Try a wider range or clear filters.</div>;
            return (
              <div className="space-y-3">
                {(data.steps || []).map((step, index) => {
                  const previous = index ? data.steps[index - 1].count : first;
                  const width = first ? Math.max(2, (step.count / first) * 100) : 0;
                  const priorStep = prior.data?.steps?.[index];
                  return (
                    <div key={step.name} className="rounded-xl border border-border p-4">
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold">
                            {index + 1}. {titleCase(step.name)}
                          </p>
                          <p className="text-xs text-muted">
                            {index
                              ? `${percent(previous ? step.count / previous : 0)} from previous · ${count(Math.max(0, previous - step.count))} drop-off`
                              : 'Entry step'}
                          </p>
                        </div>
                        <div className="text-right">
                          <strong className="font-display text-2xl tabular-nums">
                            {count(step.count)}
                          </strong>
                          <p className="text-xs text-muted">
                            {percent(first ? step.count / first : 0)} of entry
                            {state.compare && priorStep
                              ? ` · previous ${count(priorStep.count)}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-surface-alt">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </ReportBody>
      </Panel>
      <p className="text-xs text-muted">
        Steps come from the server’s configured funnel. Time-to-convert is unavailable in the current report.
      </p>
    </div>
  );
}

export function Conversions({ state, params, revision, setParams, search }) {
  const page = Math.max(1, Number(new URLSearchParams(search).get('page')) || 1);
  const report = useAnalyticsData('conversions', { ...params, page, limit: 30 }, revision);
  const [selected, setSelected] = useState(null);
  const channels = new Map();
  for (const model of Object.keys(models))
    for (const row of report.data?.attribution?.[model] || []) {
      const name = row._id || '(none)';
      const item = channels.get(name) || {
        value: name,
        firstTouch: 0,
        lastTouch: 0,
        lastNonDirectTouch: 0,
      };
      item[model] = row.count;
      channels.set(name, item);
    }
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Conversions</h2>
        <p className="text-sm text-muted">
          Confirmed access activations. Select registration as the conversion type to inspect that
          milestone.
        </p>
      </div>
      <Panel
        title="Attribution comparison"
        description="Each column credits the same confirmed events using a different touch rule. Direct returns may change last touch without changing last non-direct."
      >
        <ReportBody report={report} empty="No conversions for this period.">
          {() => (
            <AnalyticsTable
              rows={[...channels.values()]}
              columns={[
                { key: 'value', label: 'Channel' },
                ...Object.entries(models).map(([key, label]) => ({
                  key,
                  label,
                  numeric: true,
                  render: (row) => count(row[key]),
                })),
              ]}
              sortable
              empty="No confirmed conversions for this period."
            />
          )}
        </ReportBody>
      </Panel>
      <Panel
        title="Conversion records"
        description={`Active model: ${models[state.model]} · ${count(report.data?.total || 0)} records`}
      >
        <ReportBody report={report} empty="No confirmed conversions for these filters.">
          {(data) => (
            <>
              <AnalyticsTable
                rows={data.rows || []}
                columns={[
                  { key: 'name', label: 'Type', render: (row) => titleCase(row.name) },
                  {
                    key: 'occurredAt',
                    label: 'UTC time',
                    render: (row) => dateTime(row.occurredAt),
                  },
                  {
                    key: 'visitorId',
                    label: 'Visitor',
                    render: (row) => (
                      <span className="font-mono text-xs">
                        {row.visitorId?.slice(0, 12) || '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'channel',
                    label: 'Attributed touch',
                    render: (row) => <TouchSummary touch={row.attribution?.[state.model]} />,
                  },
                ]}
                onRowClick={(row) => setSelected(row.eventId)}
                empty="No confirmed conversions for these filters."
              />
              <Pagination
                pagination={data.pagination}
                onPage={(value) => setParams({ page: value })}
              />
            </>
          )}
        </ReportBody>
      </Panel>
      {selected && (
        <JourneyModal
          key={selected}
          kind="conversion"
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
