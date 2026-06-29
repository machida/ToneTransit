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
  assert.match(s.bullets[0], /ガイドトーン/);
  assert.match(s.bullets[0], /B\(3\)/);
  assert.match(s.bullets[0], /F\(♭7\)/);
  assert.match(s.bullets[2], /スケール外のコードトーン: なし/);
});

test('C major over E7: flags the out-of-scale chord tone G#', () => {
  const s = build({ scaleKey: 'major', scaleRoot: 'C', chordRoot: 'E', chordKey: '7' });
  assert.match(s.bullets[2], /スケール外のコードトーン/);
  assert.match(s.bullets[2], /G♯\(3\)/);
});

test('no chord: describes the scale and invites picking a chord', () => {
  const s = build({ noChord: true, scaleRoot: 'C', scaleKey: 'major' });
  assert.match(s.intro, /C Major/);
  assert.match(s.bullets[1], /コードを選ぶ/);
});

test('no scale: describes the chord tones and invites picking a scale', () => {
  const s = build({ noScale: true, chordRoot: 'G', chordKey: '7' });
  assert.match(s.bullets[1], /スケールを選ぶ/);
  assert.match(s.bullets[0], /G\(1\)/);
});

test('no scale and no chord: a sensible empty message', () => {
  const s = build({ noScale: true, noChord: true });
  assert.match(s.intro, /スケールもコードも/);
});

test('English summary (lang=en) describes the same facts', () => {
  const m = fretboard.buildModel(makeState({ scaleKey: 'major', scaleRoot: 'C', chordRoot: 'G', chordKey: '7' }), data);
  const s = summary(m, 'en');
  assert.match(s.bullets[0], /Guide tones/);
  assert.match(s.bullets[0], /B\(3\)/);
  assert.match(s.bullets[2], /none/);
});

test('summary always returns intro and bullets for valid states', () => {
  ['major', 'dorian', 'altered', 'blues'].forEach((scaleKey) => {
    const s = build({ scaleKey, chordRoot: 'G', chordKey: '7' });
    assert.ok(typeof s.intro === 'string' && s.intro.length > 0);
    assert.ok(Array.isArray(s.bullets) && s.bullets.length > 0);
  });
});
