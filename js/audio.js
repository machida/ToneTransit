/*
 * audio.js
 *
 * Hear the current scale / chord. Uses WebAudioFont (bundled in assets/sound)
 * for real sampled instruments — Acoustic Grand (piano), Rhodes (epiano) and
 * Drawbar Organ — and falls back to a built-in OscillatorNode synth ("simple",
 * or whenever the samples / player aren't available).
 *
 * Exposed on TT.audio; a no-op where Web Audio is unsupported.
 */
(function (global) {
  'use strict';

  var TT = (global.TT = global.TT || {});
  var AC = global.AudioContext || global.webkitAudioContext;

  // Sampled timbres -> WebAudioFont global tone-data variable names.
  var SAMPLED = {
    piano: '_tone_0000_JCLive_sf2_file',
    epiano: '_tone_0040_JCLive_sf2_file',
    organ: '_tone_0160_JCLive_sf2_file'
  };

  // Synth fallback specs (additive partials + envelope) per timbre.
  var SYNTH = {
    piano: { partials: [0, 1, 0.65, 0.38, 0.24, 0.16, 0.1, 0.06, 0.04], env: 'pluck' },
    epiano: { partials: [0, 1, 0.2, 0.08, 0.5, 0.05, 0.2], env: 'pluck' },
    organ: { partials: [0, 1, 0.5, 0.85, 0.25, 0.55, 0, 0.3], env: 'pad' },
    simple: { type: 'triangle', env: 'pad' }
  };

  var ctx = null;
  var masterGain = null;
  var waf = null;            // WebAudioFont player (if available)
  var decodeStarted = {};    // timbre -> true once decoding has been kicked off
  var waveCache = {};        // synth PeriodicWave cache
  var active = [];           // scheduled synth oscillators (for stop)

  function context() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.6;
      masterGain.connect(ctx.destination);
      if (global.WebAudioFontPlayer) {
        waf = new global.WebAudioFontPlayer();
        // Start decoding all sampled instruments now (asynchronous); until a
        // preset is fully decoded, sampleFor() returns null and we use synth.
        Object.keys(SAMPLED).forEach(startDecode);
      }
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  function startDecode(name) {
    var varName = SAMPLED[name];
    if (!waf || !varName || !global[varName] || decodeStarted[name]) return;
    waf.loader.decodeAfterLoading(ctx, varName);
    decodeStarted[name] = true;
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // MIDI of the root in the given octave (C4 = 60). Defaults to octave 4.
  function rootMidi(rootName, octave) {
    var oct = octave == null ? 4 : octave;
    return 12 * (oct + 1) + TT.theory.pitchClassOf(rootName);
  }

  // The sample preset for a timbre, but ONLY once fully decoded; otherwise null
  // so the caller falls back to the synth (avoids the silent first play).
  function sampleFor(name) {
    if (!waf) return null;
    var varName = SAMPLED[name];
    if (!varName || !global[varName]) return null;
    startDecode(name);
    return waf.loader.loaded(varName) ? global[varName] : null;
  }

  // --- synth fallback ---
  function synthWave(name) {
    var spec = SYNTH[name] || SYNTH.simple;
    if (!spec.partials) return null;
    if (waveCache[name]) return waveCache[name];
    var n = spec.partials.length;
    var real = new Float32Array(n);
    var imag = new Float32Array(n);
    for (var i = 0; i < n; i++) imag[i] = spec.partials[i];
    var w = ctx.createPeriodicWave(real, imag);
    waveCache[name] = w;
    return w;
  }

  function synthTone(name, freq, t0, dur, peak) {
    var spec = SYNTH[name] || SYNTH.simple;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    var wave = synthWave(name);
    if (wave) osc.setPeriodicWave(wave); else osc.type = spec.type || 'triangle';
    osc.frequency.value = freq;

    var g0 = 0.0001;
    if (spec.env === 'pluck') {
      g.gain.setValueAtTime(g0, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(g0, t0 + dur);
    } else {
      var a = 0.02, r = 0.16, s = Math.max(t0 + a, t0 + dur - r);
      g.gain.setValueAtTime(g0, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + a);
      g.gain.setValueAtTime(peak, s);
      g.gain.exponentialRampToValueAtTime(g0, t0 + dur);
    }
    osc.connect(g).connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    active.push(osc);
    osc.onended = function () { var i = active.indexOf(osc); if (i >= 0) active.splice(i, 1); };
  }

  // Note-event listeners (for syncing the diagram with playback). Each gets
  // { pitchClass, midi, delay, dur } where `delay` is seconds from now.
  var noteListeners = [];
  function onNote(cb) { if (typeof cb === 'function') noteListeners.push(cb); }
  function emitNote(midi, when, dur) {
    if (!noteListeners.length) return;
    var delay = ctx ? Math.max(0, when - ctx.currentTime) : 0;
    var ev = { pitchClass: ((midi % 12) + 12) % 12, midi: midi, delay: delay, dur: dur };
    for (var i = 0; i < noteListeners.length; i++) {
      try { noteListeners[i](ev); } catch (e) { /* a bad listener can't break audio */ }
    }
  }

  // Schedules one note with the given timbre, via samples if available, else synth.
  function note(timbre, midi, when, dur, vol) {
    var preset = sampleFor(timbre);
    if (preset) waf.queueWaveTable(ctx, masterGain, preset, when, midi, dur, vol);
    else synthTone(timbre, midiToFreq(midi), when, dur, vol);
    emitNote(midi, when, dur);
  }

  function stop() {
    if (waf) try { waf.cancelQueue(ctx); } catch (e) { /* ignore */ }
    active.forEach(function (o) { try { o.stop(); } catch (e) { /* ignore */ } });
    active = [];
  }

  function playScale(rootName, intervals, timbre, octave) {
    if (!context()) return;
    stop();
    var base = rootMidi(rootName, octave);
    var step = 0.34;
    var t = ctx.currentTime + 0.06;
    intervals.concat([12]).forEach(function (iv, i) {
      note(timbre, base + iv, t + i * step, step * 1.4, 0.7);
    });
  }

  function playChord(rootName, intervals, timbre, octave) {
    if (!context()) return;
    stop();
    var base = rootMidi(rootName, octave);
    var t = ctx.currentTime + 0.06;
    var dur = 1.9;
    var vol = Math.max(0.3, 0.9 / intervals.length);
    intervals.forEach(function (iv, i) {
      note(timbre, base + iv, t + i * 0.035, dur - i * 0.035, vol);
    });
  }

  // Scale (ascending melody) over the chord (sustained backing). The scale and
  // chord can use different timbres and octaves.
  function playScaleChord(scaleRoot, scaleIntervals, chordRoot, chordIntervals,
                          scaleTimbre, chordTimbre, scaleOct, chordOct) {
    if (!context()) return;
    stop();
    var t = ctx.currentTime + 0.06;
    var step = 0.34;
    var seq = scaleIntervals.concat([12]);
    var scaleDur = seq.length * step + 0.4;

    var cbase = rootMidi(chordRoot, chordOct);
    var cvol = Math.max(0.18, 0.5 / chordIntervals.length);
    chordIntervals.forEach(function (iv, i) {
      note(chordTimbre, cbase + iv, t + i * 0.03, scaleDur, cvol);
    });

    var sbase = rootMidi(scaleRoot, scaleOct);
    seq.forEach(function (iv, i) {
      note(scaleTimbre, sbase + iv, t + i * step, step * 1.4, 0.7);
    });
  }

  TT.audio = {
    supported: function () { return !!AC; },
    playScale: playScale,
    playChord: playChord,
    playScaleChord: playScaleChord,
    onNote: onNote,
    stop: stop
  };
})(typeof window !== 'undefined' ? window : this);
