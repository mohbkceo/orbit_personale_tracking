import { useEffect, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  LoaderCircle,
  PanelRight,
  Redo2,
  Save,
  ScanLine,
  Undo2,
} from 'lucide-react';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-serif/400.css';
import '@fontsource/noto-serif/700.css';
import '@fontsource/noto-sans-mono/400.css';
import '@fontsource/noto-sans-mono/700.css';
import { api } from '../../../api/client.js';
import { Spinner } from '../../../components/ui.jsx';
import { openPrintPdf } from '../printPdf.js';
import { CardCanvas } from './CardCanvas.jsx';
import { IconButton, ZoomControls } from './EditorControls.jsx';
import { ElementLibrary, ElementRail } from './ElementLibrary.jsx';
import { PropertiesPanel } from './PropertiesPanel.jsx';
import {
  constrainElement,
  createDesign,
  createElement,
  createHistory,
  designBody,
  HEIGHT,
  historyReducer,
  signature,
  validateDesign,
  WIDTH,
} from './design.js';
import './card-editor.css';

export function AdminQrPrintTemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [history, dispatch] = useReducer(historyReducer, undefined, () =>
    createHistory(createDesign()),
  );
  const template = history.present;
  const [loading, setLoading] = useState(id !== 'new');
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [category, setCategory] = useState('templates');
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [safeMargins, setSafeMargins] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 520, height: 430 });
  const [guides, setGuides] = useState([]);
  const canvasRef = useRef(null);
  const loadedId = useRef(null);
  const savingRef = useRef(false);
  const uploadingRef = useRef(false);
  const chosen = template.elements.find((element) => element.id === selected);
  const errors = validateDesign(template);
  const valid = Object.keys(errors).length === 0;
  const dirty = history.saved !== signature(template);
  const limitReached = template.elements.length >= 80;
  // Fit uses the actual available workspace, including its height on small screens.
  const fitScale = Math.max(
    0.1,
    Math.min(8, (canvasSize.width - 64) / WIDTH, (canvasSize.height - 64) / HEIGHT),
  );
  const scale = fitScale * zoom;
  const ordered = template.elements.filter((e) => e.type !== 'qr');
  const orderIndex = ordered.findIndex((e) => e.id === selected);
  const canForward = chosen?.type !== 'qr' && orderIndex >= 0 && orderIndex < ordered.length - 1;
  const canBack = chosen?.type !== 'qr' && orderIndex > 0;

  useEffect(() => {
    if (loadedId.current === id) return;
    if (id === 'new') {
      loadedId.current = id;
      return;
    }
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    api
      .get(`/admin/qr-print-templates/${id}`)
      .then((res) => {
        if (!active) return;
        dispatch({ type: 'load', template: res.data });
        loadedId.current = id;
        setSelected(null);
        setError('');
      })
      .catch((failure) => {
        if (active) {
          setError(failure.message);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [loading, loadFailed]);
  useEffect(() => {
    if (!dirty || loading || loadFailed) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, loading, loadFailed]);

  function commit(update) {
    dispatch({ type: 'commit', update });
    setError('');
  }
  function select(elementId) {
    setSelected(elementId);
    if (elementId) setPropertiesOpen(true);
  }
  function change(elementId, patch) {
    commit((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === elementId
          ? element.locked && Object.keys(patch).some((key) => key !== 'locked')
            ? element
            : constrainElement(element, patch)
          : element,
      ),
    }));
    setGuides([]);
  }
  function undo() {
    dispatch({ type: 'undo' });
    setGuides([]);
    setError('');
  }
  function redo() {
    dispatch({ type: 'redo' });
    setGuides([]);
    setError('');
  }
  function remove() {
    if (!chosen || chosen.locked) return;
    commit((current) => ({
      ...current,
      elements: current.elements.filter((element) => element.id !== chosen.id),
    }));
    select(null);
  }
  function duplicate() {
    if (!chosen || chosen.locked || chosen.type === 'qr' || limitReached) return;
    const copy = constrainElement(
      { ...chosen, id: crypto.randomUUID() },
      { x: chosen.x + 2, y: chosen.y + 2 },
    );
    commit((current) => ({ ...current, elements: [...current.elements, copy] }));
    select(copy.id);
  }
  function reorder(direction) {
    if (
      !chosen ||
      chosen.locked ||
      chosen.type === 'qr' ||
      (direction > 0 ? !canForward : !canBack)
    )
      return;
    commit((current) => {
      const elements = [...current.elements];
      const index = elements.findIndex((element) => element.id === chosen.id);
      let target = index + direction;
      while (elements[target]?.type === 'qr') target += direction;
      [elements[index], elements[target]] = [elements[target], elements[index]];
      return { ...current, elements };
    });
  }
  function add(type, extra = {}) {
    if (
      limitReached ||
      (type === 'qr' && template.elements.some((element) => element.type === 'qr'))
    )
      return;
    const element = createElement(type, extra);
    commit((current) => ({ ...current, elements: [...current.elements, element] }));
    select(element.id);
  }
  function addText(variable, extra) {
    add(variable ? 'variable' : 'text', {
      ...(variable ? { variable, fontSize: 9, w: 52 } : {}),
      ...extra,
    });
  }
  function applyPreset(style) {
    const preset = createDesign(style);
    commit((current) => ({ ...current, background: preset.background, elements: preset.elements }));
    select(null);
  }
  async function upload(background, file) {
    if (!file || uploadingRef.current) return;
    setUploadError('');
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setUploadError('Choose a PNG or JPG image up to 2 MB.');
      return;
    }
    if (!background && limitReached) {
      setUploadError('Delete an element before uploading another image.');
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    try {
      const res = await api.post('/admin/qr-print-templates/assets', file, {
        headers: { 'Content-Type': file.type },
        timeout: 60000,
      });
      if (background)
        commit((current) => ({ ...current, background: { type: 'image', assetId: res.data._id } }));
      else {
        // Read the source aspect ratio so logos are not stretched when first added.
        let w = 32;
        let h = 24;
        if (typeof createImageBitmap === 'function') {
          const bitmap = await createImageBitmap(file);
          h = (w * bitmap.height) / bitmap.width;
          if (h > 35) {
            w *= 35 / h;
            h = 35;
          }
          bitmap.close();
        }
        const element = createElement('image', { assetId: res.data._id, w, h });
        commit((current) =>
          current.elements.length >= 80
            ? current
            : { ...current, elements: [...current.elements, element] },
        );
        select(element.id);
      }
    } catch (failure) {
      setUploadError(failure.message);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }
  async function save(textEdit) {
    if (!valid || savingRef.current || loading || loadFailed || uploadingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const body = designBody(template);
      if (textEdit?.elementId)
        body.elements = body.elements.map((element) =>
          element.id === textEdit.elementId ? { ...element, text: textEdit.text } : element,
        );
      const res =
        id === 'new'
          ? await api.post('/admin/qr-print-templates', body)
          : await api.patch(`/admin/qr-print-templates/${id}`, body);
      dispatch({ type: 'save', template: body });
      if (id === 'new') {
        loadedId.current = res.data._id;
        navigate(`/admin/qr-batches/print-templates/${res.data._id}`, { replace: true });
      }
    } catch (failure) {
      setError(
        Object.values(failure.errors || {})
          .flat()
          .join(' · ') || failure.message,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function preview() {
    if (!valid || previewing) return;
    setPreviewing(true);
    setError('');
    try {
      await openPrintPdf(
        '/admin/qr-print-templates/preview.pdf',
        'sample-print-card.pdf',
        designBody(template),
        { preview: true },
      );
    } catch (failure) {
      setError(
        Object.values(failure.errors || {})
          .flat()
          .join(' · ') || failure.message,
      );
    } finally {
      setPreviewing(false);
    }
  }
  function keyboard(event) {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === 's') {
      event.preventDefault();
      save();
      return;
    }
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (modifier && ['z', 'y', 'd'].includes(key)) {
      event.preventDefault();
      if (key === 'd') duplicate();
      else if (key === 'y' || event.shiftKey) redo();
      else undo();
    } else if (key === 'escape') {
      select(null);
      setGuides([]);
    } else if (chosen && !chosen.locked) {
      if (['delete', 'backspace'].includes(key)) {
        event.preventDefault();
        remove();
      }
      const step = event.shiftKey ? 1 : 0.25;
      const offsets = {
        arrowleft: [-step, 0],
        arrowright: [step, 0],
        arrowup: [0, -step],
        arrowdown: [0, step],
      };
      if (offsets[key]) {
        event.preventDefault();
        change(chosen.id, { x: chosen.x + offsets[key][0], y: chosen.y + offsets[key][1] });
      }
    }
  }

  if (loading) return <Spinner label="Loading template…" />;
  if (loadFailed)
    return (
      <div className="panel p-6">
        <p role="alert">{error}</p>
        <Link className="text-primary underline" to="/admin/qr-batches/print-templates">
          Back to templates
        </Link>
      </div>
    );
  return (
    <section className="ce-editor" aria-label="Card template editor" onKeyDown={keyboard}>
      <header className="ce-toolbar">
        <Link
          className="ce-back"
          to="/admin/qr-batches/print-templates"
          aria-label="Back to templates"
          title="Back to templates"
        >
          <ArrowLeft size={19} />
        </Link>
        <div className="ce-template-title">
          <label className="sr-only" htmlFor="ce-template-name">
            Template name
          </label>
          <input
            id="ce-template-name"
            maxLength={120}
            value={template.name}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'ce-name-error' : undefined}
            onChange={(event) => commit((current) => ({ ...current, name: event.target.value }))}
          />
          <span className={`ce-save-status ${dirty ? 'is-unsaved' : ''}`} role="status">
            {saving ? (
              <LoaderCircle size={12} className="ce-spin" />
            ) : dirty ? (
              <i />
            ) : (
              <CheckCheck size={13} />
            )}
            {saving ? 'Saving changes…' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
        </div>
        <div className="ce-history">
          <IconButton icon={Undo2} label="Undo" disabled={!history.past.length} onClick={undo} />
          <IconButton icon={Redo2} label="Redo" disabled={!history.future.length} onClick={redo} />
        </div>
        <ZoomControls zoom={zoom} setZoom={setZoom} className="ce-toolbar-zoom" />
        <div className="ce-toolbar-actions">
          <button
            className="ce-button ce-preview-button"
            disabled={!valid || previewing || uploading}
            onClick={preview}
          >
            <ScanLine size={16} />
            {previewing ? 'Preparing…' : 'Preview PDF'}
          </button>
          <button
            className="ce-button ce-button-primary"
            disabled={saving || !valid || uploading || !dirty}
            onClick={save}
          >
            <Save size={16} />
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </header>
      {(errors.name || errors.qr || errors.elements || error) && (
        <div className="ce-error-bar" role="alert">
          {errors.name && <span id="ce-name-error">{errors.name}</span>}
          {errors.qr && (
            <button
              onClick={() => {
                setCategory('qr');
                setLibraryOpen(true);
                setPropertiesOpen(false);
              }}
            >
              {errors.qr}
            </button>
          )}
          {errors.elements && <span>{errors.elements}</span>}
          {error && <span>{error}</span>}
        </div>
      )}
      {template.elements.some((element) => errors[element.id]) && (
        <div className="ce-error-bar" role="alert">
          <button
            onClick={() => select(template.elements.find((element) => errors[element.id]).id)}
          >
            Check your QR colors: use a dark code on a light background.
          </button>
        </div>
      )}
      <div
        className={`ce-layout ${libraryOpen ? 'has-library' : ''} ${propertiesOpen ? 'has-properties' : ''}`}
      >
        <ElementRail
          category={category}
          open={libraryOpen && !propertiesOpen}
          onSelect={(next) => {
            setCategory(next);
            setLibraryOpen(category !== next || !libraryOpen || propertiesOpen);
            setPropertiesOpen(false);
          }}
        />
        {libraryOpen && (
          <ElementLibrary
            category={category}
            onClose={() => setLibraryOpen(false)}
            template={template}
            addText={addText}
            addShape={(shape) =>
              add('shape', {
                shape,
                ...(shape === 'circle'
                  ? { h: 25 }
                  : shape === 'line'
                    ? { fill: '#202329', stroke: '#202329', strokeWidth: 0.5, h: 2 }
                    : {}),
              })
            }
            addQr={() => add('qr')}
            upload={upload}
            uploading={uploading}
            uploadError={uploadError}
            applyPreset={applyPreset}
            selected={selected}
            select={select}
            limitReached={limitReached}
            backgroundColor={(color) =>
              commit((current) => ({ ...current, background: { type: 'color', color } }))
            }
          />
        )}
        <div className="ce-workspace-area">
          <div className="ce-workspace-heading">
            <span>
              <span className="ce-small-dot" />
              Front of card
            </span>
            <span>97 × 55 mm</span>
            <button
              className="ce-properties-toggle"
              onClick={() => {
                setPropertiesOpen(!propertiesOpen);
              }}
              aria-expanded={propertiesOpen}
              aria-controls="ce-properties"
            >
              <PanelRight size={16} />
              Properties
            </button>
          </div>
          <div
            className="ce-canvas-viewport"
            ref={canvasRef}
            tabIndex={0}
            aria-label="Design canvas"
            aria-describedby="ce-canvas-help"
            onPointerDown={(event) => {
              if (event.target.tagName !== 'TEXTAREA') event.currentTarget.focus();
              if (!event.target.closest('.ce-card-stage')) select(null);
            }}
          >
            <div
              className="ce-canvas-scroll"
              style={{
                width: Math.max(canvasSize.width, WIDTH * scale + 48),
                height: Math.max(canvasSize.height, HEIGHT * scale + 48),
              }}
            >
              <CardCanvas
                template={template}
                scale={scale}
                selected={chosen?.id}
                select={select}
                change={change}
                guides={guides}
                setGuides={setGuides}
                safeMargins={safeMargins}
                saveText={(elementId, text) => save({ elementId, text })}
              />
            </div>
          </div>
          <div className="ce-canvas-controls">
            <button
              className={`ce-margin-toggle ${safeMargins ? 'is-active' : ''}`}
              aria-pressed={safeMargins}
              onClick={() => setSafeMargins(!safeMargins)}
            >
              <span>{safeMargins && <Check size={11} />}</span>Safe margin
            </button>
            <span className="ce-sample-label">Sample details shown</span>
            <ZoomControls zoom={zoom} setZoom={setZoom} className="ce-mobile-zoom" />
          </div>
          <p id="ce-canvas-help" className="ce-canvas-help">
            {chosen?.locked
              ? 'Locked in place. Unlock in properties to edit.'
              : chosen
                ? 'Drag to move · Handles to resize · Arrow keys to nudge'
                : 'Click an element to customize it. Double-click text to write.'}
          </p>
        </div>
        <PropertiesPanel
          chosen={chosen}
          template={template}
          change={change}
          commit={commit}
          duplicate={duplicate}
          remove={remove}
          reorder={reorder}
          canForward={canForward}
          canBack={canBack}
          upload={upload}
          uploading={uploading}
          uploadError={uploadError}
          error={chosen && errors[chosen.id]}
          limitReached={limitReached}
          onClose={() => setPropertiesOpen(false)}
        />
      </div>
      <footer className="ce-footer">
        <span>
          <span className="ce-small-dot" />
          {template.elements.length} elements<span className="ce-footer-divider">·</span>Print at
          actual size
        </span>
        <span>Designed for every new beginning.</span>
      </footer>
    </section>
  );
}
