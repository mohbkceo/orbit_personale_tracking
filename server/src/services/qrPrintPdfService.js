import { createRequire } from 'node:module';
import { setImmediate as yieldPage, setTimeout as pause } from 'node:timers/promises';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { ActivationLink } from '../models/ActivationLink.js';
import { QrBatch } from '../models/QrBatch.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { activationUrlFromLink } from './activationService.js';
import { readPrintAsset } from './qrPrintAssetService.js';
import { templateAssetIds, PRINT_WIDTH, PRINT_HEIGHT } from '../validators/qrPrintTemplate.js';

const require = createRequire(import.meta.url);
const notoRegular = require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff');
const notoBold = require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff');
const serifRegular = require.resolve('@fontsource/noto-serif/files/noto-serif-latin-400-normal.woff');
const serifBold = require.resolve('@fontsource/noto-serif/files/noto-serif-latin-700-normal.woff');
const monoRegular = require.resolve('@fontsource/noto-sans-mono/files/noto-sans-mono-latin-400-normal.woff');
const monoBold = require.resolve('@fontsource/noto-sans-mono/files/noto-sans-mono-latin-700-normal.woff');
const pt = (mm) => mm * 72 / 25.4;
const pageSize = [pt(PRINT_WIDTH), pt(PRINT_HEIGHT)];
let exportsInFlight = 0;
export function reservePrintExport() {
  if (exportsInFlight >= 2) throw new AppError('Print server is busy; retry shortly', 429);
  exportsInFlight += 1;
  let released = false;
  return () => { if (!released) { released = true; exportsInFlight -= 1; } };
}
export function activePrintExports() { return exportsInFlight; }

export function resolvePrintText(source, row) {
  const values = {
    ACTIVATION_CODE: row.code,
    PLAN_NAME: row.plan,
    PLAN_DURATION: row.duration,
    BATCH_CODE: row.batchCode,
    CARD_NUMBER: String(row.sequence),
  };
  return String(source).replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => values[key] ?? match);
}

export async function preparePrintBatch(id) {
  const batch = await QrBatch.findById(id).populate('plan', 'name durationValue durationUnit');
  if (!batch) throw new AppError('QR batch not found', 404);
  if (!batch.printSnapshot) throw new AppError('Choose a print template for this batch first', 409);
  const links = await ActivationLink.find({ qrBatch: batch._id })
    .select('batchCode batchSequence status expiresAt planSnapshot +encryptedToken +tokenIv +tokenAuthTag')
    .sort({ batchSequence: 1 });
  if (links.length !== batch.quantity) throw new AppError('Batch link count is incomplete', 409);
  const rows = [];
  for (const [index, link] of links.entries()) {
    if (link.batchSequence !== index + 1 || !link.batchCode || link.status !== 'ACTIVE' || (link.expiresAt && link.expiresAt <= new Date()))
      throw new AppError('Every card must have an active, unexpired, unused code before printing', 409);
    let url;
    try { url = activationUrlFromLink(link); }
    catch { throw new AppError('A card has no recoverable activation URL', 409); }
    rows.push({
      code: link.batchCode, sequence: link.batchSequence, batchCode: batch.code,
      plan: link.planSnapshot?.name || batch.plan?.name || '',
      duration: `${link.planSnapshot?.durationValue || batch.plan?.durationValue || ''} ${link.planSnapshot?.durationUnit || batch.plan?.durationUnit || ''}`.trim(),
      url,
    });
  }
  return { batch, template: batch.printSnapshot, rows };
}

