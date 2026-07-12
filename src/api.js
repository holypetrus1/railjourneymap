const API_BASE_URL = 'https://v6.db.transport.rest';
const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function fetchJson(path, params, externalSignal) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('Die Bahndaten konnten nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.');
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromOutside);
  }
}

export async function searchStations(query, signal) {
  const normalized = query.trim();
  if (normalized.length < 2) return [];

  const locations = await fetchJson('/locations', {
    query: normalized,
    results: 8,
    stops: true,
    addresses: false,
    poi: false,
    linesOfStops: false,
    language: 'de',
    pretty: false,
  }, signal);

  return (Array.isArray(locations) ? locations : [])
    .filter((location) => ['stop', 'station'].includes(location?.type))
    .filter((location) => location?.id && location?.name && location?.location)
    .slice(0, 8);
}

export async function fetchJourneys({ fromId, toId, departure }, signal) {
  const data = await fetchJson('/journeys', {
    from: fromId,
    to: toId,
    departure,
    results: 8,
    transfers: 4,
    stopovers: true,
    polylines: true,
    startWithWalking: false,
    notOnlyFastRoutes: true,
    remarks: false,
    subStops: false,
    entrances: false,
    language: 'de',
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

  return Array.isArray(data?.journeys) ? data.journeys : [];
}
