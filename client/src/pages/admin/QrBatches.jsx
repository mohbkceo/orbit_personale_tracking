import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { PageHeader, Spinner, StatusBadge } from '../../components/ui.jsx';

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—');
const statusTone = (status) =>
  ({ ACTIVE: 'success', USED: 'info', EXPIRED: 'warning', REVOKED: 'danger' })[status] || 'neutral';

function ErrorText({ error }) {
  return error ? (
    <p
      role="alert"
      className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-400/10 dark:text-red-300"
    >
      {error}
    </p>
  ) : null;
}

function useApiResource(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData((await api.get(path)).data);
      setError('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { data, loading, error, refresh };
}

function saveDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function downloadBatch(batch, kind) {
  const isCsv = kind === 'csv';
  const blob = await api.get(
    `/admin/qr-batches/${batch._id}/${isCsv ? 'export.csv' : 'download'}`,
    { responseType: 'blob' },
  );
  saveDownload(blob, `${batch.code}.${isCsv ? 'csv' : 'zip'}`);
}

function BatchActions({ batch, onError, onRevoked }) {
  const [busy, setBusy] = useState('');
  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === 'revoke') {
        if (!window.confirm('Revoke every currently active link in this batch?')) return;
        await api.post(`/admin/qr-batches/${batch._id}/revoke-unused`);
        onRevoked?.();
      } else {
        await downloadBatch(batch, kind);
      }
      onError('');
    } catch (failure) {
      onError(failure.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      <Link className="text-accent underline" to={`/admin/qr-batches/${batch._id}`}>
        View
      </Link>
      <button
        disabled={Boolean(busy)}
        className="text-accent underline disabled:opacity-50"
        onClick={() => run('zip')}
      >
        {busy === 'zip' ? 'Preparing…' : 'Download ZIP'}
      </button>
      <button
        disabled={Boolean(busy)}
        className="text-accent underline disabled:opacity-50"
        onClick={() => run('csv')}
      >
        Export CSV
      </button>
      <button
        disabled={Boolean(busy) || !batch.stats?.active}
        className="text-red-600 underline disabled:opacity-40"
        onClick={() => run('revoke')}
      >
        Revoke unused
      </button>
    </div>
  );
}

