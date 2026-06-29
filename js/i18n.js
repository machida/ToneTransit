/*
 * i18n.js
 *
 * Tiny dependency-free i18n. Holds the ja/en dictionaries for the main UI
 * chrome and dynamic messages, plus t(key, vars) with {var} interpolation.
 * Data-driven scale/chord descriptions are left in Japanese and fall back to it.
 *
 * Exposed on TT.i18n (and module.exports for node tests).
 */
(function (global) {
  'use strict';

  var TT = (global.TT = global.TT || {});

  var DICT = {
    ja: {
      'app.help': '？ 使い方',
      'app.lang': '言語',
      'scale.heading': 'スケール',
      'scale.root': 'ルート',
      'scale.label': 'スケール',
      'scale.search.ph': '検索（例: ドリアン / lydian）',
      'scale.show': '表示',
      'scale.showAria': 'スケールを表示（オフでコードトーンのみ）',
      'scale.hint': 'スケールなし：音名の綴りはコードのルート基準で表示します。',
      'chord.heading': 'コード',
      'chord.root': 'コードルート',
      'chord.type': '種類',
      'chord.show': '表示',
      'chord.showAria': 'コードを表示（オフでスケールのみ）',
      'audition.heading': '試聴',
      'audition.scaleTimbre': 'スケールの音色',
      'audition.chordTimbre': 'コードの音色',
      'audition.octave': 'オクターブ',
      'audition.playScale': 'スケール',
      'audition.playChord': 'コード',
      'audition.playMix': 'ミックス',
      'timbre.piano': 'ピアノ',
      'timbre.epiano': 'エレピ',
      'timbre.organ': 'オルガン',
      'timbre.simple': 'シンプル（合成）',
      'tool.notation': '表記',
      'tool.notation.name': '音名',
      'tool.notation.degree': '度数',
      'tool.notation.nameDegree': '音名＋度数',
      'tool.fretRange': 'フレット範囲',
      'tool.palette': '配色',
      'tool.palette.color': 'カラー',
      'tool.palette.mono': 'モノトーン',
      'tool.theme': 'テーマ',
      'tool.theme.auto': '自動',
      'tool.theme.light': 'ライト',
      'tool.theme.dark': 'ダーク',
      'action.image': '画像を保存',
      'action.print': '印刷 / PDF',
      'action.share': 'リンクをコピー',
      'legend.guide': '四角＝ルート、リング付き＝コードの要(3rd/7th)、青＝コードの音、薄色＝スケールの音。',
      'legend.root': 'ルート (1)',
      'legend.guideTone': 'ガイドトーン (3rd / 7th)',
      'legend.chordTone': 'コードトーン',
      'legend.scale': 'スケール音 / テンション',
      'legend.out': 'コードトーン（スケール外）',
      'toast.shared': 'リンクをコピーしました',
      'toast.imgSaved': '画像を保存しました',
      'toast.imgFail': '画像の生成に失敗しました',
      'toast.imgNone': '画像にできる図がありません',
      'toast.imgUnsupported': 'このブラウザは画像保存に未対応です',
      'coach.next': '次へ',
      'coach.done': '使ってみる',
      'coach.close': '閉じる'
    },
    en: {
      'app.help': '？ Guide',
      'app.lang': 'Language',
      'scale.heading': 'Scale',
      'scale.root': 'Root',
      'scale.label': 'Scale',
      'scale.search.ph': 'Search (e.g. dorian / lydian)',
      'scale.show': 'Show',
      'scale.showAria': 'Show the scale (off = chord tones only)',
      'scale.hint': 'No scale: note spelling follows the chord root.',
      'chord.heading': 'Chord',
      'chord.root': 'Chord root',
      'chord.type': 'Type',
      'chord.show': 'Show',
      'chord.showAria': 'Show the chord (off = scale only)',
      'audition.heading': 'Audition',
      'audition.scaleTimbre': 'Scale timbre',
      'audition.chordTimbre': 'Chord timbre',
      'audition.octave': 'Octave',
      'audition.playScale': 'Scale',
      'audition.playChord': 'Chord',
      'audition.playMix': 'Mix',
      'timbre.piano': 'Piano',
      'timbre.epiano': 'E.Piano',
      'timbre.organ': 'Organ',
      'timbre.simple': 'Simple (synth)',
      'tool.notation': 'Labels',
      'tool.notation.name': 'Note',
      'tool.notation.degree': 'Degree',
      'tool.notation.nameDegree': 'Note + degree',
      'tool.fretRange': 'Fret range',
      'tool.palette': 'Palette',
      'tool.palette.color': 'Colour',
      'tool.palette.mono': 'Mono',
      'tool.theme': 'Theme',
      'tool.theme.auto': 'Auto',
      'tool.theme.light': 'Light',
      'tool.theme.dark': 'Dark',
      'action.image': 'Save image',
      'action.print': 'Print / PDF',
      'action.share': 'Copy link',
      'legend.guide': 'Square = root, ringed = chord core (3rd/7th), blue = chord tones, pale = scale tones.',
      'legend.root': 'Root (1)',
      'legend.guideTone': 'Guide tone (3rd / 7th)',
      'legend.chordTone': 'Chord tone',
      'legend.scale': 'Scale tone / tension',
      'legend.out': 'Chord tone (outside scale)',
      'toast.shared': 'Link copied',
      'toast.imgSaved': 'Image saved',
      'toast.imgFail': 'Could not generate the image',
      'toast.imgNone': 'No diagram to export',
      'toast.imgUnsupported': 'This browser can’t save images',
      'coach.next': 'Next',
      'coach.done': 'Got it',
      'coach.close': 'Close'
    }
  };

  var current = 'ja';

  function resolve(lang) { return DICT[lang] ? lang : 'ja'; }
  function setLang(lang) { current = resolve(lang); }
  function getLang() { return current; }

  function t(key, vars, lang) {
    var d = DICT[resolve(lang || current)];
    var s = (d && d[key] != null) ? d[key] : (DICT.ja[key] != null ? DICT.ja[key] : key);
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    }
    return s;
  }

  TT.i18n = { dict: DICT, t: t, setLang: setLang, getLang: getLang, resolve: resolve };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT.i18n;
})(typeof window !== 'undefined' ? window : this);
