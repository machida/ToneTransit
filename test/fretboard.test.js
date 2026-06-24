'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fretboard, data, makeState, visibleMap, visibleCells } = require('./helpers');

// ---- Tuning ----

test('standard tuning has six strings, high-e to low-E', () => {
  assert.equal(fretboard.TUNING.length, 6);
  assert.deepEqual(fretboard.TUNING.map((s) => s.pitchClass), [4, 11, 7, 2, 9, 4]);
  assert.deepEqual(fretboard.TUNING.map((s) => s.label), ['e', 'B', 'G', 'D', 'A', 'E']);
});

// ---- Chord symbol parsing ----

test('parseChordSymbol reads root + quality', () => {
  assert.deepEqual(pick(fretboard.parseChordSymbol('G7', data.chords)), { root: 'G', chordKey: '7' });
  assert.deepEqual(pick(fretboard.parseChordSymbol('Dm7', data.chords)), { root: 'D', chordKey: 'm7' });
  assert.deepEqual(pick(fretboard.parseChordSymbol('Cmaj7', data.chords)), { root: 'C', chordKey: 'maj7' });
  assert.deepEqual(pick(fretboard.parseChordSymbol('F#m7b5', data.chords)), { root: 'F♯', chordKey: 'm7b5' });
});

test('parseChordSymbol spells the root with unicode accidentals', () => {
  assert.equal(fretboard.parseChordSymbol('Bb7', data.chords).root, 'B♭');
  assert.equal(fretboard.parseChordSymbol('F#m7b5', data.chords).root, 'F♯');
});

test('parseChordSymbol falls back to triads', () => {
  assert.equal(fretboard.parseChordSymbol('C', data.chords).chordKey, 'maj');
  assert.equal(fretboard.parseChordSymbol('Am', data.chords).chordKey, 'm');
});

test('parseChordSymbol rejects junk', () => {
  assert.equal(fretboard.parseChordSymbol('', data.chords), null);
  assert.equal(fretboard.parseChordSymbol('xyz', data.chords), null);
  assert.equal(fretboard.parseChordSymbol('H7', data.chords), null);
});

// ---- buildModel: geometry ----

test('buildModel returns 6 strings of the right length', () => {
  const m = fretboard.buildModel(makeState({ fretStart: 0, fretEnd: 12 }), data);
  assert.equal(m.strings.length, 6);
  m.strings.forEach((s) => assert.equal(s.cells.length, 13));
});

test('buildModel swaps an inverted fret range', () => {
  const m = fretboard.buildModel(makeState({ fretStart: 9, fretEnd: 5 }), data);
  assert.equal(m.fretStart, 5);
  assert.equal(m.fretEnd, 9);
  m.strings.forEach((s) => assert.equal(s.cells.length, 5));
});

test('buildModel clamps an out-of-range fret span to 0..24', () => {
  const m = fretboard.buildModel(makeState({ fretStart: -5, fretEnd: 999 }), data);
  assert.equal(m.fretStart, 0);
  assert.equal(m.fretEnd, 24);
  m.strings.forEach((s) => assert.equal(s.cells.length, 25));
});

test('buildModel coerces non-numeric fret values without crashing', () => {
  const m = fretboard.buildModel(makeState({ fretStart: 'abc', fretEnd: '7' }), data);
  assert.equal(m.fretStart, 0);
  assert.equal(m.fretEnd, 7);
});

test('buildModel exposes open strings (fret 0) when range starts at 0', () => {
  const m = fretboard.buildModel(makeState({ fretStart: 0, fretEnd: 3 }), data);
  m.strings.forEach((s) => assert.equal(s.cells[0].fret, 0));
});

// ---- buildModel: the core promise (degrees relative to the chord) ----

test('C major over G7: B is the 3rd, and the guide tones are B & F', () => {
  const m = fretboard.buildModel(makeState({ scaleKey: 'major', chordRoot: 'G', chordKey: '7' }), data);
  const b = visibleCells(m).find((c) => c.name === 'B');
  assert.ok(b);
  assert.equal(b.degree, '3');
  assert.equal(b.isChordTone, true);
  assert.equal(b.isGuide, true);

  const map = visibleMap(m);
  assert.equal(map['G'], '1');
  assert.equal(map['B'], '3');
  assert.equal(map['D'], '5');
  assert.equal(map['F'], '♭7');
  // tensions
  assert.equal(map['A'], '9');
  assert.equal(map['C'], '11');
  assert.equal(map['E'], '13');
});

test('chord root carries the root marker (square)', () => {
  const m = fretboard.buildModel(makeState({ chordRoot: 'G', chordKey: '7' }), data);
  const roots = visibleCells(m).filter((c) => c.isChordRoot);
  assert.ok(roots.length > 0);
  roots.forEach((c) => assert.equal(c.name, 'G'));
});

// ---- buildModel: chord tones outside the scale ----

test('chord tones not in the scale are flagged outOfScale (C major over E7)', () => {
  const m = fretboard.buildModel(makeState({ scaleKey: 'major', chordRoot: 'E', chordKey: '7' }), data);
  const cells = visibleCells(m);
  const gsharp = cells.find((c) => c.name === 'G♯'); // 3rd of E7, not in C major
  assert.ok(gsharp);
  assert.equal(gsharp.isChordTone, true);
  assert.equal(gsharp.outOfScale, true);
  // B is a chord tone that IS in C major → not flagged.
  const b = cells.find((c) => c.name === 'B');
  assert.equal(b.isChordTone, true);
  assert.equal(b.outOfScale, false);
});

