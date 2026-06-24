'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { data } = require('./helpers');
const PRESETS = require('../js/presets');

test('presets reference scale/chord keys that exist in the data', () => {
  assert.ok(PRESETS.length > 0, 'there is at least one preset');
  PRESETS.forEach((p) => {
    assert.ok(data.scales[p.patch.scaleKey], p.label + ': scaleKey "' + p.patch.scaleKey + '" exists');
    assert.ok(data.chords[p.patch.chordKey], p.label + ': chordKey "' + p.patch.chordKey + '" exists');
  });
});

test('every preset has a label, a caption and a patch', () => {
  PRESETS.forEach((p) => {
    assert.equal(typeof p.label, 'string');
    assert.ok(p.label.length > 0);
    assert.equal(typeof p.caption, 'string');
    assert.ok(p.caption.length > 0);
    assert.equal(typeof p.patch, 'object');
  });
});

test('no preset produces an empty board (scale and chord both off)', () => {
  PRESETS.forEach((p) => {
    assert.ok(!(p.patch.noScale && p.patch.noChord), p.label + ' must show something');
  });
});

test('preset patches only touch known state fields', () => {
  const allowed = new Set([
    'scaleRoot', 'scaleKey', 'chordRoot', 'chordKey', 'noChord', 'noScale',
    'fretStart', 'fretEnd', 'displayMode', 'palette'
  ]);
  PRESETS.forEach((p) => {
    Object.keys(p.patch).forEach((k) => {
      assert.ok(allowed.has(k), p.label + ': unexpected field "' + k + '"');
    });
  });
});
