/*
 * summary.js
 *
 * Turns a fretboard model into structured summary data for the preview.
 * Pure: takes a model (from fretboard.buildModel) and an optional
 * lang ('ja' | 'en', default 'ja'), returns { intro, bullets }.
 * No DOM, no state. Self-contained (no i18n dep) so it stays unit-testable.
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
  function joinJa(items, sep, lastSep) {
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + lastSep + items[1];
    return items.slice(0, -1).join(sep) + lastSep + items[items.length - 1];
  }

  function summary(model, lang) {
    var en = lang === 'en';
    var notes = uniqueVisible(model);

    if (model.noScale && model.noChord) {
      return {
        intro: en ? 'No scale or chord selected.' : 'スケールもコードも選ばれていません。',
        bullets: [
          en
            ? 'Pick a scale or a chord to see what each note means.'
            : 'スケールかコードを選ぶと、各音の意味が表示されます。'
        ]
      };
    }

    if (model.noScale) {
      var ct = notes.map(nameDeg).join(en ? ', ' : '・');
      return {
        intro: en ? 'Chord tones of ' + model.chordName : model.chordName + ' の情報',
        bullets: [
          (en ? 'Chord tones: ' : '構成音: ') + ct,
          en
            ? 'Pick a scale to see which of them lie in it.'
            : 'スケールを選ぶと、どの音がスケールに入るかが分かります。'
        ]
      };
    }

    if (model.noChord) {
      var sc = notes.map(nameDeg).join(en ? ', ' : '・');
      return {
        intro: en ? model.scaleRoot + ' ' + model.scaleName : model.scaleRoot + ' ' + model.scaleName + ' の情報',
        bullets: [
          (en ? 'Notes: ' : '構成音: ') + sc,
          en
            ? 'Pick a chord to read each note as a degree against it.'
            : 'コードを選ぶと、各音がそのコードに対して何度かを読めます。'
        ]
      };
    }

    // Scale over a chord — the core case.
    var guides = notes.filter(function (c) { return c.isGuide; }).map(nameDeg);
    var tensions = notes.filter(function (c) {
      return !c.isChordTone && c.inScale && !c.isChordRoot;
    }).map(nameDeg);
    var outs = notes.filter(function (c) { return c.outOfScale; }).map(nameDeg);

    if (en) {
      return {
        intro: model.scaleRoot + ' ' + model.scaleName + ' over ' + model.chordName,
        bullets: [
          guides.length ? 'Guide tones: ' + guides.join(' and ') : 'Guide tones: none',
          tensions.length ? 'Tensions: ' + tensions.join(', ') : 'Tensions: none',
          outs.length ? 'Out-of-scale chord tones: ' + outs.join(', ') : 'Out-of-scale chord tones: none'
        ]
      };
    }

    return {
      intro: model.chordName + ' に対して ' + model.scaleRoot + ' ' + model.scaleName,
      bullets: [
        guides.length
          ? 'ガイドトーン: ' + joinJa(guides, '・', ' と ')
          : 'ガイドトーン: なし',
        tensions.length
          ? 'テンション: ' + joinJa(tensions, '・', ' と ')
          : 'テンション: なし',
        outs.length
          ? 'スケール外のコードトーン: ' + joinJa(outs, '・', ' と ')
          : 'スケール外のコードトーン: なし'
      ]
    };
  }

  TT.summary = summary;
  if (typeof module !== 'undefined' && module.exports) module.exports = summary;
})(typeof window !== 'undefined' ? window : this);
