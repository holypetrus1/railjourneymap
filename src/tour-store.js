import {
  journeyArrival,
  journeyDeparture,
  journeyDurationMinutes,
  journeyStops,
  journeyTrainLabels,
  journeyTransfers,
  measureJourney,
  railLegLabel,
  simplifyPoints,
} from './route-utils.js';

export const MAX_SEGMENTS = 10;
export const STORAGE_KEY = 'railjourneymap.tour.v2';

export const COLOR_PALETTE = [
  { value: '#2563eb', label: 'Blau' },
  { value: '#dc2626', label: 'Rot' },
  { value: '#7c3aed', label: 'Lila' },
  { value: '#059669', label: 'Grün' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#0891b2', label: 'Türkis' },
  { value: '#db2777', label: 'Pink' },
  { value: '#374151', label: 'Anthrazit' },
];

export function createEmptyTour() {
  return {
    version: 2,
    title: 'Meine Bahntour',
    segments: [],
    exportSettings: {
      ratio: '16 / 9',
      width: 2560,
      showLegend: true,
      showStops: true,
      showRailwayLayer: true,
    },
  };
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `segment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value) : COLOR_PALETTE[0].value;
}

function compactPlace(place) {
  if (!place?.name) return null;
  return {
    id: place.id ?? null,
    name: place.name,
    location: place.location ? {
      latitude: Number(place.location.latitude),
      longitude: Number(place.location.longitude),
    } : null,
  };
}

export function buildTourSegment(journey, {
  color = COLOR_PALETTE[0].value,
  dayLabel = 'Tag 1',
  viaNames = [],
} = {}) {
  const measurement = measureJourney(journey);
  const railLegs = (journey?.legs ?? []).filter((leg) => leg.line?.mode === 'train');
  if (!railLegs.length || !measurement.segments.length) {
    throw new Error('Diese Verbindung enthält keine speicherbare Bahnstrecke.');
  }

  return {
    id: createId(),
    from: compactPlace(railLegs[0].origin),
    to: compactPlace(railLegs.at(-1).destination),
    viaNames: viaNames.filter(Boolean).slice(0, 2),
    dayLabel: String(dayLabel || 'Tag 1').trim().slice(0, 40) || 'Tag 1',
    color: cleanColor(color),
    departure: journeyDeparture(journey),
    arrival: journeyArrival(journey),
    durationMinutes: journeyDurationMinutes(journey),
    transfers: journeyTransfers(journey),
    distanceMeters: Math.round(measurement.distanceMeters),
    approximate: measurement.approximate,
    trainLabels: journeyTrainLabels(journey),
    stops: journeyStops(journey),
    legs: measurement.segments.map((segment) => ({
      label: railLegLabel(segment.leg),
      origin: compactPlace(segment.leg.origin),
      destination: compactPlace(segment.leg.destination),
      approximate: segment.approximate,
      distanceMeters: Math.round(segment.distanceMeters),
      points: simplifyPoints(segment.points, 16),
    })),
  };
}

function sanitizePlace(place) {
  if (!place?.name) return null;
  const latitude = Number(place?.location?.latitude);
  const longitude = Number(place?.location?.longitude);
  return {
    id: place.id ?? null,
    name: String(place.name),
    location: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null,
  };
}

function sanitizeSegment(segment) {
  const legs = (segment?.legs ?? [])
    .map((leg) => ({
      label: String(leg?.label ?? 'Zug'),
      origin: sanitizePlace(leg?.origin),
      destination: sanitizePlace(leg?.destination),
      approximate: Boolean(leg?.approximate),
      distanceMeters: Math.max(0, Number(leg?.distanceMeters) || 0),
      points: (leg?.points ?? [])
        .map((point) => Array.isArray(point) ? point.map(Number) : null)
        .filter((point) => point?.length >= 2 && point.every(Number.isFinite)),
    }))
    .filter((leg) => leg.points.length >= 2);

  if (!legs.length) return null;
  return {
    id: String(segment?.id || createId()),
    from: sanitizePlace(segment?.from) ?? legs[0].origin,
    to: sanitizePlace(segment?.to) ?? legs.at(-1).destination,
    viaNames: (segment?.viaNames ?? []).map(String).filter(Boolean).slice(0, 2),
    dayLabel: String(segment?.dayLabel || 'Tag 1').trim().slice(0, 40) || 'Tag 1',
    color: cleanColor(segment?.color),
    departure: segment?.departure ?? null,
    arrival: segment?.arrival ?? null,
    durationMinutes: Number.isFinite(Number(segment?.durationMinutes)) ? Number(segment.durationMinutes) : null,
    transfers: Math.max(0, Number(segment?.transfers) || 0),
    distanceMeters: Math.max(0, Number(segment?.distanceMeters) || legs.reduce((sum, leg) => sum + leg.distanceMeters, 0)),
    approximate: Boolean(segment?.approximate || legs.some((leg) => leg.approximate)),
    trainLabels: (segment?.trainLabels ?? []).map(String).filter(Boolean),
    stops: (segment?.stops ?? []).map(sanitizePlace).filter(Boolean),
    legs,
  };
}

export function sanitizeTour(value) {
  const empty = createEmptyTour();
  const segments = (value?.segments ?? []).map(sanitizeSegment).filter(Boolean).slice(0, MAX_SEGMENTS);
  return {
    version: 2,
    title: String(value?.title || empty.title).trim().slice(0, 80) || empty.title,
    segments,
    exportSettings: {
      ratio: ['16 / 9', '4 / 3', '1 / 1', '4 / 5'].includes(value?.exportSettings?.ratio)
        ? value.exportSettings.ratio
        : empty.exportSettings.ratio,
      width: [2560, 3840].includes(Number(value?.exportSettings?.width))
        ? Number(value.exportSettings.width)
        : empty.exportSettings.width,
      showLegend: value?.exportSettings?.showLegend !== false,
      showStops: value?.exportSettings?.showStops !== false,
      showRailwayLayer: value?.exportSettings?.showRailwayLayer !== false,
    },
  };
}

export function loadTour(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? sanitizeTour(JSON.parse(raw)) : createEmptyTour();
  } catch {
    return createEmptyTour();
  }
}

export function saveTour(tour, storage = globalThis.localStorage) {
  const sanitized = sanitizeTour(tour);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (error) {
    throw new Error('Die Tour ist zu groß für den lokalen Speicher. Entferne ein Segment oder reduziere die Tour.');
  }
  return sanitized;
}

export function addSegment(tour, segment) {
  if ((tour?.segments?.length ?? 0) >= MAX_SEGMENTS) {
    throw new Error(`Eine Tour kann höchstens ${MAX_SEGMENTS} Segmente enthalten.`);
  }
  return sanitizeTour({ ...tour, segments: [...(tour?.segments ?? []), segment] });
}

export function updateSegment(tour, segmentId, patch) {
  return sanitizeTour({
    ...tour,
    segments: (tour?.segments ?? []).map((segment) => segment.id === segmentId ? { ...segment, ...patch } : segment),
  });
}

export function removeSegment(tour, segmentId) {
  return sanitizeTour({
    ...tour,
    segments: (tour?.segments ?? []).filter((segment) => segment.id !== segmentId),
  });
}

export function moveSegment(tour, segmentId, direction) {
  const segments = [...(tour?.segments ?? [])];
  const index = segments.findIndex((segment) => segment.id === segmentId);
  const target = index + Number(direction);
  if (index < 0 || target < 0 || target >= segments.length) return sanitizeTour(tour);
  [segments[index], segments[target]] = [segments[target], segments[index]];
  return sanitizeTour({ ...tour, segments });
}

export function tourTotals(tour) {
  const segments = tour?.segments ?? [];
  return {
    segmentCount: segments.length,
    distanceMeters: segments.reduce((sum, segment) => sum + Number(segment.distanceMeters || 0), 0),
    durationMinutes: segments.reduce((sum, segment) => sum + Number(segment.durationMinutes || 0), 0),
    approximate: segments.some((segment) => segment.approximate),
    dayCount: new Set(segments.map((segment) => segment.dayLabel.trim()).filter(Boolean)).size,
  };
}

export function tourGroups(tour) {
  const groups = [];
  const keyToGroup = new Map();
  for (const segment of tour?.segments ?? []) {
    const key = `${segment.dayLabel}\u0000${segment.color}`;
    if (!keyToGroup.has(key)) {
      const group = {
        key,
        label: segment.dayLabel,
        color: segment.color,
        distanceMeters: 0,
        segmentCount: 0,
      };
      keyToGroup.set(key, group);
      groups.push(group);
    }
    const group = keyToGroup.get(key);
    group.distanceMeters += Number(segment.distanceMeters || 0);
    group.segmentCount += 1;
  }
  return groups;
}
