'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// --- Mock Web Audio + WebAudioFont, set up BEFORE requiring audio.js so the
//     module captures them. node --test runs each file in its own process,
//     so these globals don't leak into the other audio test. ---

global.window = global;
global.__osc = [];        // synth oscillators created
global.__queued = [];     // sampled notes queued via WebAudioFont
global.__loaded = true;   // toggle to simulate decode readiness

function GainNode() {
  this.gain = {
    value: 1,
    setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}
  };
}
GainNode.prototype.connect = function (dest) { return dest; };

function OscNode() { this.type = ''; this.frequency = { value: 0 }; }
OscNode.prototype.setPeriodicWave = function () {};
OscNode.prototype.connect = function (dest) { return dest; };
OscNode.prototype.start = function () {};
OscNode.prototype.stop = function () {};

function MockAC() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
MockAC.prototype.createGain = function () { return new GainNode(); };
MockAC.prototype.createOscillator = function () { var o = new OscNode(); global.__osc.push(o); return o; };
MockAC.prototype.createPeriodicWave = function () { return {}; };
MockAC.prototype.resume = function () {};
global.AudioContext = MockAC;

function MockWAFPlayer() {
  this.loader = {
    decodeAfterLoading() {},
    loaded() { return !!global.__loaded; }
  };
}
MockWAFPlayer.prototype.queueWaveTable = function (ctx, dest, preset, when, midi, dur, vol) {
  global.__queued.push({ midi: midi, when: when, dur: dur, vol: vol });
};
MockWAFPlayer.prototype.cancelQueue = function () {};
global.WebAudioFontPlayer = MockWAFPlayer;

// Bundled tone-data globals (content irrelevant; loaded() is mocked).
global._tone_0000_JCLive_sf2_file = { zones: [{}] };
global._tone_0040_JCLive_sf2_file = { zones: [{}] };
global._tone_0160_JCLive_sf2_file = { zones: [{}] };

require('../js/music-theory.js');
require('../js/audio.js');
const audio = global.TT.audio;

function reset(loaded) {
  global.__osc = [];
  global.__queued = [];
  global.__loaded = loaded;
  audio.stop();
}

test('supported() is true when AudioContext exists', () => {
  assert.equal(audio.supported(), true);
});

test('decoded sample timbre plays through WebAudioFont (not synth)', () => {
  reset(true);
  audio.playScale('C', [0, 2, 4, 5, 7, 9, 11], 'piano', 4);
  assert.equal(global.__queued.length, 8, 'scale + octave note queued via samples');
  assert.equal(global.__osc.length, 0, 'no synth oscillators');
  // Octave 4 root C => MIDI 60; ascending, last is the octave (+12 = 72).
  assert.equal(global.__queued[0].midi, 60);
  assert.equal(global.__queued[global.__queued.length - 1].midi, 72);
});

test('before decode completes, sampled timbre falls back to synth', () => {
  reset(false); // not loaded yet
  audio.playChord('G', [0, 4, 7, 10], 'piano', 4);
  assert.equal(global.__queued.length, 0, 'nothing queued via samples');
  assert.equal(global.__osc.length, 4, 'synth oscillators used instead');
});

test('the "simple" timbre always uses the synth', () => {
  reset(true);
  audio.playChord('C', [0, 4, 7], 'simple', 4);
  assert.equal(global.__queued.length, 0);
  assert.equal(global.__osc.length, 3);
});

test('playScaleChord mixes per-part timbre and octave', () => {
  reset(true);
  // scale piano @oct4 (C => base 60), chord organ @oct3 (G => base 55)
  audio.playScaleChord('C', [0, 2, 4], 'G', [0, 4, 7], 'piano', 'organ', 4, 3);
  var midis = global.__queued.map(function (q) { return q.midi; });
  assert.ok(midis.includes(60), 'scale root C4 = 60 present');
  assert.ok(midis.includes(55), 'chord root G3 = 55 present');
  // 3 chord tones + 4 scale notes (3 + octave)
  assert.equal(global.__queued.length, 7);
});
