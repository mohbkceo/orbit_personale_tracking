import { useAnalyticsData } from './api.js';
import {
  AnalyticsTable,
  MetricCard,
  MetricSkeletons,
  Panel,
  RankedBars,
  ReportBody,
  TrendChart,
} from './components.jsx';
import { count, models, percent, previousPeriod, reportParams, titleCase } from './state.js';

export function Overview({ state, params, revision, setParams, go, search }) {
  const overview = useAnalyticsData('overview', params, revision);
  const prior = useAnalyticsData(
    'overview',
    state.compare ? reportParams(previousPeriod(state)) : null,
    revision,
  );
  const trend = useAnalyticsData('trend', params, revision);
  const metric = ['visitors', 'sessions', 'leads', 'conversions'].includes(
    new URLSearchParams(search).get('metric'),
  )
    ? new URLSearchParams(search).get('metric')
    : 'visitors';
  const metrics = [
    ['visitors', 'Visitors'],
    ['sessions', 'Sessions'],
    ['leads', 'Leads'],
    ['registrations', 'Registrations'],
    ['conversions', state.filters.conversion ? titleCase(state.filters.conversion) : 'Access activations'],
    ['conversionRate', state.filters.conversion ? 'Visitor conversion rate' : 'Visitor activation rate'],
    ['returningVisitors', 'Returning visitors'],
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Overview</h2>
          <p className="text-sm text-muted">
            Key outcomes for {state.from} to {state.to} UTC.
          </p>
        </div>
        <span className="text-xs text-muted">Attribution: {models[state.model]}</span>
      </div>
      {overview.loading ? (
        <MetricSkeletons items={7} />
      ) : overview.error ? (
        <Panel title="Overview unavailable">
          <ReportBody report={overview}>{() => null}</ReportBody>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(([key, label]) => (
            <MetricCard
              key={key}
              label={label}
              value={overview.data?.[key] || 0}
              previous={state.compare && !prior.loading && !prior.error ? prior.data?.[key] : null}
              format={key === 'conversionRate' ? percent : count}
            />
          ))}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Panel
          title="Trend"
          description={`Observed ${metric} by UTC time bucket`}
          action={
            <select
              className="field h-9 w-36"
              aria-label="Trend metric"
              value={metric}
              onChange={(event) => setParams({ metric: event.target.value })}
            >
              {['visitors', 'sessions', 'leads', 'conversions'].map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
          }
        >
          <ReportBody report={trend} height="h-64">
            {(data) => <TrendChart points={data.points || []} metric={metric} unit={data.unit} />}
          </ReportBody>
        </Panel>
        <Panel
          title="Acquisition channels"
          description="Ranked by sessions"
          action={
            <button
              className="text-xs font-semibold text-primary"
              onClick={() => go('/acquisition')}
            >
              Explore →
            </button>
          }
        >
          <ReportBody report={overview}>
            {(data) => (
              <RankedBars
                rows={data.channels || []}
                onSelect={(row) => go('/acquisition', { channel: row.value })}
              />
            )}
          </ReportBody>
        </Panel>
      </div>
      <Panel
        title="Top landing pages"
        description="Normalized paths; campaign parameters are excluded"
      >
        <ReportBody report={overview}>
          {(data) => (
            <AnalyticsTable
              rows={(data.landingPages || []).map((row) => ({
                value: row._id || '/',
                sessions: row.sessions,
              }))}
              columns={[
                { key: 'value', label: 'Landing path' },
                {
                  key: 'sessions',
                  label: 'Sessions',
                  numeric: true,
                  render: (row) => count(row.sessions),
                },
              ]}
              sortable
            />
          )}
        </ReportBody>
      </Panel>
      <p className="text-xs text-muted">
        Visitor conversion rate divides unique visitors with the selected conversion by visitors in
        this period. Conversions can follow an earlier visit, so this is a period ratio rather than a
        cohort rate.
      </p>
    </div>
  );
}
