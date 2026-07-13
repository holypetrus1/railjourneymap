import { fetchJourneys, searchStations } from './api.js';
import { exportElementAsPng } from './export-map.js';
import {
  coordinatesOf, formatDistance, isRailLeg, journeyArrival, journeyDeparture,
  journeyDurationMinutes, journeyTrainLabels, journeyTransfers, measureJourney,
} from './route-utils.js';
import {
  COLOR_PALETTE, MAX_SEGMENTS, addSegment, buildTourSegment, createEmptyTour,
  loadTour, moveSegment, removeSegment, saveTour, tourGroups, tourTotals, updateSegment,
} from './tour-store.js';

const state = {
  view: 'search', stations: { from: null, to: null, via1: null, via2: null }, viaCount: 0,
  journeys: [], selectedJourneyIndex: null, searchController: null, tour: loadTour(),
  map: null, railwayTiles: null, routeLayer: null, routeBounds: null,
};

const q = (selector) => document.querySelector(selector);
const elements = {
  body: document.body, panels: [...document.querySelectorAll('[data-panel]')],
  navItems: [...document.querySelectorAll('.nav-item[data-view]')], workspace: q('#workspace'), mapStage: q('#map-stage'),
  form: q('#search-form'), fromInput: q('#from-input'), toInput: q('#to-input'), via1Input: q('#via1-input'), via2Input: q('#via2-input'),
  via1Field: q('#via1-field'), via2Field: q('#via2-field'), addViaButton: q('#add-via-button'), removeViaButton: q('#remove-via-button'),
  departureInput: q('#departure-input'), searchButton: q('#search-button'), formMessage: q('#form-message'),
  resultsSection: q('#results-section'), resultsList: q('#results-list'), resultCount: q('#result-count'), searchEmpty: q('#search-empty'),
  exampleButton: q('#example-button'), addSegmentCard: q('#add-segment-card'), selectedRouteTitle: q('#selected-route-title'),
  selectedRouteDistance: q('#selected-route-distance'), newSegmentDay: q('#new-segment-day'), newSegmentColor: q('#new-segment-color'),
  addSegmentButton: q('#add-segment-button'), continueButton: q('#continue-from-destination'), segmentCapacity: q('#segment-capacity'),
  tourTitleInput: q('#tour-title-input'), tourTotalDistance: q('#tour-total-distance'), tourTotalDuration: q('#tour-total-duration'),
  tourDayCount: q('#tour-day-count'), tourSegmentCount: q('#tour-segment-count'), tourList: q('#tour-list'), tourEmpty: q('#tour-empty'),
  clearTourButton: q('#clear-tour-button'), navTourCount: q('#nav-tour-count'), railwayLayerToggle: q('#railway-layer-toggle'),
  fitRouteButton: q('#fit-route-button'), routeSummary: q('#route-summary'), summaryLabel: q('#summary-label'), summaryTitle: q('#summary-title'),
  summaryDistance: q('#summary-distance'), summaryDuration: q('#summary-duration'), summaryThirdLabel: q('#summary-third-label'),
  summaryThirdValue: q('#summary-third-value'), summaryNote: q('#summary-note'), exportTitleInput: q('#export-title-input'),
  exportRatio: q('#export-ratio'), exportWidth: q('#export-width'), exportShowLegend: q('#export-show-legend'),
  exportShowStops: q('#export-show-stops'), exportShowRailway: q('#export-show-railway'), exportButton: q('#export-png-button'),
  exportStatus: q('#export-status'), exportEmpty: q('#export-empty'), exportOverlay: q('#export-overlay'),
  exportOverlayTitle: q('#export-overlay-title'), exportOverlayMeta: q('#export-overlay-meta'), exportLegend: q('#export-legend'), toast: q('#toast'),
};

