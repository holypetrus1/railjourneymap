import { fetchJourneys, searchStations } from './api.js?v=20260712-4';
import {
  coordinatesOf,
  formatDistance,
  isRailLeg,
  journeyArrival,
  journeyDeparture,
  journeyDurationMinutes,
  journeyTransfers,
  measureJourney,
  railLegLabel,
} from './route-utils.js?v=20260712-4';

const state = {
  stations: { from: null, to: null },
  journeys: [],
  selectedIndex: null,
  measurements: new WeakMap(),
  searchController: null,
  map: null,
  railwayTiles: null,
  routeLayer: null,
  routeBounds: null,
};

const elements = {
  form: document.querySelector('#search-form'),
  fromInput: document.querySelector('#from-input'),
  toInput: document.querySelector('#to-input'),
  departureInput: document.querySelector('#departure-input'),
  swapButton: document.querySelector('#swap-button'),
  searchButton: document.querySelector('#search-button'),
  formMessage: document.querySelector('#form-message'),
  resultsSection: document.querySelector('#results-section'),
  resultsList: document.querySelector('#results-list'),
  resultCount: document.querySelector('#result-count'),
  emptyState: document.querySelector('#empty-state'),
  exampleButton: document.querySelector('#example-button'),
  railwayLayerToggle: document.querySelector('#railway-layer-toggle'),
  fitRouteButton: document.querySelector('#fit-route-button'),
  routeSummary: document.querySelector('#route-summary'),
  summaryLabel: document.querySelector('#summary-label'),
  summaryTitle: document.querySelector('#summary-title'),
  summaryDistance: document.querySelector('#summary-distance'),
  summaryDuration: document.querySelector('#summary-duration'),
  summaryTransfers: document.querySelector('#summary-transfers'),
  summaryNote: document.querySelector('#summary-note'),
};

const formatter = {
  time: new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }),
  date: new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
};

function setMessage(message = '', type = '') {
  elements.formMessage.textContent = message;
  elements.formMessage.dataset.type = type;
}

function setLoading(loading) {
  elements.searchButton.disabled = loading;
  elements.searchButton.classList.toggle('is-loading', loading);
  const label = elements.searchButton.querySelector('span');
  if (label) label.textContent = loading ? 'Strecken werden geladen …' : 'Verbindungen anzeigen';
}

function setDefaultDeparture() {
  const date = new Date(Date.now() + 15 * 60_000);
  date.setSeconds(0, 0);
  elements.departureInput.value = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function initMap() {
  if (!window.L) {
    setMessage('Die Kartenbibliothek konnte nicht geladen werden.', 'error');
    return;
  }

  const L = window.L;
  state.map = L.map('map', {
    center: [51.15, 10.45],
    zoom: 6,
    zoomControl: false,
    preferCanvas: true,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(state.map);
  state.railwayTiles = L.tileLayer('https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
    maxZoom: 19,
    tileSize: 256,
    opacity: 0.72,
    attribution: 'Style: <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA 2.0</a> <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>',
  }).addTo(state.map);
  window.setTimeout(() => state.map.invalidateSize(), 0);
}

function debounce(callback, wait = 280) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(...args), wait);
  };
}