test('outOfScale is never set when there is no scale', () => {
  const m = fretboard.buildModel(makeState({ noScale: true, chordRoot: 'E', chordKey: '7' }), data);
  assert.ok(visibleCells(m).every((c) => c.outOfScale === false));
});

// ---- buildModel: invalid keys are absorbed, not crashes ----

test('an unknown scaleKey is treated as no scale (no crash)', () => {
  const m = fretboard.buildModel(makeState({ scaleKey: 'does-not-exist' }), data);
  assert.equal(m.noScale, true);
  assert.equal(m.scaleName, '(スケールなし)');
  assert.ok(visibleCells(m).length > 0); // the chord still renders
});

test('an unknown chordKey is treated as no chord (no crash)', () => {
  const m = fretboard.buildModel(makeState({ chordKey: 'does-not-exist' }), data);
  assert.equal(m.noChord, true);
});

// ---- buildModel: no chord ----

test('noChord shows the scale alone with plain degrees', () => {
  const m = fretboard.buildModel(makeState({ noChord: true }), data);
  assert.equal(m.noChord, true);
  const map = visibleMap(m);
  assert.deepEqual(map, { C: '1', D: '2', E: '3', F: '4', G: '5', A: '6', B: '7' });
  assert.ok(visibleCells(m).every((c) => c.isChordTone === false));
});

test('noChord anchors the root marker on the scale root', () => {
  const m = fretboard.buildModel(makeState({ noChord: true, scaleRoot: 'C' }), data);
  const roots = visibleCells(m).filter((c) => c.isChordRoot);
  assert.ok(roots.length > 0);
  roots.forEach((c) => assert.equal(c.name, 'C'));
});

// ---- buildModel: no scale ----

test('noScale shows chord tones only', () => {
  const m = fretboard.buildModel(makeState({ noScale: true, chordRoot: 'G', chordKey: '7' }), data);
  assert.equal(m.noScale, true);
  assert.deepEqual(visibleMap(m), { G: '1', B: '3', D: '5', F: '♭7' });
  assert.ok(visibleCells(m).every((c) => c.isChordTone === true));
});

test('noScale spells notes from the chord root, not the scale root', () => {
  const m = fretboard.buildModel(
    makeState({ noScale: true, scaleRoot: 'C', chordRoot: 'E♭', chordKey: '7' }), data);
  const names = Object.keys(visibleMap(m));
  assert.ok(names.includes('B♭'));
  assert.ok(names.includes('D♭'));
  assert.ok(!names.includes('A♯')); // would be the sharp spelling
});

test('noScale + noChord is empty', () => {
  const m = fretboard.buildModel(makeState({ noScale: true, noChord: true }), data);
  assert.equal(visibleCells(m).length, 0);
});

// ---- buildModel: emphasis filter (separate from label style) ----

test('default emphasis shows scale notes alongside the chord tones', () => {
  // Regression guard: selecting a chord must NOT hide non-chord scale notes.
  const m = fretboard.buildModel(makeState({ chordRoot: 'G', chordKey: '7' }), data);
  const map = visibleMap(m);
  ['G', 'B', 'D', 'F'].forEach((n) => assert.ok(n in map, n + ' chord tone visible'));
  ['A', 'C', 'E'].forEach((n) => assert.ok(n in map, n + ' scale tone must stay visible'));
});

test('guide tones stay flagged for highlighting (3rd & 7th over G7)', () => {
  const m = fretboard.buildModel(makeState({ chordRoot: 'G', chordKey: '7' }), data);
  const guides = visibleCells(m).filter((c) => c.isGuide).map((c) => c.name);
  assert.ok(guides.includes('B'));
  assert.ok(guides.includes('F'));
  assert.ok(!guides.includes('G')); // root is not a guide tone
});

// ---- buildModel: display level (SPEC-08) ----

test('beginner level hides non-chord scale tones (tensions) when a chord is set', () => {
  const m = fretboard.buildModel(makeState({ level: 'beginner', chordRoot: 'G', chordKey: '7' }), data);
  const map = visibleMap(m);
  ['G', 'B', 'D', 'F'].forEach((n) => assert.ok(n in map, n + ' chord tone stays visible'));
  ['A', 'C', 'E'].forEach((n) => assert.ok(!(n in map), n + ' tension hidden in beginner'));
  assert.equal(m.level, 'beginner');
});

test('beginner level still shows the whole scale when no chord is selected', () => {
  const m = fretboard.buildModel(makeState({ level: 'beginner', noChord: true }), data);
  assert.deepEqual(visibleMap(m), { C: '1', D: '2', E: '3', F: '4', G: '5', A: '6', B: '7' });
});

test('advanced (default) keeps tensions visible', () => {
  const m = fretboard.buildModel(makeState({ chordRoot: 'G', chordKey: '7' }), data);
  assert.equal(m.level, 'advanced');
  ['A', 'C', 'E'].forEach((n) => assert.ok(n in visibleMap(m), n + ' tension visible'));
});

// ---- helper ----

function pick(parsed) {
  return parsed && { root: parsed.root, chordKey: parsed.chordKey };
}
