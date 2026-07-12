import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline, journeyFromMotis } from '../src/api.js';

// Google's canonical sample, encoded with precision 5.
test('decodes an encoded Google polyline', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5), [
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453],
  ]);
});

test('adapts a MOTIS itinerary to the app journey format', () => {
  const journey = journeyFromMotis({
    transfers: 0,
    duration: 3600,
    legs: [{
      mode: 'HIGHSPEED_RAIL',
      displayName: 'ICE 100',
      startTime: '2026-07-13T08:00:00+02:00',
      endTime: '2026-07-13T09:00:00+02:00',
      scheduledStartTime: '2026-07-13T08:00:00+02:00',
      scheduledEndTime: '2026-07-13T09:00:00+02:00',
      from: { stopId: 'A', name: 'A', lat: 52, lon: 13 },
      to: { stopId: 'B', name: 'B', lat: 53, lon: 13 },
      legGeometry: {
        points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        precision: 5,
        length: 3,
      },
    }],
  });

  assert.equal(journey.transfers, 0);
  assert.equal(journey.legs[0].line.mode, 'train');
  assert.equal(journey.legs[0].line.product, 'nationalExpress');
  assert.equal(journey.legs[0].line.name, 'ICE 100');
  assert.equal(journey.legs[0].polyline.features.length, 3);
});
