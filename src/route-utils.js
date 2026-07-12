const EARTH_RADIUS_METERS = 6_371_008.8;

export function coordinatesOf(place) {
  const location = place?.location ?? place;
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return [latitude, longitude];
}

export function polylineToLatLngs(polyline) {
  if (!polyline || polyline.type !== 'FeatureCollection' || !Array.isArray(polyline.features)) {
    return [];
  }

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

  return [
    'nationalExpress',
    'national',
    'regionalExpress',
    'regional',
    'suburban',
  ].includes(leg.line?.product);
}

function nearestPointIndex(points, target, startIndex = 0, endIndex = points.length) {
  if (!target || !points.length) return -1;
  let bestIndex = -1;
  let bestDistance = Infinity;

  for (let index = startIndex; index < endIndex; index += 1) {
    const distance = haversineMeters(points[index], target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export function sliceTripPolylineForLeg(polyline, originPlace, destinationPlace) {
  const points = polylineToLatLngs(polyline);
  const origin = coordinatesOf(originPlace);
  const destination = coordinatesOf(destinationPlace);
  if (points.length < 2 || !origin || !destination) return [];

  const originIndex = nearestPointIndex(points, origin);
  const forwardDestinationIndex = nearestPointIndex(points, destination, Math.max(0, originIndex));

  if (originIndex >= 0 && forwardDestinationIndex > originIndex) {
    return points.slice(originIndex, forwardDestinationIndex + 1);
  }

  const destinationIndex = nearestPointIndex(points, destination);
  if (destinationIndex >= 0 && destinationIndex < originIndex) {
    return points.slice(destinationIndex, originIndex + 1).reverse();
  }

  return [];
}

function stopoverPoints(leg) {
  const candidates = [
    coordinatesOf(leg?.origin),
    ...(leg?.stopovers ?? []).map((stopover) => coordinatesOf(stopover?.stop ?? stopover)),
    coordinatesOf(leg?.destination),
  ].filter(Boolean);

  return candidates.filter((point, index) => {
    if (index === 0) return true;
    const previous = candidates[index - 1];
    return point[0] !== previous[0] || point[1] !== previous[1];
  });
}

export function legGeometry(leg) {
  const detailed = polylineToLatLngs(leg?.polyline);
  if (detailed.length >= 2) {
    return { points: detailed, approximate: false };
  }

  const tripDetailed = sliceTripPolylineForLeg(
    leg?.tripPolyline,
    leg?.origin,
    leg?.destination,
  );
  if (tripDetailed.length >= 2) {
    return { points: tripDetailed, approximate: false };
  }

  const fallback = stopoverPoints(leg);
  return { points: fallback, approximate: fallback.length >= 2 };
}

export function haversineMeters(a, b) {
  if (!a || !b) return 0;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const [lat1, lon1] = a.map(toRadians);
  const [lat2, lon2] = b.map(toRadians);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathDistanceMeters(points) {
  return points.reduce((sum, point, index) => {
    if (index === 0) return sum;
    return sum + haversineMeters(points[index - 1], point);
  }, 0);
}

export function measureJourney(journey) {
  const railLegs = (journey?.legs ?? []).filter(isRailLeg);
  const segments = railLegs
    .map((leg) => {
      const geometry = legGeometry(leg);
      return {
        leg,
        points: geometry.points,
        approximate: geometry.approximate,
        distanceMeters: pathDistanceMeters(geometry.points),
      };
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
  return journey?.legs?.find((leg) => leg.departure || leg.plannedDeparture)?.departure
    ?? journey?.legs?.find((leg) => leg.plannedDeparture)?.plannedDeparture
    ?? null;
}

export function journeyArrival(journey) {
  const legs = journey?.legs ?? [];
  const leg = [...legs].reverse().find((item) => item.arrival || item.plannedArrival);
  return leg?.arrival ?? leg?.plannedArrival ?? null;
}

export function journeyDurationMinutes(journey) {
  const departure = Date.parse(journeyDeparture(journey));
  const arrival = Date.parse(journeyArrival(journey));
  if (!Number.isFinite(departure) || !Number.isFinite(arrival)) return null;
  return Math.max(0, Math.round((arrival - departure) / 60_000));
}

export function journeyTransfers(journey) {
  if (Number.isFinite(Number(journey?.transfers))) {
    return Math.max(0, Number(journey.transfers));
  }
  return Math.max(0, (journey?.legs ?? []).filter(isRailLeg).length - 1);
}

export function railLegLabel(leg) {
  return leg?.line?.name
    ?? leg?.line?.fahrtNr
    ?? leg?.line?.productName
    ?? 'Zug';
}

export function formatDistance(distanceMeters, approximate = false) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return '–';
  const kilometers = distanceMeters / 1000;
  const rounded = kilometers >= 100 ? Math.round(kilometers) : Math.round(kilometers * 10) / 10;
  return `${approximate ? 'ca. ' : ''}${new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: kilometers >= 100 ? 0 : 1,
  }).format(rounded)} km`;
}
