/*
 * presets.js
 *
 * "例を試す" quick-start presets. Each preset is a label + caption + a partial
 * state patch (only fields that exist in the app `state`). Applying a preset is
 * just Object.assign(state, patch) -> normalizeState() -> update(), so presets
 * are also shareable as plain URLs.
 *
 * The scale/chord keys MUST exist in data/*.json; test/presets.test.js guards
 * this. Pure data, no DOM — exposed on TT.presets (and module.exports for node).
 */
(function (global) {
  'use strict';

  var TT = (global.TT = global.TT || {});

  var PRESETS = [
    {
      label: 'ドミナントの解決',
      caption: 'G7 上の C メジャー（B=3rd, F=♭7 がガイドトーン）',
      patch: { scaleRoot: 'C', scaleKey: 'major', chordRoot: 'G', chordKey: '7', noScale: false, noChord: false }
    },
    {
      label: 'ブルース',
      caption: 'A7 上の A マイナーペンタ',
      patch: { scaleRoot: 'A', scaleKey: 'pentatonic_minor', chordRoot: 'A', chordKey: '7', noScale: false, noChord: false }
    },
    {
      label: 'ドリアン',
      caption: 'Dm7 上の D ドリアン（♮6 の浮遊感）',
      patch: { scaleRoot: 'D', scaleKey: 'dorian', chordRoot: 'D', chordKey: 'm7', noScale: false, noChord: false }
    },
    {
      label: 'リディアン',
      caption: 'Cmaj7 上の C リディアン（♯11）',
      patch: { scaleRoot: 'C', scaleKey: 'lydian', chordRoot: 'C', chordKey: 'maj7', noScale: false, noChord: false }
    },
    {
      label: 'オルタード',
      caption: 'G7 上の G オルタード（緊張するドミナント）',
      patch: { scaleRoot: 'G', scaleKey: 'altered', chordRoot: 'G', chordKey: '7', noScale: false, noChord: false }
    },
    {
      label: 'コードトーンだけ',
      caption: 'スケールを外して G7 の構成音のみ表示',
      patch: { scaleRoot: 'C', scaleKey: 'major', chordRoot: 'G', chordKey: '7', noScale: true, noChord: false }
    }
  ];

  TT.presets = PRESETS;
  if (typeof module !== 'undefined' && module.exports) module.exports = PRESETS;
})(typeof window !== 'undefined' ? window : this);
