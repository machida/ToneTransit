'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { theory } = require('./helpers');

test('mod12 wraps into 0..11', () => {
  assert.equal(theory.mod12(0), 0);
  assert.equal(theory.mod12(12), 0);
  assert.equal(theory.mod12(13), 1);
  assert.equal(theory.mod12(-1), 11);
  assert.equal(theory.mod12(-12), 0);
  assert.equal(theory.mod12(25), 1);
});

test('pitchClassOf knows sharp and flat spellings', () => {
  assert.equal(theory.pitchClassOf('C'), 0);
  assert.equal(theory.pitchClassOf('G'), 7);
  assert.equal(theory.pitchClassOf('E♭'), 3);
  assert.equal(theory.pitchClassOf('Eb'), 3);
  assert.equal(theory.pitchClassOf('D♯'), 3);
  assert.equal(theory.pitchClassOf('B♭'), 10);
  assert.equal(theory.pitchClassOf('B'), 11);
});

test('pitchClassOf defaults unknown input to 0', () => {
  assert.equal(theory.pitchClassOf('???'), 0);
});

test('usesFlats picks the right accidental preference', () => {
  assert.equal(theory.usesFlats('C'), false);
  assert.equal(theory.usesFlats('G'), false);
  assert.equal(theory.usesFlats('A'), false);
  assert.equal(theory.usesFlats('F'), true);
  assert.equal(theory.usesFlats('B♭'), true);
  assert.equal(theory.usesFlats('E♭'), true);
});

test('noteName uses sharp/flat tables and wraps', () => {
  assert.equal(theory.noteName(0, false), 'C');
  assert.equal(theory.noteName(1, false), 'C♯');
  assert.equal(theory.noteName(1, true), 'D♭');
  assert.equal(theory.noteName(10, true), 'B♭');
  assert.equal(theory.noteName(10, false), 'A♯');
  assert.equal(theory.noteName(12, false), 'C'); // wraps
});

test('chordDegreeMap maps each chord interval to its label', () => {
  const dom7 = { intervals: [0, 4, 7, 10], degrees: ['1', '3', '5', '♭7'] };
  const map = theory.chordDegreeMap(dom7);
  assert.deepEqual(map, { 0: '1', 4: '3', 7: '5', 10: '♭7' });
});

test('degreeLabel: chord tones use the chord, others use the tension chart', () => {
  const map = theory.chordDegreeMap({ intervals: [0, 4, 7, 10], degrees: ['1', '3', '5', '♭7'] });
  // chord tones
  assert.equal(theory.degreeLabel(0, map), '1');
  assert.equal(theory.degreeLabel(4, map), '3');
  assert.equal(theory.degreeLabel(10, map), '♭7');
  // tensions / non-chord tones
  assert.equal(theory.degreeLabel(1, map), '♭9');
  assert.equal(theory.degreeLabel(2, map), '9');
  assert.equal(theory.degreeLabel(6, map), '♯11');
  assert.equal(theory.degreeLabel(9, map), '13');
});

test('minor chord spells its own third as ♭3, not ♯9', () => {
  const m7 = theory.chordDegreeMap({ intervals: [0, 3, 7, 10], degrees: ['1', '♭3', '5', '♭7'] });
  assert.equal(theory.degreeLabel(3, m7), '♭3');
});

test('scaleDegreeLabel gives plain scale degrees', () => {
  assert.equal(theory.scaleDegreeLabel(0), '1');
  assert.equal(theory.scaleDegreeLabel(2), '2');
  assert.equal(theory.scaleDegreeLabel(3), '♭3');
  assert.equal(theory.scaleDegreeLabel(4), '3');
  assert.equal(theory.scaleDegreeLabel(5), '4');
  assert.equal(theory.scaleDegreeLabel(6), '♯4');
  assert.equal(theory.scaleDegreeLabel(7), '5');
  assert.equal(theory.scaleDegreeLabel(9), '6');
  assert.equal(theory.scaleDegreeLabel(11), '7');
});

test('isGuideDegree flags thirds and sevenths only', () => {
  ['3', '♭3', '7', '♭7', '♭♭7'].forEach((d) => assert.ok(theory.isGuideDegree(d), d));
  ['1', '5', '9', '♯11', '13'].forEach((d) => assert.ok(!theory.isGuideDegree(d), d));
});

test('diatonicChords builds the classic 7th chords of a major key', () => {
  const scales = require('./helpers').scales;
  const chords = require('./helpers').chords;
  const got = theory.diatonicChords(scales.major, 'C', chords)
    .map((r) => r.root + chords[r.chordKey].symbol);
  assert.deepEqual(got, ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7♭5']);
});

test('diatonicChords uses richer 7th qualities when available (harmonic minor)', () => {
  const scales = require('./helpers').scales;
  const chords = require('./helpers').chords;
  const got = theory.diatonicChords(scales.harmonic_minor, 'C', chords)
    .map((r) => r.root + chords[r.chordKey].symbol);
  // i is m(maj7), III is an augmented-major 7 — both now in the chord set.
  assert.equal(got[0], 'CmMaj7');
  assert.ok(got.includes('E♭maj7♯5'));
  assert.ok(got.includes('G7'));
});

test('diatonicChords still falls back to triads (whole tone → augmented)', () => {
  const scales = require('./helpers').scales;
  const chords = require('./helpers').chords;
  const got = theory.diatonicChords(scales.whole_tone, 'C', chords)
    .map((r) => r.chordKey);
  assert.ok(got.length > 0);
  assert.ok(got.every((k) => k === 'aug'));
});

test('diatonicChords returns nothing for a pentatonic scale', () => {
  const scales = require('./helpers').scales;
  const chords = require('./helpers').chords;
  assert.equal(theory.diatonicChords(scales.pentatonic_major, 'C', chords).length, 0);
});

test('recommendedChords gives the altered scale just its dominant target', () => {
  const scales = require('./helpers').scales;
  const chords = require('./helpers').chords;
  const recos = theory.recommendedChords(scales.altered, 'G', chords);
  // Altered is played over G7(alt) — show that, not the parent-scale chords.
  assert.deepEqual(recos.map((r) => r.root + chords[r.chordKey].symbol), ['G7']);
  assert.equal(recos[0].primary, true);
});

test('recommendedChords gives a practical (not full diatonic) major set', () => {
  const scales = require('./helpers').scales;
  const chords = require('./helpers').chords;
  const got = theory.recommendedChords(scales.major, 'C', chords)
    .map((r) => r.root + chords[r.chordKey].symbol);
  // I ii IV V vi — no rarely-used iii / viiø.
  assert.deepEqual(got, ['Cmaj7', 'Dm7', 'Fmaj7', 'G7', 'Am7']);
});

test('recommendedChords keeps the tonic chord primary for a major scale', () => {
  const scales = require('./helpers').scales;
  const chords = require('./helpers').chords;
  const recos = theory.recommendedChords(scales.major, 'C', chords);
  assert.equal(recos[0].root + chords[recos[0].chordKey].symbol, 'Cmaj7');
  assert.equal(recos[0].primary, true);
  // No duplicate of the tonic from the diatonic pass.
  const cmaj = recos.filter((r) => r.root === 'C' && r.chordKey === 'maj7');
  assert.equal(cmaj.length, 1);
});

test('ROOTS lists all twelve pitch classes once', () => {
  assert.equal(theory.ROOTS.length, 12);
  const pcs = theory.ROOTS.map(theory.pitchClassOf).sort((a, b) => a - b);
  assert.deepEqual(pcs, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});
