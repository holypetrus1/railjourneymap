const API_BASE_URL = 'https://api.transitous.org/api/';
const REQUEST_TIMEOUT_MS = 25_000;
const RAIL_MODES = new Set([
  'HIGHSPEED_RAIL',
  'LONG_DISTANCE',
  'NIGHT_RAIL',
  'REGIONAL_FAST_RAIL',
  'REGIONAL_RAIL',
  'SUBURBAN',
]);
const REQUESTED_RAIL_MODES = [...RAIL_MODES].join(',');

export class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function fetchJson(path, params, externalSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const abortFromOutside = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromOutside, { once: true });

  const url = new URL(path, API_BASE_URL);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = typeof body?.error === 'string' ? ` ${body.error}` : '';
      } catch {
        // A non-JSON error body is not useful to the UI.
      }
      throw new ApiError(
        `Der Routingdienst antwortet mit Status ${response.status}.${detail}`.trim(),
        response.status,
      );
    }

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (externalSignal?.aborted && !timedOut) throw error;
      throw new ApiError('Die Anfrage an den Routingdienst hat zu lange gedauert.');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      'Der Routingdienst Transitous konnte nicht erreicht werden. Bitte versuche es später erneut.',
    );
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromOutside);
  }
}

function hasRailMode(modes) {
  return Array.isArray(modes) && modes.some((mode) => RAIL_MODES.has(mode));
}

function stationFromMatch(match) {
  return {
    type: 'station',
    id: match.id,
    name: match.name,
    location: {
      type: 'location',
      latitude: Number(match.lat),
      longitude: Number(match.lon),
    },
    modes: match.modes ?? [],
  };
}

export async function searchStations(query, signal) {
  const normalized = query.trim();
  if (normalized.length < 2) return [];

  const matches = await fetchJson('v1/geocode', {
    text: normalized,
    type: 'STOP',
    mode: 'RAIL',
    language: 'de',
    numResults: 8,
  }, signal);

  return (Array.isArray(matches) ? matches : [])
    .filter((match) => match?.type === 'STOP')
    .filter((match) => match?.id && match?.name)
    .filter((match) => Number.isFinite(Number(match?.lat)) && Number.isFinite(Number(match?.lon)))
    .filter((match) => !Array.isArray(match.modes) || hasRailMode(match.modes))
    .map(stationFromMatch)
    .slice(0, 8);
}

export function decodePolyline(encoded, precision = 6) {
  if (typeof encoded !== 'string' || !encoded.length) return [];

  const factor = 10 ** Number(precision || 6);
  const points = [];
  let latitude = 0;
  let longitude = 0;
  let index = 0;

  const readDelta = () => {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      if (index >= encoded.length) throw new Error('Unvollständige Polyline');
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return (result & 1) ? ~(result >> 1) : (result >> 1);
  };

  try {
    while (index < encoded.length) {
      latitude += readDelta();
      longitude += readDelta();
      points.push([latitude / factor, longitude / factor]);
    }
  } catch {
    return [];
  }

  return points;
}

function featureCollectionFromGeometry(geometry) {
  const points = decodePolyline(geometry?.points, geometry?.precision ?? 6);
  if (points.length < 2) return null;

  return {
    type: 'FeatureCollection',
    features: points.map(([latitude, longitude]) => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
    })),
  };
}

function placeFromMotis(place) {
  if (!place) return null;
  return {
    type: 'stop',
    id: place.stopId ?? null,
    name: place.name ?? 'Unbekannter Halt',
    location: {
      type: 'location',
      latitude: Number(place.lat),
      longitude: Number(place.lon),
    },
  };
}

function productFromMode(mode) {
  if (mode === 'HIGHSPEED_RAIL') return 'nationalExpress';
  if (['LONG_DISTANCE', 'NIGHT_RAIL'].includes(mode)) return 'national';
  if (mode === 'SUBURBAN') return 'suburban';
  if (mode === 'REGIONAL_FAST_RAIL') return 'regionalExpress';
  return 'regional';
}

function lineName(leg) {
  return leg?.displayName
    || leg?.routeShortName
    || leg?.tripShortName
    || leg?.category?.shortName
    || leg?.category?.name
    || 'Zug';
}

function stopoverFromPlace(place) {
  const stop = placeFromMotis(place);
  return {
    stop,
    arrival: place?.arrival ?? null,
    departure: place?.departure ?? null,
    plannedArrival: place?.scheduledArrival ?? null,
    plannedDeparture: place?.scheduledDeparture ?? null,
  };
}

function legFromMotis(leg) {
  const rail = RAIL_MODES.has(leg?.mode);
  return {
    origin: placeFromMotis(leg?.from),
    destination: placeFromMotis(leg?.to),
    departure: leg?.startTime ?? null,
    plannedDeparture: leg?.scheduledStartTime ?? null,
    arrival: leg?.endTime ?? null,
    plannedArrival: leg?.scheduledEndTime ?? null,
    walking: !rail,
    tripId: leg?.tripId ?? null,
    line: rail ? {
      type: 'line',
      mode: 'train',
      product: productFromMode(leg.mode),
      name: lineName(leg),
      productName: leg?.category?.name ?? leg?.mode,
    } : {
      type: 'line',
      mode: String(leg?.mode ?? 'walk').toLowerCase(),
      product: String(leg?.mode ?? 'walk').toLowerCase(),
      name: leg?.mode === 'WALK' ? 'Fußweg' : String(leg?.mode ?? 'Transfer'),
    },
    stopovers: (leg?.intermediateStops ?? []).map(stopoverFromPlace),
    polyline: rail ? featureCollectionFromGeometry(leg?.legGeometry) : null,
  };
}

export function journeyFromMotis(itinerary) {
  return {
    legs: (itinerary?.legs ?? []).map(legFromMotis),
    transfers: Number.isFinite(Number(itinerary?.transfers))
      ? Number(itinerary.transfers)
      : null,
    duration: Number(itinerary?.duration) || null,
  };
}

export async function fetchJourneys({ fromId, toId, departure }, signal) {
  const data = await fetchJson('v6/plan', {
    fromPlace: fromId,
    toPlace: toId,
    time: departure,
    arriveBy: false,
    maxTransfers: 4,
    transitModes: REQUESTED_RAIL_MODES,
    detailedLegs: true,
    detailedTransfers: false,
    useRoutedTransfers: false,
    timetableView: true,
    searchWindow: 7200,
    numItineraries: 6,
    maxItineraries: 8,
    language: 'de',
  }, signal);

  return (Array.isArray(data?.itineraries) ? data.itineraries : [])
    .map(journeyFromMotis)
    .filter((journey) => journey.legs.some((leg) => leg.line?.mode === 'train'));
}
