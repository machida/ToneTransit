'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fretboard, data, makeState, visibleCells } = require('./helpers');

// Minimal SVG-DOM stub so we can render without a browser or jsdom.
function makeNode(name) {
  return {
    nodeName: name,
    _attrs: {},
    childNodes: [],
    textContent: '',
    setAttribute(k, v) { this._attrs[k] = String(v); },
    appendChild(c) { this.childNodes.push(c); return c; }
  };
}
global.document = { createElementNS(ns, name) { return makeNode(name); } };

require('../js/renderer.js');
const renderer = global.TT.renderer;

function walk(node, acc) {
  acc.push(node);
  node.childNodes.forEach((c) => walk(c, acc));
  return acc;
}
function classOf(node) { return node._attrs.class || ''; }
function allNodes(svg) { return walk(svg, []); }
function byClass(svg, cls) {
  return allNodes(svg).filter((n) => classOf(n).split(' ').indexOf(cls) >= 0);
}

test('render returns an <svg> with a viewBox', () => {
  const svg = renderer.render(fretboard.buildModel(makeState(), data));
  assert.equal(svg.nodeName, 'svg');
  assert.ok(svg._attrs.viewBox, 'viewBox set');
});

test('one note group is drawn per visible cell', () => {
  const model = fretboard.buildModel(makeState({ chordRoot: 'G', chordKey: '7' }), data);
  const svg = renderer.render(model);
  const noteGroups = byClass(svg, 'tt-note');
  assert.equal(noteGroups.length, visibleCells(model).length);
});

test('a nut is drawn only when the range starts at fret 0', () => {
  const open = renderer.render(fretboard.buildModel(makeState({ fretStart: 0, fretEnd: 5 }), data));
  assert.equal(byClass(open, 'tt-nut').length, 1);

  const shifted = renderer.render(fretboard.buildModel(makeState({ fretStart: 5, fretEnd: 9 }), data));
  assert.equal(byClass(shifted, 'tt-nut').length, 0);
});

test('the chord root is drawn as a square (rect), other notes as circles', () => {
  const model = fretboard.buildModel(makeState({ chordRoot: 'G', chordKey: '7', displayMode: 'name' }), data);
  const svg = renderer.render(model);

  const rootGroups = byClass(svg, 'tt-root');
  assert.ok(rootGroups.length > 0, 'expected at least one root marker');
  rootGroups.forEach((g) => {
    assert.ok(g.childNodes.some((c) => c.nodeName === 'rect'), 'root marker should contain a rect');
  });

  const plain = byClass(svg, 'tt-chordtone').concat(byClass(svg, 'tt-scale'));
  plain.forEach((g) => {
    assert.ok(g.childNodes.some((c) => c.nodeName === 'circle'), 'non-root note should contain a circle');
  });
});

test('guide-tone markers get an extra ring', () => {
  const model = fretboard.buildModel(makeState({ chordRoot: 'G', chordKey: '7' }), data);
  const svg = renderer.render(model);
  const rings = byClass(svg, 'tt-ring');
  assert.ok(rings.length > 0, 'guide tones should draw a ring');
});

test('an out-of-scale guide tone keeps BOTH rings (solid guide + dashed out)', () => {
  // C major over E7: G♯ is the 3rd (a guide tone) but not in C major.
  const model = fretboard.buildModel(makeState({ scaleKey: 'major', chordRoot: 'E', chordKey: '7' }), data);
  const svg = renderer.render(model);
  const outGuide = allNodes(svg).filter((n) => {
    const cls = classOf(n).split(' ');
    return cls.indexOf('tt-guide') >= 0 && cls.indexOf('tt-out') >= 0;
  });
  assert.ok(outGuide.length > 0, 'expected an out-of-scale guide tone group');
  outGuide.forEach((g) => {
    const rings = g.childNodes.filter((c) => classOf(c).split(' ').indexOf('tt-ring') >= 0);
    assert.equal(rings.length, 2, 'should draw a guide ring and a dashed out ring');
    assert.ok(rings.some((r) => classOf(r).split(' ').indexOf('tt-ring--out') >= 0), 'one ring is dashed-out');
  });
});

test('name-degree mode renders two text labels per note', () => {
  const model = fretboard.buildModel(makeState({ displayMode: 'name-degree', noScale: true, chordRoot: 'G', chordKey: '7' }), data);
  const svg = renderer.render(model);
  const noteGroups = byClass(svg, 'tt-note');
  noteGroups.forEach((g) => {
    const texts = g.childNodes.filter((c) => c.nodeName === 'text');
    assert.equal(texts.length, 2, 'name-degree shows note name + degree');
  });
});

test('every note group carries a <title> and data-pc/data-fret (SPEC-06/07)', () => {
  const model = fretboard.buildModel(makeState({ chordRoot: 'G', chordKey: '7' }), data);
  const svg = renderer.render(model);
  const groups = byClass(svg, 'tt-note');
  assert.ok(groups.length > 0);
  groups.forEach((g) => {
    const title = g.childNodes.find((c) => c.nodeName === 'title');
    assert.ok(title && title.textContent.length > 0, 'note has a descriptive <title>');
    assert.ok(g._attrs['data-pc'] !== undefined, 'note carries data-pc');
    assert.ok(g._attrs['data-fret'] !== undefined, 'note carries data-fret');
  });
});

test('describeCell names the role of a note (SPEC-07)', () => {
  const model = fretboard.buildModel(makeState({ chordRoot: 'G', chordKey: '7' }), data);
  const b = visibleCells(model).find((c) => c.name === 'B'); // 3rd of G7 = guide
  assert.match(renderer.describeCell(b), /ガイドトーン/);
  assert.match(renderer.describeCell(b), /^B —/);
});

test('empty model (no scale, no chord) draws no note markers', () => {
  const model = fretboard.buildModel(makeState({ noScale: true, noChord: true }), data);
  const svg = renderer.render(model);
  assert.equal(byClass(svg, 'tt-note').length, 0);
});
