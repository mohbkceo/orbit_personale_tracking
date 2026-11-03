import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import QRCode from 'qrcode';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-serif/400.css';
import '@fontsource/noto-serif/700.css';
import '@fontsource/noto-sans-mono/400.css';
import '@fontsource/noto-sans-mono/700.css';
import { api } from '../../api/client.js';
import { PageHeader, Spinner } from '../../components/ui.jsx';
import { openPrintPdf } from './printPdf.js';

const WIDTH = 97; const HEIGHT = 55;
const sample = { ACTIVATION_CODE: 'ORB-SAMPLE-001', PLAN_NAME: 'Sample Plan', PLAN_DURATION: '1 MONTH', BATCH_CODE: 'SAMPLE', CARD_NUMBER: '1' };
const objectUrl = (blob) => URL.createObjectURL(blob);
function useImageAsset(id) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!id) return;
    let active = true; let url;
    api.get(`/admin/qr-print-templates/assets/${id}`, { responseType: 'blob', timeout: 60000 }).then((blob) => {
      if (!active) return;
      url = objectUrl(blob);
      const next = new window.Image(); next.onload = () => { if (active) setImage(next); }; next.src = url;
    }).catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return image;
}
function Artwork({ element, common }) {
  const image = useImageAsset(element.assetId);
  if (!image) return <Rect {...common} fill="#e5e7eb" />;
  return <KonvaImage {...common} image={image}
    crop={{ x: image.width * element.cropX, y: image.height * element.cropY, width: image.width * element.cropW, height: image.height * element.cropH }} />;
}
function BackgroundImage({ id, scale }) {
  const image = useImageAsset(id);
  if (!image) return null;
  const width = WIDTH * scale; const height = HEIGHT * scale;
  const ratio = Math.max(width / image.width, height / image.height);
  return <KonvaImage image={image} x={(width - image.width * ratio) / 2} y={(height - image.height * ratio) / 2}
    width={image.width * ratio} height={image.height * ratio} listening={false} />;
}
function QrMatrix({ element, common, scale }) {
  const matrix = useMemo(() => QRCode.create(`${window.location.origin}/activate/${'A'.repeat(43)}`, { errorCorrectionLevel: 'M' }).modules, []);
  const unit = element.w * scale / (matrix.size + 8);
  const cells = [];
  for (let row = 0; row < matrix.size; row += 1)
    for (let col = 0; col < matrix.size; col += 1)
      if (matrix.get(row, col)) cells.push(<Rect key={`${row}-${col}`} x={(col + 4) * unit} y={(row + 4) * unit} width={unit + .02} height={unit + .02} fill={element.foreground} listening={false} />);
  return <Group {...common} width={element.w * scale} height={element.h * scale}>
    <Rect width={element.w * scale} height={element.h * scale} fill={element.background} />{cells}
  </Group>;
}
function ShapeNode({ element, common, scale }) {
  const style = { fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidth * scale };
  return <Group {...common}><Rect width={common.width} height={common.height} opacity={0.001} />
    {element.shape === 'line' && <Line points={[0, common.height / 2, common.width, common.height / 2]} {...style} />}
    {element.shape === 'circle' && <Circle x={common.width / 2} y={common.height / 2} radius={Math.min(common.width, common.height) / 2} {...style} />}
    {element.shape === 'ellipse' && <Ellipse x={common.width / 2} y={common.height / 2} radiusX={common.width / 2} radiusY={common.height / 2} {...style} />}
    {['rect', 'roundRect'].includes(element.shape) && <Rect width={common.width} height={common.height} cornerRadius={element.shape === 'roundRect' ? element.radius * scale : 0} {...style} />}
  </Group>;
}
function ElementNode({ element, scale, selected, select, change, guide }) {
  const ref = useRef(null); const transformer = useRef(null);
  useEffect(() => { if (selected && transformer.current && ref.current) { transformer.current.nodes([ref.current]); transformer.current.getLayer()?.batchDraw(); } }, [selected]);
  const common = { ref, x: element.x * scale, y: element.y * scale, width: element.w * scale, height: element.h * scale,
    rotation: element.rotation, opacity: element.opacity, draggable: !element.locked, onClick: (e) => { e.cancelBubble = true; select(element.id); },
    onTap: (e) => { e.cancelBubble = true; select(element.id); },
    onDragMove: (e) => guide(element.id, e.target.x() / scale, e.target.y() / scale),
    onDragEnd: (e) => change(element.id, { x: Math.max(0, Math.min(WIDTH - element.w, e.target.x() / scale)), y: Math.max(0, Math.min(HEIGHT - element.h, e.target.y() / scale)) }),
    onTransformEnd: () => { const node = ref.current;
      const w = Math.max(element.type === 'qr' ? 20 : 1, Math.min(WIDTH, node.width() * node.scaleX() / scale));
      const h = element.type === 'qr' ? w : Math.max(1, Math.min(HEIGHT, node.height() * node.scaleY() / scale));
      change(element.id, { x: Math.max(0, Math.min(WIDTH - w, node.x() / scale)),
        y: Math.max(0, Math.min(HEIGHT - h, node.y() / scale)), w, h, rotation: node.rotation() });
      node.scaleX(1); node.scaleY(1); },
  };
  let shape;
  if (element.type === 'qr') shape = <QrMatrix element={element} common={common} scale={scale} />;
  else if (element.type === 'image') shape = <Artwork element={element} common={common} />;
  else if (element.type === 'shape') shape = <ShapeNode element={element} common={common} scale={scale} />;
  else shape = <Text {...common} text={element.type === 'variable' ? sample[element.variable] : element.text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => sample[key] ?? match)}
    fontFamily={element.fontFamily} fontSize={element.fontSize * scale * 25.4 / 72} fontStyle={element.fontWeight}
    fill={element.color} align={element.align} wrap="word" ellipsis />;
  return <>{shape}{selected && !element.locked && <Transformer ref={transformer} rotateEnabled={element.type !== 'qr'} keepRatio={element.type === 'qr'}
    enabledAnchors={element.type === 'qr' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : undefined}
    boundBoxFunc={(_old, next) => next.width < (element.type === 'qr' ? 20 : 1) * scale || next.height < (element.type === 'qr' ? 20 : 1) * scale ? _old : next} />}</>;
}

