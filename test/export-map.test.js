import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportFilename, calculateExportScale } from '../src/export-map.js';

test('targets the selected export width within pixel limits', () => {
  assert.equal(calculateExportScale(1280, 720, 2560), 2);
  assert.ok(calculateExportScale(390, 700, 3840) > 3);
  assert.ok(calculateExportScale(2000, 2000, 3840) < 2);
});

test('builds a safe PNG filename', () => {
  assert.equal(buildExportFilename('Berlin → Zürich', new Date('2026-07-13T10:00:00Z')), 'berlin-zurich-2026-07-13.png');
});
