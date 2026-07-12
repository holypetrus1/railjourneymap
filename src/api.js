const API_BASE_URL = 'https://v6.db.transport.rest';
const REQUEST_TIMEOUT_MS = 20_000;
const TRIP_GEOMETRY_CONCURRENCY = 3;

export class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function fetchJson(path, params = {}, externalSignal) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromOutside = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromOutside, { once: true });

  const url = new URL(path, API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
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
      throw new ApiError(`Die Datenquelle antwortet mit Status ${response.status}.`, response.status);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      throw new ApiError('Die Datenquelle hat keine gültigen Bahndaten geliefert.');
    }

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (externalSignal?.aborted) throw error;
      throw new ApiError('Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('Die Bahndaten konnten nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.');
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromOutside);
  }
}

export async function searchStations(query, signal) {
  const normalized = query.trim();
  if (normalized.length < 2) return [];

  // Use the local DB station index instead of consuming the heavily
  // rate-limited journey backend for every autocomplete keystroke.
  const stations = await fetchJson('/stations', {
    query: normalized,
    limit: 8,
    fuzzy: true,
    completion: true,
  }, signal);

  return Object.values(stations ?? {})
    .filter((station) => station?.id && station?.name && station?.location)
    .slice(0, 8);
}

async function fetchTrip(tripId, signal) {
  const data = await fetchJson(`/trips/${encodeURIComponent(tripId)}`, {
    stopovers: true,
    remarks: false,
    polyline: true,
    language: 'de',
    profile: 'dbnav',
    pretty: false,
  }, signal);

  return data?.trip ?? data;
}

async function addTripPolylines(journeys, signal) {
  const targetsByTripId = new Map();

  for (const journey of journeys) {
    for (const leg of journey?.legs ?? []) {
      if (!leg?.tripId || leg.walking || leg.line?.mode !== 'train') continue;
      const targets = targetsByTripId.get(leg.tripId) ?? [];
      targets.push(leg);
      targetsByTripId.set(leg.tripId, targets);
    }
  }

  const queue = [...targetsByTripId.entries()];
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const [tripId, legs] = queue.shift();
      try {
        const trip = await fetchTrip(tripId, signal);
        if (!trip?.polyline) continue;
        legs.forEach((leg) => {
          leg.tripPolyline = trip.polyline;
        });
      } catch (error) {
        // Missing trip geometry must not make the connection search fail.
        // The UI falls back to stopover coordinates and marks the result as
        // approximate.
        if (signal?.aborted) return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(TRIP_GEOMETRY_CONCURRENCY, queue.length) }, worker),
  );
}

export async function fetchJourneys({ fromId, toId, departure }, signal) {
  const data = await fetchJson('/journeys', {
    from: fromId,
    to: toId,
    departure,
    results: 6,
    transfers: 4,
    stopovers: true,
    startWithWalking: false,
    notOnlyFastRoutes: true,
    remarks: false,
    subStops: false,
    entrances: false,
    language: 'de',
    profile: 'dbnav',
    nationalExpress: true,
    national: true,
    regionalExpress: true,
    regional: true,
    suburban: true,
    bus: false,
    tram: false,
    subway: false,
    ferry: false,
    taxi: false,
    pretty: false,
  }, signal);

  const journeys = Array.isArray(data?.journeys) ? data.journeys : [];
  await addTripPolylines(journeys, signal);
  return journeys;
}
