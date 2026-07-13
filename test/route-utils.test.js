import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDistance, haversineMeters, measureJourney, simplifyPoints } from '../src/route-utils.js';

test('measures detailed rail geometry', () => {
  const journey = { legs: [{ line: { mode: 'train', name: 'ICE 100' }, points: [[52, 13], [52, 13.5], [52, 14]], origin: { name: 'A', location: { latitude: 52, longitude: 13 } }, destination: { name: 'B', location: { latitude: 52, longitude: 14 } } }] };
  const result = measureJourney(journey);
  assert.equal(result.approximate, false);
  assert.equal(result.segments.length, 1);
  assert.ok(result.distanceMeters > 68_000 && result.distanceMeters < 69_000);
});

test('simplifies nearly straight routes but keeps endpoints', () => {
  const points = [[52, 13], [52.00001, 13.25], [52, 13.5], [52, 14]];
  const simplified = simplifyPoints(points, 20);
  assert.deepEqual(simplified[0], points[0]);
  assert.deepEqual(simplified.at(-1), points.at(-1));
  assert.ok(simplified.length < points.length);
});

test('formats route distances', () => {
  assert.equal(formatDistance(12_340, false), '12,3 km');
  assert.equal(formatDistance(289_700, true), 'ca. 290 km');
  assert.equal(formatDistance(0, false), '–');
  assert.equal(haversineMeters([52, 13], [52, 13]), 0);
});
