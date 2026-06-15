'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scales, chords } = require('./helpers');

function isValidIntervalSet(iv, opts) {
  opts = opts || {};
  const min = opts.min == null ? 0 : opts.min;
  if (!Array.isArray(iv) || iv.length < min) return false;
  if (iv[0] !== 0) return false;
  // Scales stay within an octave; chords may extend (9th/11th/13th).
  const max = opts.max == null ? 11 : opts.max;
  for (let i = 0; i < iv.length; i++) {
    if (!Number.isInteger(iv[i]) || iv[i] < 0 || iv[i] > max) return false;
    if (i > 0 && iv[i] <= iv[i - 1]) return false; // strictly ascending
  }
  return true;
}

// ---- scales.json ----

test('every scale has a name, category and valid intervals', () => {
  const keys = Object.keys(scales);
  assert.ok(keys.length >= 20, 'expected a healthy number of scales');
  keys.forEach((key) => {
    const s = scales[key];
    assert.equal(typeof s.name, 'string', key + ' name');
    assert.ok(s.name.length > 0, key + ' name non-empty');
    assert.equal(typeof s.category, 'string', key + ' category');
    assert.ok(isValidIntervalSet(s.intervals, { min: 5 }),
      key + ' intervals invalid: ' + JSON.stringify(s.intervals));
  });
});

test('every scale has a non-empty description', () => {
  Object.keys(scales).forEach((key) => {
    assert.equal(typeof scales[key].description, 'string', key + ' description');
    assert.ok(scales[key].description.trim().length > 0, key + ' description empty');
  });
});

test('scale kana aliases, when present, are non-empty katakana-ish strings', () => {
  Object.keys(scales).forEach((key) => {
    const kana = scales[key].kana;
    if (kana == null) return;
    assert.ok(Array.isArray(kana), key + ' kana should be an array');
    kana.forEach((k) => {
      assert.equal(typeof k, 'string');
      assert.ok(k.trim().length > 0, key + ' has an empty kana entry');
    });
  });
});

test('no two scales share the same interval set', () => {
  const seen = {};
  Object.keys(scales).forEach((key) => {
    const sig = scales[key].intervals.join(',');
    assert.equal(seen[sig], undefined, key + ' duplicates ' + seen[sig]);
    seen[sig] = key;
  });
});

// ---- chords.json ----

test('every chord has parallel intervals and degrees, plus aliases', () => {
  const keys = Object.keys(chords);
  assert.ok(keys.length >= 7);
  keys.forEach((key) => {
    const c = chords[key];
    assert.equal(typeof c.name, 'string', key + ' name');
    assert.equal(typeof c.symbol, 'string', key + ' symbol');
    assert.ok(isValidIntervalSet(c.intervals, { min: 3, max: 24 }),
      key + ' intervals invalid: ' + JSON.stringify(c.intervals));
    assert.ok(Array.isArray(c.degrees), key + ' degrees');
    assert.equal(c.intervals.length, c.degrees.length,
      key + ' intervals/degrees length mismatch');
    assert.ok(Array.isArray(c.aliases) && c.aliases.length > 0, key + ' aliases');
  });
});

test('every chord has a non-empty description', () => {
  Object.keys(chords).forEach((key) => {
    assert.equal(typeof chords[key].description, 'string', key + ' description');
    assert.ok(chords[key].description.trim().length > 0, key + ' description empty');
  });
});

test('chord roots are labelled "1"', () => {
  Object.keys(chords).forEach((key) => {
    assert.equal(chords[key].degrees[0], '1', key + ' first degree should be 1');
  });
});

test('the MVP chord set is present', () => {
  ['maj7', 'm7', '7', 'm7b5', 'dim', 'aug', 'sus4'].forEach((key) => {
    assert.ok(chords[key], 'missing chord: ' + key);
  });
});
