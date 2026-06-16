/*
 * app.js
 *
 * The only stateful module. Holds a single `state` object, loads the JSON
 * data, wires up the controls, keeps the URL / localStorage in sync and
 * triggers rendering. No framework, no store library.
 */
(function (global) {
  'use strict';

  var TT = global.TT;
  var theory = TT.theory;
  var fretboard = TT.fretboard;
  var renderer = TT.renderer;

  var STORAGE_KEY = 'tone-transit:state';

  var data = { scales: {}, chords: {} };

  // The single source of truth.
  var state = {
    scaleRoot: 'C',
    scaleKey: 'major',
    chordRoot: 'G',
    chordKey: '7',
    noChord: false,
    fretStart: 0,
    fretEnd: 12,
    displayMode: 'name-degree', // label style: name | degree | name-degree
    palette: 'color',           // preview palette: color | mono
    noScale: false
  };

  // ---- Persistence -------------------------------------------------------

  function readUrl() {
    var p = new URLSearchParams(global.location.search);
    if (p.get('root')) state.scaleRoot = decodeURIComponent(p.get('root'));
    if (p.get('scale')) state.scaleKey = p.get('scale');
    if (p.get('chord')) applyChordSymbol(p.get('chord'));
    if (p.get('nochord')) state.noChord = p.get('nochord') === '1';
    if (p.get('from')) state.fretStart = parseInt(p.get('from'), 10) || 0;
    if (p.get('to')) state.fretEnd = parseInt(p.get('to'), 10) || 12;
    if (p.get('mode')) state.displayMode = p.get('mode');
    if (p.get('pal')) state.palette = p.get('pal');
    if (p.get('noscale')) state.noScale = p.get('noscale') === '1';
  }

  // Old display modes mixed label + filter. Migrate legacy values ('chord-tones'
  // / 'guide-tones') from URLs or storage to the current label-only model.
  function migrateDisplayMode() {
    if (state.displayMode === 'chord-tones') state.noScale = true;
    if (['name', 'degree', 'name-degree'].indexOf(state.displayMode) < 0) {
      state.displayMode = 'name-degree';
    }
    if (['color', 'mono'].indexOf(state.palette) < 0) state.palette = 'color';
  }

  function readStorage() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.keys(saved).forEach(function (k) {
        if (k in state) state[k] = saved[k];
      });
    } catch (e) { /* ignore corrupt storage */ }
  }

  function persist() {
    // localStorage
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}

    // URL (shareable, ?root=C&scale=major&chord=G7 ...)
    var p = new URLSearchParams();
    p.set('root', state.scaleRoot);
    p.set('scale', state.scaleKey);
    p.set('chord', currentChordSymbol());
    p.set('from', state.fretStart);
    p.set('to', state.fretEnd);
    p.set('mode', state.displayMode);
    if (state.palette === 'mono') p.set('pal', 'mono');
    if (state.noChord) p.set('nochord', '1');
    if (state.noScale) p.set('noscale', '1');
    global.history.replaceState(null, '', '?' + p.toString());
  }

  // ---- Chord helpers -----------------------------------------------------

  function currentChordSymbol() {
    var chord = data.chords[state.chordKey];
    var suffix = chord ? chord.symbol : '';
    return state.chordRoot + suffix;
  }

  function applyChordSymbol(symbol) {
    var parsed = fretboard.parseChordSymbol(symbol, data.chords);
    if (parsed) {
      state.chordRoot = parsed.root;
      state.chordKey = parsed.chordKey;
    }
  }

  // ---- Rendering ---------------------------------------------------------

  var els = {};

  function cacheEls() {
    [
      'scaleRoot', 'scaleRootField', 'scaleCombo', 'scaleSearch', 'scaleList', 'noScale', 'scaleNotes',
      'scaleDesc', 'scaleHint',
      'chordRoot', 'chordRootField', 'chord', 'chordTypeField', 'noChord', 'chordReco', 'chordNotes',
      'fretStart', 'fretEnd',
      'chordDesc',
      'board', 'sheetTitle', 'sheetInfo', 'dataError'
    ].forEach(function (id) { els[id] = document.getElementById(id); });
  }

  // Chord dropdown display order (integer-like keys like "7" can't keep object
  // insertion order, so the order is fixed here; group labels come from data).
  var CHORD_ORDER = [
    'maj', 'm', 'aug', 'sus4',
    '6', 'm6', '6/9',
    'maj7', 'm7', '7', 'mMaj7', 'm7b5', 'dim', 'maj7#5', '7sus4',
    'add9', '9', 'm9', 'maj9', 'm11', '13'
  ];

  function populateSelects() {
    fillOptions(els.scaleRoot, theory.ROOTS, theory.ROOTS, state.scaleRoot);
    fillOptions(els.chordRoot, theory.ROOTS, theory.ROOTS, state.chordRoot);
    fillChordOptions(els.chord, data.chords, state.chordKey);
  }

  // Builds the chord <select> grouped into <optgroup> by each chord's `group`,
  // in CHORD_ORDER (unlisted chords fall into "その他" at the end).
  function fillChordOptions(select, chords, selected) {
    select.innerHTML = '';
    var keys = CHORD_ORDER.filter(function (k) { return chords[k]; })
      .concat(Object.keys(chords).filter(function (k) { return CHORD_ORDER.indexOf(k) < 0; }));
    var groups = {};
    var order = [];
    keys.forEach(function (key) {
      var g = chords[key].group || 'その他';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(key);
    });
    order.forEach(function (g) {
      var og = document.createElement('optgroup');
      og.label = g;
      groups[g].forEach(function (key) {
        var c = chords[key];
        var opt = document.createElement('option');
        opt.value = key;
        opt.textContent = c.name + (c.symbol ? '  (' + c.symbol + ')' : '');
        if (key === selected) opt.selected = true;
        og.appendChild(opt);
      });
      select.appendChild(og);
    });
  }

  // ---- Scale combobox (incremental search, katakana-aware) ---------------

  var combo = { open: false, items: [], highlight: -1 };

  // Normalises text for matching: lowercases latin and folds hiragana to
  // katakana, so "どりあん" and "ドリアン" and "dorian" all match.
  function normalizeText(s) {
    s = (s || '').toLowerCase();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0x3041 && c <= 0x3096) out += String.fromCharCode(c + 0x60);
      else out += s[i];
    }
    return out;
  }

  // A scale matches when every whitespace-separated token of the query is
  // found in its name, category, key or kana aliases.
  function scaleMatches(key, query) {
    var sc = data.scales[key];
    var hay = normalizeText(
      sc.name + ' ' + (sc.category || '') + ' ' + key + ' ' + (sc.kana || []).join(' ')
    );
    var tokens = normalizeText(query).split(/\s+/).filter(Boolean);
    return tokens.every(function (t) { return hay.indexOf(t) >= 0; });
  }

  function scaleName(key) {
    return data.scales[key] ? data.scales[key].name : '';
  }

  // Rebuilds the dropdown list, grouped by category, filtered by `query`.
  function buildScaleList(query) {
    els.scaleList.innerHTML = '';
    combo.items = [];

    var groups = {};
    var order = [];
    Object.keys(data.scales).forEach(function (key) {
      if (query && !scaleMatches(key, query)) return;
      var cat = data.scales[key].category || 'その他';
      if (!groups[cat]) { groups[cat] = []; order.push(cat); }
      groups[cat].push(key);
    });

    if (!order.length) {
      var empty = document.createElement('li');
      empty.className = 'tt-combo-empty';
      empty.textContent = '該当するスケールがありません';
      els.scaleList.appendChild(empty);
      combo.highlight = -1;
      return;
    }

    order.forEach(function (cat) {
      var head = document.createElement('li');
      head.className = 'tt-combo-group';
      head.textContent = cat;
      els.scaleList.appendChild(head);

      groups[cat].forEach(function (key) {
        var li = document.createElement('li');
        li.className = 'tt-combo-item' + (key === state.scaleKey ? ' is-selected' : '');
        li.setAttribute('role', 'option');
        li.id = 'tt-opt-' + key;
        li.dataset.key = key;
        li.textContent = data.scales[key].name;
        li.addEventListener('mousedown', function (e) {
          e.preventDefault(); // keep focus, avoid blur-revert
          selectScale(key);
        });
        els.scaleList.appendChild(li);
        combo.items.push(li);
      });
    });

    // Highlight the selected item if visible, else the first match.
    var selIdx = combo.items.findIndex(function (li) {
      return li.dataset.key === state.scaleKey;
    });
    setHighlight(selIdx >= 0 ? selIdx : 0);
  }

  function setHighlight(idx) {
    if (combo.highlight >= 0 && combo.items[combo.highlight]) {
      combo.items[combo.highlight].classList.remove('is-active');
    }
    combo.highlight = idx;
    var li = combo.items[idx];
    if (li) {
      li.classList.add('is-active');
      li.scrollIntoView({ block: 'nearest' });
      els.scaleSearch.setAttribute('aria-activedescendant', li.id);
    } else {
      els.scaleSearch.removeAttribute('aria-activedescendant');
    }
  }

  function openScaleList(query) {
    combo.open = true;
    els.scaleSearch.setAttribute('aria-expanded', 'true');
    els.scaleList.hidden = false;
    buildScaleList(query || '');
  }

  function closeScaleList(revert) {
    combo.open = false;
    els.scaleSearch.setAttribute('aria-expanded', 'false');
    els.scaleSearch.removeAttribute('aria-activedescendant');
    els.scaleList.hidden = true;
    if (revert) els.scaleSearch.value = scaleName(state.scaleKey);
  }

  function selectScale(key) {
    state.scaleKey = key;
    els.scaleSearch.value = scaleName(key);
    closeScaleList(false);
    update();
  }

  function bindScaleCombo() {
    els.scaleSearch.value = scaleName(state.scaleKey);

    els.scaleSearch.addEventListener('focus', function () {
      this.select();
      openScaleList(''); // show everything on focus
    });
    els.scaleSearch.addEventListener('click', function () {
      if (!combo.open) openScaleList(''); // reopen after a prior selection
    });
    els.scaleSearch.addEventListener('input', function () {
      if (!combo.open) combo.open = true;
      openScaleList(this.value);
    });
    els.scaleSearch.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!combo.open) { openScaleList(this.value); return; }
        moveHighlight(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveHighlight(-1);
      } else if (e.key === 'Enter') {
        if (combo.open && combo.items[combo.highlight]) {
          e.preventDefault();
          selectScale(combo.items[combo.highlight].dataset.key);
        }
      } else if (e.key === 'Escape') {
        if (combo.open) { e.preventDefault(); closeScaleList(true); }
      }
    });
    els.scaleSearch.addEventListener('blur', function () {
      // Delay so a click on an item (mousedown) can win first.
      global.setTimeout(function () {
        if (combo.open) closeScaleList(true);
      }, 0);
    });
  }

  function moveHighlight(dir) {
    if (!combo.items.length) return;
    var idx = combo.highlight;
    do {
      idx = (idx + dir + combo.items.length) % combo.items.length;
    } while (false);
    setHighlight(idx);
  }

  // ---- Radio group helpers (label style) --------------------------------

  function setRadio(name, value) {
    var inputs = document.querySelectorAll('input[name="' + name + '"]');
    inputs.forEach(function (el) { el.checked = el.value === value; });
  }

  function bindRadio(name, onChange) {
    var inputs = document.querySelectorAll('input[name="' + name + '"]');
    inputs.forEach(function (el) {
      el.addEventListener('change', function () {
        if (this.checked) onChange(this.value);
      });
    });
  }

  function fillOptions(select, values, labels, selected) {
    select.innerHTML = '';
    values.forEach(function (v, i) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = labels[i];
      if (v === selected) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function syncControls() {
    els.scaleRoot.value = state.scaleRoot;
    // Don't clobber what the user is typing into the search box.
    if (document.activeElement !== els.scaleSearch) {
      els.scaleSearch.value = scaleName(state.scaleKey);
    }
    els.chordRoot.value = state.chordRoot;
    els.chord.value = state.chordKey;
    els.fretStart.value = state.fretStart;
    els.fretEnd.value = state.fretEnd;
    setRadio('displayMode', state.displayMode);
    setRadio('palette', state.palette);
    document.body.classList.toggle('tt-mono', state.palette === 'mono');
    els.noScale.checked = state.noScale;
    els.noChord.checked = state.noChord;

    // No scale → there is no key, so the scale search and the (scale) root
    // are both irrelevant; grey them out. Note spelling follows the chord root.
    els.scaleSearch.disabled = state.noScale;
    els.scaleCombo.classList.toggle('is-disabled', state.noScale);
    els.scaleRoot.disabled = state.noScale;
    els.scaleRootField.classList.toggle('is-disabled', state.noScale);
    els.scaleHint.hidden = !state.noScale;

    // No chord → grey the chord pickers.
    els.chordRoot.disabled = state.noChord;
    els.chord.disabled = state.noChord;
    els.chordRootField.classList.toggle('is-disabled', state.noChord);
    els.chordTypeField.classList.toggle('is-disabled', state.noChord);
  }

  // Recommended (diatonic) chords for the current scale, shown as quick-picks.
  function renderChordReco() {
    els.chordReco.innerHTML = '';
    if (state.noScale) { els.chordReco.hidden = true; return; }

    var recos = theory.recommendedChords(data.scales[state.scaleKey], state.scaleRoot, data.chords);
    if (!recos.length) { els.chordReco.hidden = true; return; }
    els.chordReco.hidden = false;

    var label = document.createElement('span');
    label.className = 'tt-reco-label';
    label.textContent = 'おすすめ';
    els.chordReco.appendChild(label);

    recos.forEach(function (r) {
      var chord = data.chords[r.chordKey];
      var symbol = r.root + chord.symbol;
      var active = !state.noChord && r.root === state.chordRoot && r.chordKey === state.chordKey;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tt-reco-chip' +
        (r.primary ? ' is-primary' : '') + (active ? ' is-active' : '');
      btn.title = r.primary ? 'このスケールが合うコード' : 'スケールのダイアトニックコード';
      btn.textContent = symbol;
      btn.addEventListener('click', function () {
        state.chordRoot = r.root;
        state.chordKey = r.chordKey;
        state.noChord = false;
        update();
      });
      els.chordReco.appendChild(btn);
    });

    if (recos.some(function (r) { return r.primary; })) {
      var note = document.createElement('span');
      note.className = 'tt-reco-note';
      note.textContent = '★ = このスケールの中心コード';
      els.chordReco.appendChild(note);
    }
  }

  // Constituent-note readouts under the scale / chord cards.
  function renderNoteLists() {
    if (state.noScale) {
      els.scaleNotes.hidden = true;
      els.scaleDesc.hidden = true;
    } else {
      var s = data.scales[state.scaleKey];
      els.scaleNotes.hidden = false;
      els.scaleNotes.innerHTML = noteListHTML(spellNotes(state.scaleRoot, s.intervals));
      els.scaleDesc.hidden = !s.description;
      els.scaleDesc.textContent = s.description || '';
    }

    if (state.noChord) {
      els.chordNotes.hidden = true;
      els.chordDesc.hidden = true;
    } else {
      var c = data.chords[state.chordKey];
      els.chordNotes.hidden = false;
      els.chordNotes.innerHTML = noteListHTML(spellNotes(state.chordRoot, c.intervals), c.degrees);
      els.chordDesc.hidden = !c.description;
      els.chordDesc.textContent = c.description || '';
    }
  }

  // Spells an interval set against a root, using that root's accidental style.
  function spellNotes(rootName, intervals) {
    var pc = theory.pitchClassOf(rootName);
    var flats = theory.usesFlats(rootName);
    return intervals.map(function (iv) { return theory.noteName(pc + iv, flats); });
  }

  function noteListHTML(names, degrees) {
    var chips = names.map(function (name, i) {
      var deg = degrees ? '<span class="tt-note-deg">' + degrees[i] + '</span>' : '';
      return '<span class="tt-note-chip">' + name + deg + '</span>';
    }).join('');
    return '<span class="tt-notes-label">構成音</span>' + chips;
  }

  // The sheet's detail area: two columns (scale / chord). Each shows a role
  // label, the selected scale/chord name, the notes with their degrees, and the
  // description.
  function buildSheetInfo(st) {
    var html = '';
    var noChord = st.noChord || !data.chords[st.chordKey];
    if (!st.noScale && data.scales[st.scaleKey]) {
      var s = data.scales[st.scaleKey];
      var degs = s.intervals.map(function (iv) { return theory.scaleDegreeLabel(iv); });
      html += infoColumn('スケール', st.scaleRoot + ' ' + s.name,
        infoNotes(spellNotes(st.scaleRoot, s.intervals), degs), s.description);
    }
    if (!noChord) {
      var c = data.chords[st.chordKey];
      var cname = (c.symbol === '' ? st.chordRoot : st.chordRoot + c.symbol) + '（' + c.name + '）';
      html += infoColumn('コード', cname,
        infoNotes(spellNotes(st.chordRoot, c.intervals), c.degrees), c.description);
    }
    return html;
  }

  function infoNotes(names, degrees) {
    return names.map(function (n, i) {
      var d = degrees ? '<span class="tt-info-deg">' + degrees[i] + '</span>' : '';
      return '<span class="tt-info-note">' + n + d + '</span>';
    }).join('');
  }

  function infoColumn(head, name, notesHTML, desc) {
    return '<div class="tt-info-col">' +
      '<div class="tt-info-head">' + head + '</div>' +
      '<div class="tt-info-name">' + name + '</div>' +
      '<div class="tt-info-notes">' + notesHTML + '</div>' +
      (desc ? '<div class="tt-info-desc">' + desc + '</div>' : '') +
      '</div>';
  }

  function titleFor(model) {
    if (model.noScale) {
      return model.noChord ? '（スケール・コードなし）'
        : model.chordName + '  コードトーン';
    }
    if (model.noChord) return model.scaleRoot + ' ' + model.scaleName;
    return model.scaleRoot + ' ' + model.scaleName + '  ×  ' + model.chordName;
  }

  function update() {
    var model = fretboard.buildModel(state, data);

    els.board.innerHTML = '';
    if (model.noScale && model.noChord) {
      var empty = document.createElement('p');
      empty.className = 'tt-empty';
      empty.textContent = '表示する音がありません。スケールかコードを選んでください。';
      els.board.appendChild(empty);
    } else {
      els.board.appendChild(renderer.render(model, titleFor(model) + ' の指板図'));
    }

    els.sheetTitle.textContent = titleFor(model);
    els.sheetInfo.innerHTML = buildSheetInfo(state);

    syncControls();
    renderChordReco();
    renderNoteLists();
    persist();
  }

  // ---- Wiring ------------------------------------------------------------

  function bindControls() {
    els.scaleRoot.addEventListener('change', function () {
      state.scaleRoot = this.value; update();
    });
    bindScaleCombo();
    els.noScale.addEventListener('change', function () {
      state.noScale = this.checked;
      if (this.checked && combo.open) closeScaleList(true);
      update();
    });
    els.noChord.addEventListener('change', function () {
      state.noChord = this.checked; update();
    });
    els.chordRoot.addEventListener('change', function () {
      state.chordRoot = this.value; update();
    });
    els.chord.addEventListener('change', function () {
      state.chordKey = this.value; update();
    });
    els.fretStart.addEventListener('change', function () {
      state.fretStart = clampFret(this.value); update();
    });
    els.fretEnd.addEventListener('change', function () {
      state.fretEnd = clampFret(this.value); update();
    });
    bindRadio('displayMode', function (v) { state.displayMode = v; update(); });
    bindRadio('palette', function (v) { state.palette = v; update(); });

    document.getElementById('printBtn').addEventListener('click', function () {
      global.print();
    });
    document.getElementById('shareBtn').addEventListener('click', copyShareLink);
  }

  function clampFret(v) {
    var n = parseInt(v, 10);
    if (isNaN(n)) n = 0;
    return Math.max(0, Math.min(24, n));
  }

  function copyShareLink() {
    var url = global.location.href;
    if (global.navigator.clipboard) {
      global.navigator.clipboard.writeText(url).then(function () {
        flash('リンクをコピーしました');
      }, function () { flash(url); });
    } else {
      flash(url);
    }
  }

  function flash(msg) {
    var n = document.getElementById('toast');
    n.textContent = msg;
    n.classList.add('is-visible');
    global.setTimeout(function () { n.classList.remove('is-visible'); }, 1800);
  }

  // ---- Boot --------------------------------------------------------------

  function loadData() {
    return Promise.all([
      fetch('data/scales.json').then(function (r) { return r.json(); }),
      fetch('data/chords.json').then(function (r) { return r.json(); })
    ]).then(function (res) {
      data.scales = res[0];
      data.chords = res[1];
    });
  }

  function boot() {
    cacheEls();
    loadData().then(function () {
      readStorage();
      readUrl(); // URL wins over storage
      migrateDisplayMode();
      populateSelects();
      bindControls();
      update();
    }).catch(function (err) {
      els.dataError.hidden = false;
      els.dataError.textContent =
        'データ (data/*.json) を読み込めませんでした。ローカルサーバー経由で開いてください ' +
        '（例: python3 -m http.server）。詳細: ' + err.message;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