const formatter = {
  time: new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }),
  date: new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
};
const formatTime = (value) => value && !Number.isNaN(new Date(value).getTime()) ? formatter.time.format(new Date(value)) : '–';
const formatDate = (value) => value && !Number.isNaN(new Date(value).getTime()) ? formatter.date.format(new Date(value)) : '';
function formatDuration(minutes) {
  if (!Number.isFinite(Number(minutes))) return '–';
  const value = Math.max(0, Math.round(Number(minutes)));
  const hours = Math.floor(value / 60); const rest = value % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${rest} min`;
}
const transferLabel = (count) => Number(count) === 0 ? 'Direkt' : `${count}× Umstieg`;
function setMessage(message = '', type = '') { elements.formMessage.textContent = message; elements.formMessage.dataset.type = type; }
let toastTimer;
function showToast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.hidden = false; toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3200); }
function setLoading(loading) { elements.searchButton.disabled = loading; elements.searchButton.classList.toggle('is-loading', loading); elements.searchButton.querySelector('span').textContent = loading ? 'Strecken werden geladen …' : 'Verbindungen anzeigen'; }
function setDefaultDeparture() { const date = new Date(Date.now() + 15 * 60_000); date.setSeconds(0, 0); elements.departureInput.value = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function debounce(callback, wait = 280) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => callback(...args), wait); }; }

function initColorOptions() {
  COLOR_PALETTE.forEach((color) => { const option = document.createElement('option'); option.value = color.value; option.textContent = color.label; elements.newSegmentColor.append(option); });
  const last = state.tour.segments.at(-1); elements.newSegmentColor.value = last?.color ?? COLOR_PALETTE[0].value; elements.newSegmentDay.value = last?.dayLabel ?? 'Tag 1';
}

function initMap() {
  if (!window.L) { setMessage('Die Kartenbibliothek konnte nicht geladen werden.', 'error'); return; }
  const L = window.L;
  state.map = L.map('map', { center: [51.15, 10.45], zoom: 6, zoomControl: false, preferCanvas: true });
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(state.map);
  state.railwayTiles = L.tileLayer('https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', { maxZoom: 19, tileSize: 256, opacity: 0.72, crossOrigin: true, attribution: 'Style: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>' });
  ensureRailwayLayer(true); setTimeout(() => state.map.invalidateSize(), 0);
}
function ensureRailwayLayer(enabled) { if (!state.map || !state.railwayTiles) return; const active = state.map.hasLayer(state.railwayTiles); if (enabled && !active) state.railwayTiles.addTo(state.map); if (!enabled && active) state.map.removeLayer(state.railwayTiles); elements.railwayLayerToggle.checked = enabled; }

const inputByKey = { from: elements.fromInput, to: elements.toInput, via1: elements.via1Input, via2: elements.via2Input };
function clearStation(key) { state.stations[key] = null; inputByKey[key].value = ''; delete inputByKey[key].dataset.stationId; }
function setupStationAutocomplete(key) {
  const input = inputByKey[key]; const suggestions = q(`#${key}-suggestions`); let controller = null; let items = []; let activeIndex = -1;
  const close = () => { suggestions.hidden = true; suggestions.replaceChildren(); input.setAttribute('aria-expanded', 'false'); activeIndex = -1; };
  const activate = (index) => { activeIndex = index; [...suggestions.querySelectorAll('[role="option"]')].forEach((option, optionIndex) => { const active = optionIndex === activeIndex; option.classList.toggle('is-active', active); option.setAttribute('aria-selected', active ? 'true' : 'false'); }); };
  const select = (station) => { state.stations[key] = station; input.value = station.name; input.dataset.stationId = station.id; close(); setMessage(); };
  const render = (stations) => {
    items = stations; suggestions.replaceChildren();
    if (!stations.length) { const empty = document.createElement('div'); empty.className = 'suggestion-empty'; empty.textContent = 'Kein Bahnhof gefunden'; suggestions.append(empty); }
    else stations.forEach((station, index) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'suggestion-item'; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', 'false'); const name = document.createElement('strong'); name.textContent = station.name; const meta = document.createElement('span'); meta.textContent = 'Bahnhof'; button.append(name, meta); button.addEventListener('pointerdown', (event) => { event.preventDefault(); select(station); }); button.addEventListener('mouseenter', () => activate(index)); suggestions.append(button); });
    suggestions.hidden = false; input.setAttribute('aria-expanded', 'true');
  };
  const load = debounce(async () => { const query = input.value.trim(); if (query.length < 2) { close(); return; } controller?.abort(); const requestController = new AbortController(); controller = requestController; suggestions.hidden = false; suggestions.innerHTML = '<div class="suggestion-empty">Suche …</div>'; input.setAttribute('aria-expanded', 'true'); try { render(await searchStations(query, requestController.signal)); } catch (error) { if (requestController.signal.aborted) return; suggestions.innerHTML = `<div class="suggestion-empty">${error?.message ?? 'Suche derzeit nicht verfügbar'}</div>`; } });
  input.addEventListener('input', () => { state.stations[key] = null; delete input.dataset.stationId; load(); });
  input.addEventListener('focus', () => { if (items.length && input.value.trim().length >= 2) render(items); });
  input.addEventListener('keydown', (event) => { if (suggestions.hidden) return; if (event.key === 'ArrowDown') { event.preventDefault(); activate(Math.min(items.length - 1, activeIndex + 1)); } else if (event.key === 'ArrowUp') { event.preventDefault(); activate(Math.max(0, activeIndex - 1)); } else if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); select(items[activeIndex]); } else if (event.key === 'Escape') close(); });
  document.addEventListener('pointerdown', (event) => { if (!event.target.closest(`[data-station-field="${key}"]`)) close(); });
  return { select, close };
}
const stationFields = { from: setupStationAutocomplete('from'), to: setupStationAutocomplete('to'), via1: setupStationAutocomplete('via1'), via2: setupStationAutocomplete('via2') };
function updateViaUI() { elements.via1Field.hidden = state.viaCount < 1; elements.via2Field.hidden = state.viaCount < 2; elements.addViaButton.hidden = state.viaCount >= 2; elements.removeViaButton.hidden = state.viaCount === 0; }
const selectedViaStations = () => [state.stations.via1, state.stations.via2].slice(0, state.viaCount).filter(Boolean);
function validateStations() {
  if (!state.stations.from || !state.stations.to) throw new Error('Bitte wähle Start und Ziel aus den Bahnhofsvorschlägen aus.');
  if (state.stations.from.id === state.stations.to.id) throw new Error('Start und Ziel müssen unterschiedlich sein.');
  for (let index = 1; index <= state.viaCount; index += 1) { const key = `via${index}`; if (inputByKey[key].value.trim() && !state.stations[key]) throw new Error(`Bitte wähle Via ${index} aus den Bahnhofsvorschlägen aus.`); }
}
function resetSearchResults() { state.journeys = []; state.selectedJourneyIndex = null; elements.resultsSection.hidden = true; elements.addSegmentCard.hidden = true; elements.continueButton.hidden = true; elements.searchEmpty.hidden = false; renderCurrentMap(); }
async function runSearch() {
  let requestController;
  try {
    validateStations(); const departureValue = elements.departureInput.value; if (!departureValue || Number.isNaN(new Date(departureValue).getTime())) throw new Error('Bitte wähle eine gültige Abfahrtszeit.');
    state.searchController?.abort(); requestController = new AbortController(); state.searchController = requestController; setLoading(true); setMessage('Verbindungen und Gleisverläufe werden geladen …');
    const journeys = await fetchJourneys({ fromId: state.stations.from.id, toId: state.stations.to.id, viaIds: selectedViaStations().map((station) => station.id), departure: new Date(departureValue).toISOString() }, requestController.signal);
    if (requestController.signal.aborted) return;
    state.journeys = journeys.filter((journey) => (journey?.legs ?? []).some(isRailLeg)).sort((a, b) => Date.parse(journeyDeparture(a)) - Date.parse(journeyDeparture(b))); state.selectedJourneyIndex = null;
    if (!state.journeys.length) { resetSearchResults(); setMessage('Für diese Auswahl wurden keine Bahnverbindungen gefunden.', 'error'); return; }
    elements.searchEmpty.hidden = true; elements.resultsSection.hidden = false; setMessage(); renderResults(); selectJourney(0);
  } catch (error) { if (error?.name !== 'AbortError') setMessage(error?.message ?? 'Die Verbindungssuche ist fehlgeschlagen.', 'error'); }
  finally { if (requestController && state.searchController === requestController) setLoading(false); }
}

