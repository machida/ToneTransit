/*
 * summary.js
 *
 * Turns a fretboard model into a one/two-sentence plain-language description,
 * bridging the diagram and the theory ("what am I looking at?"). Pure: takes a
 * model (from fretboard.buildModel) and an optional lang ('ja' | 'en', default
 * 'ja'), returns a string. No DOM, no state. Self-contained (no i18n dep) so it
 * stays unit-testable.
 *
 * Exposed on TT.summary (and module.exports for node tests).
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

  function nameDeg(c) { return c.name + '(' + c.degree + ')'; }

  function summary(model, lang) {
    var en = lang === 'en';
    var notes = uniqueVisible(model);

    if (model.noScale && model.noChord) {
      return en
        ? 'No scale or chord selected. Pick a scale or a chord to see what each note means.'
        : 'スケールもコードも選ばれていません。スケールかコードを選ぶと、各音の意味が表示されます。';
    }

    if (model.noScale) {
      var ct = notes.map(nameDeg).join(en ? ', ' : '・');
      return en
        ? 'Chord tones of ' + model.chordName + ': ' + ct +
          '. Pick a scale to see which of them lie in it.'
        : model.chordName + ' の構成音：' + ct + '。スケールを選ぶと、各音がスケールに含まれるかが分かります。';
    }

    if (model.noChord) {
      var sc = notes.map(nameDeg).join(en ? ', ' : '・');
      return en
        ? model.scaleRoot + ' ' + model.scaleName + ' — notes: ' + sc +
          '. Pick a chord to read each note as a degree against it.'
        : model.scaleRoot + ' ' + model.scaleName + ' の構成音：' + sc +
          '。コードを選ぶと、各音が「そのコードに対して何度か」を表示します。';
    }

    // Scale over a chord — the core case.
    var guides = notes.filter(function (c) { return c.isGuide; }).map(nameDeg);
    var tensions = notes.filter(function (c) {
      return !c.isChordTone && c.inScale && !c.isChordRoot;
    }).map(nameDeg);
    var outs = notes.filter(function (c) { return c.outOfScale; }).map(nameDeg);

    if (en) {
      var s = model.scaleRoot + ' ' + model.scaleName + ' over ' + model.chordName + '. ';
      if (guides.length) s += 'Guide tones: ' + guides.join(' and ') + '. ';
      if (tensions.length) s += 'Tensions (non-chord scale notes): ' + tensions.join(', ') + '. ';
      s += outs.length
        ? 'Out-of-scale chord tones: ' + outs.join(', ') + ' (scale and chord clash here).'
        : 'No out-of-scale chord tones — a good fit.';
      return s;
    }

    var j = model.chordName + ' の上で ' + model.scaleRoot + ' ' + model.scaleName + '。';
    if (guides.length) j += 'ガイドトーンは ' + (guides.length <= 2 ? guides.join(' と ') : guides.join('・')) + '。';
    if (tensions.length) j += 'テンション（コード外のスケール音）は ' + tensions.join('・') + '。';
    j += outs.length
      ? 'スケール外のコードトーンは ' + outs.join('・') + '（コードとスケールが噛み合っていない音）。'
      : 'スケール外のコードトーンはなく、よく噛み合っています。';
    return j;
  }

  TT.summary = summary;
  if (typeof module !== 'undefined' && module.exports) module.exports = summary;
})(typeof window !== 'undefined' ? window : this);