function setOpacity(doc, value) { doc.fillOpacity(value); doc.strokeOpacity(value); }
function drawBackground(doc, template, images) {
  const bg = template.background;
  if (bg.type === 'color') doc.rect(0, 0, ...pageSize).fill(bg.color);
  else {
    const image = images.get(bg.assetId);
    const scale = Math.max(pageSize[0] / image.width, pageSize[1] / image.height);
    doc.save().rect(0, 0, ...pageSize).clip();
    doc.image(image, (pageSize[0] - image.width * scale) / 2, (pageSize[1] - image.height * scale) / 2,
      { width: image.width * scale, height: image.height * scale });
    doc.restore();
  }
}
function fontName(element) {
  const family = element.fontFamily === 'Noto Serif' ? 'NotoSerif' : element.fontFamily === 'Noto Sans Mono' ? 'NotoMono' : 'NotoSans';
  return element.fontWeight === 'bold' ? `${family}-Bold` : family;
}
function drawQr(doc, element, url) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const modules = qr.modules.size;
  const cell = pt(element.w) / (modules + 8);
  doc.rect(0, 0, pt(element.w), pt(element.h)).fill(element.background);
  doc.fillColor(element.foreground);
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (qr.modules.get(row, col)) doc.rect((col + 4) * cell, (row + 4) * cell, cell + 0.02, cell + 0.02);
    }
  }
  doc.fill();
}
function drawShape(doc, e) {
  const w = pt(e.w); const h = pt(e.h);
  if (e.shape === 'rect') doc.rect(0, 0, w, h);
  if (e.shape === 'roundRect') doc.roundedRect(0, 0, w, h, pt(e.radius));
  if (e.shape === 'circle') doc.circle(w / 2, h / 2, Math.min(w, h) / 2);
  if (e.shape === 'ellipse') doc.ellipse(w / 2, h / 2, w / 2, h / 2);
  if (e.shape === 'line') doc.moveTo(0, h / 2).lineTo(w, h / 2);
  doc.lineWidth(pt(e.strokeWidth)).fillColor(e.fill).strokeColor(e.stroke);
  if (e.shape === 'line') { if (e.strokeWidth) doc.stroke(); }
  else if (e.strokeWidth) doc.fillAndStroke();
  else doc.fill();
}
function drawImage(doc, e, image) {
  const w = pt(e.w); const h = pt(e.h);
  doc.rect(0, 0, w, h).clip();
  const drawW = w / e.cropW; const drawH = h / e.cropH;
  doc.image(image, -e.cropX * drawW, -e.cropY * drawH, { width: drawW, height: drawH });
}
export function drawPrintPage(doc, template, row, images, sample = false) {
  doc.addPage({ size: pageSize, margin: 0 });
  drawBackground(doc, template, images);
  for (const e of [...template.elements].sort((a, b) => Number(a.type === 'qr') - Number(b.type === 'qr'))) {
    doc.save();
    doc.translate(pt(e.x), pt(e.y));
    if (e.rotation) doc.rotate(e.rotation, { origin: [0, 0] });
    setOpacity(doc, e.type === 'qr' ? 1 : e.opacity);
    if (e.type === 'qr') drawQr(doc, e, row.url);
    else if (e.type === 'shape') drawShape(doc, e);
    else if (e.type === 'image') drawImage(doc, e, images.get(e.assetId));
    else {
      const text = e.type === 'variable' ? resolvePrintText(`{{${e.variable}}}`, row) : resolvePrintText(e.text, row);
      doc.fillColor(e.color).font(fontName(e)).fontSize(e.fontSize)
        .text(text, 0, 0, { width: pt(e.w), height: pt(e.h), align: e.align, lineBreak: true, ellipsis: true });
    }
    doc.restore();
  }
  if (sample) {
    doc.save().fillOpacity(0.35).font('NotoSans-Bold').fontSize(24).fillColor('#aa0000')
      .text('SAMPLE', 0, pageSize[1] / 2 - 15, { width: pageSize[0], align: 'center' }).restore();
  }
}

export async function streamPrintPdf(response, template, rows, { sample = false } = {}) {
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: false, margin: 0, compress: true });
  doc.registerFont('NotoSans', notoRegular);
  doc.registerFont('NotoSans-Bold', notoBold);
  doc.registerFont('NotoSerif', serifRegular);
  doc.registerFont('NotoSerif-Bold', serifBold);
  doc.registerFont('NotoMono', monoRegular);
  doc.registerFont('NotoMono-Bold', monoBold);
  const checkedText = new Set();
  for (const row of rows) for (const element of template.elements) {
    if (element.type !== 'text' && element.type !== 'variable') continue;
    const rendered = element.type === 'variable' ? resolvePrintText(`{{${element.variable}}}`, row) : resolvePrintText(element.text, row);
    const key = `${fontName(element)}\0${rendered}`;
    if (checkedText.has(key)) continue;
    checkedText.add(key);
    doc.font(fontName(element));
    if ([...rendered].some((character) => character.codePointAt(0) >= 32 && !doc._font.font.hasGlyphForCodePoint(character.codePointAt(0))))
      throw new AppError(`Text contains characters unsupported by ${element.fontFamily}. Change the text or use a supported font.`, 422);
  }
  const images = new Map();
  for (const id of templateAssetIds(template)) images.set(id, doc.openImage(await readPrintAsset(id)));
  let closed = false;
  const onClose = () => { if (!response.writableFinished) { closed = true; doc.destroy(new Error('Download interrupted')); } };
  response.once('close', onClose);
  response.once('error', onClose);
  const completed = new Promise((resolve, reject) => {
    doc.once('error', reject); response.once('error', reject); response.once('finish', resolve);
  });
  doc.pipe(response);
  try {
    for (const [index, row] of rows.entries()) {
      if (closed) throw new Error('Download interrupted');
      drawPrintPage(doc, template, row, images, sample);
      while (!closed && (doc.readableLength > 512 * 1024 || response.writableLength > 512 * 1024 || response.writableNeedDrain)) await pause(10);
      if (index % 4 === 3) await yieldPage();
    }
    doc.end();
    await completed;
  } catch (error) {
    doc.destroy(error);
    if (!response.destroyed) response.destroy(error);
    throw error;
  } finally { response.off('close', onClose); response.off('error', onClose); }
}

export const samplePrintRow = { code: 'ORB-SAMPLE-001', sequence: 1, batchCode: 'SAMPLE', plan: 'Sample Plan', duration: '1 MONTH', url: `${env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '')}/activate/${'A'.repeat(43)}` };
