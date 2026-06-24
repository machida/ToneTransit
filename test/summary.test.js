'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fretboard, data, makeState } = require('./helpers');
const summary = require('../js/summary');

function build(overrides) {
  return summary(fretboard.buildModel(makeState(overrides), data));
}

test('C major over G7: names the guide tones and reports a good fit', () => {
  const s = build({ scaleKey: 'major', scaleRoot: 'C', chordRoot: 'G', chordKey: '7' });
  assert.match(s, /ガイドトーン/);
  assert.match(s, /B\(3\)/);
  assert.match(s, /F\(♭7\)/);
  assert.match(s, /噛み合/);
  assert.doesNotMatch(s, /スケール外のコードトーンは [A-G]/); // none out of scale
});

test('C major over E7: flags the out-of-scale chord tone G#', () => {
  const s = build({ scaleKey: 'major', scaleRoot: 'C', chordRoot: 'E', chordKey: '7' });
  assert.match(s, /スケール外のコードトーン/);
  assert.match(s, /G♯\(3\)/);
});

test('no chord: describes the scale and invites picking a chord', () => {
  const s = build({ noChord: true, scaleRoot: 'C', scaleKey: 'major' });
  assert.match(s, /C Major/);
  assert.match(s, /コードを選ぶ/);
});

test('no scale: describes the chord tones and invites picking a scale', () => {
  const s = build({ noScale: true, chordRoot: 'G', chordKey: '7' });
  assert.match(s, /スケールを選ぶ/);
  assert.match(s, /G\(1\)/);
});

test('no scale and no chord: a sensible empty message', () => {
  const s = build({ noScale: true, noChord: true });
  assert.match(s, /スケールもコードも/);
});

test('summary never returns an empty string for valid states', () => {
  ['major', 'dorian', 'altered', 'blues'].forEach((scaleKey) => {
    const s = build({ scaleKey, chordRoot: 'G', chordKey: '7' });
    assert.ok(typeof s === 'string' && s.length > 0);
  });
});
