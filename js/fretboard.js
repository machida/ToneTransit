/*
 * fretboard.js
 *
 * Turns the current settings + data into a plain model that the renderer can
 * draw. Knows about standard tuning and how each note relates to the active
 * scale and chord. No DOM.
 */
(function (global) {
  'use strict';

  var TT = (global.TT = global.TT || {});
  var theory = TT.theory;

  // Standard tuning, listed top-to-bottom as drawn (high e first, low E last).
  var TUNING = [
    { label: 'e', pitchClass: 4 },
    { label: 'B', pitchClass: 11 },
    { label: 'G', pitchClass: 7 },
    { label: 'D', pitchClass: 2 },
    { label: 'A', pitchClass: 9 },
    { label: 'E', pitchClass: 4 }
  ];

  // Parses a chord symbol such as "Dm7", "G7", "Cmaj7", "F#m7b5" into a
  // { root, chordKey, symbol } object, using the chord aliases from data.
  function parseChordSymbol(symbol, chords) {
    var raw = String(symbol).trim();
    if (!raw) return null;

    // Root: a letter A-G plus an optional accidental.
    var m = raw.match(/^([A-Ga-g])([#♯b♭]?)/);
    if (!m) return null;
    var rootName = m[1].toUpperCase() + (m[2] || '');
    if (theory.NOTE_INDEX[rootName] == null) return null;
    var rest = raw.slice(m[0].length);

    // Find the chord key whose alias best matches the remaining suffix.
    var bestKey = null;
    var bestLen = -1;
    for (var key in chords) {
      if (!Object.prototype.hasOwnProperty.call(chords, key)) continue;
      var aliases = chords[key].aliases || [key];
      for (var i = 0; i < aliases.length; i++) {
        var a = aliases[i];
        if (rest === a && a.length > bestLen) {
          bestKey = key;
          bestLen = a.length;
        }
      }
    }
    // Fall back to major / minor triad if only "m" or nothing is left.
    if (bestKey == null) {
      if (rest === '' && chords.maj) bestKey = 'maj';
      else if (/^m/i.test(rest) && chords.m) bestKey = 'm';
    }
    if (bestKey == null) return null;

    return {
      root: theory.noteName(theory.pitchClassOf(rootName), theory.usesFlats(rootName)),
      chordKey: bestKey,
      symbol: raw
    };
  }

  // Builds the diagram model for the current state.
  function buildModel(state, data) {
    var scale = data.scales[state.scaleKey];
    var noScale = !!state.noScale;
    var noChord = !!state.noChord || !data.chords[state.chordKey];
    var chord = noChord ? null : data.chords[state.chordKey];
    // Note spelling follows the scale root normally; with no scale there is no
    // key, so it follows the chord root instead.
    var spellingRoot = (noScale && !noChord) ? state.chordRoot : state.scaleRoot;
    var preferFlats = theory.usesFlats(spellingRoot);

    var scaleRootPc = theory.pitchClassOf(state.scaleRoot);
    // With no chord, degrees are read against the scale root itself.
    var refRootPc = noChord ? scaleRootPc : theory.pitchClassOf(state.chordRoot);

    var scaleSet = {};
    if (!noScale && scale) {
      scale.intervals.forEach(function (iv) { scaleSet[theory.mod12(iv)] = true; });
    }
    var chordMap = noChord ? {} : theory.chordDegreeMap(chord);

    var start = Math.max(0, Math.min(state.fretStart, state.fretEnd));
    var end = Math.max(state.fretStart, state.fretEnd);

    var strings = TUNING.map(function (str) {
      var cells = [];
      for (var fret = start; fret <= end; fret++) {
        var pc = theory.mod12(str.pitchClass + fret);
        var semiScale = theory.mod12(pc - scaleRootPc);
        var semiRef = theory.mod12(pc - refRootPc);
        var inScale = !noScale && !!scaleSet[semiScale];
        var isScaleRoot = !noScale && semiScale === 0;
        var isChordTone = !noChord && chordMap[semiRef] != null;
        var degree = noChord
          ? theory.scaleDegreeLabel(semiRef)
          : theory.degreeLabel(semiRef, chordMap);
        var isGuide = isChordTone && theory.isGuideDegree(degree);
        // A chord tone that the current scale doesn't contain — flags a
        // scale/chord mismatch worth showing.
        var outOfScale = isChordTone && !inScale && !noScale;
        // The "root" marker follows the chord root, or the scale root when no
        // chord is selected, so there is always a visible anchor.
        var isRoot = noChord ? isScaleRoot : (semiRef === 0 && isChordTone);

        cells.push({
          fret: fret,
          pitchClass: pc,
          name: theory.noteName(pc, preferFlats),
          degree: degree,
          inScale: inScale,
          isChordTone: isChordTone,
          isChordRoot: isRoot,
          isScaleRoot: isScaleRoot,
          isGuide: isGuide,
          outOfScale: outOfScale,
          visible: noteVisible(inScale, isChordTone, noScale)
        });
      }
      return { label: str.label, cells: cells };
    });

    return {
      strings: strings,
      fretStart: start,
      fretEnd: end,
      scaleName: noScale ? '(スケールなし)' : scale.name,
      scaleRoot: state.scaleRoot,
      noScale: noScale,
      noChord: noChord,
      chordName: noChord ? '(コードなし)'
        : (chord.symbol === '' ? state.chordRoot : state.chordRoot + chord.symbol),
      chordRoot: noChord ? '' : state.chordRoot,
      chordFullName: noChord ? 'スケールのみ' : chord.name,
      displayMode: state.displayMode,
      preferFlats: preferFlats
    };
  }

  // No scale → only chord tones; otherwise scale notes plus chord tones.
  // (Guide tones are always highlighted visually, not filtered.)
  function noteVisible(inScale, isChordTone, noScale) {
    if (noScale) return isChordTone;
    return inScale || isChordTone;
  }

  TT.fretboard = {
    TUNING: TUNING,
    parseChordSymbol: parseChordSymbol,
    buildModel: buildModel
  };
})(typeof window !== 'undefined' ? window : this);
