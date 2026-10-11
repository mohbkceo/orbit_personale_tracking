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
const defaults = {
  name: 'Untitled card', widthMm: WIDTH, heightMm: HEIGHT,
  background: { type: 'color', color: '#ffffff' },
  elements: [
    { id: crypto.randomUUID(), type: 'qr', variable: 'QR_CODE', x: 64, y: 10, w: 28, h: 28, rotation: 0, opacity: 1, locked: false, foreground: '#111111', background: '#ffffff' },
    { id: crypto.randomUUID(), type: 'variable', variable: 'ACTIVATION_CODE', x: 5, y: 38, w: 55, h: 8, rotation: 0, opacity: 1, locked: false, color: '#111111', fontFamily: 'Noto Sans', fontSize: 10, fontWeight: 'bold', align: 'left' },
  ],
};
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

export function AdminQrPrintTemplateEditor() {
  const { id } = useParams(); const navigate = useNavigate();
  const [template, setTemplate] = useState(() => structuredClone(defaults));
  const [loading, setLoading] = useState(id !== 'new'); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1); const [canvasWidth, setCanvasWidth] = useState(600);
  const [guides, setGuides] = useState([]); const canvasRef = useRef(null);
  const past = useRef([]); const future = useRef([]);
  useEffect(() => { if (id === 'new') return; api.get(`/admin/qr-print-templates/${id}`).then((res) => setTemplate(res.data)).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, [id]);
  useEffect(() => { if (!canvasRef.current) return; const observer = new ResizeObserver((entries) => setCanvasWidth(entries[0].contentRect.width)); observer.observe(canvasRef.current); return () => observer.disconnect(); }, []);
  const scale = Math.min(8, Math.max(2, (canvasWidth - 24) / WIDTH)) * zoom;
  const chosen = template.elements.find((e) => e.id === selected);
  function commit(updater) { setTemplate((current) => { const next = typeof updater === 'function' ? updater(current) : updater; past.current.push(structuredClone(current)); if (past.current.length > 60) past.current.shift(); future.current = []; return next; }); }
  function change(elementId, patch) { commit((current) => ({ ...current, elements: current.elements.map((e) => e.id === elementId ? { ...e, ...patch } : e) })); setGuides([]); }
  function undo() { if (!past.current.length) return; future.current.push(structuredClone(template)); setTemplate(past.current.pop()); }
  function redo() { if (!future.current.length) return; past.current.push(structuredClone(template)); setTemplate(future.current.pop()); }
  function remove() { if (!chosen) return; commit((current) => ({ ...current, elements: current.elements.filter((e) => e.id !== selected) })); setSelected(null); }
  function duplicate() { if (!chosen) return; const copy = { ...chosen, id: crypto.randomUUID(), x: Math.min(WIDTH - chosen.w, chosen.x + 2), y: Math.min(HEIGHT - chosen.h, chosen.y + 2) }; commit((current) => ({ ...current, elements: [...current.elements, copy] })); setSelected(copy.id); }
  function reorder(direction) { if (!chosen || chosen.type === 'qr') return; commit((current) => { const elements = [...current.elements]; const index = elements.findIndex((e) => e.id === selected); let target = index + direction; while (elements[target]?.type === 'qr') target += direction; if (target < 0 || target >= elements.length) return current; [elements[index], elements[target]] = [elements[target], elements[index]]; return { ...current, elements }; }); }
  function add(type, extra = {}) { const element = { id: crypto.randomUUID(), type, x: 8, y: 8, w: type === 'qr' ? 28 : 25, h: type === 'qr' ? 28 : 10, rotation: 0, opacity: 1, locked: false, ...extra };
    commit((current) => ({ ...current, elements: [...current.elements, element] })); setSelected(element.id); }
  function addText(variable) { add(variable ? 'variable' : 'text', { ...(variable ? { variable } : { text: 'Your text' }), w: 34, h: 8, color: '#111111', fontFamily: 'Noto Sans', fontSize: 12, fontWeight: 'normal', align: 'left' }); }
  function addShape(shape) { add('shape', { shape, w: 25, h: 12, fill: '#e9efe9', stroke: '#111111', strokeWidth: 0, radius: 3 }); }
  async function upload(background = false, file) { if (!file) return; try {
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Choose a PNG/JPEG under 2 MB');
    const res = await api.post('/admin/qr-print-templates/assets', file, { headers: { 'Content-Type': file.type }, timeout: 60000 });
    const assetId = res.data._id;
    if (background) commit((current) => ({ ...current, background: { type: 'image', assetId } }));
    else add('image', { assetId, w: 25, h: 20, cropX: 0, cropY: 0, cropW: 1, cropH: 1 });
    setError('');
  } catch (e) { setError(e.message); } }
  function guide(elementId, x, y) { const lines = []; const others = template.elements.filter((e) => e.id !== elementId);
    for (const other of others) { if (Math.abs(x - other.x) < 1) lines.push({ direction: 'vertical', at: other.x }); if (Math.abs(y - other.y) < 1) lines.push({ direction: 'horizontal', at: other.y }); }
    if (Math.abs(x - WIDTH / 2) < 1) lines.push({ direction: 'vertical', at: WIDTH / 2 });
    if (Math.abs(y - HEIGHT / 2) < 1) lines.push({ direction: 'horizontal', at: HEIGHT / 2 }); setGuides(lines); }
  function designBody() { return { name: template.name, widthMm: WIDTH, heightMm: HEIGHT, background: template.background, elements: template.elements }; }
  async function save() { setSaving(true); try { const body = designBody();
    const res = id === 'new' ? await api.post('/admin/qr-print-templates', body) : await api.patch(`/admin/qr-print-templates/${id}`, body);
    setTemplate(res.data); setError(''); if (id === 'new') navigate(`/admin/qr-batches/print-templates/${res.data._id}`, { replace: true });
  } catch (e) { setError(e.message); } finally { setSaving(false); } }
  if (loading) return <Spinner label="Loading template…" />;
  return <><PageHeader eyebrow="QR Batches · Print Templates" title={template.name} description="Visual editor · 97 × 55 mm landscape" actions={<button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save template'}</button>} />
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm"><Link className="text-primary underline" to="/admin/qr-batches/print-templates">← Templates</Link>
      <button className="btn-secondary" onClick={undo} disabled={!past.current.length}>Undo</button><button className="btn-secondary" onClick={redo} disabled={!future.current.length}>Redo</button>
      <label>Zoom <select className="field ml-2 inline-block w-auto" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>{[0.5, 0.75, 1, 1.25, 1.5].map((n) => <option value={n} key={n}>{Math.round(n * 100)}%</option>)}</select></label>
      <button className="btn-secondary" onClick={() => openPrintPdf('/admin/qr-print-templates/preview.pdf', 'sample-print-card.pdf', designBody(), { preview: true }).catch((e) => setError(e.errors?.elements?.join(' · ') || e.message))}>Preview PDF</button>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 xl:grid-cols-[190px_minmax(0,1fr)_290px]">
      <aside className="panel space-y-3 p-4"><h2 className="font-semibold">Elements</h2>
        <button className="btn-secondary w-full" onClick={() => addText()}>Text</button>
        <label className="block text-xs">Variable<select className="field mt-1" value="" onChange={(e) => { if (e.target.value) addText(e.target.value); e.target.value = ''; }}><option value="">Insert variable…</option>{Object.keys(sample).map((key) => <option key={key} value={key}>{key}</option>)}</select></label>
        <button className="btn-secondary w-full" disabled={template.elements.some((e) => e.type === 'qr')} onClick={() => add('qr', { variable: 'QR_CODE', foreground: '#111111', background: '#ffffff' })}>QR Code</button>
        <label className="block text-xs">Shape<select className="field mt-1" value="" onChange={(e) => { if (e.target.value) addShape(e.target.value); e.target.value = ''; }}><option value="">Insert shape…</option>{['rect', 'roundRect', 'circle', 'ellipse', 'line'].map((shape) => <option key={shape}>{shape}</option>)}</select></label>
        <label className="btn-secondary block cursor-pointer text-center">Upload artwork<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { upload(false, e.target.files[0]); e.target.value = ''; }} /></label>
        <p className="text-xs text-muted">Drag elements on the card. Use the handles to resize and rotate.</p>
      </aside>
      <div className="panel min-w-0 overflow-auto p-4"><div ref={canvasRef} className="min-w-[360px] rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
        <Stage width={WIDTH * scale} height={HEIGHT * scale} onMouseDown={(e) => { if (e.target === e.target.getStage()) setSelected(null); }}>
          <Layer><Rect width={WIDTH * scale} height={HEIGHT * scale} fill={template.background.type === 'color' ? template.background.color : '#ffffff'} listening={false} />
            {template.background.type === 'image' && <BackgroundImage id={template.background.assetId} scale={scale} />}
            {[...template.elements].sort((a, b) => Number(a.type === 'qr') - Number(b.type === 'qr')).map((element) => <ElementNode key={element.id} element={element} scale={scale} selected={selected === element.id} select={setSelected} change={change} guide={guide} />)}
            <Rect x={3 * scale} y={3 * scale} width={91 * scale} height={49 * scale} stroke="#ff4f70" strokeWidth={1} dash={[5, 5]} listening={false} />
            {guides.map((line, i) => <Line key={i} points={line.direction === 'vertical' ? [line.at * scale, 0, line.at * scale, HEIGHT * scale] : [0, line.at * scale, WIDTH * scale, line.at * scale]} stroke="#ff4f70" dash={[4, 4]} listening={false} />)}
          </Layer></Stage></div><p className="mt-2 text-xs text-muted">Dashed line: 3 mm safe margin. Actual output: 97 × 55 mm. Print at 100% / actual size.</p></div>
      <aside className="panel space-y-4 p-4"><h2 className="font-semibold">Properties</h2>
        <label className="block text-xs">Template name<input className="field mt-1" maxLength={120} value={template.name} onChange={(e) => commit((current) => ({ ...current, name: e.target.value }))} /></label>
        <div><p className="mb-2 text-xs font-semibold">Background</p><div className="flex gap-2">{colorField('Color', template.background.type === 'color' ? template.background.color : '#ffffff', (color) => commit((current) => ({ ...current, background: { type: 'color', color } })))}
          <label className="btn-secondary cursor-pointer self-end">Image<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { upload(true, e.target.files[0]); e.target.value = ''; }} /></label></div></div>
        {chosen && <><fieldset disabled={chosen.locked} className={chosen.locked ? 'space-y-2 opacity-50' : 'space-y-2'}><div className="grid grid-cols-2 gap-2">{numeric('X (mm)', chosen.x, (x) => change(selected, { x }), 0, WIDTH)}{numeric('Y (mm)', chosen.y, (y) => change(selected, { y }), 0, HEIGHT)}
          {numeric('Width (mm)', chosen.w, (w) => change(selected, { w, ...(chosen.type === 'qr' ? { h: w } : {}) }), chosen.type === 'qr' ? 20 : 1, WIDTH)}
          {numeric('Height (mm)', chosen.h, (h) => change(selected, { h, ...(chosen.type === 'qr' ? { w: h } : {}) }), chosen.type === 'qr' ? 20 : 1, HEIGHT)}
          {chosen.type !== 'qr' && numeric('Rotation (°)', chosen.rotation, (rotation) => change(selected, { rotation }), -360, 360, 1)}
          {chosen.type !== 'qr' && numeric('Opacity', chosen.opacity, (opacity) => change(selected, { opacity }), 0, 1, .05)}</div>
          {(chosen.type === 'text' || chosen.type === 'variable') && <div className="space-y-2">{chosen.type === 'text' ? <label className="text-xs">Text<textarea className="field mt-1" value={chosen.text} onChange={(e) => change(selected, { text: e.target.value })} /></label> : <label className="text-xs">Variable<select className="field mt-1" value={chosen.variable} onChange={(e) => change(selected, { variable: e.target.value })}>{Object.keys(sample).map((key) => <option key={key}>{key}</option>)}</select></label>}
            <label className="text-xs">Font<select className="field mt-1" value={chosen.fontFamily} onChange={(e) => change(selected, { fontFamily: e.target.value })}>{['Noto Sans', 'Noto Serif', 'Noto Sans Mono'].map((font) => <option key={font}>{font}</option>)}</select></label>
            {numeric('Font size (pt)', chosen.fontSize, (fontSize) => change(selected, { fontSize }), 4, 72, 1)}{colorField('Text color', chosen.color, (color) => change(selected, { color }))}
            <label className="text-xs">Weight<select className="field mt-1" value={chosen.fontWeight} onChange={(e) => change(selected, { fontWeight: e.target.value })}><option>normal</option><option>bold</option></select></label>
            <label className="text-xs">Alignment<select className="field mt-1" value={chosen.align} onChange={(e) => change(selected, { align: e.target.value })}><option>left</option><option>center</option><option>right</option></select></label></div>}
          {chosen.type === 'qr' && <div className="grid grid-cols-2 gap-2">{colorField('QR foreground', chosen.foreground, (foreground) => change(selected, { foreground }))}{colorField('QR background', chosen.background, (background) => change(selected, { background }))}<p className="col-span-2 text-xs text-muted">Print export requires high contrast and a four-module quiet zone.</p></div>}
          {chosen.type === 'shape' && <div className="grid grid-cols-2 gap-2">{colorField('Fill', chosen.fill, (fill) => change(selected, { fill }))}{colorField('Border', chosen.stroke, (stroke) => change(selected, { stroke }))}{numeric('Border (mm)', chosen.strokeWidth, (strokeWidth) => change(selected, { strokeWidth }), 0, 5)}{chosen.shape === 'roundRect' && numeric('Corner (mm)', chosen.radius, (radius) => change(selected, { radius }), 0, 20)}</div>}
          {chosen.type === 'image' && <div className="grid grid-cols-2 gap-2">{['cropX', 'cropY', 'cropW', 'cropH'].map((key) => <div key={key}>{numeric(key, chosen[key], (value) => change(selected, { [key]: value }), 0, 1, .01)}</div>)}</div>}</fieldset>
          <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => change(selected, { locked: !chosen.locked })}>{chosen.locked ? 'Unlock' : 'Lock'}</button><button className="btn-secondary" onClick={duplicate}>Duplicate</button><button className="btn-secondary" onClick={remove}>Delete</button></div></>}
        <div><h3 className="mb-2 text-sm font-semibold">Layers</h3><div className="max-h-52 space-y-1 overflow-auto">{[...template.elements].sort((a, b) => Number(a.type === 'qr') - Number(b.type === 'qr')).reverse().map((e) => <button key={e.id} className={`block w-full rounded p-2 text-left text-xs ${selected === e.id ? 'bg-primary/10 text-primary' : 'bg-black/5 dark:bg-white/5'}`} onClick={() => setSelected(e.id)}>{e.locked ? '🔒 ' : ''}{e.type === 'variable' ? e.variable : e.type === 'shape' ? e.shape : e.type === 'text' ? e.text.slice(0, 24) : e.type}{e.type === 'qr' ? ' · protected top layer' : ''}</button>)}</div>
          <div className="mt-2 flex gap-2"><button className="btn-secondary" disabled={!chosen || chosen.locked || chosen.type === 'qr'} onClick={() => reorder(1)}>Bring forward</button><button className="btn-secondary" disabled={!chosen || chosen.locked || chosen.type === 'qr'} onClick={() => reorder(-1)}>Send back</button></div></div>
      </aside>
    </div>
  </>;
}
