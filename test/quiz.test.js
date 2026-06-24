'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fretboard, theory, data, makeState } = require('./helpers');
const { quizFor } = require('../js/quiz');

function model(overrides) {
  return fretboard.buildModel(makeState(overrides), data);
}

// Deterministic rng that always picks the first candidate.
const first = () => 0;

test('quizFor returns a question with a non-empty answer set', () => {
  const q = quizFor(model({ scaleKey: 'major', chordRoot: 'G', chordKey: '7' }), first);
  assert.ok(q);
  assert.equal(typeof q.prompt, 'string');
  assert.ok(q.prompt.length > 0);
  assert.ok(Array.isArray(q.correctPitchClasses));
  assert.ok(q.correctPitchClasses.length > 0);
});

test('the first candidate (guide tones) is solvable from the model', () => {
  const m = model({ scaleKey: 'major', chordRoot: 'G', chordKey: '7' });
  const q = quizFor(m, first);
  // With rng=0 the guide-tone question is chosen; B and F are the guides of G7.
  assert.match(q.prompt, /ガイドトーン/);
  const expected = [theory.pitchClassOf('B'), theory.pitchClassOf('F')].sort();
  assert.deepEqual([...q.correctPitchClasses].sort(), expected);
});

test('every correct pitch class actually appears on the board', () => {
  const m = model({ scaleKey: 'dorian', scaleRoot: 'D', chordRoot: 'D', chordKey: 'm7' });
  const q = quizFor(m, first);
  const onBoard = new Set();
  m.strings.forEach((s) => s.cells.forEach((c) => { if (c.visible) onBoard.add(c.pitchClass); }));
  q.correctPitchClasses.forEach((pc) => assert.ok(onBoard.has(pc), 'pc ' + pc + ' is on the board'));
});

test('English quiz (lang=en) returns an English prompt', () => {
  const q = quizFor(model({ scaleKey: 'major', chordRoot: 'G', chordKey: '7' }), first, 'en');
  assert.match(q.prompt, /guide tones/i);
  assert.ok(q.correctPitchClasses.length > 0);
});

test('quizFor returns null when nothing is shown', () => {
  assert.equal(quizFor(model({ noScale: true, noChord: true }), first), null);
});

test('quizFor is stable across the available rng range', () => {
  const m = model({ scaleKey: 'major', chordRoot: 'E', chordKey: '7' });
  [0, 0.25, 0.5, 0.75, 0.999].forEach((r) => {
    const q = quizFor(m, () => r);
    assert.ok(q && q.correctPitchClasses.length > 0);
  });
});
