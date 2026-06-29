'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
const i18n = require('../js/i18n');

test('en and ja dictionaries have exactly the same keys', () => {
  const ja = Object.keys(i18n.dict.ja).sort();
  const en = Object.keys(i18n.dict.en).sort();
  assert.deepEqual(en, ja, 'ja/en key sets must match (no missing translations)');
});

test('no translation value is empty', () => {
  ['ja', 'en'].forEach((lang) => {
    Object.entries(i18n.dict[lang]).forEach(([k, v]) => {
      assert.ok(typeof v === 'string' && v.length > 0, lang + '.' + k + ' is non-empty');
    });
  });
});

test('t() returns the requested language and falls back to ja', () => {
  assert.equal(i18n.t('action.share', null, 'en'), 'Copy link');
  assert.equal(i18n.t('action.share', null, 'ja'), 'リンクをコピー');
  // Unknown key falls back to the key itself.
  assert.equal(i18n.t('nope.nope', null, 'en'), 'nope.nope');
});

test('resolve() falls back to ja for unknown languages', () => {
  assert.equal(i18n.resolve('fr'), 'ja');
  assert.equal(i18n.resolve('en'), 'en');
});