const numeric = (label, value, onChange, min = 0, max = 360, step = 0.1) => <label className="text-xs">{label}
  <input className="field mt-1" type="number" min={min} max={max} step={step} value={value}
    onChange={(event) => onChange(Number(event.target.value))} />
</label>;
const colorField = (label, value, onChange) => <label className="text-xs">{label}<input className="mt-1 block h-9 w-full" type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>;

export function AdminQrPrintTemplates() {
  const [templates, setTemplates] = useState(null); const [error, setError] = useState('');
  const refresh = useCallback(() => api.get('/admin/qr-print-templates').then((res) => setTemplates(res.data)).catch((e) => setError(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);
  async function action(id, kind) {
    try {
      if (kind === 'delete') { if (!window.confirm('Delete this template? Existing batches keep their print design.')) return; await api.delete(`/admin/qr-print-templates/${id}`); }
      else await api.post(`/admin/qr-print-templates/${id}/duplicate`);
      setError(''); refresh();
    } catch (e) { setError(e.message); }
  }
  return <><PageHeader eyebrow="QR Batches" title="Print Templates" description="Design reusable 97 × 55 mm cards. Saving a template creates no activation links."
    actions={<Link className="btn-primary" to="/admin/qr-batches/print-templates/new">Create template</Link>} />
    {error && <p role="alert" className="mb-4 text-red-600">{error}</p>}
    <div className="mb-4"><Link to="/admin/qr-batches" className="text-primary underline">← QR Batches</Link></div>
    {!templates ? <Spinner label="Loading templates…" /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.map((template) =>
      <article className="panel p-5" key={template._id}>
        <h2 className="font-display text-lg font-semibold">{template.name}</h2>
        <p className="text-xs text-muted">Version {template.version} · 97 × 55 mm · {template.elements.length} elements</p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm"><Link className="text-primary underline" to={`/admin/qr-batches/print-templates/${template._id}`}>Edit design</Link>
          <button className="text-primary underline" onClick={() => action(template._id, 'duplicate')}>Duplicate</button>
          <button className="text-danger underline" onClick={() => action(template._id, 'delete')}>Delete</button></div>
      </article>)}</div>}
    {templates?.length === 0 && <p className="panel p-8 text-sm text-muted">Create your first print template to begin.</p>}
  </>;
}


const variableLabels = {
  ACTIVATION_CODE: 'Activation code',
  PLAN_NAME: 'Plan name',
  PLAN_DURATION: 'Plan duration',
  BATCH_CODE: 'Batch code',
  CARD_NUMBER: 'Card number',
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const createQr = (x, y, size) => ({
  id: crypto.randomUUID(), type: 'qr', variable: 'QR_CODE', x, y, w: size, h: size,
  rotation: 0, opacity: 1, locked: false, foreground: '#111111', background: '#ffffff',
});
const createText = (text, x, y, w, h, options = {}) => ({
  id: crypto.randomUUID(), type: 'text', text, x, y, w, h,
  rotation: 0, opacity: 1, locked: false, color: '#111111',
  fontFamily: 'Noto Sans', fontSize: 12, fontWeight: 'normal', align: 'left', ...options,
});
const createVariable = (variable, x, y, w, h, options = {}) => {
  const { text: _text, ...style } = createText('', x, y, w, h, options);
  return { ...style, type: 'variable', variable };
};
function starterTemplate(preset = 'classic') {
  const base = { name: 'Untitled card', widthMm: WIDTH, heightMm: HEIGHT, background: { type: 'color', color: '#ffffff' } };
  if (preset === 'clean') return { ...base, elements: [
    createQr(5, 11, 29),
    createText('YOUR BRAND', 39, 10, 52, 10, { fontSize: 18, fontWeight: 'bold' }),
    createVariable('PLAN_NAME', 39, 25, 51, 8, { fontSize: 11 }),
    createVariable('ACTIVATION_CODE', 39, 40, 51, 7, { fontSize: 9, fontWeight: 'bold' }),
  ] };
  if (preset === 'brand') return { ...base, elements: [
    { id: crypto.randomUUID(), type: 'shape', shape: 'rect', x: 0, y: 0, w: 97, h: 15, rotation: 0,
      opacity: 1, locked: false, fill: '#eb4300', stroke: '#eb4300', strokeWidth: 0, radius: 0 },
    createText('ORBIT', 5, 4, 60, 8, { color: '#ffffff', fontSize: 17, fontWeight: 'bold' }),
    createVariable('PLAN_NAME', 5, 22, 54, 9, { fontSize: 12, fontWeight: 'bold' }),
    createVariable('ACTIVATION_CODE', 5, 40, 56, 8, { fontSize: 9 }),
    createQr(64, 20, 28),
  ] };
  if (preset === 'minimal') return { ...base, elements: [
    createQr(34, 6, 29),
    createVariable('ACTIVATION_CODE', 21, 42, 55, 8, { align: 'center', fontSize: 10, fontWeight: 'bold' }),
  ] };
  return { ...base, elements: [
    createQr(64, 10, 28),
    createVariable('ACTIVATION_CODE', 5, 38, 55, 8, { fontSize: 10, fontWeight: 'bold' }),
  ] };
}
function elementLabel(element) {
  if (element.type === 'qr') return 'QR code';
  if (element.type === 'variable') return variableLabels[element.variable] || element.variable;
  if (element.type === 'text') return element.text?.slice(0, 28) || 'Text';
  if (element.type === 'shape') return element.shape === 'roundRect' ? 'Rounded rectangle' : element.shape;
  return 'Artwork';
}
function fitElement(element, patch) {
  const updated = { ...element, ...patch };
  updated.w = clamp(updated.w, element.type === 'qr' ? 20 : 1, element.type === 'qr' ? HEIGHT : WIDTH);
  updated.h = element.type === 'qr' ? updated.w : clamp(updated.h, 1, HEIGHT);
  updated.x = clamp(updated.x, 0, WIDTH - updated.w);
  updated.y = clamp(updated.y, 0, HEIGHT - updated.h);
  if (element.type === 'qr') { updated.rotation = 0; updated.opacity = 1; }
  if (element.type === 'image') {
    updated.cropX = clamp(updated.cropX, 0, 0.99);
    updated.cropY = clamp(updated.cropY, 0, 0.99);
    updated.cropW = clamp(updated.cropW, 0.01, 1 - updated.cropX);
    updated.cropH = clamp(updated.cropH, 0.01, 1 - updated.cropY);
  }
  return updated;
}
const tabStyle = (active) => 'flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ' +
  (active ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-text');
const toolStyle = 'flex min-h-12 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm hover:border-primary hover:bg-selected transition-colors';

export function AdminQrPrintTemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(() => starterTemplate());
  const [loading, setLoading] = useState(id !== 'new');
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('add');
  const [zoom, setZoom] = useState(1);
  const [canvasWidth, setCanvasWidth] = useState(600);
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [guides, setGuides] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const canvasRef = useRef(null);
  const past = useRef([]);
  const future = useRef([]);
  const revision = useRef(0);

  useEffect(() => {
    if (id === 'new') { setLoading(false); return undefined; }
    let active = true;
    setLoading(true);
    api.get('/admin/qr-print-templates/' + id)
      .then((res) => {
        if (!active) return;
        setTemplate(res.data);
        setDirty(false);
        setSelected(null);
        past.current = [];
        future.current = [];
      })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (loading || !canvasRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setCanvasWidth(entries[0].contentRect.width);
    });
    observer.observe(canvasRef.current);
    setCanvasWidth(canvasRef.current.getBoundingClientRect().width || 600);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const scale = Math.max(1.5, Math.min(8, (canvasWidth - 24) / WIDTH)) * zoom;
  const chosen = template.elements.find((element) => element.id === selected);
  const hasQr = template.elements.some((element) => element.type === 'qr');

  function commit(updater) {
    if (saving) return;
    setTemplate((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (next === current) return current;
      past.current.push(structuredClone(current));
      if (past.current.length > 60) past.current.shift();
      future.current = [];
      revision.current += 1;
      setDirty(true);
      setSavedMessage('');
      return next;
    });
  }
  function change(elementId, patch) {
    commit((current) => ({ ...current, elements: current.elements.map((element) =>
      element.id === elementId ? fitElement(element, patch) : element) }));
    setGuides([]);
  }
  function undo() {
    if (!past.current.length || saving) return;
    future.current.push(structuredClone(template));
    setTemplate(past.current.pop());
    revision.current += 1;
    setDirty(true);
    setSavedMessage('');
  }
  function redo() {
    if (!future.current.length || saving) return;
    past.current.push(structuredClone(template));
    setTemplate(future.current.pop());
    revision.current += 1;
    setDirty(true);
    setSavedMessage('');
  }
  function selectElement(elementId) { setSelected(elementId); setTab('edit'); }
  function remove() {
    if (!chosen || chosen.type === 'qr' || saving) return;
    commit((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== selected) }));
    setSelected(null);
    setTab('layers');
  }
  function duplicate() {
    if (!chosen || chosen.type === 'qr' || saving) return;
    const copy = { ...chosen, id: crypto.randomUUID(),
      x: clamp(chosen.x + 3, 0, WIDTH - chosen.w), y: clamp(chosen.y + 3, 0, HEIGHT - chosen.h) };
    commit((current) => ({ ...current, elements: [...current.elements, copy] }));
    setSelected(copy.id);
  }
  function reorder(direction) {
    if (!chosen || chosen.type === 'qr' || saving) return;
    commit((current) => {
      const elements = [...current.elements];
      const from = elements.findIndex((element) => element.id === selected);
      let to = from + direction;
      while (elements[to]?.type === 'qr') to += direction;
      if (to < 0 || to >= elements.length) return current;
      [elements[from], elements[to]] = [elements[to], elements[from]];
      return { ...current, elements };
    });
  }
  function add(type, extra = {}) {
    if (saving || template.elements.length >= 80) return;
    if (type === 'qr' && hasQr) return;
    const step = (template.elements.length % 5) * 3;
    const initial = { id: crypto.randomUUID(), type, x: 6 + step, y: 6 + step,
      w: type === 'qr' ? 28 : 25, h: type === 'qr' ? 28 : 10, rotation: 0, opacity: 1, locked: false, ...extra };
    const element = fitElement(initial, {});
    commit((current) => ({ ...current, elements: [...current.elements, element] }));
    selectElement(element.id);
  }
  function addText(variable) {
    add(variable ? 'variable' : 'text', {
      ...(variable ? { variable } : { text: 'Your text' }), w: 34, h: 8,
      color: '#111111', fontFamily: 'Noto Sans', fontSize: 12,
      fontWeight: 'normal', align: 'left',
    });
  }
  function addShape(shape) {
    add('shape', { shape, w: 25, h: 12, fill: '#e9efe9', stroke: '#111111', strokeWidth: 0, radius: 3 });
  }
  async function upload(background = false, file) {
    if (!file) return;
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024)
        throw new Error('Choose a PNG or JPEG smaller than 2 MB.');
      const res = await api.post('/admin/qr-print-templates/assets', file, {
        headers: { 'Content-Type': file.type }, timeout: 60000,
      });
      if (background) {
        commit((current) => ({ ...current, background: { type: 'image', assetId: res.data._id } }));
      } else {
        add('image', { assetId: res.data._id, w: 25, h: 20, cropX: 0, cropY: 0, cropW: 1, cropH: 1 });
      }
      setError('');
    } catch (e) { setError(e.message); }
  }
  function guide(elementId, x, y) {
    const lines = [];
    for (const other of template.elements.filter((element) => element.id !== elementId)) {
      if (Math.abs(x - other.x) < 1) lines.push({ direction: 'vertical', at: other.x });
      if (Math.abs(y - other.y) < 1) lines.push({ direction: 'horizontal', at: other.y });
    }
    if (Math.abs(x - WIDTH / 2) < 1) lines.push({ direction: 'vertical', at: WIDTH / 2 });
    if (Math.abs(y - HEIGHT / 2) < 1) lines.push({ direction: 'horizontal', at: HEIGHT / 2 });
    setGuides(lines);
  }
  function designBody() {
    return { name: template.name.trim(), widthMm: WIDTH, heightMm: HEIGHT,
      background: template.background, elements: template.elements };
  }
  async function save() {
    if (saving) return;
    if (!template.name.trim()) { setError('Add a template name before saving.'); return; }
    if (!hasQr) { setError('The card must contain exactly one QR code.'); return; }
    setSaving(true);
    const currentRevision = revision.current;
    try {
      const res = id === 'new'
        ? await api.post('/admin/qr-print-templates', designBody())
        : await api.patch('/admin/qr-print-templates/' + id, designBody());
      if (currentRevision === revision.current) {
        setTemplate(res.data);
        setDirty(false);
        setSavedMessage('All changes saved');
      }
      setError('');
      if (id === 'new') navigate('/admin/qr-batches/print-templates/' + res.data._id, { replace: true });
    } catch (e) { setError(e.errors?.elements?.join(' · ') || e.message); }
    finally { setSaving(false); }
  }
  async function preview() {
    if (previewing) return;
    setPreviewing(true);
    try {
      await openPrintPdf('/admin/qr-print-templates/preview.pdf', 'sample-print-card.pdf', designBody(), { preview: true });
      setError('');
    } catch (e) { setError(e.errors?.elements?.join(' · ') || e.message); }
    finally { setPreviewing(false); }
  }
  function applyPreset(preset) {
    if (id !== 'new' || saving) return;
    if (dirty && !window.confirm('Replace your current unsaved card with this layout?')) return;
    commit(starterTemplate(preset));
    setSelected(null);
    setTab('add');
  }

  useEffect(() => {
    function onKeyDown(event) {
      const target = event.target;
      if (target instanceof HTMLElement &&
        (target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if (modifier && key === 'y') { event.preventDefault(); redo(); }
      else if (key === 'escape') setSelected(null);
      else if ((key === 'delete' || key === 'backspace') && chosen?.type !== 'qr') {
        event.preventDefault(); remove();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (loading) return <Spinner label="Loading template…" />;
  const presets = [
    { id: 'classic', label: 'Classic', description: 'QR + code' },
    { id: 'clean', label: 'Clean', description: 'Logo-style heading' },
    { id: 'brand', label: 'Branded', description: 'Accent banner' },
    { id: 'minimal', label: 'Minimal', description: 'Focus on QR' },
  ];
  const toolbarButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold hover:bg-surface-alt disabled:opacity-40';

  return <>
    <PageHeader eyebrow="QR Batches / Print Templates" title="Card template builder"
      description="Create print-ready 97 × 55 mm cards. Drag elements to arrange them, then save your design."
      actions={<button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save template'}</button>} />
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link className="mr-auto text-sm font-medium text-primary hover:underline" to="/admin/qr-batches/print-templates">← All templates</Link>
      <span className={'mr-2 text-xs ' + (dirty || id === 'new' ? 'text-warning' : 'text-success')} aria-live="polite">
        {dirty ? 'Unsaved changes' : id === 'new' ? 'New template' : savedMessage || 'Saved'}
      </span>
      <button className={toolbarButton} disabled={saving || !past.current.length} onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button>
      <button className={toolbarButton} disabled={saving || !future.current.length} onClick={redo} title="Redo (Ctrl+Y)">↷ Redo</button>
      <button className={toolbarButton} disabled={previewing} onClick={preview}>{previewing ? 'Preparing…' : 'Preview PDF'}</button>
    </div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">{error}</div>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {id === 'new' && <section className="panel p-4">
          <h2 className="text-sm font-semibold">Start with a layout</h2>
          <p className="mt-1 text-xs text-muted">Choose a starting point, then customize everything on the card.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {presets.map((preset) => <button key={preset.id} onClick={() => applyPreset(preset.id)}
              className="rounded-lg border border-border bg-surface p-3 text-left hover:border-primary hover:bg-selected">
              <span className="block text-sm font-semibold">{preset.label}</span>
              <span className="mt-1 block text-xs text-muted">{preset.description}</span>
            </button>)}
          </div>
        </section>}
        <section className="panel min-w-0 p-3 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-muted">Template name</span>
              <input aria-label="Template name" className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-lg font-semibold text-text focus:border-primary focus:outline-none"
                value={template.name} maxLength={120} onChange={(event) => commit((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="card-zoom" className="text-muted">Zoom</label>
              <select id="card-zoom" className="field w-auto" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
                {[0.5, 0.75, 1, 1.25, 1.5].map((value) =>
                  <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
              </select>
            </div>
          </div>
          <div ref={canvasRef} className="w-full min-w-0 overflow-auto rounded-xl bg-slate-100 p-3">
            <div className="flex min-w-0 justify-center">
              <Stage width={WIDTH * scale} height={HEIGHT * scale} onMouseDown={(event) => {
                if (event.target === event.target.getStage()) setSelected(null);
              }} onTouchStart={(event) => {
                if (event.target === event.target.getStage()) setSelected(null);
              }}>
                <Layer>
                  <Rect width={WIDTH * scale} height={HEIGHT * scale}
                    fill={template.background.type === 'color' ? template.background.color : '#ffffff'} listening={false} />
                  {template.background.type === 'image' && <BackgroundImage id={template.background.assetId} scale={scale} />}
                  {[...template.elements].sort((a, b) => Number(a.type === 'qr') - Number(b.type === 'qr')).map((element) =>
                    <ElementNode key={element.id} element={element} scale={scale} selected={selected === element.id}
                      select={selectElement} change={change} guide={guide} />)}
                  {showSafeZone && <Rect x={3 * scale} y={3 * scale} width={91 * scale} height={49 * scale}
                    stroke="#eb4300" opacity={0.6} strokeWidth={1} dash={[5, 5]} listening={false} />}
                  {guides.map((line, index) => <Line key={index}
                    points={line.direction === 'vertical'
                      ? [line.at * scale, 0, line.at * scale, HEIGHT * scale]
                      : [0, line.at * scale, WIDTH * scale, line.at * scale]}
                    stroke="#eb4300" dash={[4, 4]} listening={false} />)}
                </Layer>
              </Stage>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <span>97 × 55 mm · Drag to move · Select to edit</span>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={showSafeZone} onChange={(event) => setShowSafeZone(event.target.checked)} />
              Show 3 mm safe margin
            </label>
          </div>
          <p className="mt-1 text-xs text-muted">Print the exported PDF at 100% actual size. The dashed guide is not printed.</p>
        </section>
      </div>
      <aside className="panel min-w-0 self-start p-3 sm:p-4 xl:sticky xl:top-4" aria-label="Card editor tools">
        <div role="tablist" aria-label="Builder panels" className="mb-4 flex rounded-lg bg-surface-alt p-1">
          {[
            ['add', 'Add'],
            ['edit', 'Edit'],
            ['layers', 'Layers (' + template.elements.length + ')'],
          ].map(([value, label]) => <button key={value} type="button" role="tab"
            aria-selected={tab === value} className={tabStyle(tab === value)} onClick={() => setTab(value)}>{label}</button>)}
        </div>

        {tab === 'add' && <div className="space-y-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Add to your card</h2>
            <div className="grid grid-cols-2 gap-2">
              <button className={toolStyle} onClick={() => addText()}><span className="text-lg font-bold">T</span> Text</button>
              <button className={toolStyle} onClick={() => addText('ACTIVATION_CODE')}><span className="text-lg">#</span> Code</button>
              <button className={toolStyle} onClick={() => addShape('roundRect')}><span className="text-lg">▢</span> Shape</button>
              <label className={toolStyle + ' cursor-pointer'}><span className="text-lg">▧</span> Image
                <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Upload artwork"
                  onChange={(event) => { upload(false, event.target.files[0]); event.target.value = ''; }} />
              </label>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Dynamic fields</h3>
            <p className="mb-2 text-xs text-muted">These are filled automatically when you print a batch.</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(variableLabels).filter(([key]) => key !== 'ACTIVATION_CODE').map(([key, label]) =>
                <button key={key} className={toolStyle} onClick={() => addText(key)}>+ {label}</button>)}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">More shapes</h3>
            <div className="grid grid-cols-2 gap-2">
              {[['rect', 'Rectangle'], ['circle', 'Circle'], ['ellipse', 'Ellipse'], ['line', 'Line']].map(([key, label]) =>
                <button key={key} className={toolStyle} onClick={() => addShape(key)}>+ {label}</button>)}
            </div>
          </div>
          {!hasQr && <button className="btn-secondary w-full" onClick={() => add('qr', {
            variable: 'QR_CODE', w: 28, h: 28, foreground: '#111111', background: '#ffffff',
          })}>Add QR code</button>}
          <p className="rounded-lg bg-surface-alt p-3 text-xs text-muted">Tip: select any element directly on the card to change its text, color, size or position.</p>
        </div>}

        {tab === 'edit' && <div className="space-y-4">
          {chosen ? <>
            <div className="flex items-start justify-between gap-2">
              <div><h2 className="text-sm font-semibold">{elementLabel(chosen)}</h2>
                <p className="text-xs text-muted">Edit selected element</p></div>
              <button className="text-xs text-primary hover:underline" onClick={() => setSelected(null)}>Deselect</button>
            </div>
            {(chosen.type === 'text' || chosen.type === 'variable') && <fieldset disabled={chosen.locked} className="space-y-3">
              {chosen.type === 'text'
                ? <label className="block text-xs font-semibold">Text
                    <textarea className="field mt-1" rows={3} value={chosen.text} maxLength={500}
                      onChange={(event) => change(selected, { text: event.target.value })} />
                  </label>
                : <label className="block text-xs font-semibold">Automatic field
                    <select className="field mt-1" value={chosen.variable} onChange={(event) => change(selected, { variable: event.target.value })}>
                      {Object.entries(variableLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </label>}
              <div className="grid grid-cols-2 gap-3">
                {numeric('Font size (pt)', chosen.fontSize, (fontSize) => change(selected, { fontSize }), 4, 72, 1)}
                {colorField('Text color', chosen.color, (color) => change(selected, { color }))}
                <label className="text-xs">Style
                  <select className="field mt-1" value={chosen.fontWeight} onChange={(event) => change(selected, { fontWeight: event.target.value })}>
                    <option value="normal">Regular</option><option value="bold">Bold</option>
                  </select>
                </label>
                <label className="text-xs">Align
                  <select className="field mt-1" value={chosen.align} onChange={(event) => change(selected, { align: event.target.value })}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs">Font family
                <select className="field mt-1" value={chosen.fontFamily} onChange={(event) => change(selected, { fontFamily: event.target.value })}>
                  {['Noto Sans', 'Noto Serif', 'Noto Sans Mono'].map((font) => <option key={font}>{font}</option>)}
                </select>
              </label>
            </fieldset>}
            {chosen.type === 'qr' && <div className="space-y-3">
              <div className="rounded-lg bg-surface-alt p-3 text-xs text-muted">The QR code is filled with a unique activation link for each printed card. It stays square and cannot be duplicated or removed.</div>
              <fieldset disabled={chosen.locked} className="grid grid-cols-2 gap-3">
                {colorField('Dark modules', chosen.foreground, (foreground) => change(selected, { foreground }))}
                {colorField('Light background', chosen.background, (background) => change(selected, { background }))}
              </fieldset>
              <p className="text-xs text-muted">Use dark modules on a light background for reliable scanning.</p>
            </div>}
            {chosen.type === 'shape' && <fieldset disabled={chosen.locked} className="space-y-3">
              <label className="block text-xs">Shape
                <select className="field mt-1" value={chosen.shape} onChange={(event) => change(selected, { shape: event.target.value })}>
                  {['rect', 'roundRect', 'circle', 'ellipse', 'line'].map((shape) => <option key={shape} value={shape}>{shape}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {colorField('Fill', chosen.fill, (fill) => change(selected, { fill }))}
                {colorField('Border', chosen.stroke, (stroke) => change(selected, { stroke }))}
              </div>
            </fieldset>}
            {chosen.type === 'image' && <p className="rounded-lg bg-surface-alt p-3 text-xs text-muted">Drag or resize the artwork on the card. Use Advanced controls to adjust cropping.</p>}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button className={toolbarButton} onClick={() => change(selected, { locked: !chosen.locked })}>{chosen.locked ? 'Unlock' : 'Lock'}</button>
              <button className={toolbarButton} disabled={chosen.type === 'qr'} onClick={duplicate}>Duplicate</button>
              <button className={toolbarButton + ' text-danger'} disabled={chosen.type === 'qr'} onClick={remove}>Delete</button>
            </div>
            <details className="border-t border-border pt-3">
              <summary className="cursor-pointer text-sm font-semibold">Advanced: size & position</summary>
              <fieldset disabled={chosen.locked} className="mt-3 grid grid-cols-2 gap-3">
                {numeric('X (mm)', chosen.x, (x) => change(selected, { x }), 0, WIDTH)}
                {numeric('Y (mm)', chosen.y, (y) => change(selected, { y }), 0, HEIGHT)}
                {numeric('Width (mm)', chosen.w, (w) => change(selected, { w, ...(chosen.type === 'qr' ? { h: w } : {}) }),
                  chosen.type === 'qr' ? 20 : 1, chosen.type === 'qr' ? HEIGHT : WIDTH)}
                {chosen.type !== 'qr' && numeric('Height (mm)', chosen.h, (h) => change(selected, { h }), 1, HEIGHT)}
                {chosen.type !== 'qr' && numeric('Rotation (°)', chosen.rotation, (rotation) => change(selected, { rotation }), -360, 360, 1)}
                {chosen.type !== 'qr' && numeric('Opacity', chosen.opacity, (opacity) => change(selected, { opacity }), 0, 1, .05)}
                {chosen.type === 'shape' && numeric('Border width', chosen.strokeWidth, (strokeWidth) => change(selected, { strokeWidth }), 0, 5)}
                {chosen.shape === 'roundRect' && numeric('Corner radius', chosen.radius, (radius) => change(selected, { radius }), 0, 20)}
                {chosen.type === 'image' && ['cropX', 'cropY', 'cropW', 'cropH'].map((key) =>
                  <div key={key}>{numeric(key, chosen[key], (value) => change(selected, { [key]: value }), 0, 1, 0.01)}</div>)}
              </fieldset>
            </details>
          </> : <>
            <h2 className="text-sm font-semibold">Card settings</h2>
            <p className="text-xs text-muted">Select an element to edit it, or customize the card background below.</p>
            <div className="space-y-3">
              {colorField('Background color', template.background.type === 'color' ? template.background.color : '#ffffff',
                (color) => commit((current) => ({ ...current, background: { type: 'color', color } })))}
              <label className="btn-secondary block cursor-pointer text-center">Upload background image
                <input className="sr-only" type="file" aria-label="Upload background" accept="image/png,image/jpeg"
                  onChange={(event) => { upload(true, event.target.files[0]); event.target.value = ''; }} />
              </label>
              {template.background.type === 'image' && <button className="text-xs text-primary hover:underline"
                onClick={() => commit((current) => ({ ...current, background: { type: 'color', color: '#ffffff' } }))}>
                Remove background image
              </button>}
            </div>
          </>}
        </div>}

        {tab === 'layers' && <div>
          <h2 className="mb-1 text-sm font-semibold">Card layers</h2>
          <p className="mb-3 text-xs text-muted">Select a layer to edit it. QR codes always print on top.</p>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {[...template.elements].sort((a, b) => Number(a.type === 'qr') - Number(b.type === 'qr')).reverse().map((element) =>
              <button key={element.id} className={'flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm ' +
                (selected === element.id ? 'border-primary bg-selected' : 'border-border hover:bg-surface-alt')}
                onClick={() => selectElement(element.id)}>
                <span className="min-w-0 truncate">{elementLabel(element)}</span>
                <span className="shrink-0 text-xs text-muted">{element.locked ? 'Locked' : element.type === 'qr' ? 'QR' : ''}</span>
              </button>)}
          </div>
          {chosen && chosen.type !== 'qr' && <div className="mt-3 flex flex-wrap gap-2">
            <button className={toolbarButton} disabled={chosen.locked} onClick={() => reorder(1)}>Bring forward</button>
            <button className={toolbarButton} disabled={chosen.locked} onClick={() => reorder(-1)}>Send backward</button>
          </div>}
        </div>}
      </aside>
    </div>
  </>;
}
