/*
 * music-theory.js
 *
 * Pure music-theory helpers. No DOM, no state.
 * Everything is exposed on the global `TT.theory` namespace so the app can
 * run from plain <script> tags without a module bundler.
 */
(function (global) {
  'use strict';

  var TT = (global.TT = global.TT || {});

  // 12 pitch classes, spelled with sharps or flats.
  var SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  var FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  // Maps every accepted spelling of a root to its pitch class (0-11).
  var NOTE_INDEX = {
    'C': 0, 'B♯': 0, 'B#': 0,
    'C♯': 1, 'C#': 1, 'D♭': 1, 'Db': 1,
    'D': 2,
    'D♯': 3, 'D#': 3, 'E♭': 3, 'Eb': 3,
    'E': 4, 'F♭': 4, 'Fb': 4,
    'F': 5, 'E♯': 5, 'E#': 5,
    'F♯': 6, 'F#': 6, 'G♭': 6, 'Gb': 6,
    'G': 7,
    'G♯': 8, 'G#': 8, 'A♭': 8, 'Ab': 8,
    'A': 9,
    'A♯': 10, 'A#': 10, 'B♭': 10, 'Bb': 10,
    'B': 11, 'C♭': 11, 'Cb': 11
  };

  // Roots offered in the UI, in chromatic order, flats preferred.
  var ROOTS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  // Generic chord-scale degree map (semitone -> label), used for any note
  // that is NOT a chord tone. Mirrors the dominant tension chart in the spec.
  var GENERIC_DEGREES = {
    0: '1', 1: '♭9', 2: '9', 3: '♯9', 4: '3', 5: '11',
    6: '♯11', 7: '5', 8: '♭13', 9: '13', 10: '♭7', 11: '7'
  };

  // Plain scale degrees relative to a root (used when no chord is selected).
  var SCALE_DEGREES = {
    0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4',
    6: '♯4', 7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7'
  };

  // Degree labels that count as guide tones (the 3rd and the 7th).
  var GUIDE_DEGREES = { '3': true, '♭3': true, '♯3': true, '7': true, '♭7': true, '♭♭7': true };

  function mod12(n) {
    return ((n % 12) + 12) % 12;
  }

  function pitchClassOf(rootName) {
    var pc = NOTE_INDEX[rootName];
    return typeof pc === 'number' ? pc : 0;
  }

  // Whether a root prefers flat spelling for the whole diagram.
  function usesFlats(rootName) {
    if (rootName.indexOf('♭') >= 0 || rootName.indexOf('b') === 1) return true;
    return rootName === 'F';
  }

  function noteName(pitchClass, preferFlats) {
    var table = preferFlats ? FLAT_NAMES : SHARP_NAMES;
    return table[mod12(pitchClass)];
  }

  // Builds a { semitone: label } map for a chord's own chord tones.
  function chordDegreeMap(chord) {
    var map = {};
    for (var i = 0; i < chord.intervals.length; i++) {
      map[mod12(chord.intervals[i])] = chord.degrees[i];
    }
    return map;
  }

  // Resolves the degree label of a note relative to a chord.
  // Chord tones use the chord's own spelling; everything else falls back to
  // the generic tension chart.
  function degreeLabel(semitoneFromChordRoot, chordMap) {
    var s = mod12(semitoneFromChordRoot);
    if (chordMap[s] != null) return chordMap[s];
    return GENERIC_DEGREES[s];
  }

  function scaleDegreeLabel(semitoneFromRoot) {
    return SCALE_DEGREES[mod12(semitoneFromRoot)];
  }

  function isGuideDegree(label) {
    return !!GUIDE_DEGREES[label];
  }

  // A pitch-class set signature for matching, e.g. [0,4,7,11] -> "0,4,7,11".
  function pcSignature(intervals) {
    var seen = {};
    intervals.forEach(function (iv) { seen[mod12(iv)] = true; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; }).join(',');
  }

  // Finds the chord key whose interval set matches `pcs` exactly.
  function matchChordKey(pcs, chords) {
    var sig = pcSignature(pcs);
    for (var key in chords) {
      if (!Object.prototype.hasOwnProperty.call(chords, key)) continue;
      if (pcSignature(chords[key].intervals) === sig) return key;
    }
    return null;
  }

  // Stacks notes from the scale (by the given index offsets) on degree i and
  // returns the matching chord key, or null.
  function stackedChordKey(intervals, i, offsets, chords) {
    var n = intervals.length;
    var base = intervals[i];
    var pcs = offsets.map(function (o) { return mod12(intervals[(i + o) % n] - base); });
    return matchChordKey(pcs, chords);
  }

  // Diatonic chords of a scale: build a chord on each scale degree by stacking
  // thirds (4-note 7th first, then a 3-note triad), keeping the ones that match
  // a known chord quality. Returns [{ root, chordKey }] (root flat-spelled).
  function diatonicChords(scale, scaleRootName, chords) {
    var intervals = scale.intervals;
    var n = intervals.length;
    var rootPc = pitchClassOf(scaleRootName);
    var out = [];
    var seen = {};
    for (var i = 0; i < n; i++) {
      var key = stackedChordKey(intervals, i, [0, 2, 4, 6], chords) ||
                stackedChordKey(intervals, i, [0, 2, 4], chords);
      if (!key) continue;
      var pc = mod12(rootPc + intervals[i]);
      var sig = pc + '|' + key;
      if (seen[sig]) continue;
      seen[sig] = true;
      out.push({ root: ROOTS[pc], chordKey: key });
    }
    return out;
  }

  // Chords to recommend for a scale — practical / commonly-paired chords, not
  // the full theoretical diatonic set:
  //   1. `over`   — the chord(s) the scale is played over (flagged primary).
  //   2. `common` — other chords frequently used with it, as
  //                 [semitoneFromScaleRoot, chordKey] pairs.
  // If a scale declares neither, fall back to the diatonic chords so it still
  // shows something. Deduplicated by root + quality.
  function recommendedChords(scale, scaleRootName, chords) {
    var rootPc = pitchClassOf(scaleRootName);
    var out = [];
    var seen = {};
    function add(root, key, primary) {
      if (!chords[key]) return;
      var sig = root + '|' + key;
      if (seen[sig]) return;
      seen[sig] = true;
      out.push({ root: root, chordKey: key, primary: !!primary });
    }

    var hasOver = scale.over && scale.over.length;
    var hasCommon = scale.common && scale.common.length;

    if (hasOver) {
      scale.over.forEach(function (key) { add(ROOTS[rootPc], key, true); });
    }
    if (hasCommon) {
      scale.common.forEach(function (pair) {
        add(ROOTS[mod12(rootPc + pair[0])], pair[1], false);
      });
    } else if (!hasOver) {
      diatonicChords(scale, scaleRootName, chords).forEach(function (r) {
        add(r.root, r.chordKey, false);
      });
    }
    return out;
  }

  TT.theory = {
    SHARP_NAMES: SHARP_NAMES,
    FLAT_NAMES: FLAT_NAMES,
    NOTE_INDEX: NOTE_INDEX,
    ROOTS: ROOTS,
    GENERIC_DEGREES: GENERIC_DEGREES,
    mod12: mod12,
    pitchClassOf: pitchClassOf,
    usesFlats: usesFlats,
    noteName: noteName,
    chordDegreeMap: chordDegreeMap,
    degreeLabel: degreeLabel,
    scaleDegreeLabel: scaleDegreeLabel,
    isGuideDegree: isGuideDegree,
    diatonicChords: diatonicChords,
    recommendedChords: recommendedChords
  };
})(typeof window !== 'undefined' ? window : this);