function renderResults() {
  elements.resultsList.replaceChildren(); elements.resultCount.textContent = String(state.journeys.length);
  state.journeys.forEach((journey, index) => {
    const measurement = measureJourney(journey); const card = document.createElement('button'); card.type = 'button'; card.className = 'journey-card'; card.setAttribute('aria-pressed', index === state.selectedJourneyIndex ? 'true' : 'false');
    const top = document.createElement('div'); top.className = 'journey-card-top'; const times = document.createElement('div'); times.className = 'journey-times'; const strong = document.createElement('strong'); strong.textContent = `${formatTime(journeyDeparture(journey))} – ${formatTime(journeyArrival(journey))}`; const date = document.createElement('span'); date.textContent = formatDate(journeyDeparture(journey)); times.append(strong, date); const distance = document.createElement('strong'); distance.className = 'journey-distance'; distance.textContent = formatDistance(measurement.distanceMeters, measurement.approximate); top.append(times, distance);
    const trains = document.createElement('div'); trains.className = 'train-row'; journeyTrainLabels(journey).forEach((label) => { const chip = document.createElement('span'); chip.className = 'train-chip'; chip.textContent = label; trains.append(chip); });
    const meta = document.createElement('div'); meta.className = 'journey-meta'; const duration = document.createElement('span'); duration.textContent = formatDuration(journeyDurationMinutes(journey)); const transfers = document.createElement('span'); transfers.textContent = transferLabel(journeyTransfers(journey)); meta.append(duration, transfers); card.append(top, trains, meta); card.addEventListener('click', () => selectJourney(index, true)); elements.resultsList.append(card);
  });
}
function selectJourney(index, userInitiated = false) {
  const journey = state.journeys[index]; if (!journey) return; state.selectedJourneyIndex = index; const measurement = measureJourney(journey); elements.addSegmentCard.hidden = false; elements.selectedRouteTitle.textContent = `${state.stations.from?.name ?? 'Start'} → ${state.stations.to?.name ?? 'Ziel'}`; elements.selectedRouteDistance.textContent = formatDistance(measurement.distanceMeters, measurement.approximate); elements.continueButton.hidden = true;
  [...elements.resultsList.children].forEach((card, cardIndex) => { const selected = cardIndex === index; card.classList.toggle('is-selected', selected); card.setAttribute('aria-pressed', selected ? 'true' : 'false'); }); renderCurrentMap();
  if (userInitiated && window.matchMedia('(max-width: 820px)').matches) elements.workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function makeMarkerIcon(color, label = '', small = false) { return window.L.divIcon({ className: `route-marker${small ? ' small' : ''}`, html: `<span style="--marker-color:${color}">${label}</span>`, iconSize: small ? [19, 19] : [28, 28], iconAnchor: small ? [10, 10] : [14, 14] }); }
function addMarker(layer, place, color, label = '', small = false) { const coordinates = coordinatesOf(place); if (!coordinates) return; const marker = window.L.marker(coordinates, { icon: makeMarkerIcon(color, label, small), keyboard: false }); if (place?.name) marker.bindTooltip(place.name, { direction: 'top', offset: [0, -9] }); marker.addTo(layer); }
function clearRouteLayer() { if (!state.map) return; if (state.routeLayer) state.map.removeLayer(state.routeLayer); state.routeLayer = window.L.featureGroup().addTo(state.map); state.routeBounds = null; }
function drawLine(points, color, approximate = false, opacity = 1) { if (!state.routeLayer || points.length < 2) return; const L = window.L; L.polyline(points, { color: '#fffaf1', weight: 11, opacity: 0.84 * opacity, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(state.routeLayer); L.polyline(points, { color, weight: 6, opacity, dashArray: approximate ? '9 8' : null, lineCap: 'round', lineJoin: 'round' }).addTo(state.routeLayer); }
function setBoundsFromPoints(points) { if (!state.map || points.length < 2) { state.routeBounds = null; elements.fitRouteButton.disabled = true; return; } state.routeBounds = window.L.latLngBounds(points); elements.fitRouteButton.disabled = !state.routeBounds.isValid(); }
function fitCurrentRoute({ animate = true } = {}) { if (!state.map || !state.routeBounds?.isValid()) return; const exportView = state.view === 'export'; const mobile = window.matchMedia('(max-width: 820px)').matches; state.map.fitBounds(state.routeBounds, { paddingTopLeft: exportView ? [55, 55] : mobile ? [25, 70] : [45, 45], paddingBottomRight: exportView ? [55, 210] : mobile ? [25, 190] : [45, 180], maxZoom: 12, animate }); }
function setSummary({ label, title, distance, duration, thirdLabel, thirdValue, note = '' }) { elements.routeSummary.hidden = false; elements.summaryLabel.textContent = label; elements.summaryTitle.textContent = title; elements.summaryDistance.textContent = distance; elements.summaryDuration.textContent = duration; elements.summaryThirdLabel.textContent = thirdLabel; elements.summaryThirdValue.textContent = thirdValue; elements.summaryNote.hidden = !note; elements.summaryNote.textContent = note; }

function renderSearchMap() {
  clearRouteLayer(); const journey = state.journeys[state.selectedJourneyIndex];
  if (!journey) { if (state.tour.segments.length) { renderTourLines({ opacity: 0.62, showMarkers: false }); const totals = tourTotals(state.tour); setSummary({ label: 'Bisherige Tour', title: state.tour.title, distance: formatDistance(totals.distanceMeters, totals.approximate), duration: formatDuration(totals.durationMinutes), thirdLabel: 'Segmente', thirdValue: String(totals.segmentCount) }); } else elements.routeSummary.hidden = true; return; }
  const measurement = measureJourney(journey); measurement.segments.forEach((segment) => drawLine(segment.points, '#d83a2e', segment.approximate)); const railLegs = (journey.legs ?? []).filter(isRailLeg); if (railLegs.length) { addMarker(state.routeLayer, railLegs[0].origin, '#1d6555', 'A'); railLegs.slice(0, -1).forEach((leg) => addMarker(state.routeLayer, leg.destination, '#d83a2e', '', true)); addMarker(state.routeLayer, railLegs.at(-1).destination, '#d83a2e', 'B'); } setBoundsFromPoints(measurement.allPoints); fitCurrentRoute(); setSummary({ label: `Variante ${state.selectedJourneyIndex + 1} von ${state.journeys.length}`, title: `${state.stations.from?.name ?? 'Start'} → ${state.stations.to?.name ?? 'Ziel'}`, distance: formatDistance(measurement.distanceMeters, measurement.approximate), duration: formatDuration(journeyDurationMinutes(journey)), thirdLabel: 'Umstiege', thirdValue: String(journeyTransfers(journey)), note: measurement.approximate ? 'Mindestens ein Abschnitt ist anhand der Zwischenhalte angenähert.' : '' });
}
function renderTourLines({ opacity = 1, showMarkers = true } = {}) { const allPoints = []; state.tour.segments.forEach((segment, index) => { segment.legs.forEach((leg) => { drawLine(leg.points, segment.color, leg.approximate, opacity); allPoints.push(...leg.points); }); if (showMarkers) { addMarker(state.routeLayer, segment.from, segment.color, String(index + 1)); if (index === state.tour.segments.length - 1) addMarker(state.routeLayer, segment.to, segment.color, '✓'); else addMarker(state.routeLayer, segment.to, segment.color, '', true); } }); setBoundsFromPoints(allPoints); return allPoints; }
function renderTourMap() { clearRouteLayer(); const totals = tourTotals(state.tour); if (!totals.segmentCount) { elements.routeSummary.hidden = true; return; } renderTourLines({ showMarkers: true }); fitCurrentRoute(); setSummary({ label: 'Zusammengestellte Tour', title: state.tour.title, distance: formatDistance(totals.distanceMeters, totals.approximate), duration: formatDuration(totals.durationMinutes), thirdLabel: 'Segmente', thirdValue: String(totals.segmentCount), note: totals.approximate ? 'Mindestens ein Segment enthält eine angenäherte Geometrie.' : '' }); }
function renderExportOverlay() { const totals = tourTotals(state.tour); const settings = state.tour.exportSettings; elements.exportOverlay.hidden = !totals.segmentCount; elements.exportOverlayTitle.textContent = state.tour.title; elements.exportOverlayMeta.textContent = `${formatDistance(totals.distanceMeters, totals.approximate)} · ${totals.segmentCount} Segmente · ${totals.dayCount} Gruppen`; elements.exportLegend.hidden = !settings.showLegend; elements.exportLegend.replaceChildren(); if (settings.showLegend) tourGroups(state.tour).forEach((group) => { const row = document.createElement('div'); row.className = 'legend-row'; const swatch = document.createElement('span'); swatch.className = 'legend-swatch'; swatch.style.background = group.color; const label = document.createElement('strong'); label.textContent = group.label; const distance = document.createElement('span'); distance.textContent = formatDistance(group.distanceMeters); row.append(swatch, label, distance); elements.exportLegend.append(row); }); }
function renderExportMap() { clearRouteLayer(); const totals = tourTotals(state.tour); elements.routeSummary.hidden = true; if (!totals.segmentCount) { elements.exportOverlay.hidden = true; return; } ensureRailwayLayer(state.tour.exportSettings.showRailwayLayer); renderTourLines({ showMarkers: state.tour.exportSettings.showStops }); renderExportOverlay(); fitCurrentRoute({ animate: false }); }
function renderCurrentMap() { if (!state.map) return; if (state.view !== 'export') ensureRailwayLayer(elements.railwayLayerToggle.checked); elements.exportOverlay.hidden = true; if (state.view === 'search') renderSearchMap(); else if (state.view === 'tour') renderTourMap(); else renderExportMap(); }

function numericRatio(value) { const [width, height] = String(value).split('/').map((part) => Number(part.trim())); return Number.isFinite(width) && Number.isFinite(height) && height > 0 ? width / height : 16 / 9; }
function applyExportLayout() {
  const exportView = state.view === 'export'; elements.workspace.classList.toggle('export-workspace', exportView); elements.mapStage.classList.toggle('export-preview', exportView);
  if (exportView) { const mobile = window.matchMedia('(max-width: 820px)').matches; const padding = mobile ? 28 : 56; const ratio = numericRatio(state.tour.exportSettings.ratio); const availableWidth = Math.max(280, elements.workspace.clientWidth - padding); const availableHeight = mobile ? Math.max(430, window.innerHeight * 0.7) : Math.max(430, window.innerHeight - 72 - padding); let width = Math.min(1180, availableWidth); let height = width / ratio; if (height > availableHeight) { height = availableHeight; width = height * ratio; } elements.mapStage.style.width = `${Math.round(width)}px`; elements.mapStage.style.height = `${Math.round(height)}px`; elements.mapStage.style.aspectRatio = state.tour.exportSettings.ratio; elements.workspace.style.minHeight = `${Math.round(height + padding)}px`; }
  else { elements.mapStage.style.width = ''; elements.mapStage.style.height = ''; elements.mapStage.style.aspectRatio = ''; elements.workspace.style.minHeight = ''; }
  setTimeout(() => { state.map?.invalidateSize(); renderCurrentMap(); }, 80);
}
function setView(view) { if (!['search', 'tour', 'export'].includes(view)) return; state.view = view; elements.body.dataset.view = view; elements.panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== view; }); elements.navItems.forEach((button) => button.classList.toggle('is-active', button.dataset.view === view)); applyExportLayout(); if (window.matchMedia('(max-width: 820px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' }); }
function persistTour() { try { state.tour = saveTour(state.tour); } catch (error) { showToast(error.message); } }
function updateTour(nextTour, { toast = '' } = {}) { state.tour = nextTour; persistTour(); renderTourUI(); renderExportUI(); renderCurrentMap(); if (toast) showToast(toast); }

function renderTourUI() { const totals = tourTotals(state.tour); elements.segmentCapacity.textContent = `${totals.segmentCount} / ${MAX_SEGMENTS}`; elements.tourSegmentCount.textContent = String(totals.segmentCount); elements.tourTotalDistance.textContent = formatDistance(totals.distanceMeters, totals.approximate); elements.tourTotalDuration.textContent = formatDuration(totals.durationMinutes); elements.tourDayCount.textContent = String(totals.dayCount); elements.tourTitleInput.value = state.tour.title; elements.navTourCount.textContent = String(totals.segmentCount); elements.navTourCount.hidden = !totals.segmentCount; elements.tourEmpty.hidden = Boolean(totals.segmentCount); elements.clearTourButton.hidden = !totals.segmentCount; elements.addSegmentButton.disabled = totals.segmentCount >= MAX_SEGMENTS || state.selectedJourneyIndex === null; renderTourList(); }
function renderTourList() {
  elements.tourList.replaceChildren();
  state.tour.segments.forEach((segment, index) => {
    const card = document.createElement('article'); card.className = 'tour-segment-card'; const header = document.createElement('div'); header.className = 'segment-card-header'; const indexBadge = document.createElement('span'); indexBadge.className = 'segment-index'; indexBadge.style.background = segment.color; indexBadge.textContent = String(index + 1); const titleWrap = document.createElement('div'); const title = document.createElement('h3'); title.textContent = `${segment.from?.name ?? 'Start'} → ${segment.to?.name ?? 'Ziel'}`; const meta = document.createElement('p'); meta.textContent = `${formatDistance(segment.distanceMeters, segment.approximate)} · ${formatDuration(segment.durationMinutes)} · ${segment.trainLabels.join(', ') || 'Bahn'}`; titleWrap.append(title, meta); header.append(indexBadge, titleWrap);
    const settings = document.createElement('div'); settings.className = 'segment-edit-row'; const dayLabel = document.createElement('label'); const dayCaption = document.createElement('span'); dayCaption.textContent = 'Gruppe / Tag'; const dayInput = document.createElement('input'); dayInput.type = 'text'; dayInput.maxLength = 40; dayInput.value = segment.dayLabel; dayInput.addEventListener('change', () => updateTour(updateSegment(state.tour, segment.id, { dayLabel: dayInput.value }))); dayLabel.append(dayCaption, dayInput); const colorLabel = document.createElement('label'); const colorCaption = document.createElement('span'); colorCaption.textContent = 'Farbe'; const colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = segment.color; colorInput.addEventListener('input', () => { indexBadge.style.background = colorInput.value; }); colorInput.addEventListener('change', () => updateTour(updateSegment(state.tour, segment.id, { color: colorInput.value }))); colorLabel.append(colorCaption, colorInput); settings.append(dayLabel, colorLabel);
    const details = document.createElement('details'); details.className = 'stop-details'; const summary = document.createElement('summary'); summary.textContent = `${Math.max(0, segment.stops.length - 2)} Zwischenhalte anzeigen`; const stopList = document.createElement('ol'); segment.stops.forEach((stop) => { const item = document.createElement('li'); item.textContent = stop.name; stopList.append(item); }); details.append(summary, stopList);
    const actions = document.createElement('div'); actions.className = 'segment-actions'; const focus = document.createElement('button'); focus.type = 'button'; focus.textContent = 'Auf Karte'; focus.addEventListener('click', () => focusSegment(segment)); const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.title = 'Nach oben'; up.disabled = index === 0; up.addEventListener('click', () => updateTour(moveSegment(state.tour, segment.id, -1))); const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.title = 'Nach unten'; down.disabled = index === state.tour.segments.length - 1; down.addEventListener('click', () => updateTour(moveSegment(state.tour, segment.id, 1))); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-action'; remove.textContent = 'Entfernen'; remove.addEventListener('click', () => updateTour(removeSegment(state.tour, segment.id), { toast: 'Segment entfernt.' })); actions.append(focus, up, down, remove); card.append(header, settings, details, actions); elements.tourList.append(card);
  });
}
function focusSegment(segment) { setView('tour'); const points = segment.legs.flatMap((leg) => leg.points); if (points.length >= 2 && state.map) state.map.fitBounds(window.L.latLngBounds(points), { padding: [55, 55], maxZoom: 12 }); }
function renderExportUI() { const totals = tourTotals(state.tour); const settings = state.tour.exportSettings; elements.exportTitleInput.value = state.tour.title; elements.exportRatio.value = settings.ratio; elements.exportWidth.value = String(settings.width); elements.exportShowLegend.checked = settings.showLegend; elements.exportShowStops.checked = settings.showStops; elements.exportShowRailway.checked = settings.showRailwayLayer; elements.exportButton.disabled = !totals.segmentCount; elements.exportEmpty.hidden = Boolean(totals.segmentCount); renderExportOverlay(); }
function updateExportSettings(patch) { state.tour = { ...state.tour, exportSettings: { ...state.tour.exportSettings, ...patch } }; persistTour(); renderExportUI(); if (state.view === 'export') applyExportLayout(); }
async function addSelectedJourneyToTour() { const journey = state.journeys[state.selectedJourneyIndex]; if (!journey) return; try { const segment = buildTourSegment(journey, { color: elements.newSegmentColor.value, dayLabel: elements.newSegmentDay.value, viaNames: selectedViaStations().map((station) => station.name) }); const number = state.tour.segments.length + 1; updateTour(addSegment(state.tour, segment), { toast: `Segment ${number} gespeichert.` }); elements.continueButton.hidden = false; elements.addSegmentButton.querySelector('span').textContent = 'Noch einmal hinzufügen'; } catch (error) { showToast(error.message); } }
function continueFromDestination() { if (!state.stations.to) return; stationFields.from.select(state.stations.to); clearStation('to'); clearStation('via1'); clearStation('via2'); state.viaCount = 0; updateViaUI(); resetSearchResults(); elements.addSegmentButton.querySelector('span').textContent = 'Zur Tour hinzufügen'; setMessage(`Nächste Suche startet ab ${state.stations.from.name}.`); elements.toInput.focus(); }
async function loadExample() { elements.exampleButton.disabled = true; setMessage('Beispielbahnhöfe werden geladen …'); try { const [fromMatches, toMatches] = await Promise.all([searchStations('Berlin Hbf'), searchStations('Hamburg Hbf')]); const from = fromMatches.find((station) => station.name === 'Berlin Hbf') ?? fromMatches[0]; const to = toMatches.find((station) => station.name === 'Hamburg Hbf') ?? toMatches[0]; if (!from || !to) throw new Error('Die Beispielbahnhöfe wurden nicht gefunden.'); stationFields.from.select(from); stationFields.to.select(to); await runSearch(); } catch (error) { setMessage(error?.message ?? 'Das Beispiel konnte nicht geladen werden.', 'error'); } finally { elements.exampleButton.disabled = false; } }
async function exportPng() { if (!state.tour.segments.length || elements.exportButton.dataset.busy === 'true') return; const label = elements.exportButton.querySelector('span'); const defaultText = 'Hochauflösende PNG speichern'; elements.exportButton.dataset.busy = 'true'; elements.exportButton.disabled = true; label.textContent = 'PNG wird erstellt …'; elements.exportStatus.textContent = 'Kartenkacheln und Linien werden hochauflösend gerendert.'; try { setView('export'); await new Promise((resolve) => setTimeout(resolve, 500)); const result = await exportElementAsPng({ element: elements.mapStage, title: state.tour.title, targetWidth: state.tour.exportSettings.width }); label.textContent = 'PNG gespeichert'; elements.exportStatus.textContent = `${result.filename} · ${result.width} × ${result.height} Pixel`; setTimeout(() => { label.textContent = defaultText; elements.exportStatus.textContent = ''; }, 3500); } catch (error) { console.error('PNG export failed', error); label.textContent = 'Export fehlgeschlagen'; elements.exportStatus.textContent = error?.message ?? 'Die PNG-Datei konnte nicht erstellt werden.'; showToast('PNG-Export fehlgeschlagen. Schalte testweise OpenRailwayMap aus.'); setTimeout(() => { label.textContent = defaultText; }, 3000); } finally { elements.exportButton.dataset.busy = 'false'; elements.exportButton.disabled = !state.tour.segments.length; } }

// Events
elements.navItems.forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-go-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goView)));
elements.form.addEventListener('submit', (event) => { event.preventDefault(); runSearch(); });
elements.addViaButton.addEventListener('click', () => { state.viaCount = Math.min(2, state.viaCount + 1); updateViaUI(); inputByKey[`via${state.viaCount}`]?.focus(); });
elements.removeViaButton.addEventListener('click', () => { if (!state.viaCount) return; clearStation(`via${state.viaCount}`); state.viaCount -= 1; updateViaUI(); });
elements.exampleButton.addEventListener('click', loadExample); elements.addSegmentButton.addEventListener('click', addSelectedJourneyToTour); elements.continueButton.addEventListener('click', continueFromDestination); elements.fitRouteButton.addEventListener('click', () => fitCurrentRoute()); elements.railwayLayerToggle.addEventListener('change', () => ensureRailwayLayer(elements.railwayLayerToggle.checked));
elements.tourTitleInput.addEventListener('change', () => { state.tour = { ...state.tour, title: elements.tourTitleInput.value.trim() || 'Meine Bahntour' }; persistTour(); renderExportUI(); renderCurrentMap(); });
elements.exportTitleInput.addEventListener('change', () => { state.tour = { ...state.tour, title: elements.exportTitleInput.value.trim() || 'Meine Bahntour' }; persistTour(); renderTourUI(); renderExportOverlay(); });
elements.exportRatio.addEventListener('change', () => updateExportSettings({ ratio: elements.exportRatio.value })); elements.exportWidth.addEventListener('change', () => updateExportSettings({ width: Number(elements.exportWidth.value) })); elements.exportShowLegend.addEventListener('change', () => updateExportSettings({ showLegend: elements.exportShowLegend.checked })); elements.exportShowStops.addEventListener('change', () => updateExportSettings({ showStops: elements.exportShowStops.checked })); elements.exportShowRailway.addEventListener('change', () => updateExportSettings({ showRailwayLayer: elements.exportShowRailway.checked })); elements.exportButton.addEventListener('click', exportPng);
elements.clearTourButton.addEventListener('click', () => { if (!window.confirm('Möchtest du wirklich alle gespeicherten Segmente löschen?')) return; const title = state.tour.title; state.tour = { ...createEmptyTour(), title }; updateTour(state.tour, { toast: 'Tour geleert.' }); });
window.addEventListener('resize', debounce(() => { state.map?.invalidateSize(); if (state.view === 'export') applyExportLayout(); else if (state.routeBounds?.isValid()) fitCurrentRoute({ animate: false }); }, 150));

setDefaultDeparture(); initColorOptions(); updateViaUI(); initMap(); renderTourUI(); renderExportUI(); setView('search');
