import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportFilename, calculateExportScale } from '../src/export-map.js';

test('creates a high-resolution export scale', () => {
  assert.equal(calculateExportScale(1280, 720), 2);
  assert.equal(calculateExportScale(390, 700), 6);
  assert.ok(calculateExportScale(3000, 2000) > 1);
  assert.ok(calculateExportScale(3000, 2000) < 2);
});

test('creates a safe PNG filename from the selected route', () => {
  const filename = buildExportFilename(
    'Berlin Hbf → Hamburg Hbf',
    new Date('2026-07-13T10:00:00Z'),
  );
  assert.equal(filename, 'berlin-hbf-hamburg-hbf-2026-07-13.png');
});
