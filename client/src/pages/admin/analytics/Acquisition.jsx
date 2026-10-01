import { useAnalyticsData } from './api.js';
import { AnalyticsTable, Panel, RankedBars, ReportBody } from './components.jsx';
import { count, models, percent, titleCase } from './state.js';
import { performanceColumns } from './performanceColumns.js';

function Performance({ params, revision, dimension, onSelect, description }) {
  const report = useAnalyticsData('performance', { ...params, dimension }, revision);
  return (
    <Panel
      title={`${titleCase(dimension)} performance`}
      description={
        description ||
        'Sessions and visitors use session acquisition. Outcomes use the selected attribution model.'
      }
    >
      <ReportBody
        report={report}
        empty={`No ${dimension} data for this period. Try clearing filters.`}
      >
        {(data) => !data.rows?.length ? <div className="flex min-h-44 items-center justify-center text-center text-sm text-muted">No {dimension} data for this period. Try clearing filters or widening the date range.</div> : (
          <>
            <div className="mb-6 max-w-xl">
              <RankedBars rows={data.rows || []} valueKey="sessions" onSelect={onSelect} />
            </div>
            <AnalyticsTable
              rows={data.rows || []}
              columns={performanceColumns}
              sortable
              onRowClick={onSelect}
            />
          </>
        )}
      </ReportBody>
    </Panel>
  );
}

export function SourceQuality({ params, revision, onSelect }) {
  const report = useAnalyticsData('sourceQuality', params, revision);
  return <Panel title="Source quality" description="Registration cohorts first seen in the selected period; activation and first value may happen later. Select a source for campaign detail."><ReportBody report={report}>{(data) => <AnalyticsTable rows={data.rows || []} columns={[{ key: 'value', label: 'Source' }, { key: 'registrations', label: 'Registered', numeric: true, render: (row) => count(row.registrations) }, { key: 'activated', label: 'Activated', numeric: true, render: (row) => count(row.activated) }, { key: 'reachedFirstValue', label: 'First value', numeric: true, render: (row) => count(row.reachedFirstValue) }, { key: 'activationRate', label: 'Activation rate', numeric: true, render: (row) => percent(row.activationRate) }]} sortable onRowClick={onSelect} empty="No registrations from these sources in this period." />}</ReportBody></Panel>;
}

export function Acquisition({ state, params, revision, setParams, go, search }) {
  const dimension = ['channel', 'source', 'medium', 'referrer', 'landing'].includes(
    new URLSearchParams(search).get('dimension'),
  )
    ? new URLSearchParams(search).get('dimension')
    : 'channel';
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Acquisition</h2>
        <p className="text-sm text-muted">
          Trace traffic from channels to sources, referrers and landing pages.
        </p>
      </div>
      <div role="group" aria-label="Acquisition dimension" className="flex flex-wrap gap-2">
        {['channel', 'source', 'medium', 'referrer', 'landing'].map((value) => (
          <button
            key={value}
            className={dimension === value ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setParams({ dimension: value })}
          >
            {titleCase(value)}
          </button>
        ))}
      </div>
      <Performance
        params={params}
        revision={revision}
        dimension={dimension}
        onSelect={(row) => {
          if (dimension === 'source') go('/campaigns', { source: row.value });
          else if (dimension === 'channel') go('/campaigns', { channel: row.value });
        }}
      />
      {dimension === 'source' && <SourceQuality params={params} revision={revision} onSelect={(row) => go('/campaigns', { source: row.value })} />}
      <p className="text-xs text-muted">
        Conversion counts are attributed using {models[state.model].toLowerCase()}. A period
        activation may follow an earlier visit, so period outcome ratios are directional.
      </p>
    </div>
  );
}

export function Campaigns({ state, params, revision, setParams, go, search }) {
  const dimension = state.filters.campaign
    ? 'content'
    : state.filters.source
      ? 'campaign'
      : 'source';
  const alternate = new URLSearchParams(search).get('dimension');
  const selected = ['source', 'campaign', 'content', 'term', 'id'].includes(alternate)
    ? alternate
    : dimension;
  const drill = (row) => {
    if (selected === 'source') go('/campaigns', { source: row.value, dimension: null });
    else if (selected === 'campaign') go('/campaigns', { campaign: row.value, dimension: null });
    else if (selected === 'content') go('/conversions', { content: row.value });
  };
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Campaigns</h2>
        <p className="text-sm text-muted">
          Source → campaign → creative. UTM term and ID are available as alternate breakdowns.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          className="text-primary underline"
          onClick={() =>
            go('/campaigns', { source: null, campaign: null, content: null, dimension: null })
          }
        >
          All sources
        </button>
        {state.filters.source && (
          <>
            <span>›</span>
            <button
              className="text-primary underline"
              onClick={() => go('/campaigns', { campaign: null, content: null, dimension: null })}
            >
              {state.filters.source}
            </button>
          </>
        )}
        {state.filters.campaign && (
          <>
            <span>›</span>
            <span className="font-semibold">{state.filters.campaign}</span>
          </>
        )}
      </div>
      <label className="block max-w-56">
        <span className="label">Breakdown</span>
        <select
          className="field"
          value={selected}
          onChange={(event) => setParams({ dimension: event.target.value })}
        >
          {['source', 'campaign', 'content', 'term', 'id'].map((value) => (
            <option key={value} value={value}>
              {titleCase(value)}
            </option>
          ))}
        </select>
      </label>
      <Performance
        params={params}
        revision={revision}
        dimension={selected}
        onSelect={drill}
        description={`Outcomes use ${models[state.model].toLowerCase()} attribution. Select a row to drill down.`}
      />
    </div>
  );
}
