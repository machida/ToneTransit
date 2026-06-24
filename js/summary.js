/*
 * summary.js
 *
 * Turns a fretboard model into a one/two-sentence plain-Japanese description,
 * bridging the diagram and the theory ("what am I looking at?"). Pure: takes a
 * model (from fretboard.buildModel), returns a string. No DOM, no state.
 *
 * Exposed on TT.summary (and module.exports for node tests).
 */
(function (global) {
  'use strict';

  var TT = (global.TT = global.TT || {});

  // Collects the distinct visible notes of the model (deduped by note name,
  // first occurrence wins), keeping the flags the renderer assigned.
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

  // "A と B" for two, "A・B・C" for more.
  function listJa(items) {
    return items.length <= 2 ? items.join(' と ') : items.join('・');
  }

  function summary(model) {
    if (model.noScale && model.noChord) {
      return 'スケールもコードも選ばれていません。スケールかコードを選ぶと、各音の意味が表示されます。';
    }

    var notes = uniqueVisible(model);

    if (model.noScale) {
      return model.chordName + ' の構成音：' + notes.map(nameDeg).join('・') +
        '。スケールを選ぶと、各音がスケールに含まれるかが分かります。';
    }

    if (model.noChord) {
      return model.scaleRoot + ' ' + model.scaleName + ' の構成音：' + notes.map(nameDeg).join('・') +
        '。コードを選ぶと、各音が「そのコードに対して何度か」を表示します。';
    }

    // Scale over a chord — the core case.
    var guides = notes.filter(function (c) { return c.isGuide; }).map(nameDeg);
    var tensions = notes.filter(function (c) {
      return !c.isChordTone && c.inScale && !c.isChordRoot;
    }).map(nameDeg);
    var outs = notes.filter(function (c) { return c.outOfScale; }).map(nameDeg);

    var s = model.chordName + ' の上で ' + model.scaleRoot + ' ' + model.scaleName + '。';
    if (guides.length) s += 'ガイドトーンは ' + listJa(guides) + '。';
    if (tensions.length) s += 'テンション（コード外のスケール音）は ' + tensions.join('・') + '。';
    if (outs.length) {
      s += 'スケール外のコードトーンは ' + outs.join('・') + '（コードとスケールが噛み合っていない音）。';
    } else {
      s += 'スケール外のコードトーンはなく、よく噛み合っています。';
    }
    return s;
  }

  TT.summary = summary;
  if (typeof module !== 'undefined' && module.exports) module.exports = summary;
})(typeof window !== 'undefined' ? window : this);
