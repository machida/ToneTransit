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
  var audioOn = false; // Web Audio available (set in bindControls)

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
    level: 'advanced',          // detail level: beginner | advanced
    palette: 'color',           // preview palette: color | mono
    timbreScale: 'piano',       // audition timbres: piano | epiano | organ | simple
    timbreChord: 'piano',
    octaveScale: 4,             // audition octaves (C4 = 4)
    octaveChord: 3,
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
    if (p.get('lvl')) state.level = p.get('lvl');
    if (p.get('pal')) state.palette = p.get('pal');
    if (p.get('tone')) { state.timbreScale = state.timbreChord = p.get('tone'); } // legacy single
    if (p.get('toneS')) state.timbreScale = p.get('toneS');
    if (p.get('toneC')) state.timbreChord = p.get('toneC');
    if (p.get('octS')) state.octaveScale = parseInt(p.get('octS'), 10);
    if (p.get('octC')) state.octaveChord = parseInt(p.get('octC'), 10);
    if (p.get('noscale')) state.noScale = p.get('noscale') === '1';
  }

  // Normalises restored state (URL / storage) to valid values so a bad share
  // link, stale localStorage or renamed data never crashes update(). Also
  // migrates legacy display modes ('chord-tones' / 'guide-tones').
  function normalizeState() {
    if (state.displayMode === 'chord-tones') state.noScale = true;
    if (['name', 'degree', 'name-degree'].indexOf(state.displayMode) < 0) {
      state.displayMode = 'name-degree';
    }
    if (['beginner', 'advanced'].indexOf(state.level) < 0) state.level = 'advanced';
    if (['color', 'mono'].indexOf(state.palette) < 0) state.palette = 'color';
    var timbres = ['piano', 'epiano', 'organ', 'simple'];
    if (timbres.indexOf(state.timbreScale) < 0) state.timbreScale = 'piano';
    if (timbres.indexOf(state.timbreChord) < 0) state.timbreChord = 'piano';
    if ([3, 4, 5].indexOf(state.octaveScale) < 0) state.octaveScale = 4;
    if ([3, 4, 5].indexOf(state.octaveChord) < 0) state.octaveChord = 3;
    // Roots: keep any spelling theory understands (incl. sharps from a chord
    // symbol), but fall back when it's junk so the <select> / spelling never
    // get a value they can't represent.
    state.scaleRoot = normalizeRoot(state.scaleRoot, 'C');
    state.chordRoot = normalizeRoot(state.chordRoot, 'G');
    // Fret range: integers within 0–24 (buildModel orders them).
    state.fretStart = clampFret(state.fretStart);
    state.fretEnd = clampFret(state.fretEnd);
    // Unknown scale / chord keys fall back to a valid default.
    if (!data.scales[state.scaleKey]) {
      state.scaleKey = data.scales.major ? 'major' : Object.keys(data.scales)[0];
    }
    if (!data.chords[state.chordKey]) {
      state.chordKey = data.chords['7'] ? '7' : Object.keys(data.chords)[0];
    }
  }

  function normalizeRoot(root, fallback) {
    return (root != null && theory.NOTE_INDEX[root] != null) ? root : fallback;
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
    if (state.level !== 'advanced') p.set('lvl', state.level);
    if (state.palette === 'mono') p.set('pal', 'mono');
    if (state.timbreScale !== 'piano') p.set('toneS', state.timbreScale);
    if (state.timbreChord !== 'piano') p.set('toneC', state.timbreChord);
    if (state.octaveScale !== 4) p.set('octS', state.octaveScale);
    if (state.octaveChord !== 3) p.set('octC', state.octaveChord);
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
      'scaleRoot', 'scaleRootField', 'scaleCombo', 'scaleSearch', 'scaleList', 'scaleToggle', 'scaleNotes',
      'scaleDesc', 'scaleHint',
      'chordRoot', 'chordRootField', 'chord', 'chordTypeField', 'chordToggle', 'chordReco', 'chordNotes', 'chordDesc',
      'fretStart', 'fretEnd',
      'auditionCard', 'auTimbreScale', 'auTimbreChord', 'auPlayScale', 'auPlayChord', 'auPlayMix',
      'presets', 'board', 'sheetTitle', 'summary', 'sheetInfo', 'dataError',
      'quiz', 'quizQ', 'quizFeedback', 'quizNext', 'quizClose', 'quizBtn'
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
      } else if (e.key === 'Home') {
        if (combo.open && combo.items.length) { e.preventDefault(); setHighlight(0); }
      } else if (e.key === 'End') {
        if (combo.open && combo.items.length) { e.preventDefault(); setHighlight(combo.items.length - 1); }
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
    var n = combo.items.length;
    setHighlight((combo.highlight + dir + n) % n);
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
    setRadio('level', state.level);
    setRadio('palette', state.palette);
    document.body.classList.toggle('tt-mono', state.palette === 'mono');
    // Switches are ON when the scale / chord is shown (i.e. NOT the "なし" flag).
    els.scaleToggle.checked = !state.noScale;
    els.chordToggle.checked = !state.noChord;

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

    if (audioOn) {
      els.auTimbreScale.value = state.timbreScale;
      els.auTimbreChord.value = state.timbreChord;
      setRadio('scaleOctave', String(state.octaveScale));
      setRadio('chordOctave', String(state.octaveChord));
      els.auPlayScale.disabled = state.noScale;
      els.auPlayChord.disabled = state.noChord;
      els.auPlayMix.disabled = state.noScale || state.noChord; // needs both
    }
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

  // Escapes text before it goes into an innerHTML string. The bundled data is
  // trusted today, but note names / degrees / descriptions are interpolated
  // raw, so this keeps a future user-supplied or shared dataset from injecting
  // markup.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function noteListHTML(names, degrees) {
    var chips = names.map(function (name, i) {
      var deg = degrees ? '<span class="tt-note-deg">' + esc(degrees[i]) + '</span>' : '';
      return '<span class="tt-note-chip">' + esc(name) + deg + '</span>';
    }).join('');
    return '<span class="tt-notes-label">構成音</span>' + chips;
  }

  // The sheet's detail area: two columns (scale / chord). Each shows a role
  // label, the selected scale/chord name, the notes with their degrees, and the
  // description.
  function buildSheetInfo(st, model) {
    var html = '';
    if (!model.noScale) {
      var s = data.scales[st.scaleKey];
      var degs = s.intervals.map(function (iv) { return theory.scaleDegreeLabel(iv); });
      html += infoColumn('スケール', st.scaleRoot + ' ' + s.name,
        infoNotes(spellNotes(st.scaleRoot, s.intervals), degs), s.description);
    }
    if (!model.noChord) {
      var c = data.chords[st.chordKey];
      var cname = (c.symbol === '' ? st.chordRoot : st.chordRoot + c.symbol) + '（' + c.name + '）';
      html += infoColumn('コード', cname,
        infoNotes(spellNotes(st.chordRoot, c.intervals), c.degrees), c.description);
    }
    return html;
  }

  function infoNotes(names, degrees) {
    return names.map(function (n, i) {
      var d = degrees ? '<span class="tt-info-deg">' + esc(degrees[i]) + '</span>' : '';
      return '<span class="tt-info-note">' + esc(n) + d + '</span>';
    }).join('');
  }

  // `notesHTML` is already-escaped markup from infoNotes; the rest is plain text.
  function infoColumn(head, name, notesHTML, desc) {
    return '<div class="tt-info-col">' +
      '<div class="tt-info-head">' + esc(head) + '</div>' +
      '<div class="tt-info-name">' + esc(name) + '</div>' +
      '<div class="tt-info-notes">' + notesHTML + '</div>' +
      (desc ? '<div class="tt-info-desc">' + esc(desc) + '</div>' : '') +
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

  // ---- Presets ("例を試す") ---------------------------------------------

  var presetButtons = [];

  function renderPresets() {
    if (!els.presets) return;
    (TT.presets || []).forEach(function (p) {
      // Skip a preset whose data isn't present, so we never show a dead chip.
      if (!data.scales[p.patch.scaleKey] || !data.chords[p.patch.chordKey]) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tt-preset-chip';
      btn.textContent = p.label;
      btn.title = p.caption;
      btn._patch = p.patch;
      btn.addEventListener('click', function () {
        Object.keys(p.patch).forEach(function (k) {
          if (k in state) state[k] = p.patch[k];
        });
        if (combo.open) closeScaleList(false);
        normalizeState();
        update();
      });
      els.presets.appendChild(btn);
      presetButtons.push(btn);
    });
  }

  // Highlights the chip whose patch exactly matches the current selection.
  function updatePresetsActive() {
    presetButtons.forEach(function (btn) {
      var p = btn._patch;
      var on = Object.keys(p).every(function (k) { return state[k] === p[k]; });
      btn.classList.toggle('is-active', on);
    });
  }

  function update() {
    var model = fretboard.buildModel(state, data);

    // Any change to the board invalidates an in-progress quiz question.
    if (quiz.active) endQuiz();

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
    if (els.summary && TT.summary) els.summary.textContent = TT.summary(model);
    els.sheetInfo.innerHTML = buildSheetInfo(state, model);
    global.document.title = titleFor(model) + ' — ToneTransit';

    syncControls();
    renderChordReco();
    renderNoteLists();
    updatePresetsActive();
    persist();
  }

  // ---- Playback highlighting (SPEC-06) -----------------------------------

  var playTimers = [];

  function clearPlayHighlights() {
    playTimers.forEach(function (t) { global.clearTimeout(t); });
    playTimers = [];
    if (!els.board) return;
    var lit = els.board.querySelectorAll('.tt-note.is-playing');
    Array.prototype.forEach.call(lit, function (n) { n.classList.remove('is-playing'); });
  }

  function setPcPlaying(pc, on) {
    if (!els.board) return;
    var nodes = els.board.querySelectorAll('[data-pc="' + pc + '"]');
    Array.prototype.forEach.call(nodes, function (n) { n.classList.toggle('is-playing', on); });
  }

  // Called for each scheduled note; lights the matching pitch class on, then off.
  function schedulePlayHighlight(ev) {
    var on = global.setTimeout(function () { setPcPlaying(ev.pitchClass, true); }, ev.delay * 1000);
    var off = global.setTimeout(function () { setPcPlaying(ev.pitchClass, false); }, (ev.delay + ev.dur) * 1000);
    playTimers.push(on, off);
  }

  // ---- Quiz (SPEC-09) ----------------------------------------------------

  var quiz = { active: false, answer: null };

  function clearQuizMarks() {
    if (!els.board) return;
    var marked = els.board.querySelectorAll('.tt-note.is-correct, .tt-note.is-wrong');
    Array.prototype.forEach.call(marked, function (n) {
      n.classList.remove('is-correct', 'is-wrong');
    });
  }

  function startQuiz() {
    if (!TT.quiz) return;
    var q = TT.quiz.quizFor(fretboard.buildModel(state, data));
    if (!q) { flash('この盤面では出題できません'); return; }
    quiz.active = true;
    quiz.answer = q.correctPitchClasses;
    clearQuizMarks();
    clearPlayHighlights();
    els.quiz.hidden = false;
    els.quizQ.textContent = q.prompt + '（盤上の音をタップ）';
    els.quizFeedback.textContent = '';
    els.quizFeedback.className = 'tt-quiz-feedback';
  }

  function endQuiz() {
    quiz.active = false;
    quiz.answer = null;
    clearQuizMarks();
    if (els.quiz) els.quiz.hidden = true;
  }

  function markPc(pc, cls) {
    var nodes = els.board.querySelectorAll('[data-pc="' + pc + '"]');
    Array.prototype.forEach.call(nodes, function (n) { n.classList.add(cls); });
  }

  function onBoardClick(e) {
    if (!quiz.active) return;
    var g = e.target.closest ? e.target.closest('[data-pc]') : null;
    if (!g) return;
    var pc = parseInt(g.getAttribute('data-pc'), 10);
    if (quiz.answer.indexOf(pc) >= 0) {
      quiz.answer.forEach(function (p) { markPc(p, 'is-correct'); });
      els.quizFeedback.textContent = '正解！';
      els.quizFeedback.className = 'tt-quiz-feedback is-ok';
      quiz.active = false; // answered; 次の問題 で再開
    } else {
      markPc(pc, 'is-wrong');
      els.quizFeedback.textContent = 'ちがう…もう一度';
      els.quizFeedback.className = 'tt-quiz-feedback is-ng';
    }
  }

  // ---- Wiring ------------------------------------------------------------

  function bindControls() {
    els.scaleRoot.addEventListener('change', function () {
      state.scaleRoot = this.value; update();
    });
    bindScaleCombo();
    els.scaleToggle.addEventListener('change', function () {
      state.noScale = !this.checked; // switch ON = scale shown
      if (state.noScale && combo.open) closeScaleList(true);
      update();
    });
    els.chordToggle.addEventListener('change', function () {
      state.noChord = !this.checked; // switch ON = chord shown
      update();
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
    bindRadio('level', function (v) { state.level = v; update(); });
    bindRadio('palette', function (v) { state.palette = v; update(); });

    document.getElementById('printBtn').addEventListener('click', function () {
      global.print();
    });
    document.getElementById('shareBtn').addEventListener('click', copyShareLink);

    // Quiz (SPEC-09): start / next / quit, and tap-to-answer on the board.
    if (els.quizBtn) els.quizBtn.addEventListener('click', startQuiz);
    if (els.quizNext) els.quizNext.addEventListener('click', startQuiz);
    if (els.quizClose) els.quizClose.addEventListener('click', endQuiz);
    if (els.board) els.board.addEventListener('click', onBoardClick);

    // Audio audition (Web Audio); hide the whole 試聴 card where unsupported.
    audioOn = !!(TT.audio && TT.audio.supported());
    if (audioOn) {
      els.auTimbreScale.addEventListener('change', function () {
        state.timbreScale = this.value; persist();
      });
      els.auTimbreChord.addEventListener('change', function () {
        state.timbreChord = this.value; persist();
      });
      bindRadio('scaleOctave', function (v) { state.octaveScale = parseInt(v, 10); persist(); });
      bindRadio('chordOctave', function (v) { state.octaveChord = parseInt(v, 10); persist(); });
      // Light up the matching notes on the board as they sound (SPEC-06).
      TT.audio.onNote(schedulePlayHighlight);
      els.auPlayScale.addEventListener('click', function () {
        var s = data.scales[state.scaleKey];
        if (!s) return;
        clearPlayHighlights();
        TT.audio.playScale(state.scaleRoot, s.intervals, state.timbreScale, state.octaveScale);
      });
      els.auPlayChord.addEventListener('click', function () {
        var c = data.chords[state.chordKey];
        if (!c) return;
        clearPlayHighlights();
        TT.audio.playChord(state.chordRoot, c.intervals, state.timbreChord, state.octaveChord);
      });
      els.auPlayMix.addEventListener('click', function () {
        var s = data.scales[state.scaleKey];
        var c = data.chords[state.chordKey];
        if (!s || !c) return;
        clearPlayHighlights();
        TT.audio.playScaleChord(state.scaleRoot, s.intervals, state.chordRoot, c.intervals,
          state.timbreScale, state.timbreChord, state.octaveScale, state.octaveChord);
      });
    } else {
      els.auditionCard.hidden = true;
    }
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

  // ---- First-run coaching (SPEC-04) -------------------------------------
  // Shown once; the flag lives OUTSIDE `state` so it never rides along in a
  // shared URL.
  var ONBOARD_KEY = 'tone-transit:onboarded';

  function shouldShowCoach() {
    try { return global.localStorage.getItem(ONBOARD_KEY) !== '1'; }
    catch (e) { return false; } // no storage → don't nag every load
  }
  function markOnboarded() {
    try { global.localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) {}
  }

  var COACH_STEPS = [
    { sel: '#presets', text: 'まずはここから。例をクリックすると、意味のある盤面がすぐ開きます。' },
    { sel: '#chord', text: 'コードを変えると、各音の「度数（今のコードに対する意味）」が切り替わります。' },
    { sel: '#auPlayScale', text: '▶ で音を鳴らして、耳でも確かめられます。' },
    { sel: '#shareBtn', text: '今の状態はリンクで共有・印刷できます。' }
  ];

  function startCoach() {
    var steps = COACH_STEPS.filter(function (s) {
      var el = document.querySelector(s.sel);
      return el && el.offsetParent !== null; // exists and visible
    });
    if (!steps.length) return;

    var backdrop = document.createElement('div');
    backdrop.className = 'tt-coach-backdrop';
    var tip = document.createElement('div');
    tip.className = 'tt-coach-tip';
    tip.setAttribute('role', 'dialog');
    tip.setAttribute('aria-live', 'polite');
    backdrop.appendChild(tip);
    document.body.appendChild(backdrop);

    var i = 0;
    function close() {
      markOnboarded();
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      global.removeEventListener('resize', place);
    }
    function place() {
      var target = document.querySelector(steps[i].sel);
      if (!target) { close(); return; }
      // Tip is a child of the fixed backdrop, so viewport coords are correct.
      var r = target.getBoundingClientRect();
      var top = r.bottom + 10;
      // If the target is near the bottom, place the tip above it instead.
      if (top + tip.offsetHeight > global.innerHeight - 8) {
        top = Math.max(8, r.top - tip.offsetHeight - 10);
      }
      tip.style.top = top + 'px';
      tip.style.left = Math.max(8, Math.min(r.left, global.innerWidth - tip.offsetWidth - 8)) + 'px';
    }
    function render() {
      var last = i === steps.length - 1;
      tip.innerHTML = '';
      var p = document.createElement('p');
      p.className = 'tt-coach-text';
      p.textContent = steps[i].text;
      var row = document.createElement('div');
      row.className = 'tt-coach-actions';
      var count = document.createElement('span');
      count.className = 'tt-coach-count';
      count.textContent = (i + 1) + ' / ' + steps.length;
      var skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'tt-coach-skip';
      skip.textContent = '閉じる';
      skip.addEventListener('click', close);
      var next = document.createElement('button');
      next.type = 'button';
      next.className = 'tt-coach-next';
      next.textContent = last ? '使ってみる' : '次へ';
      next.addEventListener('click', function () {
        if (last) { close(); return; }
        i++; render(); place();
      });
      row.appendChild(count);
      row.appendChild(skip);
      row.appendChild(next);
      tip.appendChild(p);
      tip.appendChild(row);
      var target = document.querySelector(steps[i].sel);
      if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' });
    }
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    global.addEventListener('resize', place);
    render();
    place();
  }

  function maybeStartCoach() {
    if (shouldShowCoach()) startCoach();
  }

  // ---- Boot --------------------------------------------------------------

  // Fetches one JSON file, distinguishing HTTP errors from parse errors so the
  // failure message can point at the right cause.
  function loadJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ' — HTTP ' + r.status);
      return r.json().catch(function () { throw new Error(path + ' — 不正な JSON'); });
    });
  }

  function loadData() {
    return Promise.all([loadJSON('data/scales.json'), loadJSON('data/chords.json')])
      .then(function (res) {
        data.scales = res[0];
        data.chords = res[1];
      });
  }

  function boot() {
    cacheEls();
    loadData().then(function () {
      readStorage();
      readUrl(); // URL wins over storage
      normalizeState();
      populateSelects();
      bindControls();
      renderPresets();
      update();
      maybeStartCoach();
    }).catch(function (err) {
      els.dataError.hidden = false;
      var msg = String(err && err.message || err);
      // A bare network failure (file:// or no server) has no HTTP status.
      var hint = /HTTP|JSON/.test(msg)
        ? 'データファイルの取得に失敗しました。'
        : 'データを取得できません。ローカルサーバー経由で開いてください（例: python3 -m http.server）。';
      els.dataError.textContent = hint + '（詳細: ' + msg + '）';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
