const MAX_EXPORT_PIXELS = 28_000_000;

export function calculateExportScale(width, height, targetWidth = 2560, maxPixels = MAX_EXPORT_PIXELS) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const desiredScale = Math.max(1, Number(targetWidth) / safeWidth);
  const pixelLimitScale = Math.sqrt(maxPixels / (safeWidth * safeHeight));
  return Math.max(1, Math.min(desiredScale, pixelLimitScale));
}

function slugify(value) {
  return String(value || 'bahntour')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'bahntour';
}

export function buildExportFilename(title, date = new Date()) {
  return `${slugify(title)}-${date.toISOString().slice(0, 10)}.png`;
}

function waitForImages(root, timeoutMs = 10_000) {
  const pending = [...root.querySelectorAll('img')]
    .filter((image) => !image.complete)
    .map((image) => new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    }));
  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending),
    new Promise((resolve) => globalThis.setTimeout(resolve, timeoutMs)),
  ]);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Die PNG-Datei konnte nicht erzeugt werden.'));
    }, 'image/png', 1);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export async function exportElementAsPng({ element, title, targetWidth = 2560, ignoreSelector = '[data-export-ignore]' }) {
  if (!element) throw new Error('Die Exportansicht wurde nicht gefunden.');
  if (typeof window.html2canvas !== 'function') throw new Error('Das Exportmodul konnte nicht geladen werden.');
  await document.fonts?.ready;
  await waitForImages(element);
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (!width || !height) throw new Error('Die Exportansicht hat keine gültige Größe.');
  const scale = calculateExportScale(width, height, targetWidth);
  const canvas = await window.html2canvas(element, {
    allowTaint: false,
    backgroundColor: '#dfe5df',
    imageTimeout: 30_000,
    logging: false,
    removeContainer: true,
    scale,
    useCORS: true,
    width,
    height,
    windowWidth: document.documentElement.clientWidth,
    windowHeight: document.documentElement.clientHeight,
    ignoreElements: (node) => node.matches?.(ignoreSelector),
    onclone: (clonedDocument) => {
      clonedDocument.querySelectorAll(ignoreSelector).forEach((node) => node.remove());
      clonedDocument.querySelectorAll('.leaflet-control-zoom').forEach((node) => node.remove());
      clonedDocument.querySelectorAll('.glass-panel').forEach((node) => {
        node.style.backdropFilter = 'none';
        node.style.webkitBackdropFilter = 'none';
      });
    },
  });
  const blob = await canvasToBlob(canvas);
  const filename = buildExportFilename(title);
  downloadBlob(blob, filename);
  return { filename, width: canvas.width, height: canvas.height };
}
