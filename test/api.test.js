import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanParams, decodePolyline, journeyFromMotis } from '../src/api.js';

test('decodes a Google polyline', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

test('adds up to two via stops to MOTIS planning parameters', () => {
  const params = buildPlanParams({ fromId: 'A', toId: 'D', viaIds: ['B', 'C', 'IGNORED'], departure: '2026-07-13T08:00:00+02:00' });
  assert.deepEqual(params.via, ['B', 'C']);
  assert.deepEqual(params.viaMinimumStay, [0, 0]);
  assert.equal(params.fromPlace, 'A');
  assert.equal(params.toPlace, 'D');
});

test('adapts MOTIS rail legs', () => {
  const journey = journeyFromMotis({ transfers: 0, duration: 3600, legs: [{ mode: 'HIGHSPEED_RAIL', displayName: 'ICE 100', from: { stopId: 'A', name: 'A', lat: 52, lon: 13 }, to: { stopId: 'B', name: 'B', lat: 53, lon: 13 }, legGeometry: { points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', precision: 5 } }] });
  assert.equal(journey.legs[0].line.mode, 'train');
  assert.equal(journey.legs[0].line.name, 'ICE 100');
  assert.equal(journey.legs[0].points.length, 3);
});
