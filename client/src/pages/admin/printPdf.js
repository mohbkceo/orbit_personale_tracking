import { api } from '../../api/client.js';

export async function openPrintPdf(path, downloadName, design, { preview = false } = {}) {
  const viewer = preview ? window.open('about:blank', '_blank') : null;
  let blob;
  try { blob = design ? await api.post(path, design, { responseType: 'blob', timeout: 0 })
    : await api.get(path, { responseType: 'blob', timeout: 0 }); }
  catch (error) {
    viewer?.close();
    if (error.responseData instanceof Blob) {
      try { throw new Error(JSON.parse(await error.responseData.text()).message); }
      catch (parseError) { if (!(parseError instanceof SyntaxError)) throw parseError; }
    }
    throw error;
  }
  if (blob.type !== 'application/pdf') {
    const text = await blob.text();
    try { throw new Error(JSON.parse(text).message); }
    catch (error) { if (error instanceof SyntaxError) throw new Error('Could not download PDF'); throw error; }
  }
  const url = URL.createObjectURL(blob);
  if (viewer) { viewer.opener = null; viewer.location.href = url; }
  else {
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = downloadName;
    document.body.append(anchor); anchor.click(); anchor.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), preview ? 300_000 : 60_000);
}
