import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { PageHeader, Spinner, StatusBadge } from '../../components/ui.jsx';
import { openPrintPdf } from './printPdf.js';

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
  if (kind === 'pdf') return openPrintPdf(`/admin/qr-batches/${batch._id}/print.pdf`, `${batch.code}-print.pdf`);
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
      <Link className="text-primary underline" to={`/admin/qr-batches/${batch._id}`}>
        View
      </Link>
      <button
        disabled={Boolean(busy)}
        className="text-primary underline disabled:opacity-50"
        onClick={() => run('zip')}
      >
        {busy === 'zip' ? 'Preparing…' : 'Download ZIP'}
      </button>
      <button
        disabled={Boolean(busy)}
        className="text-primary underline disabled:opacity-50"
        onClick={() => run('csv')}
      >
        Export CSV
      </button>
      {batch.printSnapshot && <button disabled={Boolean(busy)} className="text-primary underline disabled:opacity-50" onClick={() => run('pdf')}>{busy === 'pdf' ? 'Preparing PDF…' : 'Download Print PDF'}</button>}
      <button
        disabled={Boolean(busy) || !batch.stats?.active}
        className="text-danger underline disabled:opacity-40"
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
  const templates = useApiResource('/admin/qr-print-templates');
  const [form, setForm] = useState({
    name: '',
    planId: '',
    quantity: 100,
    validityDays: 7,
    noExpiry: false,
    templateId: '',
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
      const response = await api.post('/admin/qr-batches', { ...form, templateId: form.templateId || undefined, validityDays: form.noExpiry ? undefined : form.validityDays });
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
        actions={<Link className="btn-secondary" to="/admin/qr-batches/print-templates">Print Templates</Link>}
      />
      <ErrorText error={batches.error || plans.error || templates.error || actionError} />
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
          <span className="label">Print template</span>
          <select className="field" value={form.templateId} onChange={(event) => update('templateId', event.target.value)}>
            <option value="">No print template (legacy ZIP/CSV)</option>
            {templates.data?.map((template) => <option key={template._id} value={template._id}>{template.name} · v{template.version}</option>)}
          </select>
          {form.templateId && <button type="button" className="mt-1 text-xs text-primary underline" onClick={() => openPrintPdf(`/admin/qr-print-templates/${form.templateId}/preview.pdf`, 'sample-print-card.pdf', undefined, { preview: true }).catch((failure) => setActionError(failure.message))}>Preview selected design</button>}
        </label>
        <label>
          <span className="label">Valid for days</span>
          <input
            required={!form.noExpiry}
            disabled={form.noExpiry}
            type="number"
            min="1"
            max="365"
            className="field"
            value={form.validityDays}
            onChange={(event) => update('validityDays', Number(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.noExpiry} onChange={(event) => update('noExpiry', event.target.checked)} />No redemption expiry (printed cards)</label>
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
          {creating ? 'Generating secure links…' : form.templateId ? 'Create print batch' : 'Generate batch'}
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
        <div className="panel admin-scroll-table">
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
                    <div className="mt-1 font-mono text-xs text-muted">{batch.code}</div>
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
            <p className="p-8 text-center text-sm text-muted">No QR batches found.</p>
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
  const templates = useApiResource('/admin/qr-print-templates');
  const [templateId, setTemplateId] = useState('');
  const [configuring, setConfiguring] = useState(false);
  async function configurePrint() {
    if (!templateId) return;
    setConfiguring(true);
    try { await api.post(`/admin/qr-batches/${id}/print-template`, { templateId }); await resource.refresh(); setActionError(''); }
    catch (failure) { setActionError(failure.message); }
    finally { setConfiguring(false); }
  }
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
      <div className="panel mb-6 p-5">
        <h2 className="font-display text-lg font-semibold">Print cards</h2>
        {batch.printSnapshot ? <p className="mt-1 text-sm text-muted">Locked design: {batch.printSnapshot.name} · version {batch.printSnapshot.version} · 97 × 55 mm · {batch.noExpiry ? 'No redemption expiry' : `${batch.validityDays} day redemption window`}. All {batch.quantity} codes must remain active for a full reprint.</p> :
          <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-sm">Choose a template<select className="field mt-1" value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Select template</option>{templates.data?.map((template) => <option key={template._id} value={template._id}>{template.name} · v{template.version}</option>)}</select></label>
            <button disabled={!templateId || configuring} className="btn-primary" onClick={configurePrint}>Lock print design</button>
            {templateId && <button className="btn-secondary" onClick={() => openPrintPdf(`/admin/qr-print-templates/${templateId}/preview.pdf`, 'sample-print-card.pdf', undefined, { preview: true }).catch((failure) => setActionError(failure.message))}>Preview PDF</button>}</div>}
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
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
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
      <div className="panel admin-scroll-table">
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
          <p className="p-8 text-center text-sm text-muted">
            No activation codes match this search.
          </p>
        )}
      </div>
    </>
  );
}
