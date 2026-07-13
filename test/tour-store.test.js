import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SEGMENTS,
  addSegment,
  buildTourSegment,
  createEmptyTour,
  moveSegment,
  tourGroups,
  tourTotals,
  updateSegment,
} from '../src/tour-store.js';

function journey(from, to, offset = 0) {
  return {
    transfers: 0,
    durationMinutes: 60,
    legs: [{
      line: { mode: 'train', name: 'RE 1' },
      origin: { id: from, name: from, location: { latitude: 52 + offset, longitude: 13 } },
      destination: { id: to, name: to, location: { latitude: 53 + offset, longitude: 13 } },
      points: [[52 + offset, 13], [52.5 + offset, 13.1], [53 + offset, 13]],
      stopovers: [{
        stop: {
          id: 'X',
          name: 'Zwischenhalt',
          location: { latitude: 52.5 + offset, longitude: 13.1 },
        },
      }],
    }],
  };
}

test('builds and groups tour segments with shared colors', () => {
  let tour = createEmptyTour();
  tour = addSegment(tour, buildTourSegment(journey('A', 'B'), { dayLabel: 'Tag 1', color: '#2563eb' }));
  tour = addSegment(tour, buildTourSegment(journey('B', 'C', 1), { dayLabel: 'Tag 1', color: '#2563eb' }));
  tour = addSegment(tour, buildTourSegment(journey('C', 'D', 2), { dayLabel: 'Tag 2', color: '#dc2626' }));

  const totals = tourTotals(tour);
  assert.equal(totals.segmentCount, 3);
  assert.equal(totals.dayCount, 2);
  assert.equal(tourGroups(tour).length, 2);
  assert.equal(tour.segments[0].stops[1].name, 'Zwischenhalt');
});

test('updates colors and reorders segments', () => {
  let tour = createEmptyTour();
  const first = buildTourSegment(journey('A', 'B'), { dayLabel: 'Tag 1' });
  const second = buildTourSegment(journey('B', 'C', 1), { dayLabel: 'Tag 2' });
  tour = addSegment(addSegment(tour, first), second);
  tour = updateSegment(tour, first.id, { color: '#7c3aed' });
  assert.equal(tour.segments[0].color, '#7c3aed');
  tour = moveSegment(tour, second.id, -1);
  assert.equal(tour.segments[0].id, second.id);
});

test('limits tours to ten segments', () => {
  let tour = createEmptyTour();
  for (let index = 0; index < MAX_SEGMENTS; index += 1) {
    tour = addSegment(tour, buildTourSegment(journey(`A${index}`, `B${index}`, index), {}));
  }
  assert.throws(
    () => addSegment(tour, buildTourSegment(journey('X', 'Y'), {})),
    /höchstens/,
  );
});
