const TARGET_EXPORT_WIDTH = 2560;
const MIN_EXPORT_SCALE = 2;
const MAX_EXPORT_SCALE = 6;
const MAX_EXPORT_PIXELS = 18_000_000;

export function calculateExportScale(
  width,
  height,
  targetWidth = TARGET_EXPORT_WIDTH,
  maxPixels = MAX_EXPORT_PIXELS,
) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const desiredScale = Math.min(
    MAX_EXPORT_SCALE,
    Math.max(MIN_EXPORT_SCALE, targetWidth / safeWidth),
  );
  const pixelLimitScale = Math.sqrt(maxPixels / (safeWidth * safeHeight));
  return Math.max(1, Math.min(desiredScale, pixelLimitScale));
}

function slugify(value) {
  return String(value || 'zugstrecke')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'zugstrecke';
}

export function buildExportFilename(title, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return `${slugify(title)}-${day}.png`;
}

function waitForImages(root, timeoutMs = 8_000) {
  const pending = [...root.querySelectorAll('img')]
    .filter((image) => !image.complete)
    .map((image) => new Promise((resolve) => {
      const finish = () => resolve();
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    }));

  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending),
    new Promise((resolve) => globalThis.setTimeout(resolve, timeoutMs)),
  ]);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const binary = atob(dataUrl.split(',')[1]);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        resolve(new Blob([bytes], { type: 'image/png' }));
      } catch (error) {
        reject(error);
      }
      return;
    }

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

function setupExport() {
  const exportButton = document.querySelector('#export-png-button');
  const exportStatus = document.querySelector('#export-status');
  const routeSummary = document.querySelector('#route-summary');
  const mapPanel = document.querySelector('.map-panel');
  if (!exportButton || !routeSummary || !mapPanel) return;

  const buttonLabel = exportButton.querySelector('span');
  const defaultLabel = buttonLabel?.textContent ?? 'PNG speichern';

  const setStatus = (message = '') => {
    if (exportStatus) exportStatus.textContent = message;
  };

  const syncAvailability = () => {
    exportButton.disabled = routeSummary.hidden || exportButton.dataset.busy === 'true';
  };

  const observer = new MutationObserver(syncAvailability);
  observer.observe(routeSummary, { attributes: true, attributeFilter: ['hidden'] });
  syncAvailability();

  exportButton.addEventListener('click', async () => {
    if (routeSummary.hidden || exportButton.dataset.busy === 'true') return;
    if (typeof window.html2canvas !== 'function') {
      window.alert('Das Exportmodul konnte nicht geladen werden. Bitte lade die Seite neu.');
      return;
    }

    exportButton.dataset.busy = 'true';
    exportButton.classList.add('is-loading');
    exportButton.disabled = true;
    if (buttonLabel) buttonLabel.textContent = 'PNG wird erstellt …';
    setStatus('Die hochauflösende PNG-Datei wird erstellt.');

    try {
      await document.fonts?.ready;
      await waitForImages(mapPanel);

      const width = mapPanel.clientWidth;
      const height = mapPanel.clientHeight;
      const scale = calculateExportScale(width, height);
      const canvas = await window.html2canvas(mapPanel, {
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
        ignoreElements: (element) => element.hasAttribute?.('data-export-ignore'),
        onclone: (clonedDocument) => {
          clonedDocument.querySelectorAll('.leaflet-control-zoom, [data-export-ignore]')
            .forEach((element) => { element.style.display = 'none'; });

          const clonedSummary = clonedDocument.querySelector('#route-summary');
          if (clonedSummary) {
            clonedSummary.style.background = '#fcfaf5';
            clonedSummary.style.backdropFilter = 'none';
            clonedSummary.style.webkitBackdropFilter = 'none';
          }
        },
      });

      const blob = await canvasToBlob(canvas);
      const title = document.querySelector('#summary-title')?.textContent ?? 'Zugstrecke';
      downloadBlob(blob, buildExportFilename(title));

      if (buttonLabel) buttonLabel.textContent = 'PNG gespeichert';
      setStatus(`PNG gespeichert (${canvas.width} × ${canvas.height} Pixel).`);
      globalThis.setTimeout(() => {
        if (buttonLabel) buttonLabel.textContent = defaultLabel;
        setStatus();
      }, 2_500);
    } catch (error) {
      console.error('PNG export failed', error);
      if (buttonLabel) buttonLabel.textContent = 'Export fehlgeschlagen';
      setStatus('Die PNG-Datei konnte nicht erstellt werden.');
      window.alert(
        'Die PNG-Datei konnte nicht erstellt werden. Möglicherweise blockiert eine Kartenebene den Bildexport. Bitte deaktiviere testweise OpenRailwayMap und versuche es erneut.',
      );
      globalThis.setTimeout(() => {
        if (buttonLabel) buttonLabel.textContent = defaultLabel;
      }, 2_500);
    } finally {
      exportButton.dataset.busy = 'false';
      exportButton.classList.remove('is-loading');
      syncAvailability();
    }
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setupExport();
}
