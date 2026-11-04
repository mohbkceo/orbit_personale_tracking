import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { PageHeader, Spinner } from '../../components/ui.jsx';
export { AdminQrPrintTemplateEditor } from './qr-template-editor/CardTemplateEditor.jsx';
export function AdminQrPrintTemplates() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(
    () =>
      api
        .get('/admin/qr-print-templates')
        .then((res) => setTemplates(res.data))
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);
  async function action(id, kind) {
    try {
      if (kind === 'delete') {
        if (!window.confirm('Delete this template? Existing batches keep their print design.'))
          return;
        await api.delete(`/admin/qr-print-templates/${id}`);
      } else await api.post(`/admin/qr-print-templates/${id}/duplicate`);
      setError('');
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="QR Batches"
        title="Print Templates"
        description="Design reusable 97 × 55 mm cards. Saving a template creates no activation links."
        actions={
          <Link className="btn-primary" to="/admin/qr-batches/print-templates/new">
            Create template
          </Link>
        }
      />
      {error && (
        <p role="alert" className="mb-4 text-red-600">
          {error}
        </p>
      )}
      <div className="mb-4">
        <Link to="/admin/qr-batches" className="text-primary underline">
          ← QR Batches
        </Link>
      </div>
      {!templates ? (
        <Spinner label="Loading templates…" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <article className="panel p-5" key={template._id}>
              <h2 className="font-display text-lg font-semibold">{template.name}</h2>
              <p className="text-xs text-muted">
                Version {template.version} · 97 × 55 mm · {template.elements.length} elements
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-sm">
                <Link
                  className="text-primary underline"
                  to={`/admin/qr-batches/print-templates/${template._id}`}
                >
                  Edit design
                </Link>
                <button
                  className="text-primary underline"
                  onClick={() => action(template._id, 'duplicate')}
                >
                  Duplicate
                </button>
                <button
                  className="text-danger underline"
                  onClick={() => action(template._id, 'delete')}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {templates?.length === 0 && (
        <p className="panel p-8 text-sm text-muted">Create your first print template to begin.</p>
      )}
    </>
  );
}
