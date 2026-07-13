const EARTH_RADIUS_METERS = 6_371_008.8;

export function coordinatesOf(place) {
  const location = place?.location ?? place;
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return [latitude, longitude];
}

export function polylineToLatLngs(polyline) {
  if (Array.isArray(polyline)) {
    return polyline
      .map((point) => Array.isArray(point) ? point.map(Number) : null)
      .filter((point) => point?.length >= 2 && point.every(Number.isFinite));
  }
  if (!polyline || polyline.type !== 'FeatureCollection' || !Array.isArray(polyline.features)) return [];
  return polyline.features
    .map((feature) => {
      const coordinates = feature?.geometry?.coordinates;
      if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) return null;
      const [longitude, latitude] = coordinates.map(Number);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return [latitude, longitude];
    })
    .filter(Boolean);
}

export function isRailLeg(leg) {
  if (!leg || leg.walking) return false;
  if (leg.line?.mode === 'train') return true;
  return ['nationalExpress', 'national', 'regionalExpress', 'regional', 'suburban'].includes(leg.line?.product);
}

export function haversineMeters(a, b) {
  if (!a || !b) return 0;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const [lat1, lon1] = a.map(toRadians);
  const [lat2, lon2] = b.map(toRadians);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathDistanceMeters(points) {
  return points.reduce((sum, point, index) => index === 0 ? sum : sum + haversineMeters(points[index - 1], point), 0);
}

function projectMeters(point, referenceLatitude) {
  const radians = (referenceLatitude * Math.PI) / 180;
  return [point[1] * 111_320 * Math.cos(radians), point[0] * 110_540];
}

function pointToSegmentDistanceMeters(point, start, end) {
  const referenceLatitude = (point[0] + start[0] + end[0]) / 3;
  const p = projectMeters(point, referenceLatitude);
  const a = projectMeters(start, referenceLatitude);
  const b = projectMeters(end, referenceLatitude);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function simplifyPoints(points, toleranceMeters = 18) {
  if (!Array.isArray(points) || points.length <= 2) return Array.isArray(points) ? [...points] : [];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [startIndex, endIndex] = stack.pop();
    let maxDistance = 0;
    let maxIndex = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = pointToSegmentDistanceMeters(points[index], points[startIndex], points[endIndex]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxIndex >= 0 && maxDistance > toleranceMeters) {
      keep[maxIndex] = 1;
      stack.push([startIndex, maxIndex], [maxIndex, endIndex]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function uniquePoints(points) {
  return points.filter((point, index) => {
    if (!point) return false;
    if (index === 0) return true;
    const previous = points[index - 1];
    return !previous || point[0] !== previous[0] || point[1] !== previous[1];
  });
}

function stopoverPoints(leg) {
  return uniquePoints([
    coordinatesOf(leg?.origin),
    ...(leg?.stopovers ?? []).map((stopover) => coordinatesOf(stopover?.stop ?? stopover)),
    coordinatesOf(leg?.destination),
  ].filter(Boolean));
}

export function legGeometry(leg) {
  const directPoints = polylineToLatLngs(leg?.points ?? leg?.polyline);
  if (directPoints.length >= 2) return { points: directPoints, approximate: false };
  const fallback = stopoverPoints(leg);
  return { points: fallback, approximate: fallback.length >= 2 };
}

export function measureJourney(journey) {
  const segments = (journey?.legs ?? [])
    .filter(isRailLeg)
    .map((leg) => {
      const geometry = legGeometry(leg);
      return { leg, points: geometry.points, approximate: geometry.approximate, distanceMeters: pathDistanceMeters(geometry.points) };
    })
    .filter((segment) => segment.points.length >= 2);
  return {
    segments,
    distanceMeters: segments.reduce((sum, segment) => sum + segment.distanceMeters, 0),
    approximate: segments.some((segment) => segment.approximate),
    allPoints: segments.flatMap((segment) => segment.points),
  };
}

export function journeyDeparture(journey) {
  const leg = journey?.legs?.find((item) => item.departure || item.plannedDeparture);
  return leg?.departure ?? leg?.plannedDeparture ?? null;
}

export function journeyArrival(journey) {
  const leg = [...(journey?.legs ?? [])].reverse().find((item) => item.arrival || item.plannedArrival);
  return leg?.arrival ?? leg?.plannedArrival ?? null;
}

export function journeyDurationMinutes(journey) {
  if (Number.isFinite(Number(journey?.durationMinutes))) return Number(journey.durationMinutes);
  const departure = Date.parse(journeyDeparture(journey));
  const arrival = Date.parse(journeyArrival(journey));
  if (!Number.isFinite(departure) || !Number.isFinite(arrival)) return null;
  return Math.max(0, Math.round((arrival - departure) / 60_000));
}

export function journeyTransfers(journey) {
  if (Number.isFinite(Number(journey?.transfers))) return Math.max(0, Number(journey.transfers));
  return Math.max(0, (journey?.legs ?? []).filter(isRailLeg).length - 1);
}

export function railLegLabel(leg) {
  return leg?.line?.name ?? leg?.line?.fahrtNr ?? leg?.line?.productName ?? 'Zug';
}

export function journeyTrainLabels(journey) {
  return (journey?.legs ?? []).filter(isRailLeg).map(railLegLabel).filter((label, index, all) => index === 0 || label !== all[index - 1]);
}

export function journeyStops(journey) {
  const stops = [];
  const add = (place) => {
    if (!place?.name || stops.at(-1)?.name === place.name) return;
    stops.push({
      id: place.id ?? null,
      name: place.name,
      location: place.location ? { latitude: Number(place.location.latitude), longitude: Number(place.location.longitude) } : null,
    });
  };
  for (const leg of (journey?.legs ?? []).filter(isRailLeg)) {
    add(leg.origin);
    (leg.stopovers ?? []).forEach((stopover) => add(stopover?.stop ?? stopover));
    add(leg.destination);
  }
  return stops;
}

export function formatDistance(distanceMeters, approximate = false) {
  if (!Number.isFinite(Number(distanceMeters)) || Number(distanceMeters) <= 0) return '–';
  const kilometers = Number(distanceMeters) / 1000;
  const rounded = kilometers >= 100 ? Math.round(kilometers) : Math.round(kilometers * 10) / 10;
  return `${approximate ? 'ca. ' : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: kilometers >= 100 ? 0 : 1 }).format(rounded)} km`;
}
