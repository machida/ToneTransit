'use strict';

/*
 * Shared test helpers.
 *
 * The source modules are browser IIFEs that attach to `global.window`. We set
 * that up, require them, and expose the resulting namespaces plus the JSON
 * data — all with zero third-party dependencies (node:test / node:assert only).
 */
const fs = require('fs');
const path = require('path');

global.window = global;
require('../js/music-theory.js');
require('../js/fretboard.js');

const ROOT = path.join(__dirname, '..');

function loadJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const scales = loadJSON('data/scales.json');
const chords = loadJSON('data/chords.json');
const data = { scales: scales, chords: chords };

// A complete default state; pass overrides for the field(s) under test.
function makeState(overrides) {
  return Object.assign({
    scaleRoot: 'C',
    scaleKey: 'major',
    chordRoot: 'G',
    chordKey: '7',
    noChord: false,
    noScale: false,
    fretStart: 0,
    fretEnd: 12,
    displayMode: 'name-degree'
  }, overrides || {});
}

// Flattens a built model into { noteName: degree } for the visible notes.
function visibleMap(model) {
  const out = {};
  model.strings.forEach(function (s) {
    s.cells.forEach(function (c) {
      if (c.visible) out[c.name] = c.degree;
    });
  });
  return out;
}

// All visible cells across the board (with duplicates), useful for counts.
function visibleCells(model) {
  const out = [];
  model.strings.forEach(function (s) {
    s.cells.forEach(function (c) { if (c.visible) out.push(c); });
  });
  return out;
}

module.exports = {
  theory: global.TT.theory,
  fretboard: global.TT.fretboard,
  renderer: global.TT.renderer,
  scales: scales,
  chords: chords,
  data: data,
  makeState: makeState,
  visibleMap: visibleMap,
  visibleCells: visibleCells,
  loadJSON: loadJSON
};
