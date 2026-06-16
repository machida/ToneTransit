'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../js/music-theory.js');
require('../js/audio.js');
const audio = global.TT.audio;

test('audio module exposes its API', () => {
  ['supported', 'playScale', 'playChord', 'playScaleChord', 'stop'].forEach((fn) => {
    assert.equal(typeof audio[fn], 'function', fn);
  });
});

test('without Web Audio (Node) the API is a safe no-op', () => {
  assert.equal(audio.supported(), false);
  assert.doesNotThrow(() => audio.playScale('C', [0, 2, 4, 5, 7, 9, 11], 'piano', 4));
  assert.doesNotThrow(() => audio.playChord('G', [0, 4, 7, 10], 'piano', 4));
  assert.doesNotThrow(() => audio.playScaleChord('C', [0, 2, 4], 'G', [0, 4, 7], 'piano', 'organ', 4, 3));
  assert.doesNotThrow(() => audio.stop());
});
