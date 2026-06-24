/*
 * renderer.js
 *
 * Draws a fretboard model as an SVG element. Pure: takes a model, returns an
 * <svg>. Used for both the on-screen diagram and the printable sheets, so the
 * print output is identical to the screen.
 *
 * Black & white friendly: chord tones, guide tones, the chord root and plain
 * scale notes are distinguished by fill, stroke and shape, not colour alone.
 */
(function (global) {
  'use strict';

  var TT = (global.TT = global.TT || {});
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Layout constants (SVG user units).
  var L = {
    padTop: 28,
    padBottom: 40,
    padLeft: 46,
    padRight: 22,
    stringGap: 40,
    fretWidth: 64,
    openWidth: 40,
    radius: 15
  };

  function el(name, attrs, text) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function render(model, ariaLabel) {
    var label = ariaLabel || '指板図';
    var nStrings = model.strings.length;
    var firstFret = model.fretStart;

    // Open strings (fret 0) live in a dedicated zone LEFT of the nut, so they
    // never look like they are fretted at fret 1. Fretted cells start at the
    // first fret >= 1 within range.
    var hasOpen = firstFret === 0;
    var openZone = hasOpen ? L.openWidth : 0;
    var firstCellFret = hasOpen ? 1 : firstFret;
    var nCells = Math.max(0, model.fretEnd - firstCellFret + 1);

    var nutX = L.padLeft + openZone;            // left edge of the fretted area
    var width = nutX + nCells * L.fretWidth + L.padRight;
    var height = L.padTop + (nStrings - 1) * L.stringGap + L.padBottom;

    var svg = el('svg', {
      xmlns: SVG_NS,
      viewBox: '0 0 ' + width + ' ' + height,
      class: 'tt-fretboard tt-level-' + (model.level || 'advanced'),
      role: 'img',
      'aria-label': label
    });
    svg.appendChild(el('title', {}, label)); // screen-reader description

    function stringY(s) { return L.padTop + s * L.stringGap; }
    function openX() { return L.padLeft + openZone / 2; }
    // Centre X of the cell for an actual fret number (>= firstCellFret).
    function fretX(fretNo) {
      return nutX + (fretNo - firstCellFret) * L.fretWidth + L.fretWidth / 2;
    }

    var boardLeft = L.padLeft;
    var boardRight = nutX + nCells * L.fretWidth;
    var boardTop = stringY(0);
    var boardBottom = stringY(nStrings - 1);

    // --- Fret wires (vertical lines) ---
    // Left edge: thick nut when the range starts open, otherwise a plain wire.
    svg.appendChild(el('line', {
      x1: nutX, y1: boardTop, x2: nutX, y2: boardBottom,
      class: hasOpen ? 'tt-nut' : 'tt-fret'
    }));
    for (var f = 1; f <= nCells; f++) {
      var x = nutX + f * L.fretWidth;
      svg.appendChild(el('line', {
        x1: x, y1: boardTop, x2: x, y2: boardBottom, class: 'tt-fret'
      }));
    }

    // --- Fret position numbers (under the board) ---
    if (hasOpen) {
      svg.appendChild(el('text', {
        x: openX(), y: boardBottom + L.radius + 17, class: 'tt-fretnum', 'text-anchor': 'middle'
      }, '0'));
    }
    for (var c = 0; c < nCells; c++) {
      var fno = firstCellFret + c;
      svg.appendChild(el('text', {
        x: fretX(fno), y: boardBottom + L.radius + 17, class: 'tt-fretnum', 'text-anchor': 'middle'
      }, String(fno)));
    }

    // --- Strings (horizontal lines) + open-string labels ---
    for (var s = 0; s < nStrings; s++) {
      var y = stringY(s);
      svg.appendChild(el('line', {
        x1: boardLeft, y1: y, x2: boardRight, y2: y, class: 'tt-string'
      }));
      svg.appendChild(el('text', {
        x: L.padLeft - 18, y: y + 4, class: 'tt-stringlabel', 'text-anchor': 'middle'
      }, model.strings[s].label));
    }

    // --- Note markers ---
    for (var si = 0; si < nStrings; si++) {
      var cells = model.strings[si].cells;
      for (var ci = 0; ci < cells.length; ci++) {
        var cell = cells[ci];
        if (!cell.visible) continue;
        var noteX = cell.fret === 0 ? openX() : fretX(cell.fret);
        drawNote(svg, cell, noteX, stringY(si), model.displayMode);
      }
    }

    return svg;
  }

  function noteClass(cell) {
    var base;
    if (cell.isChordRoot) base = 'tt-note tt-root';
    else if (cell.isGuide) base = 'tt-note tt-guide';
    else if (cell.isChordTone) base = 'tt-note tt-chordtone';
    else base = 'tt-note tt-scale';
    return cell.outOfScale ? base + ' tt-out' : base;
  }

  // A plain-language description of a note's role (for the SVG <title> /
  // screen readers / hover). E.g. "B — 3（ガイドトーン・スケール内）".
  function describeCell(cell) {
    var role;
    if (cell.isChordRoot) role = 'ルート';
    else if (cell.isGuide) role = 'ガイドトーン';
    else if (cell.isChordTone) role = 'コードトーン';
    else role = 'スケール音';
    var loc = cell.outOfScale ? '・スケール外' : '';
    return cell.name + ' — ' + cell.degree + '（' + role + loc + '）';
  }

  function drawNote(svg, cell, cx, cy, mode) {
    var g = el('g', {
      class: noteClass(cell),
      'data-pc': cell.pitchClass,
      'data-fret': cell.fret
    });
    g.appendChild(el('title', {}, describeCell(cell))); // hover / SR description

    // Chord root gets a square so it reads even with no colour; the rest are
    // circles.
    if (cell.isChordRoot) {
      var sz = L.radius * 1.9;
      g.appendChild(el('rect', {
        x: cx - sz / 2, y: cy - sz / 2, width: sz, height: sz, rx: 3,
        class: 'tt-shape'
      }));
    } else {
      g.appendChild(el('circle', { cx: cx, cy: cy, r: L.radius, class: 'tt-shape' }));
    }

    // Rings are independent: a guide tone gets a solid ring, a chord tone
    // outside the scale gets a dashed ring. A note can be BOTH (an out-of-scale
    // 3rd / 7th), so the dashed ring sits one step further out and neither is
    // hidden.
    if (cell.isGuide) {
      g.appendChild(el('circle', { cx: cx, cy: cy, r: L.radius + 4, class: 'tt-ring' }));
    }
    if (cell.outOfScale) {
      var outR = cell.isGuide ? L.radius + 7 : L.radius + 4;
      g.appendChild(el('circle', { cx: cx, cy: cy, r: outR, class: 'tt-ring tt-ring--out' }));
    }

    if (mode === 'name-degree') {
      g.appendChild(el('text', {
        x: cx, y: cy - 1, class: 'tt-label tt-label-main', 'text-anchor': 'middle'
      }, cell.name));
      g.appendChild(el('text', {
        x: cx, y: cy + 11, class: 'tt-label tt-label-sub', 'text-anchor': 'middle'
      }, cell.degree));
    } else {
      g.appendChild(el('text', {
        x: cx, y: cy + 4, class: 'tt-label', 'text-anchor': 'middle'
      }, labelFor(cell, mode)));
    }

    svg.appendChild(g);
  }

  // Label style only ('name-degree' is handled separately in drawNote).
  function labelFor(cell, mode) {
    return mode === 'degree' ? cell.degree : cell.name;
  }

  TT.renderer = { render: render, describeCell: describeCell };
})(typeof window !== 'undefined' ? window : this);
