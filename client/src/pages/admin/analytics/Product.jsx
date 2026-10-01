import { useAnalyticsData } from './api.js';
import { AnalyticsTable, MetricCard, Panel, ReportBody } from './components.jsx';
import { SourceQuality } from './Acquisition.jsx';
import { count, percent, titleCase } from './state.js';

export function Product({ params, revision, go }) {
  const report = useAnalyticsData('product', params, revision);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Product and activation</h2>
        <p className="text-sm text-muted">
          Do registered users activate access and reach a meaningful first action?
        </p>
      </div>
      <ReportBody report={report}>
        {(data) => (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Registrations" value={data.registrations} />
            <MetricCard
              label="Access activation rate"
              value={data.activationRate}
              format={percent}
              description="Registered cohort with an access activation"
            />
            <MetricCard
              label="Reached first value"
              value={data.reachedFirstValue}
              description="Created a task or project after registration"
            />
            <MetricCard
              label="Average time to first value"
              value={data.averageTimeToFirstValueMs ? data.averageTimeToFirstValueMs / 3600000 : 0}
              format={(value) =>
                data.averageTimeToFirstValueMs
                  ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} h`
                  : '—'
              }
            />
          </div>
        )}
      </ReportBody>
      <Panel title="Feature adoption" description="Unique users completing semantic product events">
        <ReportBody report={report}>
          {(data) => (
            <AnalyticsTable
              rows={(data.adoption || []).map((row) => ({ value: row._id, users: row.users }))}
              columns={[
                { key: 'value', label: 'Event', render: (row) => titleCase(row.value) },
                {
                  key: 'users',
                  label: 'Unique users',
                  numeric: true,
                  render: (row) => count(row.users),
                },
              ]}
              sortable
              empty="No product events for this period."
              onRowClick={(row) => go('/events', { event: row.value })}
            />
          )}
        </ReportBody>
      </Panel>
      <SourceQuality params={params} revision={revision} onSelect={(row) => go('/campaigns', { source: row.value })} />
    </div>
  );
}

export function Retention({ params, revision }) {
  const report = useAnalyticsData('retention', params, revision);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Retention</h2>
        <p className="text-sm text-muted">
          A visitor returns in days 7–13 after their first visit. Only mature cohorts are included.
        </p>
      </div>
      <ReportBody report={report}>
        {(data) => (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Eligible cohort visitors" value={data.cohortVisitors} />
              <MetricCard label="Returned in week two" value={data.retainedVisitors} />
              <MetricCard
                label="7-day return rate"
                value={data.sevenDayRetentionRate}
                format={percent}
              />
            </div>
            <Panel
              title="Weekly first-seen cohorts"
              className="mt-5"
              description="Week two means a return 7–13 days after first seen, not a calendar-week visit"
            >
              <AnalyticsTable
                rows={data.cohorts || []}
                columns={[
                  {
                    key: 'week',
                    label: 'Cohort week (UTC)',
                    render: (row) => row.week?.slice(0, 10),
                  },
                  {
                    key: 'visitors',
                    label: 'Visitors',
                    numeric: true,
                    render: (row) => count(row.visitors),
                  },
                  {
                    key: 'retained',
                    label: 'Returned',
                    numeric: true,
                    render: (row) => count(row.retained),
                  },
                  { key: 'rate', label: 'Rate', numeric: true, render: (row) => percent(row.rate) },
                ]}
                sortable
                empty="No mature cohorts in the selected period."
              />
            </Panel>
          </>
        )}
      </ReportBody>
    </div>
  );
}