export function AdminQrBatches() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const batches = useApiResource(`/admin/qr-batches?search=${encodeURIComponent(query)}`);
  const plans = useApiResource('/admin/plans');
  const [form, setForm] = useState({
    name: '',
    planId: '',
    quantity: 10,
    validityDays: 7,
    note: '',
    qrFormat: 'PNG',
    qrSize: 1024,
  });
  const [actionError, setActionError] = useState('');
  const [creating, setCreating] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function create(event) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await api.post('/admin/qr-batches', form);
      setActionError('');
      navigate(`/admin/qr-batches/${response.data.batch._id}`);
    } catch (failure) {
      setActionError(failure.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="QR Batches"
        description="Generate independent, single-use activation QR codes and download them as a batch."
      />
      <ErrorText error={batches.error || plans.error || actionError} />
      <form onSubmit={create} className="panel mb-6 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="label">Batch name</span>
          <input
            required
            maxLength="120"
            className="field"
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
          />
        </label>
        <label>
          <span className="label">Plan</span>
          <select
            required
            className="field"
            value={form.planId}
            onChange={(event) => update('planId', event.target.value)}
          >
            <option value="">Select plan</option>
            {plans.data
              ?.filter((plan) => plan.status === 'ACTIVE')
              .map((plan) => (
                <option key={plan._id} value={plan._id}>
                  {plan.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span className="label">Quantity</span>
          <input
            required
            type="number"
            min="1"
            max="500"
            className="field"
            value={form.quantity}
            onChange={(event) => update('quantity', Number(event.target.value))}
          />
        </label>
        <label>
          <span className="label">Valid for days</span>
          <input
            required
            type="number"
            min="1"
            max="365"
            className="field"
            value={form.validityDays}
            onChange={(event) => update('validityDays', Number(event.target.value))}
          />
        </label>
        <label>
          <span className="label">QR format</span>
          <select
            className="field"
            value={form.qrFormat}
            onChange={(event) => update('qrFormat', event.target.value)}
          >
            <option>PNG</option>
            <option>SVG</option>
          </select>
        </label>
        <label>
          <span className="label">QR size</span>
          <select
            className="field"
            value={form.qrSize}
            onChange={(event) => update('qrSize', Number(event.target.value))}
          >
            {[512, 1024, 2048].map((size) => (
              <option key={size} value={size}>
                {size} × {size}
              </option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="label">Internal note</span>
          <input
            maxLength="500"
            className="field"
            value={form.note}
            onChange={(event) => update('note', event.target.value)}
          />
        </label>
        <button disabled={creating} className="btn-primary md:col-span-2 xl:col-span-4">
          {creating ? 'Generating secure links…' : 'Generate batch'}
        </button>
      </form>
      <form
        className="mb-4 flex max-w-lg gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search);
        }}
      >
        <input
          className="field"
          placeholder="Search by batch name or code"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="btn-secondary">Search</button>
      </form>
      {batches.loading ? (
        <Spinner label="Loading QR batches…" />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                {[
                  'Name',
                  'Plan',
                  'Quantity',
                  'Active',
                  'Used',
                  'Expired',
                  'Revoked',
                  'Created',
                  'Actions',
                ].map((label) => (
                  <th key={label} className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.data?.map((batch) => (
                <tr
                  key={batch._id}
                  className="border-b border-black/5 align-top dark:border-white/5"
                >
                  <td className="p-3">
                    <b>{batch.name}</b>
                    <div className="mt-1 font-mono text-xs text-[#7a857e]">{batch.code}</div>
                  </td>
                  <td className="p-3">{batch.plan?.name || 'Unavailable'}</td>
                  <td className="p-3">{batch.quantity}</td>
                  <td className="p-3">{batch.stats.active}</td>
                  <td className="p-3">{batch.stats.used}</td>
                  <td className="p-3">{batch.stats.expired}</td>
                  <td className="p-3">{batch.stats.revoked}</td>
                  <td className="p-3 whitespace-nowrap">{formatDate(batch.createdAt)}</td>
                  <td className="p-3">
                    <BatchActions
                      batch={batch}
                      onError={setActionError}
                      onRevoked={batches.refresh}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!batches.data?.length && (
            <p className="p-8 text-center text-sm text-[#7a857e]">No QR batches found.</p>
          )}
        </div>
      )}
    </>
  );
}

export function AdminQrBatchDetail() {
  const { id } = useParams();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const resource = useApiResource(`/admin/qr-batches/${id}?search=${encodeURIComponent(query)}`);
  const [actionError, setActionError] = useState('');
  if (resource.loading) return <Spinner label="Loading QR batch…" />;
  const detail = resource.data;
  if (!detail)
    return (
      <>
        <PageHeader eyebrow="Access" title="QR Batch" />
        <ErrorText error={resource.error || 'QR batch not found'} />
      </>
    );
  const { batch, stats, links } = detail;
  const actionBatch = { ...batch, stats };
  return (
    <>
      <PageHeader
        eyebrow="QR Batch"
        title={batch.name}
        description={`${batch.code} · ${batch.plan?.name || 'Unavailable plan'} · ${batch.qrFormat} ${batch.qrSize}px`}
        actions={
          <Link className="btn-secondary" to="/admin/qr-batches">
            All batches
          </Link>
        }
      />
      <ErrorText error={resource.error || actionError} />
      <div className="mb-5">
        <BatchActions batch={actionBatch} onError={setActionError} onRevoked={resource.refresh} />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Total', stats.total],
          ['Active', stats.active],
          ['Used', stats.used],
          ['Expired', stats.expired],
          ['Revoked', stats.revoked],
        ].map(([label, value]) => (
          <div key={label} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-[#7a857e]">{label}</p>
            <p className="mt-2 font-display text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <form
        className="mb-4 flex max-w-lg gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search);
        }}
      >
        <input
          className="field"
          placeholder={`Search codes such as ORB-${batch.code}-001`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              {['Code', 'Status', 'Open Count', 'Activated User', 'Activated At', 'Expires'].map(
                (label) => (
                  <th key={label} className="p-3">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link._id} className="border-b border-black/5 dark:border-white/5">
                <td className="p-3 font-mono text-xs">{link.batchCode}</td>
                <td className="p-3">
                  <StatusBadge tone={statusTone(link.status)}>{link.status}</StatusBadge>
                </td>
                <td className="p-3">{link.openCount || 0}</td>
                <td className="p-3">{link.activatedUser?.email || '—'}</td>
                <td className="p-3 whitespace-nowrap">{formatDate(link.activatedAt)}</td>
                <td className="p-3 whitespace-nowrap">{formatDate(link.expiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!links.length && (
          <p className="p-8 text-center text-sm text-[#7a857e]">
            No activation codes match this search.
          </p>
        )}
      </div>
    </>
  );
}
