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

test('name-degree mode renders two text labels per note', () => {
  const model = fretboard.buildModel(makeState({ displayMode: 'name-degree', noScale: true, chordRoot: 'G', chordKey: '7' }), data);
  const svg = renderer.render(model);
  const noteGroups = byClass(svg, 'tt-note');
  noteGroups.forEach((g) => {
    const texts = g.childNodes.filter((c) => c.nodeName === 'text');
    assert.equal(texts.length, 2, 'name-degree shows note name + degree');
  });
});

test('empty model (no scale, no chord) draws no note markers', () => {
  const model = fretboard.buildModel(makeState({ noScale: true, noChord: true }), data);
  const svg = renderer.render(model);
  assert.equal(byClass(svg, 'tt-note').length, 0);
});
