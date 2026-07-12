import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDistance,
  haversineMeters,
  isRailLeg,
  measureJourney,
  polylineToLatLngs,
  sliceTripPolylineForLeg,
} from '../src/route-utils.js';

test('converts HAFAS GeoJSON point collections to Leaflet coordinates', () => {
  const points = polylineToLatLngs({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [13.3694, 52.5251] } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [10.0069, 53.5527] } },
    ],
  });

  assert.deepEqual(points, [[52.5251, 13.3694], [53.5527, 10.0069]]);
});

test('recognises rail legs and ignores walking legs', () => {
  assert.equal(isRailLeg({ line: { mode: 'train', product: 'nationalExpress' } }), true);
  assert.equal(isRailLeg({ walking: true, line: { mode: 'train' } }), false);
  assert.equal(isRailLeg({ line: { mode: 'bus', product: 'bus' } }), false);
});

test('measures a journey along its detailed polyline', () => {
  const journey = {
    legs: [{
      line: { mode: 'train', name: 'ICE 100' },
      polyline: {
        type: 'FeatureCollection',
        features: [
          { geometry: { type: 'Point', coordinates: [13.0, 52.0] } },
          { geometry: { type: 'Point', coordinates: [13.5, 52.0] } },
          { geometry: { type: 'Point', coordinates: [14.0, 52.0] } },
        ],
      },
    }],
  };

  const result = measureJourney(journey);
  assert.equal(result.approximate, false);
  assert.equal(result.segments.length, 1);
  assert.ok(result.distanceMeters > 68_000 && result.distanceMeters < 69_000);
});

test('slices a complete trip polyline to the selected journey leg', () => {
  const polyline = {
    type: 'FeatureCollection',
    features: [
      { geometry: { type: 'Point', coordinates: [10, 50] } },
      { geometry: { type: 'Point', coordinates: [11, 51] } },
      { geometry: { type: 'Point', coordinates: [12, 52] } },
      { geometry: { type: 'Point', coordinates: [13, 53] } },
    ],
  };

  const points = sliceTripPolylineForLeg(
    polyline,
    { location: { latitude: 51, longitude: 11 } },
    { location: { latitude: 53, longitude: 13 } },
  );

  assert.deepEqual(points, [[51, 11], [52, 12], [53, 13]]);
});

test('uses stopovers for a better approximate route', () => {
  const journey = {
    legs: [{
      line: { mode: 'train', product: 'regional' },
      origin: { location: { latitude: 52, longitude: 13 } },
      stopovers: [{ stop: { location: { latitude: 52.5, longitude: 13.5 } } }],
      destination: { location: { latitude: 53, longitude: 13 } },
    }],
  };

  const result = measureJourney(journey);
  assert.equal(result.approximate, true);
  assert.equal(result.segments[0].points.length, 3);
  assert.ok(result.distanceMeters > 120_000);
});

test('formats long and short route lengths for German UI', () => {
  assert.equal(formatDistance(12_340, false), '12,3 km');
  assert.equal(formatDistance(289_700, true), 'ca. 290 km');
  assert.equal(formatDistance(0, false), '–');
  assert.ok(haversineMeters([52, 13], [52, 13]) === 0);
});