function setupStationAutocomplete(key) {
  const input = key === 'from' ? elements.fromInput : elements.toInput;
  const suggestions = document.querySelector(`#${key}-suggestions`);
  let controller = null;
  let items = [];
  let activeIndex = -1;

  const close = () => {
    suggestions.hidden = true;
    suggestions.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  };

  const activate = (index) => {
    activeIndex = index;
    [...suggestions.querySelectorAll('[role="option"]')].forEach((option, optionIndex) => {
      const active = optionIndex === activeIndex;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  };

  const select = (station) => {
    state.stations[key] = station;
    input.value = station.name;
    input.dataset.stationId = station.id;
    close();
    setMessage();
  };

  const render = (stations) => {
    items = stations;
    suggestions.replaceChildren();

    if (!stations.length) {
      const empty = document.createElement('div');
      empty.className = 'suggestion-empty';
      empty.textContent = 'Kein Bahnhof gefunden';
      suggestions.append(empty);
    } else {
      stations.forEach((station, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'suggestion-item';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', 'false');

        const name = document.createElement('strong');
        name.textContent = station.name;
        const meta = document.createElement('span');
        meta.textContent = 'Bahnhof';
        button.append(name, meta);
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          select(station);
        });
        button.addEventListener('mouseenter', () => activate(index));
        suggestions.append(button);
      });
    }

    suggestions.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const load = debounce(async () => {
    const query = input.value.trim();
    if (query.length < 2) {
      close();
      return;
    }

    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    suggestions.hidden = false;
    suggestions.innerHTML = '<div class="suggestion-empty">Suche …</div>';
    input.setAttribute('aria-expanded', 'true');

    try {
      render(await searchStations(query, requestController.signal));
    } catch (error) {
      if (requestController.signal.aborted) return;
      suggestions.innerHTML = `<div class="suggestion-empty">${error?.message ?? 'Suche derzeit nicht verfügbar'}</div>`;
    }
  });

  input.addEventListener('input', () => {
    state.stations[key] = null;
    delete input.dataset.stationId;
    load();
  });
  input.addEventListener('focus', () => {
    if (items.length && input.value.trim().length >= 2) render(items);
  });
  input.addEventListener('keydown', (event) => {
    if (suggestions.hidden) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activate(Math.min(items.length - 1, activeIndex + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activate(Math.max(0, activeIndex - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      select(items[activeIndex]);
    } else if (event.key === 'Escape') {
      close();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest(`[data-station-field="${key}"]`)) close();
  });

  return { select, close };
}

const stationFields = {
  from: setupStationAutocomplete('from'),
  to: setupStationAutocomplete('to'),
};

function formatTime(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? formatter.time.format(date) : '–';
}

function formatDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? formatter.date.format(date) : '';
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return '–';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return `${hours} h${rest ? ` ${rest} min` : ''}`;
}

function transferLabel(count) {
  if (count === 0) return 'Direkt';
  return `${count}× Umstieg`;
}

function journeyMeasurement(journey) {
  if (!state.measurements.has(journey)) state.measurements.set(journey, measureJourney(journey));
  return state.measurements.get(journey);
}

function journeyTrainLabels(journey) {
  return (journey?.legs ?? [])
    .filter(isRailLeg)
    .map(railLegLabel)
    .filter((label, index, all) => index === 0 || label !== all[index - 1]);
}

function renderResults() {
  elements.resultsList.replaceChildren();
  elements.resultCount.textContent = String(state.journeys.length);

  state.journeys.forEach((journey, index) => {
    const measurement = journeyMeasurement(journey);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'journey-card';
    card.dataset.index = String(index);
    card.setAttribute('aria-pressed', index === state.selectedIndex ? 'true' : 'false');

    const top = document.createElement('div');
    top.className = 'journey-card-top';
    const times = document.createElement('div');
    times.className = 'journey-times';
    const timeStrong = document.createElement('strong');
    timeStrong.textContent = `${formatTime(journeyDeparture(journey))} – ${formatTime(journeyArrival(journey))}`;
    const dateSpan = document.createElement('span');
    dateSpan.textContent = formatDate(journeyDeparture(journey));
    times.append(timeStrong, dateSpan);
    const distance = document.createElement('strong');
    distance.className = 'journey-distance';
    distance.textContent = formatDistance(measurement.distanceMeters, measurement.approximate);
    top.append(times, distance);

    const trainRow = document.createElement('div');
    trainRow.className = 'train-row';
    journeyTrainLabels(journey).forEach((label) => {
      const chip = document.createElement('span');
      chip.className = 'train-chip';
      chip.textContent = label;
      trainRow.append(chip);
    });

    const meta = document.createElement('div');
    meta.className = 'journey-meta';
    const duration = document.createElement('span');
    duration.textContent = formatDuration(journeyDurationMinutes(journey));
    const transfers = document.createElement('span');
    transfers.textContent = transferLabel(journeyTransfers(journey));
    meta.append(duration, transfers);

    card.append(top, trainRow, meta);
    card.addEventListener('click', () => selectJourney(index, true));
    elements.resultsList.append(card);
  });
}

function makeMarkerIcon(kind, label = '') {
  return window.L.divIcon({
    className: `route-marker route-marker-${kind}`,
    html: `<span>${label}</span>`,
    iconSize: kind === 'transfer' ? [22, 22] : [28, 28],
    iconAnchor: kind === 'transfer' ? [11, 11] : [14, 14],
  });
}

function addStationMarker(layer, place, kind, label = '') {
  const coordinates = coordinatesOf(place);
  if (!coordinates) return;
  const marker = window.L.marker(coordinates, {
    icon: makeMarkerIcon(kind, label),
    keyboard: false,
  });
  if (place?.name) marker.bindTooltip(place.name, { direction: 'top', offset: [0, -10] });
  marker.addTo(layer);
}

function fitSelectedRoute() {
  if (!state.map || !state.routeBounds?.isValid()) return;
  const mobile = window.matchMedia('(max-width: 820px)').matches;
  state.map.fitBounds(state.routeBounds, {
    paddingTopLeft: mobile ? [28, 90] : [55, 55],
    paddingBottomRight: mobile ? [28, 210] : [55, 180],
    maxZoom: 12,
    animate: true,
  });
}

function selectJourney(index, userInitiated = false) {
  const journey = state.journeys[index];
  if (!journey) return;
  state.selectedIndex = index;
  const measurement = journeyMeasurement(journey);
  const railLegs = (journey.legs ?? []).filter(isRailLeg);

  if (state.map) {
    const L = window.L;
    if (state.routeLayer) state.map.removeLayer(state.routeLayer);
    state.routeLayer = L.featureGroup().addTo(state.map);

    measurement.segments.forEach((segment) => {
      L.polyline(segment.points, {
        color: '#fff7eb',
        weight: 11,
        opacity: 0.92,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(state.routeLayer);
      const routeLine = L.polyline(segment.points, {
        color: segment.approximate ? '#ba5b46' : '#d83a2e',
        weight: 6,
        opacity: 0.98,
        dashArray: segment.approximate ? '9 8' : null,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(state.routeLayer);
      routeLine.bindTooltip(
        `${railLegLabel(segment.leg)} · ${formatDistance(segment.distanceMeters, segment.approximate)}`,
        { sticky: true },
      );
    });

    if (railLegs.length) {
      addStationMarker(state.routeLayer, railLegs[0].origin, 'start', 'A');
      railLegs.slice(0, -1).forEach((leg) => addStationMarker(state.routeLayer, leg.destination, 'transfer'));
      addStationMarker(state.routeLayer, railLegs.at(-1).destination, 'destination', 'B');
    }

    state.routeBounds = measurement.allPoints.length >= 2 ? L.latLngBounds(measurement.allPoints) : null;
    elements.fitRouteButton.disabled = !state.routeBounds;
    fitSelectedRoute();
  }

  elements.routeSummary.hidden = false;
  elements.summaryLabel.textContent = `Verbindung ${index + 1} von ${state.journeys.length}`;
  elements.summaryTitle.textContent = `${state.stations.from?.name ?? 'Start'} → ${state.stations.to?.name ?? 'Ziel'}`;
  elements.summaryDistance.textContent = formatDistance(measurement.distanceMeters, measurement.approximate);
  elements.summaryDuration.textContent = formatDuration(journeyDurationMinutes(journey));
  elements.summaryTransfers.textContent = String(journeyTransfers(journey));
  elements.summaryNote.hidden = !measurement.approximate;
  elements.summaryNote.textContent = measurement.approximate
    ? 'Für mindestens einen Abschnitt fehlte eine vollständige Gleisgeometrie. Die gestrichelte Strecke und die Distanz sind daher angenähert.'
    : '';

  [...elements.resultsList.children].forEach((card, cardIndex) => {
    const selected = cardIndex === index;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });

  if (userInitiated && window.matchMedia('(max-width: 820px)').matches) {
    document.querySelector('.map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function runSearch() {
  const from = state.stations.from;
  const to = state.stations.to;
  const departureValue = elements.departureInput.value;

  if (!from || !to) {
    setMessage('Bitte wähle Start und Ziel aus den Bahnhofsvorschlägen aus.', 'error');
    return;
  }
  if (from.id === to.id) {
    setMessage('Start und Ziel müssen unterschiedlich sein.', 'error');
    return;
  }
  if (!departureValue || Number.isNaN(new Date(departureValue).getTime())) {
    setMessage('Bitte wähle eine gültige Abfahrtszeit.', 'error');
    return;
  }

  state.searchController?.abort();
  const requestController = new AbortController();
  state.searchController = requestController;
  setLoading(true);
  setMessage('Verbindungen und Gleisverläufe werden geladen …');

  try {
    const journeys = await fetchJourneys({
      fromId: from.id,
      toId: to.id,
      departure: new Date(departureValue).toISOString(),
    }, requestController.signal);

    state.journeys = journeys
      .filter((journey) => (journey?.legs ?? []).some(isRailLeg))
      .sort((a, b) => Date.parse(journeyDeparture(a)) - Date.parse(journeyDeparture(b)));
    state.selectedIndex = null;
    state.measurements = new WeakMap();

    if (!state.journeys.length) {
      elements.resultsSection.hidden = true;
      elements.emptyState.hidden = false;
      elements.routeSummary.hidden = true;
      setMessage('Für diese Auswahl wurden keine Bahnverbindungen gefunden.', 'error');
      return;
    }

    elements.emptyState.hidden = true;
    elements.resultsSection.hidden = false;
    setMessage();
    renderResults();
    selectJourney(0);
  } catch (error) {
    if (requestController.signal.aborted) return;
    setMessage(error?.message ?? 'Die Verbindungssuche ist fehlgeschlagen.', 'error');
  } finally {
    if (state.searchController === requestController) setLoading(false);
  }
}

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  runSearch();
});

elements.swapButton.addEventListener('click', () => {
  const from = state.stations.from;
  const to = state.stations.to;
  const fromValue = elements.fromInput.value;
  const toValue = elements.toInput.value;
  state.stations.from = to;
  state.stations.to = from;
  elements.fromInput.value = to?.name ?? toValue;
  elements.toInput.value = from?.name ?? fromValue;
});

elements.exampleButton.addEventListener('click', async () => {
  elements.exampleButton.disabled = true;
  setMessage('Beispielbahnhöfe werden geladen …');
  try {
    const [fromMatches, toMatches] = await Promise.all([
      searchStations('Berlin Hbf'),
      searchStations('Hamburg Hbf'),
    ]);
    const from = fromMatches.find((station) => station.name === 'Berlin Hbf') ?? fromMatches[0];
    const to = toMatches.find((station) => station.name === 'Hamburg Hbf') ?? toMatches[0];
    if (!from || !to) throw new Error('Die Beispielbahnhöfe wurden nicht gefunden.');
    stationFields.from.select(from);
    stationFields.to.select(to);
    await runSearch();
  } catch (error) {
    setMessage(error?.message ?? 'Das Beispiel konnte nicht geladen werden.', 'error');
  } finally {
    elements.exampleButton.disabled = false;
  }
});

elements.railwayLayerToggle.addEventListener('change', () => {
  if (!state.map || !state.railwayTiles) return;
  if (elements.railwayLayerToggle.checked) state.railwayTiles.addTo(state.map);
  else state.map.removeLayer(state.railwayTiles);
});

elements.fitRouteButton.addEventListener('click', fitSelectedRoute);
window.addEventListener('resize', debounce(() => state.map?.invalidateSize(), 120));

setDefaultDeparture();
initMap();
