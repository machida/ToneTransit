/*
 * quiz.js
 *
 * Generates a quick ear/eye challenge from the current fretboard model
 * ("which notes are the guide tones?" etc.). Pure: takes a model (and an
 * optional rng for deterministic tests), returns a question or null. The
 * answer is expressed as a set of pitch classes, which the UI matches against
 * the data-pc of tapped notes. No DOM, no state.
 *
 * Exposed on TT.quiz (and module.exports for node tests).
 */
(function (global) {
  'use strict';

  var TT = (global.TT = global.TT || {});

  function uniqueVisible(model) {
    var seen = {};
    var out = [];
    model.strings.forEach(function (str) {
      str.cells.forEach(function (c) {
        if (!c.visible || seen[c.name]) return;
        seen[c.name] = true;
        out.push(c);
      });
    });
    return out;
  }

  function pcSet(cells) {
    var seen = {};
    cells.forEach(function (c) { seen[c.pitchClass] = true; });
    return Object.keys(seen).map(Number);
  }

  // Returns { prompt, correctPitchClasses } or null when nothing can be asked.
  function quizFor(model, rng) {
    rng = rng || Math.random;
    if (model.noScale && model.noChord) return null;

    var notes = uniqueVisible(model);
    if (!notes.length) return null;
    var candidates = [];

    var guides = notes.filter(function (c) { return c.isGuide; });
    if (guides.length) {
      candidates.push({ prompt: 'ガイドトーン（コードの 3rd / 7th）はどれ？', pcs: pcSet(guides) });
    }

    var roots = notes.filter(function (c) { return c.isChordRoot; });
    if (roots.length) {
      candidates.push({ prompt: 'ルート（1度）はどれ？', pcs: pcSet(roots) });
    }

    if (!model.noChord) {
      var cts = notes.filter(function (c) { return c.isChordTone && !c.isChordRoot; });
      if (cts.length) {
        var pick = cts[Math.floor(rng() * cts.length) % cts.length];
        candidates.push({
          prompt: model.chordName + ' の ' + pick.degree + ' はどれ？',
          pcs: [pick.pitchClass]
        });
      }
    }

    var outs = notes.filter(function (c) { return c.outOfScale; });
    if (outs.length) {
      candidates.push({ prompt: 'スケールに無いコードトーン（噛み合わない音）はどれ？', pcs: pcSet(outs) });
    }

    if (!candidates.length) return null;
    var q = candidates[Math.floor(rng() * candidates.length) % candidates.length];
    return { prompt: q.prompt, correctPitchClasses: q.pcs };
  }

  TT.quiz = { quizFor: quizFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = { quizFor: quizFor };
})(typeof window !== 'undefined' ? window : this);
